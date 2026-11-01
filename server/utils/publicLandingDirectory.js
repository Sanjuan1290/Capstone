// Public, minimal catalog for marketing-to-booking links.
// Never return staff credentials, patient data, doctor contact details or schedules.
const db = require('../db/connect')
const getPublicLandingDirectory = async () => {
  const [services] = await db.query(`
    SELECT s.id, s.service_name, s.clinic_type, s.branch_id, b.name AS branch_name
    FROM billing_service_catalog s
    JOIN clinic_branches b ON b.id=s.branch_id AND b.is_active=1
    WHERE s.is_active=1 AND s.clinic_type IN ('medical','derma')
    ORDER BY b.name,s.sort_order,s.service_name LIMIT 300`)
  const [doctors] = await db.query(`
    SELECT d.id, d.full_name, d.specialty, d.clinic_type, d.profile_image_url,
           a.branch_id, b.name AS branch_name
    FROM doctors d
    JOIN doctor_branch_assignments a ON a.doctor_id=d.id AND a.is_active=1
    JOIN clinic_branches b ON b.id=a.branch_id AND b.is_active=1
    WHERE d.is_active=1
    ORDER BY d.full_name,b.name LIMIT 200`)
  return { services, doctors }
}
module.exports = { getPublicLandingDirectory }
