const db = require('../db/connect')

const DEFAULT_LANDING_PAGE_CONTENT = {
  header: {
    clinic_name: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
    logo_url: '/logo.png',
    nav_links: [
      { label: 'Home', path: '#home' },
      { label: 'About', path: '#about' },
      { label: 'Services', path: '#services' },
      { label: 'Doctors', path: '#doctors' },
      { label: 'Contact', path: '#contact' },
    ],
    login_label: 'Log in',
    login_path: '/patient/login',
    cta_label: 'Book Appointment',
    cta_path: '/patient/register',
  },
  hero: {
    section_id: 'home',
    background_image_url: '/homeBG.png',
    overlay_opacity: 0.7,
    heading: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
    heading_highlight: 'DERMATOLOGY CLINIC',
    description: 'Since our founding in 2015, we have been committed to providing modern, efficient, and high-quality medical and dermatological care to every patient. We focus on wellness and holistic care, ensuring personalized treatment for everyone who visits our clinic.',
    subheading: 'Providers of Comprehensive Care',
    primary_button_label: 'Book Appointment',
    primary_button_path: '/patient/register',
    secondary_button_label: 'Learn More',
    secondary_button_path: '#about',
  },
  about: {
    section_id: 'about',
    image_url: '/about/aboutClinic.png',
    image_alt: 'Carait Medical and Dermatology Clinic',
    badge_title: '10+',
    badge_text: 'Years Experience',
    heading: 'ABOUT OUR CLINIC',
    body_primary: 'Since its founding in 2015, Carait Medical and Dermatology Clinic has been committed to providing patients with affordable, reliable, and efficient healthcare services. Our goal is to deliver quality medical and dermatologic care that focuses on the overall health and well-being of every patient who visits our clinic.',
    body_secondary: 'We strive to minimize patient wait times and continuously improve our services to make healthcare more convenient and accessible. Whenever possible, we also offer same-day appointments to better accommodate urgent medical needs. Our clinic is located at A. Bonifacio St., Brgy. Canlalay, Binan, Laguna, where we proudly serve the local community with compassionate and patient-centered care.',
    mission_title: 'Our Mission',
    mission_body: 'To provide accessible, compassionate, and high-quality medical and dermatological care that improves the health and wellbeing of our patients.',
    vision_title: 'Our Vision',
    vision_body: 'To be a trusted healthcare provider known for modern treatments, patient-centered care, and excellence in dermatological and medical services.',
  },
  testimonial: {
    heading: 'WHAT OUR PATIENTS SAY ABOUT US',
    subheading: 'Only the Best',
    quote: 'Thank you dra for making us beautiful and gwapod as can be. Our monthly IPL and microneedling all paid off. Thank you for removing my 10 step Korean skincare regimen and working your magic on us.',
    image_url: '/about/feedback.png',
    image_alt: 'Patient Feedback',
  },
  services: {
    section_id: 'services',
    heading: 'OUR SERVICES',
    description: 'We provide a wide range of medical and dermatological services focused on patient wellness, modern treatments, and quality healthcare.',
    items: [
      {
        name: 'MEDICAL CONSULTATIONS',
        description: 'Consultations for medical concerns for all ages (baby to adult) and surgical procedures (minor excision, circumcision etc).',
        image: '/services/medical_consultation.png',
        bg: 'bg-blue-50',
      },
      {
        name: 'VACCINATIONS',
        description: 'It can be so tempting to put off your next appointment. At Carait Medical and Dermatology Clinic, we make it easier than ever to schedule Vaccinations.',
        image: '/services/vaccination.png',
        bg: 'bg-green-50',
      },
      {
        name: 'DERMATOLOGIC CONSULTS AND PROCEDURES',
        description: 'Concern on skin, hair and nails for all ages. Dermatologic procedures include laser for rejuvenation and scars, intense pulse light treatment for anti-aging and hair removal, electrocautery for warts and syringoma, chemical peeling, and skin biopsy.',
        image: '/services/dermatologic_consults_procedures.png',
        bg: 'bg-purple-50',
      },
      {
        name: 'ACUPUNCTURE',
        description: 'Acupuncture for pain relief, vertigo, migraine, insomnia and smoking cessation and more.',
        image: '/services/acupuncture.png',
        bg: 'bg-yellow-50',
      },
      {
        name: 'ANIMAL BITE CENTER (ABC)',
        description: 'We offer vaccines for pre-exposure prophylaxis and post-exposure animal bite management by our trained doctors.',
        image: '/services/animal_bite_center(ABC).png',
        bg: 'bg-red-50',
      },
    ],
  },
  doctors: {
    section_id: 'doctors',
    heading: 'OUR DOCTORS',
    description: 'Meet our team of experienced and compassionate doctors, committed to providing high-quality medical and dermatological care.',
    items: [
      {
        name: 'DR. MAGTANGOL JOSE C. CARAIT IV',
        specialize: 'Family Medicine Specialist',
        description: 'Dr. Carait is a Fellow of the Philippine Academy of Family Physicians (PAFP). He is also a certified medical acupuncturist and a member of the Philippine Institute of Traditional and Alternative Health Care (PITAHC).',
        image: '/doctors/tanjol.png',
      },
      {
        name: 'DR. PAULA KARINA GONZALES-CARAIT',
        specialize: 'Dermatologist',
        description: 'Dr. Gonzales-Carait is a Board-certified Dermatologist. She is a Fellow of the Philippine Dermatological Society and the Philippine Society of Venereology Inc.',
        image: '/doctors/paula.png',
      },
    ],
  },
  contact: {
    section_id: 'contact',
    heading: 'CONTACT US',
    description: "We'd love to hear from you. Visit us or reach out anytime.",
    location_title: 'Our Location',
    address_lines: ['A. Bonifacio St., Brgy. Canlalay', 'Binan, Laguna 4024'],
    phone_title: 'Phone Number',
    phone: '(0949) 998 6956',
    hours_title: 'Clinic Hours',
    hours: 'Monday - Saturday: 9:00 AM - 6:00 PM\nSunday: Closed',
    map_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d43325.4203321316!2d121.06200694781873!3d14.342479587423213!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397d7dd46e3b0cf%3A0x1e83bf84b4d824b3!2scarait%20medical%20and%20dermatological%20clinic!5e1!3m2!1sen!2sph!4v1773723093429!5m2!1sen!2sph',
    cta_heading: 'Ready to Book an Appointment?',
    cta_description: 'Same-day appointments available whenever possible.',
    cta_label: 'Book Appointment',
    cta_path: '/patient/register',
  },
  footer: {
    copyright: '©2023 by Carait Medical and Dermatology Clinic',
    facebook_url: 'https://www.facebook.com/carait.mdc?mibextid=LQQJ4d',
  },
}

