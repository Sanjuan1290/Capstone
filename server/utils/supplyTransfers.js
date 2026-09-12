const db = require('../db/connect')
const { writeAuditLog } = require('./audit')
const { broadcast } = require('./sse')
const { transferInventoryBatchesFEFO, MAIN_LOCATION, getInventoryLocationById } = require('./inventoryBatches')

const resolveSupplyTransfer = async ({ requestId, status, actorRole, actorId, ipAddress, note = '' }) => {
  if (!['approved', 'rejected'].includes(String(status))) {
    return { statusCode: 400, body: { message: 'Status must be approved or rejected.' } }
  }

  const conn = await db.getConnection()
  let request
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      `SELECT sr.*, i.name AS item_name, i.stock AS total_stock, i.unit,
              loc.name AS destination_location_name, loc.location_type AS destination_location_type
       FROM supply_requests sr
       JOIN inventory i ON i.id = sr.inventory_id
       LEFT JOIN inventory_locations loc ON loc.id = sr.destination_location_id
       WHERE sr.id = ?
       FOR UPDATE`,
      [requestId]
    )
    if (!rows.length) {
      await conn.rollback()
      return { statusCode: 404, body: { message: 'Supply request not found.' } }
    }

    request = rows[0]
    if (request.status !== 'pending') {
      await conn.rollback()
      return { statusCode: 400, body: { message: 'Only pending requests can be resolved.' } }
    }

    let batchBreakdown = []
    let destinationRow = null
    if (status === 'approved') {
      destinationRow = request.destination_location_id ? await getInventoryLocationById(request.destination_location_id, conn) : null
      const destination = String(destinationRow?.name || request.destination_location_name || request.destination_location || '').trim()
      if (!destinationRow || !['room','dispensing'].includes(String(destinationRow.location_type))) {
        await conn.rollback()
        return { statusCode: 400, body: { message: 'The requested inventory destination is no longer available.' } }
      }
      const qty = Math.max(0, Number(request.qty_requested) || 0)
      if (qty <= 0) {
        await conn.rollback()
        return { statusCode: 400, body: { message: 'Supply request quantity must be greater than zero.' } }
      }

      // Transfer location ownership per batch. This does NOT decrease clinic-wide
      // inventory quantity; the same physical batch simply moves to another room.
      const movement = await transferInventoryBatchesFEFO(
        request.inventory_id,
        qty,
        MAIN_LOCATION,
        destination,
        conn
      )
      if (!movement.ok) {
        await conn.rollback()
        return { statusCode: 400, body: { message: `${request.item_name}: ${movement.message}` } }
      }
      batchBreakdown = movement.transferred

      const [transfer] = await conn.query(
        `INSERT INTO inventory_transfers
         (inventory_id, supply_request_id, from_location, to_location, quantity, transferred_by_role, transferred_by_user_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [request.inventory_id, request.id, MAIN_LOCATION, destination, qty, actorRole, actorId, request.reason || null]
      )
      request.transfer_id = transfer.insertId

      for (const batch of batchBreakdown) {
        await conn.query(
          `INSERT INTO inventory_transfer_batches (transfer_id, batch_id, quantity, expiration_date)
           VALUES (?, ?, ?, ?)`,
          [transfer.insertId, batch.batch_id, batch.quantity, batch.expiration_date || null]
        )
      }

      const actorColumn = actorRole === 'admin' ? 'admin_id' : 'staff_id'
      for (const batch of batchBreakdown) {
        const label = batch.batch_code || `Batch #${batch.batch_id}`
        await conn.query(
          `INSERT INTO inventory_logs
           (inventory_id, ${actorColumn}, type, qty, note, movement_type, from_location, to_location, reference_type, reference_id, batch_id)
           VALUES (?, ?, 'out', ?, ?, 'transfer_out', ?, ?, 'supply_request', ?, ?)`,
          [request.inventory_id, actorId, batch.quantity, `${label} transferred to ${destination} for supply request #${request.id}`, MAIN_LOCATION, destination, request.id, batch.batch_id]
        )
        await conn.query(
          `INSERT INTO inventory_logs
           (inventory_id, ${actorColumn}, type, qty, note, movement_type, from_location, to_location, reference_type, reference_id, batch_id)
           VALUES (?, ?, 'in', ?, ?, 'transfer_in', ?, ?, 'supply_request', ?, ?)`,
          [request.inventory_id, actorId, batch.quantity, `${label} received at ${destination}`, MAIN_LOCATION, destination, request.id, batch.batch_id]
        )
      }
    }

    const resolutionNote = String(note || '').trim() || null
    await conn.query(
      `UPDATE supply_requests
       SET status = ?, resolved_at = NOW(), resolved_by_admin_id = ?, resolution_note = ?
       WHERE id = ?`,
      [status, actorRole === 'admin' ? actorId : null, resolutionNote, request.id]
    )

    await writeAuditLog({
      userId: actorId,
      userRole: actorRole,
      action: `supply.request_${status}`,
      entityType: 'supply_request',
      entityId: request.id,
      oldValues: { status: 'pending' },
      newValues: {
        status,
        destination_location_id: request.destination_location_id || null,
        destination_location: destinationRow?.name || request.destination_location,
        transfer_id: request.transfer_id || null,
        resolution_note: resolutionNote,
        batches: batchBreakdown.map((batch) => ({
          batch_id: batch.batch_id,
          batch_code: batch.batch_code,
          expiration_date: batch.expiration_date,
          quantity: batch.quantity,
        })),
      },
      ipAddress,
    }, conn)

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  broadcast(['admin', 'staff', `doctor_${request.doctor_id}`], 'supply_request_resolved', {
    requestId: Number(request.id),
    status,
    doctorId: request.doctor_id,
  })

  return {
    statusCode: 200,
    body: {
      message: status === 'approved'
        ? 'Supply request approved. Stock was transferred per batch.'
        : 'Supply request rejected.',
      transfer_id: request.transfer_id || null,
    },
  }
}

module.exports = { resolveSupplyTransfer }



