const db = require('../db/connect')

const loadConsultationAmendments = async (consultationIds = [], executor = db) => {
  const ids = [...new Set((consultationIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  if (!ids.length) return {}
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await executor.query(
    `SELECT ca.id, ca.consultation_id, ca.doctor_id, ca.reason, ca.amendment_text, ca.created_at,
            d.full_name AS doctor_name
     FROM consultation_amendments ca
     JOIN doctors d ON d.id = ca.doctor_id
     WHERE ca.consultation_id IN (${placeholders})
     ORDER BY ca.consultation_id ASC, ca.created_at ASC, ca.id ASC`,
    ids
  )
  return rows.reduce((acc, row) => {
    if (!acc[row.consultation_id]) acc[row.consultation_id] = []
    acc[row.consultation_id].push(row)
    return acc
  }, {})
}

const assertConsultationEditable = (consultation) => {
  if (!consultation) throw Object.assign(new Error('Consultation not found.'), { statusCode: 404 })
  if (String(consultation.status || 'draft') === 'finalized') {
    throw Object.assign(new Error('This consultation is finalized. Add an amendment instead of changing the original medical record.'), { statusCode: 409, code: 'CONSULTATION_FINALIZED' })
  }
}

module.exports = { loadConsultationAmendments, assertConsultationEditable }



