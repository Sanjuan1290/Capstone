import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MdArrowForward, MdCalendarMonth, MdLocalPhone, MdLocationOn, MdMedicalServices, MdOpenInNew, MdPerson, MdSchedule, MdVerified } from 'react-icons/md'
import { getPublicLandingPage, getPublicPromotions, getPublicLandingDirectory } from '../../services/landing.service'
import { PromotionCard } from '../../components/promotions/PromotionCards'
import { normalizeAppPath, isExternalPath } from '../../utils/navigation'
import { branchDirectionsUrl } from '../../utils/philippinePhone'

const bookingFallback = '/patient/register'
const PUBLIC_BRANCHES = '/api/patient/branches'
const visible = (section) => section?.visible !== false
const safePhone = (value) => String(value || '').replace(/[^+\d]/g, '')
const headingText = (value, fallback) => String(value || fallback).trim()
const linkedBookingPath = (record, kind, directory) => {
  if (!directory || !record) return ''
  const id = Number(kind === 'service' ? record.catalog_service_id : record.doctor_id)
  const branch = Number(record.branch_id)
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(branch) || branch <= 0) return ''
  const found = (kind === 'service' ? directory.services : directory.doctors)?.find(row => Number(row.id) === id && Number(row.branch_id) === branch)
  if (!found) return ''
  const params = new URLSearchParams({ branch_id: String(branch), clinic: found.clinic_type })
  if (kind === 'service') params.set('service_id', String(found.id))
  else params.set('doctor', String(found.id))
  return `/patient/book?${params.toString()}`
}
const CARD_COLORS = Object.freeze({
  'bg-slate-50':'#ffffff', 'bg-blue-50':'#eff6ff', 'bg-green-50':'#f0fdf4',
  'bg-purple-50':'#faf5ff', 'bg-yellow-50':'#fefce8', 'bg-red-50':'#fef2f2',
})
const sectionBase = 'scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24'
const button = 'carait-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-[background-color,transform,box-shadow,color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600'

// Reveal uses IntersectionObserver only on the public site. Content remains visible if JS is unavailable.
export function Reveal({ children, className = '', delay = 0, preview = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node || preview || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    node.dataset.reveal = 'pending'
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { node.dataset.reveal = 'shown'; observer.unobserve(node) }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' })
    observer.observe(node)
    return () => { observer.disconnect(); node.dataset.reveal = 'shown' }
  }, [preview])
  return <div ref={ref} className={`carait-reveal ${className}`} style={{ '--carait-delay': `${Math.min(delay, 450)}ms` }}>{children}</div>
}