const normalizeArray = (value, fallback) => {
  if (!Array.isArray(value)) return fallback
  return value
}

const mergeSection = (defaults, incoming = {}) => {
  const next = { ...defaults, ...(incoming || {}) }
  if (Array.isArray(defaults.nav_links)) next.nav_links = normalizeArray(incoming?.nav_links, defaults.nav_links)
  if (Array.isArray(defaults.items)) next.items = normalizeArray(incoming?.items, defaults.items)
  if (Array.isArray(defaults.address_lines)) next.address_lines = normalizeArray(incoming?.address_lines, defaults.address_lines)
  return next
}

const DEFAULT_SECTION_ORDER = ['hero','services','doctors','about','testimonial','contact']
const normalizeSectionOrder = value => {
  const allowed = Array.isArray(value) ? value.filter(id => DEFAULT_SECTION_ORDER.includes(id)) : []
  return [...new Set([...allowed, ...DEFAULT_SECTION_ORDER])]
}
const normalizeLandingPageContent = (content = {}) => ({
  section_order: normalizeSectionOrder(content.section_order),
  header: mergeSection(DEFAULT_LANDING_PAGE_CONTENT.header, content.header),
  hero: mergeSection(DEFAULT_LANDING_PAGE_CONTENT.hero, content.hero),
  about: mergeSection(DEFAULT_LANDING_PAGE_CONTENT.about, content.about),
  testimonial: mergeSection(DEFAULT_LANDING_PAGE_CONTENT.testimonial, content.testimonial),
  services: {
    ...mergeSection(DEFAULT_LANDING_PAGE_CONTENT.services, content.services),
    items: normalizeArray(content?.services?.items, DEFAULT_LANDING_PAGE_CONTENT.services.items),
  },
  doctors: {
    ...mergeSection(DEFAULT_LANDING_PAGE_CONTENT.doctors, content.doctors),
    items: normalizeArray(content?.doctors?.items, DEFAULT_LANDING_PAGE_CONTENT.doctors.items),
  },
  contact: mergeSection(DEFAULT_LANDING_PAGE_CONTENT.contact, content.contact),
  footer: mergeSection(DEFAULT_LANDING_PAGE_CONTENT.footer, content.footer),
})

const ensureLandingPageRow = async () => {
  const [rows] = await db.query('SELECT id FROM landing_page_content WHERE id = 1 LIMIT 1')
  if (rows.length === 0) {
    await db.query(
      'INSERT INTO landing_page_content (id, content) VALUES (1, ?)',
      [JSON.stringify(DEFAULT_LANDING_PAGE_CONTENT)]
    )
  }
}

