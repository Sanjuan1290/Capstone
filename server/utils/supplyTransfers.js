const db = require('../db/connect')
const { writeAuditLog } = require('./audit')
const { broadcast } = require('./sse')
const { transferInventoryBatchesFEFO, MAIN_LOCATION, getInventoryLocationById } = require('./inventoryBatches')

const groupTransferRows = (rows = []) => {
  const groups = new Map()
  for (const row of rows) {
    const groupId = Number(row.request_group_id || row.group_id || row.id)
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        doctor_id: Number(row.doctor_id),
        doctor_name: row.doctor_name || null,
        appointment_id: Number(row.appointment_id || 0) || null,
        consultation_id: Number(row.consultation_id || 0) || null,
        appointment_status: row.appointment_status || null,
        appointment_date: row.appointment_date || null,
        appointment_time: row.appointment_time || null,
        patient_name: row.patient_name || null,
        requested_service_name: row.requested_service_name || null,
        destination_location_id: Number(row.destination_location_id || 0) || null,
        destination_location: row.destination_location || row.destination_location_snapshot || 'Doctor / Treatment Room',
        reason: row.group_reason ?? row.reason ?? null,
        status: row.group_status || row.status,
        requested_at: row.group_requested_at || row.requested_at,
        updated_at: row.group_updated_at || row.updated_at,
        resolved_at: row.group_resolved_at || row.resolved_at || null,
        resolved_by_role: row.resolved_by_role || null,
        resolved_by_user_id: Number(row.resolved_by_user_id || 0) || null,
        resolution_note: row.group_resolution_note ?? row.resolution_note ?? null,
        items: [],
      })
    }
    groups.get(groupId).items.push({
      id: Number(row.line_id || row.supply_request_id || row.id),
      inventory_id: Number(row.inventory_id),
      item_name: row.item_name,
      category: row.category || null,
      item_type: row.item_type || null,
      unit: row.unit || row.uom || 'unit',
      qty_requested: Number(row.qty_requested || 0),
      main_stockroom_stock: Number(row.main_stockroom_stock || 0),
      destination_stock: Number(row.destination_stock || 0),
      measurement_value: row.measurement_value === null || row.measurement_value === undefined ? null : Number(row.measurement_value),
      measurement_unit: row.measurement_unit || null,
    })
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    item_count: group.items.length,
  }))
}

