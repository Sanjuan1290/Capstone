// client/src/components/layouts/Layout.jsx
// UPDATED:
//  1. Footer is no longer "fixed" — it stays at bottom of page content naturally.
//  2. Footer now shows Terms of Service and Privacy Policy links (read from CMS).
//  3. Footer links are hidden when their URL is blank (admin can toggle them by clearing the field).
//  4. Facebook icon replaced with FaFacebook from react-icons (was already there — kept).

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MdClose, MdMenu } from 'react-icons/md'
import { FaFacebook } from 'react-icons/fa'
import { getPublicLandingPage } from '../../services/landing.service'
import { isExternalPath, normalizeAppPath } from '../../utils/navigation'
import { useAuth } from '../../context/AuthContext'

// ── Defaults (match DB content) ───────────────────────────────────────────────
const defaultHeader = {
  nav_links: [
    { label: 'Home',     path: '#home'    },
    { label: 'About',    path: '#about'   },
    { label: 'Services', path: '#services'},
    { label: 'Doctors',  path: '#doctors' },
    { label: 'Contact',  path: '#contact' },
  ],
  login_label: 'Log in',
  login_path:  '/login',
  cta_label:   'Book Appointment',
  cta_path:    '/patient/register',
  clinic_name: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
}

const defaultFooter = {
  copyright:    '©2026 CARAIT MEDICAL AND DERMATOLOGY CLINIC',
  facebook_url: 'https://www.facebook.com/carait.mdc?mibextid=LQQJ4d',
  terms_url:    '/terms',
  privacy_url:  '/privacy-policy',
}

