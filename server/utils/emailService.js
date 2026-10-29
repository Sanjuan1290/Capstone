const { sendResendEmail } = require('./resendEmail')

const formatAppointmentDate = (appointmentDate) => {
  const raw = typeof appointmentDate === 'string'
    ? appointmentDate.slice(0, 10)
    : String(appointmentDate).slice(0, 10)
  const [year, month, day] = raw.split('-').map(Number)
  const safeDate = year && month && day
    ? new Date(year, month - 1, day)
    : new Date(appointmentDate)

  if (Number.isNaN(safeDate.getTime())) return String(appointmentDate)

  return safeDate.toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const sendTempPassword = async (email, full_name, role, tempPassword, loginUrl) => {
  await sendResendEmail({
    to: email,
    subject: `Welcome to Carait Clinic - Your ${role} Account`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Welcome, ${full_name}!</h2>
        <p>The administrator has created a <strong>${role}</strong> account for you at Carait Medical and Dermatology Clinic.</p>
        <p>Use the temporary password below for your first sign-in. You will be required to create your own password before accessing the portal.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px 0"><strong>Email:</strong> ${email}</p>
          <p style="margin:0"><strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
        </div>
        <a href="${loginUrl}" style="display:inline-block;background:#0b1a2c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">
          Go to Login
        </a>
      </div>
    `,
  })
}

const sendVerificationCode = async (email, full_name, code) => {
  await sendResendEmail({
    to: email,
    subject: 'Carait Clinic - Your Email Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Verify your email address</h2>
        <p>Hi ${full_name}, thanks for registering at Carait Medical and Dermatology Clinic.</p>
        <p>Enter the 6-digit code below. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <div style="display:inline-block;background:#0b1a2c;color:#fff;font-size:40px;font-weight:900;letter-spacing:14px;padding:16px 32px;border-radius:12px">
            ${code}
          </div>
        </div>
      </div>
    `,
  })
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const sendAppointmentReminder = async ({to,patient_name,doctor_name,appointment_date,appointment_time,branch_name,branch_address,branch_phone}) => {
  const date=escapeHtml(formatAppointmentDate(appointment_date))
  const person=escapeHtml(patient_name)
  const doctor=escapeHtml(doctor_name)
  const time=escapeHtml(appointment_time)
  const branch=escapeHtml(branch_name||'CARAIT Clinic')
  const address=escapeHtml(branch_address||'Contact the clinic for directions')
  const phone=escapeHtml(branch_phone||'')
  await sendResendEmail({
    to,subject:`CARAIT Clinic appointment reminder — ${date}`,
    html:`<div style="margin:0 auto;max-width:600px;font-family:Arial,sans-serif;color:#122036;background:white">
      <div style="background:#0b1a2c;color:white;padding:24px 28px"><h1 style="margin:0;font-size:23px">CARAIT CLINIC</h1><p style="margin:8px 0 0">Appointment reminder</p></div>
      <div style="padding:28px"><p>Hi ${person},</p><p>Your confirmed appointment is coming up.</p>
      <div style="padding:20px;background:#f8fafc;border:1px solid #dbe3ed;border-radius:12px;line-height:1.9">
        <b>Date:</b> ${date}<br><b>Time:</b> ${time} (Philippine time)<br><b>Doctor:</b> ${doctor}<br><b>Branch:</b> ${branch}<br><b>Location:</b> ${address}
      </div>
      <p>Please arrive a few minutes early. To cancel or reschedule, contact the clinic.</p>
      <a href="https://caraitclinic.com/patient/my-appointments" style="display:inline-block;background:#f59e0b;padding:13px 22px;border-radius:8px;color:#0b1a2c;text-decoration:none;font-weight:bold">View My Appointment</a>
      <p style="color:#64748b;font-size:12px">${phone} · No reply is required. Not replying will never cancel your appointment.</p>
      </div></div>`,
  })
}

const sendAppointmentStatusEmail = async ({
  to,
  patient_name,
  doctor_name,
  appointment_date,
  appointment_time,
  clinic_type,
  status,
  notes,
}) => {
  const formattedDate = formatAppointmentDate(appointment_date)

  const statusMap = {
    confirmed: ['Your Appointment Has Been Confirmed', 'Appointment Confirmed', '#059669', 'Your clinic appointment has been successfully confirmed.'],
    cancelled: ['Your Appointment Has Been Cancelled', 'Appointment Cancelled', '#dc2626', 'Your clinic appointment has been cancelled.'],
    rescheduled: ['Your Appointment Has Been Rescheduled', 'Appointment Rescheduled', '#0284c7', 'Your clinic appointment schedule has been updated.'],
    rejected: ['Your Appointment Request Was Not Confirmed', 'Appointment Request Released', '#b45309', 'Your appointment request was not confirmed before the clinic confirmation deadline, so the requested time has been released.'],
  }

  const cfg = statusMap[status]
  if (!cfg) return

  await sendResendEmail({
    to,
    subject: `Carait Clinic - ${cfg[0]}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:${cfg[2]}">${cfg[1]}</h2>
        <p>Hi <strong>${patient_name}</strong>,</p>
        <p>${cfg[3]}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px 0"><strong>Doctor:</strong> ${doctor_name}</p>
          <p style="margin:0 0 8px 0"><strong>Date:</strong> ${formattedDate}</p>
          <p style="margin:0 0 8px 0"><strong>Time:</strong> ${appointment_time}</p>
          <p style="margin:0"><strong>Clinic:</strong> ${clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
        </div>
        ${notes ? `<p><strong>Update:</strong> ${notes}</p>` : ''}
      </div>
    `,
  })
}

const sendPasswordResetOtp = async (email, full_name, role, otp) => {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  await sendResendEmail({
    to: email,
    subject: 'Carait Clinic - Password Reset Code',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Password Reset Request</h2>
        <p>Hi <strong>${full_name}</strong>,</p>
        <p>We received a request to reset the password for your <strong>${roleLabel}</strong> account.</p>
        <p>Enter the 6-digit code below in the app. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <div style="display:inline-block;background:#0b1a2c;color:#34d399;font-size:42px;font-weight:900;letter-spacing:16px;padding:18px 36px;border-radius:14px;font-family:monospace">
            ${otp}
          </div>
        </div>
      </div>
    `,
  })
}


const sendSecurityOtp = async (email, full_name, title, otp) => {
  await sendResendEmail({
    to: email,
    subject: `Carait Clinic - ${title}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">${title}</h2>
        <p>Hi <strong>${full_name}</strong>,</p>
        <p>Enter the 6-digit security code below. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <div style="display:inline-block;background:#0b1a2c;color:#34d399;font-size:42px;font-weight:900;letter-spacing:16px;padding:18px 36px;border-radius:14px;font-family:monospace">${otp}</div>
        </div>
        <p style="color:#64748b;font-size:13px">If you did not request this code, you can ignore this email.</p>
      </div>
    `,
  })
}

const sendAdminMfaOtp = (email, full_name, otp) => sendSecurityOtp(email, full_name, 'Administrator Sign-In Code', otp)
const sendAccountSecurityOtp = (email, full_name, otp) => sendSecurityOtp(email, full_name, 'Account Security Code', otp)

module.exports = {
  sendTempPassword,
  sendVerificationCode,
  sendAppointmentReminder,
  sendAppointmentStatusEmail,
  sendPasswordResetOtp,
  sendAdminMfaOtp,
  sendAccountSecurityOtp,
}

