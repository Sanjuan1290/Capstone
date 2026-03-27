// server/utils/emailService.js

const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

const FROM = `"Carait Clinic" <${process.env.EMAIL_USER}>`

// ── Welcome email for new staff/doctor accounts ───────────────────────────────
const sendTempPassword = async (email, full_name, role, tempPassword, loginUrl) => {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Welcome to Carait Clinic — Your ${role} Account`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Welcome, ${full_name}!</h2>
        <p>The administrator has created a <strong>${role}</strong> account for you at Carait Medical and Dermatology Clinic.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px 0"><strong>Email:</strong> ${email}</p>
          <p style="margin:0"><strong>Temporary Password:</strong>
            <code style="background:#fff;padding:3px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:15px;letter-spacing:1px">
              ${tempPassword}
            </code>
          </p>
        </div>
        <p style="color:#dc2626;font-weight:bold">⚠️ Please log in and change your password immediately.</p>
        <a href="${loginUrl}"
           style="display:inline-block;background:#0b1a2c;color:#fff;padding:12px 28px;
                  border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">
          Go to Login
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">
          If you did not expect this email, please contact your clinic administrator.
        </p>
      </div>
    `,
  })
}

// ── OTP for patient registration ──────────────────────────────────────────────
const sendVerificationCode = async (email, full_name, code) => {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Carait Clinic — Your Email Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Verify your email address</h2>
        <p>Hi ${full_name}, thanks for registering at Carait Medical and Dermatology Clinic!</p>
        <p>Enter the 6-digit code below. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <div style="display:inline-block;background:#0b1a2c;color:#fff;font-size:40px;
                      font-weight:900;letter-spacing:14px;padding:16px 32px;border-radius:12px">
            ${code}
          </div>
        </div>
        <p style="color:#94a3b8;font-size:12px">
          If you did not request this, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}

// ── Appointment reminder email (daily cron) ───────────────────────────────────
const sendAppointmentReminder = async ({ to, patient_name, doctor_name, appointment_date, appointment_time, clinic_type }) => {
  const formattedDate = new Date(appointment_date).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Reminder: Your Appointment Tomorrow — Carait Clinic`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Appointment Reminder</h2>
        <p>Hi <strong>${patient_name}</strong>,</p>
        <p>This is a reminder that you have an appointment scheduled for <strong>tomorrow</strong>.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px 0"><strong>Doctor:</strong> ${doctor_name}</p>
          <p style="margin:0 0 8px 0"><strong>Date:</strong> ${formattedDate}</p>
          <p style="margin:0 0 8px 0"><strong>Time:</strong> ${appointment_time}</p>
          <p style="margin:0"><strong>Clinic:</strong> ${clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
        </div>
        <p>Please arrive <strong>10–15 minutes early</strong> and bring any relevant medical records.</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">
          Carait Medical and Dermatology Clinic — A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna
        </p>
      </div>
    `,
  })
}

// ── ✅ NEW: OTP email for forgot password (replaces link-based reset) ──────────
const sendPasswordResetOtp = async (email, full_name, role, otp) => {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Carait Clinic — Password Reset Code',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Password Reset Request</h2>
        <p>Hi <strong>${full_name}</strong>,</p>
        <p>We received a request to reset the password for your <strong>${roleLabel}</strong> account.</p>
        <p>Enter the 6-digit code below in the app. It expires in <strong>10 minutes</strong>.</p>

        <div style="text-align:center;margin:32px 0">
          <div style="display:inline-block;background:#0b1a2c;color:#34d399;font-size:42px;
                      font-weight:900;letter-spacing:16px;padding:18px 36px;border-radius:14px;
                      font-family:monospace">
            ${otp}
          </div>
        </div>

        <p style="color:#64748b;font-size:13px">
          If you did not request a password reset, you can safely ignore this email.
          Your password will not change.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="color:#94a3b8;font-size:12px">
          Carait Medical and Dermatology Clinic — A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna
        </p>
      </div>
    `,
  })
}

module.exports = {
  sendTempPassword,
  sendVerificationCode,
  sendAppointmentReminder,
  sendPasswordResetOtp,   // ✅ NEW
}