const Action = ({ path, children, tone = 'primary', preview = false, className = '' }) => {
  const target = normalizeAppPath(path || bookingFallback, bookingFallback)
  const classes = `${button} ${tone === 'primary' ? 'bg-sky-700 text-white shadow-sm hover:bg-sky-800 hover:-translate-y-0.5' : 'border border-sky-700 bg-white/90 text-sky-800 hover:bg-sky-50 hover:-translate-y-0.5'} ${className}`
  if (preview) return <span className={classes} aria-hidden="true">{children}</span>
  if (target.startsWith('#') || isExternalPath(target)) return <a href={target} className={classes} {...(isExternalPath(target) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  return <NavLink to={target} className={classes}>{children}</NavLink>
}

const SectionTitle = ({ eyebrow, title, description, id }) => (
  <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
    {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>}
    <h2 id={id} className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
    {description && <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">{description}</p>}
  </div>
)

// The same component renders published content and the unsaved editor preview.
export function LandingPageSections({ content, promotions = [], branches = [], directory = null, preview = false, previewSection = 'all' }) {
  if (!content) return null
  const { hero = {}, about = {}, testimonial = {}, services = {}, doctors = {}, contact = {}, header = {}, footer = {} } = content
  const ordering = Array.isArray(content.section_order) ? content.section_order : ['hero','services','doctors','about','testimonial','contact']
  const order = id => Math.max(0,ordering.indexOf(id)) * 10
  const show = (id) => previewSection === 'all' || previewSection === id || (id === 'testimonial' && previewSection === 'about')
  const address = Array.isArray(contact.address_lines) ? contact.address_lines.filter(Boolean).join(', ') : String(contact.address_lines || '')
  const mapUrl = String(contact.map_embed_url || '')
  const validMapUrl = /^https:\/\/(www\.)?google\.com\/maps\/embed\?/i.test(mapUrl)
  const phone = safePhone(contact.phone)
  const selectedBranches = Array.isArray(branches) ? branches : []
  const serviceFallback = normalizeAppPath(header.cta_path, bookingFallback)
  return <div className={`carait-landing flex flex-col bg-white text-slate-900 ${preview ? 'carait-preview' : ''}`}>
    {preview && show('header') && <div style={{order:-10}} className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3"><div className="flex items-center gap-2"><img src={header.logo_url || '/logo.png'} className="h-9 w-9 rounded-full object-contain" alt="" /><b className="text-sm">{header.clinic_name || 'CARAIT Clinic'}</b></div><span className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white">{header.cta_label || 'Book Appointment'}</span></div>}

    {visible(hero) && show('hero') && <section style={{order:order('hero')}} id={hero.section_id || 'home'} aria-labelledby="carait-hero-heading" className={`relative isolate flex overflow-hidden ${preview ? 'min-h-[380px]' : 'min-h-[min(700px,86svh)]'} items-center px-4 py-16 sm:px-6 lg:px-8`}>
      <img src={hero.background_image_url || '/homeBG.png'} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority={preview ? 'auto' : 'high'} onError={e => { if (!e.currentTarget.src.endsWith('/homeBG.png')) e.currentTarget.src = '/homeBG.png' }} />
      <div className="absolute inset-0" style={{ background: `rgba(255,255,255,${Math.max(0,Math.min(1,Number(hero.overlay_opacity ?? 0.68)))})` }} />
      <div className={`relative z-10 mx-auto w-full max-w-7xl ${preview ? '' : 'carait-hero-content'}`}>
        {hero.subheading && <p className="mb-4 inline-flex rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-sky-900">{hero.subheading}</p>}
        <h1 id="carait-hero-heading" className="max-w-3xl text-3xl font-black leading-[1.13] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">{headingText(hero.heading, 'Medical and Dermatology Care')}</h1>
        {hero.description && <p className="mt-5 max-w-2xl text-base leading-7 text-slate-800 sm:text-lg">{hero.description}</p>}
        <div className="mt-7 flex flex-wrap gap-3"><Action path={hero.primary_button_path} preview={preview}>{hero.primary_button_label || 'Book Appointment'} <MdArrowForward /></Action><Action path={hero.secondary_button_path || '#services'} tone="outline" preview={preview}>{hero.secondary_button_label || 'View Services'}</Action></div>
      </div>
    </section>}

    {show('hero') && previewSection === 'all' && <div style={{order:order('hero')+1}} className="border-y border-sky-100 bg-sky-50/70 px-4 py-5"><div className="mx-auto grid max-w-6xl gap-4 text-sm sm:grid-cols-3"><p className="flex items-center gap-2 font-semibold text-slate-700"><MdMedicalServices className="text-teal-700" /> Medical & dermatology care</p><p className="flex items-center gap-2 font-semibold text-slate-700"><MdCalendarMonth className="text-teal-700" /> Online appointment requests</p><p className="flex items-center gap-2 font-semibold text-slate-700"><MdLocationOn className="text-teal-700" /> Clinic branch information</p></div></div>}

    {show('hero') && promotions.length > 0 && <section style={{order:order('hero')+2}} id="special-offers" className={`${sectionBase} bg-slate-50`} aria-labelledby="carait-offers-heading"><div className="mx-auto max-w-7xl"><SectionTitle id="carait-offers-heading" eyebrow="Current promotions" title="Clinic Offers" description="Read each offer's branch, dates, and terms before booking." /><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{promotions.slice(0,6).map((p, i) => <Reveal preview={preview} delay={i * 65} key={`${p.branch_id}-${p.id}`}><PromotionCard promotion={p} directory={directory} /></Reveal>)}</div><div className="mt-8 text-center"><Action path="/news?type=promotion" tone="outline" preview={preview}>All Offers <MdArrowForward /></Action></div></div></section>}

    {visible(services) && show('services') && <section style={{order:order('services')}} id={services.section_id || 'services'} className={`${sectionBase} bg-gradient-to-b from-white to-sky-50/40`} aria-labelledby="carait-services-heading"><div className="mx-auto max-w-7xl"><Reveal preview={preview}><SectionTitle id="carait-services-heading" eyebrow="What we offer" title={headingText(services.heading, 'Our Services')} description={services.description} /></Reveal><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{(services.items || []).map((service, index) => <Reveal preview={preview} delay={index % 3 * 75} key={`${service.name}-${index}`}><article className="carait-lift flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 p-6 shadow-sm" style={{backgroundColor:CARD_COLORS[service.bg] || '#ffffff'}}><div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-50">{service.image ? <img src={service.image} alt="" loading="lazy" className="h-16 w-16 object-contain" /> : <MdMedicalServices className="text-3xl text-teal-700" />}</div><h3 className="text-lg font-extrabold text-slate-900">{service.name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{service.description}</p><div className="mt-auto pt-6"><Action preview={preview} path={linkedBookingPath(service,'service',directory) || service.booking_path || serviceFallback} tone="outline" className="w-full">{service.button_label || 'Book an Appointment'} <MdArrowForward /></Action></div></article></Reveal>)}</div></div></section>}

    {visible(doctors) && show('doctors') && <section style={{order:order('doctors')}} id={doctors.section_id || 'doctors'} className={`${sectionBase} bg-slate-50`} aria-labelledby="carait-doctors-heading"><div className="mx-auto max-w-7xl"><Reveal preview={preview}><SectionTitle id="carait-doctors-heading" eyebrow="Our care team" title={headingText(doctors.heading, 'Meet Our Doctors')} description={doctors.description} /></Reveal><div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">{(doctors.items || []).map((doctor,index) => <Reveal key={`${doctor.name}-${index}`} preview={preview} delay={index*85}><article className="carait-lift flex h-full flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><div className="h-28 w-28 overflow-hidden rounded-full border-4 border-sky-100 bg-slate-100">{doctor.image ? <img src={doctor.image} alt="" loading="lazy" className="h-full w-full object-cover"/> : <MdPerson className="h-full w-full p-6 text-slate-400"/>}</div><div><h3 className="text-lg font-extrabold text-slate-900">{doctor.name}</h3><p className="mt-1 font-semibold text-teal-700">{doctor.specialize}</p></div><p className="flex-1 text-sm leading-6 text-slate-600">{doctor.description}</p><Action path={linkedBookingPath(doctor,'doctor',directory) || doctor.booking_path || serviceFallback} preview={preview} tone="outline" className="w-full">Book an Appointment <MdArrowForward /></Action></article></Reveal>)}</div></div></section>}

    {visible(about) && show('about') && <section style={{order:order('about')}} id={about.section_id || 'about'} className={`${sectionBase} bg-white`} aria-labelledby="carait-about-heading"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2"><Reveal preview={preview}><div className="relative"><img src={about.image_url || '/about/aboutClinic.png'} alt={about.image_alt || 'CARAIT Clinic facility'} loading="lazy" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-md" />{about.badge_title && <div className="absolute bottom-4 left-4 rounded-xl bg-white/95 px-5 py-3 shadow-lg"><b className="block text-2xl text-sky-800">{about.badge_title}</b><span className="text-sm text-slate-600">{about.badge_text}</span></div>}</div></Reveal><Reveal preview={preview} delay={100}><p className="text-xs font-extrabold uppercase tracking-widest text-teal-700">About CARAIT</p><h2 id="carait-about-heading" className="mt-3 text-3xl font-black text-slate-900 sm:text-4xl">{about.heading || 'About Our Clinic'}</h2><p className="mt-5 text-base leading-7 text-slate-700">{about.body_primary}</p>{about.body_secondary && <p className="mt-4 text-sm leading-7 text-slate-600">{about.body_secondary}</p>}<div className="mt-7 grid gap-4 sm:grid-cols-2">{[['mission_title','mission_body'],['vision_title','vision_body']].map(([title,body])=>about[body] && <div key={title} className="rounded-xl border border-teal-100 bg-teal-50/70 p-5"><h3 className="font-extrabold text-teal-900">{about[title]}</h3><p className="mt-2 text-sm leading-6 text-slate-700">{about[body]}</p></div>)}</div></Reveal></div></section>}

    {visible(testimonial) && show('testimonial') && testimonial.quote && <section style={{order:order('testimonial')}} className={`${sectionBase} bg-teal-50`} aria-labelledby="carait-feedback-heading"><Reveal preview={preview}><div className="mx-auto grid max-w-6xl items-center gap-8 rounded-3xl bg-white p-6 shadow-sm md:grid-cols-2 md:p-10"><div><p className="text-xs font-extrabold uppercase tracking-widest text-teal-700">Patient feedback</p><h2 id="carait-feedback-heading" className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">{testimonial.heading}</h2><p className="mt-3 font-semibold text-teal-700">{testimonial.subheading}</p><blockquote className="mt-4 border-l-4 border-teal-600 pl-4 text-base leading-7 text-slate-700">“{testimonial.quote}”</blockquote></div>{testimonial.image_url && <img src={testimonial.image_url} alt={testimonial.image_alt || 'Clinic feedback'} loading="lazy" className="max-h-72 w-full rounded-2xl object-cover" />}</div></Reveal></section>}

    {visible(contact) && show('contact') && <section style={{order:order('contact')}} id={contact.section_id || 'contact'} className={`${sectionBase} bg-slate-50`} aria-labelledby="carait-contact-heading"><div className="mx-auto max-w-7xl"><Reveal preview={preview}><SectionTitle id="carait-contact-heading" eyebrow="Visit or get in touch" title={headingText(contact.heading, 'Contact Our Clinic')} description={contact.description}/></Reveal>{selectedBranches.length > 0 ? <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{selectedBranches.map((branch,i) => <Reveal preview={preview} delay={i%3*70} key={branch.id}><article className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-extrabold text-slate-900">{branch.name}</h3>{branch.address && <p className="mt-3 flex items-start gap-2 text-sm text-slate-600"><MdLocationOn className="mt-1 shrink-0 text-teal-700" />{branch.address}</p>}{branch.phone && <p className="mt-3 flex items-center gap-2 text-sm text-slate-600"><MdLocalPhone className="shrink-0 text-teal-700" />{branch.phone}</p>}<div className="mt-5 flex flex-wrap gap-2">{branch.phone && <a href={`tel:${safePhone(branch.phone)}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-sky-800">Call Clinic</a>}{branchDirectionsUrl(branch) && <a href={branchDirectionsUrl(branch)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-sky-800">Directions <MdOpenInNew /></a>}</div></article></Reveal>)}</div> : <div className="mb-8 rounded-xl border border-sky-100 bg-white p-5"><p className="flex items-start gap-2 text-sm text-slate-700"><MdLocationOn className="mt-1 text-teal-700" />{address || 'Contact the clinic for the current address.'}</p><p className="mt-3 flex items-center gap-2 text-sm text-slate-700"><MdLocalPhone className="text-teal-700" />{contact.phone || 'Please contact the clinic for its phone number.'}</p></div>}
      <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="text-lg font-bold text-slate-900">General Clinic Information</h3>{contact.hours && <p className="mt-4 flex items-start gap-2 whitespace-pre-line text-sm leading-7 text-slate-600"><MdSchedule className="mt-1 shrink-0 text-teal-700" />{contact.hours}</p>}<p className="mt-3 text-xs text-slate-500">Contact the selected branch to confirm its current hours.</p>{phone && <a className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-sky-700 underline" href={`tel:${phone}`}><MdLocalPhone />Call Main Clinic</a>}</div>{validMapUrl && <div className="min-h-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white"><iframe title="CARAIT Clinic location map" src={mapUrl} className="h-full min-h-[280px] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div>}</div>{contact.cta_heading && <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-2xl bg-teal-800 p-7 text-white md:flex-row md:items-center"><div><h3 className="text-xl font-black">{contact.cta_heading}</h3><p className="mt-2 text-sm text-teal-50">{contact.cta_description}</p></div><Action path={contact.cta_path} preview={preview} tone="outline">{contact.cta_label || 'Book Appointment'} <MdArrowForward /></Action></div>}</div></section>}

    {preview && show('footer') && <div style={{order:70}} className="bg-teal-900 p-6 text-white"><b className="text-lg">CARAIT Clinic</b><p className="mt-2 text-sm text-teal-100">{footer.copyright}</p><p className="mt-2 text-xs text-teal-100">Services · Doctors · Contact · News & Offers</p></div>}
  </div>
}

const LandingPage = () => {
  const [content,setContent] = useState(null)
  const [promotions,setPromotions] = useState([])
  const [branches,setBranches] = useState([])
  const [directory,setDirectory] = useState(null)
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const load = () => {
    setLoading(true);setError('')
    getPublicLandingPage().then(d => setContent(d?.content || null)).catch(() => setError('The website information could not be loaded. Please try again.')).finally(() => setLoading(false))
  }
  useEffect(() => { load();getPublicPromotions().then(setPromotions).catch(()=>setPromotions([]));getPublicLandingDirectory().then(setDirectory).catch(()=>setDirectory(null));fetch(PUBLIC_BRANCHES).then(r=>r.ok?r.json():[]).then(d=>setBranches(Array.isArray(d)?d:[])).catch(()=>setBranches([])) }, [])
  if (loading) return <main className="mx-auto min-h-[60vh] max-w-6xl animate-pulse space-y-5 px-5 py-16" aria-busy="true" aria-label="Loading clinic website"><div className="h-9 w-3/4 rounded-xl bg-slate-200"/><div className="h-5 w-1/2 rounded-xl bg-slate-100"/><div className="h-56 rounded-3xl bg-slate-100"/></main>
  if (error || !content) return <main className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"><MdVerified className="text-4xl text-teal-700"/><h1 className="text-2xl font-bold text-slate-900">Clinic website temporarily unavailable</h1><p className="text-sm text-slate-600">{error || 'Please try again.'}</p><button className={`${button} bg-sky-700 text-white`} type="button" onClick={load}>Try Again</button></main>
  return <LandingPageSections content={content} promotions={promotions} branches={branches} directory={directory} />
}
export default LandingPage