// ── Footer link helper ─────────────────────────────────────────────────────────
const FooterLink = ({ href, children }) => {
  if (!href) return null
  if (isExternalPath(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-gray-100/80 hover:text-white transition-colors underline-offset-2 hover:underline"
      >
        {children}
      </a>
    )
  }
  return (
    <NavLink
      to={href}
      className="text-sm text-gray-100/80 hover:text-white transition-colors underline-offset-2 hover:underline"
    >
      {children}
    </NavLink>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
const Layout = () => {
  const location    = useLocation()
  const { user, role } = useAuth()
  const [landing,   setLanding]   = useState({ header: defaultHeader, footer: defaultFooter })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    getPublicLandingPage()
      .then(data => setLanding(data?.content || { header: defaultHeader, footer: defaultFooter }))
      .catch(() => {})
  }, [])

  const header    = landing?.header || defaultHeader
  const footer    = { ...defaultFooter, ...landing?.footer }
  const navLinks  = Array.isArray(header.nav_links) && header.nav_links.length > 0 ? header.nav_links : defaultHeader.nav_links
  const showMarketingShell = ['/', '/login', '/patient/register', '/patient/login', '/news', '/unsubscribe'].includes(location.pathname) || location.pathname.startsWith('/news/')
  const logoSrc   = header.logo_url || '/logo.png'
  const clinicSubtitle = String(header.clinic_name || defaultHeader.clinic_name).trim().replace(/^carait\s*/i, '') || 'Medical & Dermatology Clinic'
  const isPatientLoggedIn = Boolean(user && role === 'patient')
  const loginPath = isPatientLoggedIn
    ? '/patient'
    : normalizeAppPath(header.login_path, '/login')
  const loginLabel = isPatientLoggedIn ? 'Clinic Portal' : (header.login_label || 'Log in')
  const ctaPath   = normalizeAppPath(header.cta_path,   '/patient/register')

  if (showMarketingShell) {
    return (
      <div className="flex flex-col min-h-screen scroll-smooth">

        {/* ── Responsive public header: separate brand/action and navigation rows ── */}
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-[0_4px_20px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <NavLink to="/" onClick={() => setMobileOpen(false)} className="group flex min-w-0 items-center gap-3" aria-label="CARAIT Clinic home">
              <img src={logoSrc} alt="CARAIT Clinic logo" className="h-11 w-11 shrink-0 rounded-full object-contain sm:h-12 sm:w-12" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-sm font-black tracking-tight text-slate-900 sm:text-[15px]">CARAIT</span>
                <span className="max-w-[215px] text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:max-w-none sm:text-[11px]">{clinicSubtitle}</span>
              </span>
            </NavLink>

            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              {isExternalPath(loginPath) ? (
                <a href={loginPath} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">{loginLabel}</a>
              ) : (
                <NavLink to={loginPath} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">{loginLabel}</NavLink>
              )}
              {isExternalPath(ctaPath) ? (
                <a href={ctaPath} className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">{header.cta_label || 'Book Appointment'}</a>
              ) : (
                <NavLink to={ctaPath} className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">{header.cta_label || 'Book Appointment'}</NavLink>
              )}
            </div>
            <button type="button" onClick={() => setMobileOpen(prev => !prev)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 sm:hidden" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls="public-mobile-navigation">
              {mobileOpen ? <MdClose size={23} /> : <MdMenu size={23} />}
            </button>
          </div>
          <nav className="hidden border-t border-slate-100 bg-slate-50/70 sm:block" aria-label="Main navigation">
            <div className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-4 py-2 sm:gap-2 lg:gap-5">
              {navLinks.map((nl,index) => {
                const dest = normalizeAppPath(nl.path, '#home')
                const target = dest.startsWith('#') && location.pathname !== '/' ? `/${dest}` : dest
                const active = dest.startsWith('#') ? location.pathname === '/' && (dest === '#home' || location.hash === dest) : location.pathname === target
                return <a key={`${nl.path}-${index}`} href={target} className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}>{nl.label}</a>
              })}
              <NavLink to="/news" className={({isActive}) => `rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${isActive || location.pathname.startsWith('/news/') ? 'bg-amber-50 text-amber-800' : 'text-amber-700 hover:bg-amber-50'}`}>News & Offers</NavLink>
            </div>
          </nav>
          {mobileOpen && <nav id="public-mobile-navigation" className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-slate-100 bg-white p-4 sm:hidden" aria-label="Mobile navigation">
            <div className="grid gap-1">
              {navLinks.map((nl,index) => {
                const dest=normalizeAppPath(nl.path,'#home')
                const target=dest.startsWith('#') && location.pathname !== '/' ? `/${dest}` : dest
                return <a key={`${nl.path}-${index}`} href={target} onClick={()=>setMobileOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{nl.label}</a>
              })}
              <NavLink to="/news" onClick={()=>setMobileOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50">News & Offers</NavLink>
            </div>
            <div className="mt-3 grid gap-2 border-t border-slate-100 pt-4">
              {isExternalPath(loginPath) ? <a href={loginPath} onClick={()=>setMobileOpen(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700">{loginLabel}</a> : <NavLink to={loginPath} onClick={()=>setMobileOpen(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700">{loginLabel}</NavLink>}
              {isExternalPath(ctaPath) ? <a href={ctaPath} onClick={()=>setMobileOpen(false)} className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white">{header.cta_label || 'Book Appointment'}</a> : <NavLink to={ctaPath} onClick={()=>setMobileOpen(false)} className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white">{header.cta_label || 'Book Appointment'}</NavLink>}
            </div>
          </nav>}
        </header>

        {/* ── Page content ───────────────────────────────────────────────── */}
        {/* pb-0 — footer is no longer fixed so no padding needed */}
        <main className="flex-1">
          <Outlet />
        </main>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="bg-[rgb(43,125,111)] text-gray-50">
          {/* Top row */}
          <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">

            {/* Copyright */}
            <p className="text-sm text-gray-100/90 text-center sm:text-left">
              {footer.copyright}
            </p>

            {/* Legal links + Social */}
            <div className="flex items-center gap-5 flex-wrap justify-center">
              <FooterLink href={footer.terms_url || ''}>Terms of Service</FooterLink>
              <FooterLink href={footer.privacy_url || ''}>Privacy Policy</FooterLink>

              {footer.facebook_url && (
                <a
                  href={footer.facebook_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="text-xl hover:scale-110 transition text-gray-100/90 hover:text-white"
                >
                  <FaFacebook />
                </a>
              )}
            </div>
          </div>
        </footer>
      </div>
    )
  }

  return <Outlet />
}

export default Layout

