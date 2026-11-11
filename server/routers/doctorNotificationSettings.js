const db = require('../db/connect')
const { readSettings, saveSettings } = require('../utils/doctorConfirmationNotifications')
const { writeAuditLog } = require('../utils/audit')

const getDoctorNotificationSettings = async (req, res) => {
  res.json(await readSettings())
}
const updateDoctorNotificationSettings = async (req, res) => {
  const original = await readSettings()
  const saved = await saveSettings(req.body, req.user.id)
  await writeAuditLog({
    userId: req.user.id, userRole: 'superadmin', action:'settings.doctor_notifications_updated',
    entityType:'system_setting', entityId:'doctor_confirmation',
    oldValues: {send_email:original.send_email,send_sms:original.send_sms},
    newValues: {send_email:saved.send_email,send_sms:saved.send_sms}, ipAddress:req.ip,
  }).catch(err => console.error('[doctor-confirmation] settings audit failed',err.message))
  res.json({message:'Doctor notification settings saved.',...saved})
}
module.exports={getDoctorNotificationSettings,updateDoctorNotificationSettings}
