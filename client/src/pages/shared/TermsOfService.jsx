// client/src/pages/shared/TermsOfService.jsx
// Full Terms of Service for Carait Medical and Dermatology Clinic

import { NavLink } from 'react-router-dom'
import { MdArrowBack } from 'react-icons/md'

const Section = ({ title, children }) => (
  <div className="mt-8">
    <h2 className="text-lg font-bold text-slate-800 mb-3">{title}</h2>
    <div className="text-sm leading-7 text-slate-600 space-y-3">{children}</div>
  </div>
)

const TermsOfService = () => {
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
        <h1 className="text-3xl font-black text-slate-800">Terms of Service</h1>
        <p className="mt-2 text-xs text-slate-400 font-medium uppercase tracking-wider">
          Effective Date: January 1, 2025 · Last Updated: April 2026
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Welcome to the Carait Medical and Dermatology Clinic patient portal. By accessing or using
          this system — including appointment booking, patient records, and any related features —
          you agree to be bound by these Terms of Service. Please read them carefully before
          registering or using any part of the system.
        </p>

        <Section title="1. Acceptance of Terms">
          <p>
            By creating an account or using any feature of the Carait Clinic patient portal, you
            confirm that you have read, understood, and agree to these Terms of Service and our
            Privacy Policy. If you do not agree, you must not use this system.
          </p>
          <p>
            These terms apply to all users of the portal, including patients, walk-in registrants,
            and any other individuals who access the system on behalf of a patient (e.g., a guardian
            registering a minor).
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 18 years old to register independently for the portal. Minors may
            be registered by a parent or legal guardian, who accepts these terms on their behalf.
            By registering, you represent that all information you provide is accurate, current, and
            complete.
          </p>
        </Section>

        <Section title="3. User Account">
          <p>
            You are responsible for maintaining the confidentiality of your account credentials
            (email and password). You must not share your login information with any other person.
            You agree to notify clinic staff immediately if you suspect unauthorized access to your
            account.
          </p>
          <p>
            The clinic reserves the right to suspend or terminate any account that violates these
            terms or poses a risk to other users or clinic operations.
          </p>
        </Section>

        <Section title="4. Use of the System">
          <p>You agree to use the portal only for lawful purposes, including:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Booking, rescheduling, or cancelling appointments.</li>
            <li>Viewing your appointment history and consultation records.</li>
            <li>Communicating accurate health information to support your care.</li>
          </ul>
          <p>
            You agree NOT to misuse the system by submitting false information, impersonating
            another person, interfering with the operation of the portal, or attempting to gain
            unauthorized access to other accounts or clinic data.
          </p>
        </Section>

        <Section title="5. Medical Disclaimer">
          <p>
            This portal is a scheduling and records management tool. It does not provide medical
            advice, diagnosis, or treatment. Information accessible through the portal (such as
            consultation notes or prescriptions) is provided for your personal reference only and
            must not be interpreted as a substitute for professional medical advice from a licensed
            physician.
          </p>
          <p>
            In case of a medical emergency, please call emergency services (911) or proceed to the
            nearest emergency room immediately. Do not rely on this system for urgent medical needs.
          </p>
        </Section>

        <Section title="6. Appointments and Cancellations">
          <p>
            Appointment slots are limited. Once a booking is confirmed, you are expected to attend
            at the scheduled time or cancel in advance so the slot can be made available to others.
            Repeated no-shows may result in restrictions on future bookings at the clinic's
            discretion.
          </p>
          <p>
            The clinic reserves the right to reschedule or cancel appointments due to emergencies,
            doctor unavailability, or other unforeseen circumstances. You will be notified via the
            contact information on your account.
          </p>
        </Section>

        <Section title="7. Personal Data and Privacy">
          <p>
            Your use of the portal is also governed by our{' '}
            <NavLink to="/privacy-policy" className="text-blue-600 hover:underline font-medium">
              Privacy Policy
            </NavLink>
            , which explains how we collect, use, and protect your personal health information in
            accordance with Republic Act 10173 (Data Privacy Act of 2012).
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            All content, designs, software, and materials provided through this portal are the
            property of Carait Medical and Dermatology Clinic and may not be reproduced, distributed,
            or used for commercial purposes without prior written consent.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            Carait Medical and Dermatology Clinic shall not be liable for any indirect, incidental,
            or consequential damages arising from your use of or inability to use the portal,
            including but not limited to loss of data, scheduling errors resulting from inaccurate
            information submitted by the user, or service interruptions.
          </p>
          <p>
            Our total liability for any claim related to the portal shall not exceed the amount
            paid by you, if any, for services directly related to the claim.
          </p>
        </Section>

        <Section title="10. Changes to These Terms">
          <p>
            We may update these Terms of Service from time to time. Changes will be posted on this
            page with an updated effective date. Continued use of the portal after changes are
            posted constitutes your acceptance of the revised terms.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms of Service are governed by the laws of the Republic of the Philippines.
            Any disputes arising from use of this portal shall be subject to the jurisdiction of
            the appropriate courts in the Province of Laguna, Philippines.
          </p>
        </Section>

        <Section title="12. Contact Us">
          <p>
            If you have questions about these Terms of Service, please contact us at:
          </p>
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-700 space-y-1">
            <p className="font-semibold">Carait Medical and Dermatology Clinic</p>
            <p>A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna 4024</p>
            <p>Phone: (0949) 998 6956</p>
          </div>
        </Section>

        {/* Footer nav */}
        <div className="mt-10 pt-6 border-t border-slate-100 flex items-center gap-4 flex-wrap">
          <NavLink to="/privacy-policy" className="text-sm text-blue-600 hover:underline">
            Privacy Policy
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

export default TermsOfService