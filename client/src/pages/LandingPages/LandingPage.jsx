import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getPublicLandingPage } from '../../services/landing.service'

const cardBg = ['bg-blue-50', 'bg-green-50', 'bg-purple-50', 'bg-yellow-50', 'bg-red-50', 'bg-slate-50']

const LandingPage = () => {
  const [content, setContent] = useState(null)

  useEffect(() => {
    getPublicLandingPage()
      .then(data => setContent(data?.content || null))
      .catch(() => setContent(null))
  }, [])

  if (!content) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-slate-400">Loading landing page...</div>
  }

  const { hero, about, testimonial, services, doctors, contact } = content

  return (
    <>
      <section
        id={hero.section_id || 'home'}
        className="relative min-h-screen flex items-center justify-center px-10 overflow-hidden"
      >
        <img
          src={hero.background_image_url}
          alt="home background"
          className="absolute inset-0 w-full h-full object-cover -z-10"
        />
        <div
          className="absolute inset-0 -z-10"
          style={{ backgroundColor: `rgba(255,255,255,${Number(hero.overlay_opacity ?? 0.7)})` }}
        />

        <div className="max-w-5xl mx-auto flex flex-col gap-6 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 leading-tight">
            {hero.heading?.replace(hero.heading_highlight || '', '').trim()} {hero.heading_highlight ? <br /> : null}
            {hero.heading_highlight && <span className="text-blue-600">{hero.heading_highlight}</span>}
          </h1>

          <p className="text-gray-700 text-lg max-w-2xl leading-relaxed">{hero.description}</p>
          <h3 className="text-xl font-semibold text-gray-800">{hero.subheading}</h3>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <NavLink
              to={hero.primary_button_path || '/patient/register'}
              className="bg-blue-600 text-white text-sm font-semibold px-5 py-3 rounded-lg hover:bg-blue-700 transition duration-300"
            >
              {hero.primary_button_label}
            </NavLink>

            <a
              href={hero.secondary_button_path || '#about'}
              className="border border-blue-600 text-blue-600 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition duration-300"
            >
              {hero.secondary_button_label}
            </a>
          </div>
        </div>
      </section>

      <section id={about.section_id || 'about'} className="py-24 px-10 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-14 items-center">
          <div className="relative">
            <img
              src={about.image_url}
              alt={about.image_alt || 'About clinic'}
              className="rounded-2xl shadow-lg w-full object-cover"
            />

            <div className="absolute -bottom-6 -right-6 bg-blue-600 text-white px-6 py-4 rounded-xl shadow-lg">
              <p className="text-2xl font-bold">{about.badge_title}</p>
              <p className="text-sm">{about.badge_text}</p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h2 className="text-4xl font-bold text-gray-800">{about.heading}</h2>
            <p className="text-gray-600 leading-relaxed text-lg">{about.body_primary}</p>
            <p className="text-gray-600 leading-relaxed">{about.body_secondary}</p>

            <div className="grid sm:grid-cols-2 gap-6 mt-4">
              <div className="bg-blue-50 p-6 rounded-xl hover:shadow-md transition">
                <h3 className="font-semibold text-lg text-blue-700 mb-2">{about.mission_title}</h3>
                <p className="text-gray-600 text-sm">{about.mission_body}</p>
              </div>

              <div className="bg-green-50 p-6 rounded-xl hover:shadow-md transition">
                <h3 className="font-semibold text-lg text-green-700 mb-2">{about.vision_title}</h3>
                <p className="text-gray-600 text-sm">{about.vision_body}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 items-center gap-10 bg-[#E6F4F1] rounded-2xl shadow-lg p-12">
            <div className="flex flex-col gap-4">
              <h2 className="text-4xl font-semibold text-teal-800">{testimonial.heading}</h2>
              <p className="text-teal-600 font-medium text-lg">{testimonial.subheading}</p>
              <p className="text-teal-700 leading-relaxed text-lg max-w-md">"{testimonial.quote}"</p>
            </div>

            <div className="relative">
              <img
                src={testimonial.image_url}
                alt={testimonial.image_alt || 'Patient Feedback'}
                className="rounded-2xl shadow-lg w-full object-cover"
              />
              <div className="absolute -bottom-4 left-0 w-24 h-1 bg-teal-800 rounded" />
            </div>
          </div>
        </div>
      </section>

      <section id={services.section_id || 'services'} className="py-24 px-10 bg-gradient-to-b from-gray-50 to-white">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-800">{services.heading}</h1>
          <p className="text-gray-600 mt-4 max-w-2xl mx-auto text-lg">{services.description}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 max-w-7xl mx-auto">
          {(services.items || []).map((service, index) => (
            <div
              key={`${service.name}-${index}`}
              className={`rounded-2xl p-8 shadow-sm hover:shadow-xl transition duration-300 transform hover:-translate-y-2 ${service.bg || cardBg[index % cardBg.length]}`}
            >
              <div className="flex justify-center mb-6 overflow-hidden">
                <img
                  src={service.image}
                  alt={service.name}
                  className="w-32 h-32 object-contain transition duration-300 hover:scale-110"
                />
              </div>

              <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">{service.name}</h3>
              <p className="text-gray-600 text-sm leading-relaxed text-center">{service.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id={doctors.section_id || 'doctors'} className="py-24 px-10 bg-gray-50 scroll-mt-24">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-800">{doctors.heading}</h1>
          <p className="text-gray-600 mt-4 max-w-2xl mx-auto text-lg">{doctors.description}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 max-w-7xl mx-auto">
          {(doctors.items || []).map((doctor, index) => (
            <div
              key={`${doctor.name}-${index}`}
              className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition transform hover:-translate-y-2 flex flex-col items-center text-center"
            >
              <div className="w-32 h-32 mb-4 rounded-full overflow-hidden border-4 border-blue-100">
                <img
                  src={doctor.image}
                  alt={doctor.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <h3 className="text-xl font-semibold text-gray-800 mb-1">{doctor.name}</h3>
              <p className="text-blue-600 font-medium mb-3">{doctor.specialize}</p>
              <p className="text-gray-600 text-sm leading-relaxed">{doctor.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id={contact.section_id || 'contact'} className="py-24 px-10 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-800 mb-4">{contact.heading}</h2>
            <p className="text-gray-600 text-lg max-w-xl mx-auto">{contact.description}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-14 items-stretch">
            <div className="flex flex-col gap-6 justify-center">
              <InfoCard title={contact.location_title} tone="blue">
                <p className="text-gray-600 text-sm leading-relaxed">
                  {(contact.address_lines || []).map((line, index) => (
                    <span key={`${line}-${index}`}>
                      {line}
                      {index < contact.address_lines.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              </InfoCard>

              <InfoCard title={contact.phone_title} tone="green">
                <p className="text-gray-600 text-sm">{contact.phone}</p>
              </InfoCard>

              <InfoCard title={contact.hours_title} tone="teal">
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{contact.hours}</p>
              </InfoCard>
            </div>

            <div className="rounded-2xl overflow-hidden shadow-lg w-full min-h-[400px]">
              <iframe
                src={contact.map_embed_url}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '400px' }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`${contact.location_title} Map`}
              />
            </div>
          </div>

          <div className="mt-16 bg-[#E6F4F1] rounded-2xl shadow-lg p-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-semibold text-teal-800 mb-1">{contact.cta_heading}</h3>
              <p className="text-teal-700 text-sm">{contact.cta_description}</p>
            </div>
            <NavLink
              to={contact.cta_path || '/patient/register'}
              className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
            >
              {contact.cta_label}
            </NavLink>
          </div>
        </div>
      </section>
    </>
  )
}

const InfoCard = ({ title, children, tone }) => {
  const toneMap = {
    blue: { wrap: 'bg-blue-50', icon: 'bg-blue-600', title: 'text-blue-700' },
    green: { wrap: 'bg-green-50', icon: 'bg-green-600', title: 'text-green-700' },
    teal: { wrap: 'bg-[#E6F4F1]', icon: 'bg-teal-700', title: 'text-teal-800' },
  }
  const current = toneMap[tone] || toneMap.blue

  return (
    <div className={`${current.wrap} p-6 rounded-xl hover:shadow-md transition flex gap-4 items-start`}>
      <div className={`${current.icon} text-white p-3 rounded-lg mt-1 shrink-0 w-11 h-11`} />
      <div>
        <h3 className={`font-semibold text-lg mb-1 ${current.title}`}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default LandingPage
