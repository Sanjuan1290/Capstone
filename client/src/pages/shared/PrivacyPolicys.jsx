// client/src/pages/shared/PrivacyPolicys.jsx
// UPDATED: Full Privacy Policy with proper sections, back link, and Terms link.

import { NavLink } from 'react-router-dom'
import { MdArrowBack } from 'react-icons/md'

const Section = ({ title, children }) => (
  <div className="mt-8">
    <h2 className="text-lg font-bold text-slate-800 mb-3">{title}</h2>
    <div className="text-sm leading-7 text-slate-600 space-y-3">{children}</div>
  </div>
)

const PrivacyPolicys = () => {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">

        {/* Back link */}
        <NavLink
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 mb-6"
        >
          <MdArrowBack className="text-[16px]" />
          Back to Home
        </NavLink>

        {/* Title */}
        <h1 className="text-3xl font-black text-slate-800">Privacy Policy</h1>
        <p className="mt-2 text-xs text-slate-400 font-medium uppercase tracking-wider">
          Effective Date: January 1, 2025 · Last Updated: April 2026
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Carait Medical and Dermatology Clinic ("the Clinic", "we", "us", or "our") is committed to
          protecting your personal information and your right to privacy. This Privacy Policy explains
          how we collect, use, store, and protect information about you when you use our patient
          portal system, in compliance with Republic Act No. 10173, also known as the{' '}
          <strong>Data Privacy Act of 2012</strong>.
        </p>

        <Section title="1. Information We Collect">
          <p>We collect the following categories of personal information when you register and use the portal:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Personal Identifiers:</strong> Full name, birthdate, sex, civil status.</li>
            <li><strong>Contact Information:</strong> Phone number, email address, home address.</li>
            <li><strong>Account Credentials:</strong> Email and encrypted password.</li>
            <li><strong>Medical Information:</strong> Appointment records, consultation notes, diagnoses, prescriptions, and health history as documented by clinic staff and doctors.</li>
            <li><strong>Usage Data:</strong> Date and time of logins, actions performed within the portal.</li>
            <li><strong>Profile Image:</strong> If voluntarily uploaded by you in account settings.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use your personal information for the following legitimate purposes:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Creating and managing your patient account.</li>
            <li>Scheduling, confirming, rescheduling, or cancelling appointments.</li>
            <li>Documenting consultations, diagnoses, and prescriptions for continuity of care.</li>
            <li>Sending appointment reminders, confirmations, and status updates via email.</li>
            <li>Managing clinic operations, including queue management and inventory.</li>
            <li>Generating anonymized reports for clinic performance and planning purposes.</li>
            <li>Complying with legal, regulatory, and medical record-keeping obligations.</li>
          </ul>
        </Section>

        <Section title="3. Legal Basis for Processing">
          <p>
            We process your personal data based on the following lawful grounds under RA 10173:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Consent:</strong> You provide consent when you register for an account and agree to these terms.</li>
            <li><strong>Contract:</strong> Processing is necessary to fulfill your appointment and healthcare service requests.</li>
            <li><strong>Legal Obligation:</strong> We are required to maintain medical records under applicable Philippine health and privacy laws.</li>
            <li><strong>Legitimate Interest:</strong> Clinic operations, communication, and safety.</li>
          </ul>
        </Section>

        <Section title="4. Data Retention">
          <p>
            We retain your personal and medical information for as long as necessary to fulfill the
            purposes outlined in this policy, or as required by law. Patient medical records are
            typically retained for a minimum of 10 years from the date of last consultation, in
            accordance with Philippine Department of Health guidelines.
          </p>
          <p>
            Account credentials and usage data are retained while your account is active. Inactive
            accounts may be archived or deleted after an extended period of inactivity, with prior notice.
          </p>
        </Section>

        <Section title="5. Data Sharing and Disclosure">
          <p>
            We do not sell, rent, or trade your personal information to third parties. We may share
            your information only in the following limited circumstances:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Within the clinic:</strong> Authorized clinic staff, doctors, and administrators access your data only to the extent necessary to provide your care.</li>
            <li><strong>Service providers:</strong> We use third-party services (such as email delivery and cloud image storage) that may process data on our behalf under strict confidentiality agreements.</li>
            <li><strong>Legal requirements:</strong> We may disclose information when required by law, court order, or government regulation.</li>
            <li><strong>Medical emergency:</strong> We may share information necessary to protect the vital interests of the patient or another person.</li>
          </ul>
        </Section>

        <Section title="6. Data Security">
          <p>
            We implement appropriate technical and organizational safeguards to protect your personal
            information, including:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Passwords are hashed using industry-standard bcrypt encryption and are never stored in plain text.</li>
            <li>Authentication is managed using secure HTTP-only cookies and signed JSON Web Tokens.</li>
            <li>Access to patient data is restricted based on user roles (patient, doctor, staff, admin).</li>
            <li>Database connections are protected and hosted on secure servers.</li>
          </ul>
          <p>
            No security system is impenetrable. If you believe your account has been compromised,
            please contact us immediately.
          </p>
        </Section>

        <Section title="7. Your Rights as a Data Subject">
          <p>Under the Data Privacy Act of 2012, you have the following rights:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Right to be informed:</strong> To know how your personal data is collected and used.</li>
            <li><strong>Right to access:</strong> To request a copy of your personal data held by us.</li>
            <li><strong>Right to rectification:</strong> To request corrections to inaccurate or incomplete data.</li>
            <li><strong>Right to erasure:</strong> To request deletion of your personal data, subject to legal and medical record retention requirements.</li>
            <li><strong>Right to object:</strong> To object to the processing of your data in certain circumstances.</li>
            <li><strong>Right to data portability:</strong> To receive your data in a structured, commonly used format.</li>
          </ul>
          <p>
            To exercise any of these rights, please contact clinic staff in person or through our
            official contact channels listed below.
          </p>
        </Section>

        <Section title="8. Cookies and Local Storage">
          <p>
            The portal uses browser cookies for session management (authentication tokens). These
            are HTTP-only cookies that cannot be accessed by JavaScript, providing an added layer of
            security. We also use browser localStorage solely for non-sensitive preferences such as
            theme selection (light/dark mode).
          </p>
          <p>
            We do not use tracking cookies or third-party advertising cookies.
          </p>
        </Section>

        <Section title="9. Third-Party Services">
          <p>
            We currently use the following third-party services that may process your data:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Cloudinary:</strong> For storing profile images uploaded by users.</li>
            <li><strong>Gmail (SMTP via Nodemailer):</strong> For sending appointment reminders and notification emails.</li>
            <li><strong>Google Maps Embed:</strong> For displaying our clinic location on the public website (no user data is sent to Google Maps through this feature).</li>
          </ul>
        </Section>

        <Section title="10. Children's Privacy">
          <p>
            Our portal may be used on behalf of minors by a parent or guardian. We do not knowingly
            collect data from children under 18 without parental or guardian consent. If you believe
            data from a minor has been collected without appropriate consent, please contact us
            immediately.
          </p>
        </Section>

        <Section title="11. Changes to This Privacy Policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices
            or applicable law. We will post the updated policy on this page with a revised effective
            date. We encourage you to review it periodically.
          </p>
        </Section>

        <Section title="12. Contact Us">
          <p>
            For questions, concerns, or requests regarding your personal data, please reach us at:
          </p>
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-700 space-y-1">
            <p className="font-semibold">Carait Medical and Dermatology Clinic</p>
            <p>A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna 4024</p>
            <p>Phone: (0949) 998 6956</p>
            <p>Monday – Saturday: 9:00 AM – 6:00 PM</p>
          </div>
          <p className="mt-3">
            You may also file a complaint with the{' '}
            <a
              href="https://www.privacy.gov.ph"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              National Privacy Commission of the Philippines
            </a>{' '}
            if you believe your data privacy rights have been violated.
          </p>
        </Section>

        {/* Footer nav */}
        <div className="mt-10 pt-6 border-t border-slate-100 flex items-center gap-4 flex-wrap">
          <NavLink to="/terms" className="text-sm text-blue-600 hover:underline">
            Terms of Service
          </NavLink>
          <span className="text-slate-300">|</span>
          <NavLink to="/" className="text-sm text-slate-500 hover:text-slate-700">
            Back to Home
          </NavLink>
        </div>

      </div>
    </div>
  )
}

export default PrivacyPolicys