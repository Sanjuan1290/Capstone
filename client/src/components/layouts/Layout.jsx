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
import logo from '../../assets/logo-removebg.png'
import { getPublicLandingPage } from '../../services/landing.service'
import { isExternalPath, normalizeAppPath } from '../../utils/navigation'

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
  login_path:  '/patient/login',
  cta_label:   'Book Appointment',
  cta_path:    '/patient/register',
}

const defaultFooter = {
  copyright:    '©2023 by Carait Medical and Dermatology Clinic',
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
  const showMarketingShell = ['/', '/patient/register', '/patient/login'].includes(location.pathname)
  const logoSrc   = header.logo_url || logo
  const loginPath = normalizeAppPath(header.login_path, '/patient/login')
  const ctaPath   = normalizeAppPath(header.cta_path,   '/patient/register')

  if (showMarketingShell) {
    return (
      <div className="flex flex-col min-h-screen scroll-smooth">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">

            {/* Brand */}
            <div className="flex min-w-0 items-center gap-3">
              <img src={logoSrc} alt="logo" className="w-10 h-10 object-contain" />
              <h3 className="max-w-[190px] text-xs font-semibold leading-tight text-gray-700 sm:max-w-[260px] sm:text-sm">
                {header.clinic_name}
              </h3>
            </div>

            {/* Desktop nav */}
            <ul className="hidden items-center gap-8 list-none lg:flex">
              {navLinks.map((nl, index) => (
                <li key={`${nl.path}-${index}`}>
                  <a
                    href={location.pathname === '/' ? normalizeAppPath(nl.path, '#home') : '/'}
                    className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
                  >
                    {nl.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Desktop CTA */}
            <div className="hidden items-center gap-4 lg:flex">
              {isExternalPath(loginPath) ? (
                <a href={loginPath} className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300">
                  {header.login_label || 'Log in'}
                </a>
              ) : (
                <NavLink to={loginPath} className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300">
                  {header.login_label || 'Log in'}
                </NavLink>
              )}

              {isExternalPath(ctaPath) ? (
                <a href={ctaPath} className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300">
                  {header.cta_label || 'Book Appointment'}
                </a>
              ) : (
                <NavLink to={ctaPath} className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300">
                  {header.cta_label || 'Book Appointment'}
                </NavLink>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(prev => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 lg:hidden"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <MdClose className="text-[20px]" /> : <MdMenu className="text-[20px]" />}
            </button>
          </div>

          {/* Mobile dropdown */}
          {mobileOpen && (
            <div className="border-t border-slate-100 bg-white px-4 py-4 shadow-sm lg:hidden">
              <div className="space-y-2">
                {navLinks.map((nl, index) => (
                  <a
                    key={`${nl.path}-${index}`}
                    href={location.pathname === '/' ? normalizeAppPath(nl.path, '#home') : '/'}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {nl.label}
                  </a>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                {isExternalPath(loginPath) ? (
                  <a href={loginPath} onClick={() => setMobileOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-600">
                    {header.login_label || 'Log in'}
                  </a>
                ) : (
                  <NavLink to={loginPath} onClick={() => setMobileOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-600">
                    {header.login_label || 'Log in'}
                  </NavLink>
                )}
                {isExternalPath(ctaPath) ? (
                  <a href={ctaPath} onClick={() => setMobileOpen(false)} className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">
                    {header.cta_label || 'Book Appointment'}
                  </a>
                ) : (
                  <NavLink to={ctaPath} onClick={() => setMobileOpen(false)} className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">
                    {header.cta_label || 'Book Appointment'}
                  </NavLink>
                )}
              </div>
            </div>
          )}
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