const listSupplyTransferGroups = async ({ doctorId = null, groupId = null, pendingFirst = false, executor = db } = {}) => {
  const conditions = []
  const params = []
  if (Number(doctorId)) {
    conditions.push('g.doctor_id = ?')
    params.push(Number(doctorId))
  }
  if (Number(groupId)) {
    conditions.push('g.id = ?')
    params.push(Number(groupId))
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const order = pendingFirst
    ? "ORDER BY FIELD(g.status,'pending','approved','rejected'), g.requested_at DESC, sr.id ASC"
    : 'ORDER BY g.requested_at DESC, sr.id ASC'

  const [rows] = await executor.query(
    `SELECT
       g.id AS request_group_id,
       g.doctor_id,
       d.full_name AS doctor_name,
       g.appointment_id,
       g.consultation_id,
       a.status AS appointment_status,
       DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
       a.appointment_time,
       p.full_name AS patient_name,
       COALESCE(bsc.service_name,a.requested_service_name_snapshot) AS requested_service_name,
       g.destination_location_id,
       COALESCE(dest.name, g.destination_location) AS destination_location,
       g.reason AS group_reason,
       g.status AS group_status,
       g.requested_at AS group_requested_at,
       g.updated_at AS group_updated_at,
       g.resolved_at AS group_resolved_at,
       g.resolved_by_role,
       g.resolved_by_user_id,
       g.resolution_note AS group_resolution_note,
       sr.id AS line_id,
       sr.inventory_id,
       sr.qty_requested,
       i.name AS item_name,
       i.category,
       COALESCE(i.item_type,'medicine') AS item_type,
       COALESCE(i.uom,i.base_unit,i.unit,'unit') AS unit,
       i.measurement_value,
       i.measurement_unit,
       COALESCE((
         SELECT SUM(ilb.quantity)
         FROM inventory_location_batches ilb
         JOIN inventory_locations ml ON ml.id=ilb.location_id
         JOIN inventory_batches ib ON ib.id=ilb.batch_id
         WHERE ilb.inventory_id=i.id AND ml.name=? AND ilb.quantity>0 AND ib.quantity>0
           AND ib.archived_at IS NULL AND (ib.expiration_date IS NULL OR ib.expiration_date>=CURDATE())
       ),0) AS main_stockroom_stock,
       COALESCE((
         SELECT SUM(ilb.quantity)
         FROM inventory_location_batches ilb
         JOIN inventory_batches ib ON ib.id=ilb.batch_id
         WHERE ilb.inventory_id=i.id AND ilb.location_id=g.destination_location_id AND ilb.quantity>0 AND ib.quantity>0
           AND ib.archived_at IS NULL AND (ib.expiration_date IS NULL OR ib.expiration_date>=CURDATE())
       ),0) AS destination_stock
     FROM supply_request_groups g
     JOIN supply_requests sr ON sr.request_group_id=g.id
     JOIN inventory i ON i.id=sr.inventory_id
     JOIN doctors d ON d.id=g.doctor_id
     LEFT JOIN appointments a ON a.id=g.appointment_id
     LEFT JOIN patients p ON p.id=a.patient_id
     LEFT JOIN billing_service_catalog bsc ON bsc.id=a.requested_service_id
     LEFT JOIN inventory_locations dest ON dest.id=g.destination_location_id
     ${where}
     ${order}`,
    [MAIN_LOCATION, ...params]
  )
  return groupTransferRows(rows)
}

const resolveSupplyTransfer = async ({ requestId, status, actorRole, actorId, ipAddress, note = '' }) => {
  if (!['approved', 'rejected'].includes(String(status))) {
    return { statusCode: 400, body: { message: 'Status must be approved or rejected.' } }
  }

  const conn = await db.getConnection()
  let group
  let itemResults = []
  try {
    await conn.beginTransaction()
    const [groups] = await conn.query(
      `SELECT g.*, d.full_name AS doctor_name,
              a.status AS appointment_status,
              p.full_name AS patient_name,
              COALESCE(bsc.service_name,a.requested_service_name_snapshot) AS requested_service_name,
              COALESCE(loc.name, g.destination_location) AS destination_location_name,
              loc.location_type AS destination_location_type
       FROM supply_request_groups g
       JOIN doctors d ON d.id=g.doctor_id
       LEFT JOIN appointments a ON a.id=g.appointment_id
       LEFT JOIN patients p ON p.id=a.patient_id
       LEFT JOIN billing_service_catalog bsc ON bsc.id=a.requested_service_id
       LEFT JOIN inventory_locations loc ON loc.id=g.destination_location_id
       WHERE g.id=?
       FOR UPDATE`,
      [requestId]
    )
    if (!groups.length) {
      await conn.rollback()
      return { statusCode: 404, body: { message: 'Stock transfer request not found.' } }
    }
    group = groups[0]
    if (group.status !== 'pending') {
      await conn.rollback()
      return { statusCode: 400, body: { message: 'Only pending stock transfer requests can be resolved.' } }
    }
    if (group.appointment_id && !['confirmed','rescheduled','in-progress'].includes(String(group.appointment_status || ''))) {
      await conn.rollback()
      return { statusCode: 409, body: { code: 'TRANSFER_APPOINTMENT_NOT_ACTIVE', message: 'This stock transfer is linked to an appointment that is no longer active. Reject the request instead of transferring stock.' } }
    }

    const [lines] = await conn.query(
      `SELECT sr.id, sr.inventory_id, sr.qty_requested,
              i.name AS item_name,
              COALESCE(i.uom,i.base_unit,i.unit,'unit') AS unit
       FROM supply_requests sr
       JOIN inventory i ON i.id=sr.inventory_id
       WHERE sr.request_group_id=?
       ORDER BY sr.id ASC
       FOR UPDATE`,
      [group.id]
    )
    if (!lines.length) {
      await conn.rollback()
      return { statusCode: 409, body: { message: 'This stock transfer request has no items.' } }
    }

    let destinationRow = null
    if (status === 'approved') {
      destinationRow = group.destination_location_id ? await getInventoryLocationById(group.destination_location_id, conn) : null
      const destination = String(destinationRow?.name || group.destination_location_name || group.destination_location || '').trim()
      if (!destinationRow || !['room', 'dispensing'].includes(String(destinationRow.location_type))) {
        await conn.rollback()
        return { statusCode: 400, body: { message: 'The requested inventory destination is no longer available.' } }
      }

      // Every line is transferred in this same transaction. If any line cannot be
      // fulfilled, the transaction is rolled back so the request is all-or-nothing.
      for (const line of lines) {
        const qty = Math.max(0, Number(line.qty_requested) || 0)
        if (qty <= 0) {
          await conn.rollback()
          return { statusCode: 400, body: { message: `${line.item_name} has an invalid requested quantity.` } }
        }

        const movement = await transferInventoryBatchesFEFO(
          line.inventory_id,
          qty,
          MAIN_LOCATION,
          destination,
          conn
        )
        if (!movement.ok) {
          await conn.rollback()
          return {
            statusCode: 409,
            body: {
              code: 'STOCK_TRANSFER_GROUP_INSUFFICIENT',
              message: `${line.item_name}: ${movement.message}. No items in this request were transferred.`,
              inventory_id: Number(line.inventory_id),
              item_name: line.item_name,
            },
          }
        }

        const [transfer] = await conn.query(
          `INSERT INTO inventory_transfers
           (inventory_id, supply_request_id, from_location, to_location, quantity, transferred_by_role, transferred_by_user_id, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [line.inventory_id, line.id, MAIN_LOCATION, destination, qty, actorRole, actorId, group.reason || null]
        )

        for (const batch of movement.transferred) {
          await conn.query(
            `INSERT INTO inventory_transfer_batches (transfer_id, batch_id, quantity, expiration_date)
             VALUES (?, ?, ?, ?)`,
            [transfer.insertId, batch.batch_id, batch.quantity, batch.expiration_date || null]
          )
        }

        const actorColumn = actorRole === 'admin' ? 'admin_id' : 'staff_id'
        for (const batch of movement.transferred) {
          const label = batch.batch_code || `Batch #${batch.batch_id}`
          await conn.query(
            `INSERT INTO inventory_logs
             (inventory_id, ${actorColumn}, type, qty, note, movement_type, from_location, to_location, reference_type, reference_id, batch_id)
             VALUES (?, ?, 'out', ?, ?, 'transfer_out', ?, ?, 'supply_request', ?, ?)`,
            [line.inventory_id, actorId, batch.quantity, `${label} moved from ${MAIN_LOCATION} to ${destination} for stock transfer request #${group.id} (line #${line.id})`, MAIN_LOCATION, destination, line.id, batch.batch_id]
          )
        }

        itemResults.push({
          supply_request_id: Number(line.id),
          inventory_id: Number(line.inventory_id),
          item_name: line.item_name,
          quantity: qty,
          unit: line.unit,
          transfer_id: Number(transfer.insertId),
          batches: movement.transferred.map((batch) => ({
            batch_id: batch.batch_id,
            batch_code: batch.batch_code,
            expiration_date: batch.expiration_date,
            quantity: batch.quantity,
          })),
        })
      }
    }

    const resolutionNote = String(note || '').trim() || null
    await conn.query(
      `UPDATE supply_request_groups
       SET status=?, resolved_at=NOW(), resolved_by_role=?, resolved_by_user_id=?, resolution_note=?, updated_at=NOW()
       WHERE id=?`,
      [status, actorRole, actorId, resolutionNote, group.id]
    )
    await conn.query(
      `UPDATE supply_requests
       SET status=?, resolved_at=NOW(), resolved_by_admin_id=?, resolution_note=?
       WHERE request_group_id=?`,
      [status, actorRole === 'admin' ? actorId : null, resolutionNote, group.id]
    )

    await writeAuditLog({
      userId: actorId,
      userRole: actorRole,
      action: `supply.request_${status}`,
      entityType: 'supply_request',
      entityId: group.id,
      oldValues: { status: 'pending' },
      newValues: {
        status,
        appointment_id: group.appointment_id || null,
        consultation_id: group.consultation_id || null,
        patient_name: group.patient_name || null,
        requested_service_name: group.requested_service_name || null,
        item_count: lines.length,
        destination_location_id: group.destination_location_id || null,
        destination_location: destinationRow?.name || group.destination_location_name || group.destination_location,
        resolution_note: resolutionNote,
        items: status === 'approved' ? itemResults : lines.map((line) => ({
          supply_request_id: Number(line.id),
          inventory_id: Number(line.inventory_id),
          item_name: line.item_name,
          quantity: Number(line.qty_requested),
        })),
      },
      ipAddress,
    }, conn)

    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }

  broadcast(['admin', 'staff', `doctor_${group.doctor_id}`], 'supply_request_resolved', {
    requestId: Number(group.id),
    status,
    doctorId: Number(group.doctor_id),
    itemCount: itemResults.length || undefined,
  })

  return {
    statusCode: 200,
    body: {
      message: status === 'approved'
        ? `Stock transfer approved. ${itemResults.length} item${itemResults.length === 1 ? '' : 's'} were moved from Main Stockroom to the destination atomically.`
        : 'Stock transfer request rejected.',
      request_id: Number(group.id),
      appointment_id: Number(group.appointment_id || 0) || null,
      consultation_id: Number(group.consultation_id || 0) || null,
      items: itemResults,
    },
  }
}

module.exports = { resolveSupplyTransfer, listSupplyTransferGroups, groupTransferRows }