const parseLandingContent = (value) => {
  if (!value) return DEFAULT_LANDING_PAGE_CONTENT
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return DEFAULT_LANDING_PAGE_CONTENT
    }
  }
  if (typeof value === 'object') {
    return value
  }
  return DEFAULT_LANDING_PAGE_CONTENT
}

const getLandingPageContent = async () => {
  await ensureLandingPageRow()
  const [rows] = await db.query('SELECT content, updated_at FROM landing_page_content WHERE id = 1 LIMIT 1')
  const raw = parseLandingContent(rows[0]?.content)
  return {
    content: normalizeLandingPageContent(raw),
    updated_at: rows[0]?.updated_at || null,
  }
}

// Private CMS metadata is stored in the existing JSON column. The public response
// is normalized through known section keys and never returns draft or history.
const getCms = (raw) => {
  const cms = raw?._cms && typeof raw._cms === 'object' ? raw._cms : {}
  return {
    revision: Number.isSafeInteger(Number(cms.revision)) && Number(cms.revision) >= 0 ? Number(cms.revision) : 0,
    draft: cms.draft && typeof cms.draft === 'object' ? cms.draft : null,
    history: Array.isArray(cms.history) ? cms.history.slice(0, 5) : [],
    published_at: cms.published_at || null,
  }
}
const getEditorLandingPageContent = async () => {
  await ensureLandingPageRow()
  const [[row]] = await db.query('SELECT content, updated_at FROM landing_page_content WHERE id=1 LIMIT 1')
  const raw = parseLandingContent(row?.content)
  const cms = getCms(raw)
  const published_content = normalizeLandingPageContent(raw)
  return {
    content: normalizeLandingPageContent(cms.draft || published_content),
    published_content,
    has_draft: Boolean(cms.draft),
    revision: cms.revision,
    history: cms.history.map(({ id, at }) => ({ id, at })),
    published_at: cms.published_at || row?.updated_at || null,
    updated_at: row?.updated_at || null,
  }
}

const mutateLandingContent = async ({ mode, content, expectedRevision, restoreId }) => {
  await ensureLandingPageRow()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[row]] = await conn.query('SELECT content FROM landing_page_content WHERE id=1 FOR UPDATE')
    const current = parseLandingContent(row?.content)
    const cms = getCms(current)
    if (expectedRevision !== undefined && Number(expectedRevision) !== cms.revision) {
      const error = new Error('The website was changed in another session. Reload the editor before saving.')
      error.statusCode = 409
      throw error
    }
    const published = normalizeLandingPageContent(current)
    const nextCms = { ...cms, revision: cms.revision + 1 }
    let nextPublished = published
    if (mode === 'restore') {
      const version = cms.history.find(v => v.id === String(restoreId))
      if (!version) { const e = new Error('That version is no longer available.'); e.statusCode=404; throw e }
      nextCms.draft = normalizeLandingPageContent(version.content)
    } else if (mode === 'draft') {
      nextCms.draft = normalizeLandingPageContent(content)
    } else if (mode === 'publish') {
      const selected = normalizeLandingPageContent(content || cms.draft || published)
      const historyId = `r${cms.revision}-${Date.now()}`
      nextCms.history = [{ id: historyId, at: new Date().toISOString(), content: published }, ...cms.history].slice(0, 5)
      nextCms.draft = null
      nextCms.published_at = new Date().toISOString()
      nextPublished = selected
    } else {
      throw new Error('Invalid landing-page operation')
    }
    await conn.query('UPDATE landing_page_content SET content=? WHERE id=1', [JSON.stringify({ ...nextPublished, _cms: nextCms })])
    await conn.commit()
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally { conn.release() }
  return getEditorLandingPageContent()
}

// Legacy PUT remains a publish operation for integrations that still use it.
const updateLandingPageContent = async (content) => mutateLandingContent({ mode: 'publish', content })
const saveLandingPageDraft = async (content, revision) => mutateLandingContent({ mode: 'draft', content, expectedRevision: revision })
const publishLandingPageDraft = async (content, revision) => mutateLandingContent({ mode: 'publish', content, expectedRevision: revision })
const restoreLandingPageVersion = async (id, revision) => mutateLandingContent({ mode: 'restore', restoreId: id, expectedRevision: revision })

module.exports = {
  DEFAULT_LANDING_PAGE_CONTENT,
  getLandingPageContent,
  getEditorLandingPageContent,
  updateLandingPageContent,
  saveLandingPageDraft,
  publishLandingPageDraft,
  restoreLandingPageVersion,
  normalizeLandingPageContent,
}
