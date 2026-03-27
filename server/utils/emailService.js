// server/utils/emailService.js
// FIX #2 — Welcome email when admin creates staff/doctor account
// FIX #3 — Verification code email when patient registers
// FIX #4 — Appointment reminder email (called by reminder.js cron job)
//
// SETUP:
//   1. Run: npm install nodemailer   (inside /server)
//   2. Add to your .env:
//        EMAIL_USER=youraddress@gmail.com
//        EMAIL_PASS=your_gmail_app_password
//        CLIENT_URL=http://localhost:5173
//
//   Gmail App Password guide:
//   Google Account → Security → 2-Step Verification → App Passwords
//   Generate one for "Mail" and paste it in EMAIL_PASS.

const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

const FROM = `"Carait Clinic" <${process.env.EMAIL_USER}>`

// ─── FIX #2 — Temp password email for new staff / doctor accounts ─────────────

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

// ─── FIX #3 — Verification code for patient registration ──────────────────────

const sendVerificationCode = async (email, full_name, code) => {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Carait Clinic — Your Email Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#0b1a2c">Verify your email address</h2>
        <p>Hi ${full_name}, thanks for registering at Carait Medical and Dermatology Clinic!</p>
        <p>Enter the 6-digit code below on the verification page. It expires in <strong>10 minutes</strong>.</p>

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

// ─── FIX #4 — Appointment reminder email ──────────────────────────────────────

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
        <p>Hi ${patient_name}, this is a reminder that you have an appointment <strong>tomorrow</strong>.</p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:24px 0">
          <p style="margin:0 0 8px 0"><strong>Doctor:</strong> ${doctor_name}</p>
          <p style="margin:0 0 8px 0"><strong>Date:</strong> ${formattedDate}</p>
          <p style="margin:0 0 8px 0"><strong>Time:</strong> ${appointment_time}</p>
          <p style="margin:0"><strong>Type:</strong> ${clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
        </div>

        <p>Please arrive at least <strong>15 minutes early</strong>. To reschedule, log in to the patient portal as soon as possible.</p>

        <p style="color:#94a3b8;font-size:12px;margin-top:32px">
          Carait Medical and Dermatology Clinic · This is an automated message, please do not reply.
        </p>
      </div>
    `,
  })
}

module.exports = { sendTempPassword, sendVerificationCode, sendAppointmentReminder }