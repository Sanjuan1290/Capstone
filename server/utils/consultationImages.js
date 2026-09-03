const db = require('../db/connect')
const { verifyUploadSecurityToken } = require('./cloudinarySecurity')

const ALLOWED_SCAN_STATUSES = new Set(['approved', 'bypassed', 'legacy'])

const normalizeScanStatus = (value) => {
  const status = String(value || '').trim().toLowerCase()
  return ALLOWED_SCAN_STATUSES.has(status) ? status : 'legacy'
}

const normalizeConsultationImages = (images = []) => (
  Array.isArray(images)
    ? images
      .map((image, index) => {
        const imageUrl = String(image?.image_url || image?.url || '').trim()
        if (!imageUrl) return null

        return {
          image_url: imageUrl,
          caption: String(image?.caption || image?.notes || '').trim() || null,
          security_scan_status: normalizeScanStatus(image?.security_scan_status),
          security_token: String(image?.security_token || '').trim() || null,
          sort_order: Number.isFinite(Number(image?.sort_order)) ? Number(image.sort_order) : index,
        }
      })
      .filter(Boolean)
    : []
)

const loadImagesForConsultationIds = async (consultationIds = [], executor = db) => {
  const ids = Array.from(new Set(
    consultationIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  ))

  if (ids.length === 0) return {}

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await executor.query(
    `SELECT id, consultation_id, image_url, caption, security_scan_status, sort_order, created_at
     FROM consultation_images
     WHERE consultation_id IN (${placeholders})
     ORDER BY consultation_id ASC, sort_order ASC, id ASC`,
    ids
  )

  return rows.reduce((acc, row) => {
    if (!acc[row.consultation_id]) acc[row.consultation_id] = []
    acc[row.consultation_id].push({
      ...row,
      security_scan_status: normalizeScanStatus(row.security_scan_status),
    })
    return acc
  }, {})
}

const authorizeConsultationImages = async ({ consultationId, appointmentId, doctorId, images = [], executor = db }) => {
  const normalized = normalizeConsultationImages(images)
  const [existingRows] = consultationId
    ? await executor.query(
      'SELECT image_url, security_scan_status FROM consultation_images WHERE consultation_id = ?',
      [consultationId]
    )
    : [[]]
  const existingByUrl = new Map(existingRows.map((row) => [String(row.image_url), normalizeScanStatus(row.security_scan_status)]))

  return normalized.map((image) => {
    if (existingByUrl.has(image.image_url)) {
      return { ...image, security_scan_status: existingByUrl.get(image.image_url), security_token: null }
    }

    const verified = verifyUploadSecurityToken(image.security_token, {
      stage: 'accepted',
      role: 'doctor',
      user_id: doctorId,
      context_type: 'clinical',
      context_id: appointmentId,
      url: image.image_url,
    })
    if (!['approved', 'bypassed'].includes(String(verified.scan_status))) {
      throw Object.assign(new Error('A new clinical image has not completed the required upload security workflow.'), { statusCode: 400 })
    }
    return { ...image, security_scan_status: verified.scan_status, security_token: null }
  })
}

const syncConsultationImages = async (consultationId, images = [], executor = db) => {
  const normalizedImages = normalizeConsultationImages(images)
  await executor.query('DELETE FROM consultation_images WHERE consultation_id = ?', [consultationId])

  for (const image of normalizedImages) {
    await executor.query(
      `INSERT INTO consultation_images (consultation_id, image_url, caption, security_scan_status, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [consultationId, image.image_url, image.caption, image.security_scan_status, image.sort_order]
    )
  }

  return normalizedImages
}

module.exports = {
  normalizeConsultationImages,
  loadImagesForConsultationIds,
  authorizeConsultationImages,
  syncConsultationImages,
}
