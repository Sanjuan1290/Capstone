const db = require('../db/connect')

const normalizeConsultationImages = (images = []) => (
  Array.isArray(images)
    ? images
      .map((image, index) => {
        const imageUrl = String(image?.image_url || image?.url || '').trim()
        if (!imageUrl) return null

        return {
          image_url: imageUrl,
          caption: String(image?.caption || image?.notes || '').trim() || null,
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
    `SELECT id, consultation_id, image_url, caption, sort_order, created_at
     FROM consultation_images
     WHERE consultation_id IN (${placeholders})
     ORDER BY consultation_id ASC, sort_order ASC, id ASC`,
    ids
  )

  return rows.reduce((acc, row) => {
    if (!acc[row.consultation_id]) acc[row.consultation_id] = []
    acc[row.consultation_id].push(row)
    return acc
  }, {})
}

const syncConsultationImages = async (consultationId, images = [], executor = db) => {
  const normalizedImages = normalizeConsultationImages(images)
  await executor.query('DELETE FROM consultation_images WHERE consultation_id = ?', [consultationId])

  for (const image of normalizedImages) {
    await executor.query(
      `INSERT INTO consultation_images (consultation_id, image_url, caption, sort_order)
       VALUES (?, ?, ?, ?)`,
      [consultationId, image.image_url, image.caption, image.sort_order]
    )
  }

  return normalizedImages
}

module.exports = {
  normalizeConsultationImages,
  loadImagesForConsultationIds,
  syncConsultationImages,
}
