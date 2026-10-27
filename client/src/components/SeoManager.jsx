import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const BASE_URL = 'https://caraitclinic.com'
const CLINIC = 'Carait Medical and Dermatology Clinic'
const HOME_DESCRIPTION = 'Carait Medical and Dermatology Clinic in Biñan, Laguna offers medical consultations, dermatology, vaccinations, acupuncture, and animal bite care. Book an appointment online.'

const pageDetails = (pathname) => {
  if (pathname === '/') {
    return {
      title: `${CLINIC} | Biñan, Laguna`,
      description: HOME_DESCRIPTION,
      canonical: `${BASE_URL}/`,
      clinicSchema: true,
    }
  }
  if (pathname === '/news') {
    return {
      title: `News & Offers | ${CLINIC}`,
      description: 'Read clinic updates, health articles, announcements and current offers from Carait Medical and Dermatology Clinic.',
      canonical: `${BASE_URL}/news`,
    }
  }
  if (/^\/news\/\d+\/[a-zA-Z0-9_-]+\/?$/.test(pathname)) {
    return {
      title: `Clinic News | ${CLINIC}`,
      description: 'Read this clinic news article or announcement from Carait Medical and Dermatology Clinic.',
      canonical: `${BASE_URL}${pathname.replace(/\/$/, '')}`,
    }
  }
  if (pathname === '/privacy-policy') {
    return {
      title: `Privacy Policy | ${CLINIC}`,
      description: 'Read the privacy policy of Carait Medical and Dermatology Clinic.',
      canonical: `${BASE_URL}/privacy-policy`,
    }
  }
  if (pathname === '/terms') {
    return {
      title: `Terms of Service | ${CLINIC}`,
      description: 'Read the terms of service for Carait Medical and Dermatology Clinic.',
      canonical: `${BASE_URL}/terms`,
    }
  }
  // All login, account, clinical, display, and unsubscribe routes are not public search landing pages.
  return { title: `Clinic Portal | ${CLINIC}`, description: '', noindex: true }
}

const upsertMeta = (selector, attributes) => {
  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    document.head.appendChild(tag)
  }
  for (const [name, value] of Object.entries(attributes)) tag.setAttribute(name, value)
}

const CLINIC_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'MedicalClinic',
  '@id': `${BASE_URL}/#clinic`,
  name: CLINIC,
  url: `${BASE_URL}/`,
  image: `${BASE_URL}/homeBG.png`,
  logo: `${BASE_URL}/logo.png`,
  telephone: '+639499986956',
  description: HOME_DESCRIPTION,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'A. Bonifacio St., Brgy. Canlalay',
    addressLocality: 'Biñan',
    addressRegion: 'Laguna',
    postalCode: '4024',
    addressCountry: 'PH',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
  ],
  sameAs: ['https://www.facebook.com/carait.mdc'],
}

// Route-aware SEO for the existing React SPA. Does not modify routing or API behavior.
export default function SeoManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    const details = pageDetails(pathname)
    document.title = details.title
    upsertMeta('meta[name="description"]', { name: 'description', content: details.description })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: details.title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: details.description })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: details.canonical || BASE_URL })
    upsertMeta('meta[name="robots"]', { name: 'robots', content: details.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large' })

    const oldCanonical = document.head.querySelector('link[rel="canonical"]')
    if (details.canonical) {
      const link = oldCanonical || document.createElement('link')
      link.rel = 'canonical'
      link.href = details.canonical
      if (!oldCanonical) document.head.appendChild(link)
    } else {
      oldCanonical?.remove()
    }

    const oldSchema = document.head.querySelector('script[data-carait-seo-schema]')
    if (details.clinicSchema) {
      const script = oldSchema || document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.caraitSeoSchema = 'true'
      script.textContent = JSON.stringify(CLINIC_STRUCTURED_DATA)
      if (!oldSchema) document.head.appendChild(script)
    } else {
      oldSchema?.remove()
    }
  }, [pathname])

  return null
}


