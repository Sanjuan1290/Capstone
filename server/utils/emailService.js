const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

const FROM = `"Carait Clinic" <${process.env.EMAIL_USER}>`

const sendTempPassword = async (email, full_name, role, tempPassword, loginUrl) => {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Welcome to Carait Clinic - Your ${role} Account`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Welcome, ${full_name}!</h2>
        <p>The administrator has created a <strong>${role}</strong> account for you at Carait Medical and Dermatology Clinic.</p>
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
  await transporter.sendMail({
    from: FROM,
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

const sendAppointmentReminder = async ({ to, patient_name, doctor_name, appointment_date, appointment_time, clinic_type }) => {
  const formattedDate = new Date(appointment_date).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Reminder: Your Appointment Tomorrow - Carait Clinic',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Appointment Reminder</h2>
        <p>Hi <strong>${patient_name}</strong>,</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px 0"><strong>Doctor:</strong> ${doctor_name}</p>
          <p style="margin:0 0 8px 0"><strong>Date:</strong> ${formattedDate}</p>
          <p style="margin:0 0 8px 0"><strong>Time:</strong> ${appointment_time}</p>
          <p style="margin:0"><strong>Clinic:</strong> ${clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
        </div>
      </div>
    `,
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
  const formattedDate = new Date(appointment_date).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const statusMap = {
    confirmed: ['Your Appointment Has Been Confirmed', 'Appointment Confirmed', '#059669', 'Your clinic appointment has been successfully confirmed.'],
    cancelled: ['Your Appointment Has Been Cancelled', 'Appointment Cancelled', '#dc2626', 'Your clinic appointment has been cancelled.'],
    rescheduled: ['Your Appointment Has Been Rescheduled', 'Appointment Rescheduled', '#0284c7', 'Your clinic appointment schedule has been updated.'],
  }

  const cfg = statusMap[status]
  if (!cfg) return

  await transporter.sendMail({
    from: FROM,
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
  await transporter.sendMail({
    from: FROM,
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

module.exports = {
  sendTempPassword,
  sendVerificationCode,
  sendAppointmentReminder,
  sendAppointmentStatusEmail,
  sendPasswordResetOtp,
}
