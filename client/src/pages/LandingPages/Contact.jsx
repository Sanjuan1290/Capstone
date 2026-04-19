// client/src/pages/LandingPages/Contact.jsx
// UPDATED: Now reads all contact info from landing page CMS data passed as props.
// Icons are rendered from react-icons (no missing SVGs).
// Supports address_lines, phone, hours, map_embed_url, heading, description,
// location_title, phone_title, hours_title, cta_heading, cta_description, cta_label, cta_path.

import { NavLink } from 'react-router-dom'
import { MdLocationOn, MdPhone, MdAccessTime } from 'react-icons/md'

// ── Default fallback values (matches DB content) ──────────────────────────────
const DEFAULT_CONTACT = {
  heading:         'CONTACT US',
  description:     "We'd love to hear from you. Visit us or reach out anytime.",
  location_title:  'Our Location',
  address_lines:   ['A. Bonifacio St., Brgy. Canlalay', 'Binan, Laguna 4024'],
  phone_title:     'Phone Number',
  phone:           '(0949) 998 6956',
  hours_title:     'Clinic Hours',
  hours:           'Monday - Saturday: 9:00 AM - 6:00 PM\nSunday: Closed',
  map_embed_url:   'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d43325.4203321316!2d121.06200694781873!3d14.342479587423213!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397d7dd46e3b0cf%3A0x1e83bf84b4d824b3!2scarait%20medical%20and%20dermatological%20clinic!5e1!3m2!1sen!2sph!4v1773723093429!5m2!1sen!2sph',
  cta_heading:     'Ready to Book an Appointment?',
  cta_description: 'Same-day appointments available whenever possible.',
  cta_label:       'Book Appointment',
  cta_path:        '/patient/register',
}

// ── Contact info card ─────────────────────────────────────────────────────────
const InfoCard = ({ icon: Icon, iconBg, iconColor, titleColor, bg, title, children }) => (
  <div className={`${bg} p-6 rounded-2xl hover:shadow-md transition flex gap-4 items-start`}>
    <div className={`${iconBg} text-white p-3 rounded-xl mt-1 shrink-0`}>
      <Icon className={`w-5 h-5 ${iconColor}`} />
    </div>
    <div>
      <h3 className={`font-semibold text-lg ${titleColor} mb-1`}>{title}</h3>
      {children}
    </div>
  </div>
)

const Contact = ({ contact: contactProp }) => {
  const c = { ...DEFAULT_CONTACT, ...contactProp }

  // address_lines can be an array or a plain string
  const addressLines = Array.isArray(c.address_lines)
    ? c.address_lines.filter(Boolean)
    : typeof c.address_lines === 'string'
      ? c.address_lines.split('\n')
      : [DEFAULT_CONTACT.address_lines[0], DEFAULT_CONTACT.address_lines[1]]

  // hours can be multiline string
  const hoursLines = typeof c.hours === 'string'
    ? c.hours.split('\n').filter(Boolean)
    : ['Monday - Saturday: 9:00 AM - 6:00 PM', 'Sunday: Closed']

  return (
    <section id={c.section_id || 'contact'} className="py-24 px-6 md:px-10 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-800 mb-4">{c.heading}</h2>
          <p className="text-gray-600 text-lg max-w-xl mx-auto">{c.description}</p>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-14 items-stretch">

          {/* LEFT — Contact Info */}
          <div className="flex flex-col gap-5 justify-center">

            {/* Our Location */}
            <InfoCard
              icon={MdLocationOn}
              iconBg="bg-blue-600"
              iconColor="text-white"
              titleColor="text-blue-700"
              bg="bg-blue-50"
              title={c.location_title || 'Our Location'}
            >
              <p className="text-gray-600 text-sm leading-relaxed">
                {addressLines.map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < addressLines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            </InfoCard>

            {/* Phone Number */}
            <InfoCard
              icon={MdPhone}
              iconBg="bg-green-600"
              iconColor="text-white"
              titleColor="text-green-700"
              bg="bg-green-50"
              title={c.phone_title || 'Phone Number'}
            >
              <p className="text-gray-600 text-sm">{c.phone}</p>
            </InfoCard>

            {/* Clinic Hours */}
            <InfoCard
              icon={MdAccessTime}
              iconBg="bg-teal-700"
              iconColor="text-white"
              titleColor="text-teal-800"
              bg="bg-[#E6F4F1]"
              title={c.hours_title || 'Clinic Hours'}
            >
              <p className="text-gray-600 text-sm leading-relaxed">
                {hoursLines.map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < hoursLines.length - 1 && <br />}
                  </span>
                ))}
              </p>
            </InfoCard>
          </div>

          {/* RIGHT — Google Map */}
          {c.map_embed_url ? (
            <div className="rounded-2xl overflow-hidden shadow-lg w-full min-h-[400px]">
              <iframe
                src={c.map_embed_url}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '400px' }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Carait Medical and Dermatological Clinic Location"
              />
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden shadow-lg w-full min-h-[400px] bg-slate-100 flex items-center justify-center">
              <p className="text-slate-400 text-sm">Map embed URL not set</p>
            </div>
          )}
        </div>

        {/* ── Bottom CTA Banner ────────────────────────────────────────────── */}
        {c.cta_heading && (
          <div className="mt-16 bg-[#E6F4F1] rounded-2xl shadow-lg p-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-semibold text-teal-800 mb-1">{c.cta_heading}</h3>
              {c.cta_description && (
                <p className="text-teal-700 text-sm">{c.cta_description}</p>
              )}
            </div>
            {c.cta_path && (
              <NavLink
                to={c.cta_path}
                className="bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-300 whitespace-nowrap"
              >
                {c.cta_label || 'Book Appointment'}
              </NavLink>
            )}
          </div>
        )}

      </div>
    </section>
  )
}

export default Contact