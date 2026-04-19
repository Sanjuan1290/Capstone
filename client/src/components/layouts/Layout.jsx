import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FaFacebook } from 'react-icons/fa'
import { MdClose, MdMenu } from 'react-icons/md'
import logo from '../../assets/logo.png'
import { getPublicLandingPage } from '../../services/landing.service'
import { isExternalPath, normalizeAppPath } from '../../utils/navigation'

const defaultHeader = {
  clinic_name: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
  logo_url: '',
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
}

const defaultFooter = {
  copyright: '©2023 by Carait Medical and Dermatology Clinic',
  facebook_url: 'https://www.facebook.com/carait.mdc?mibextid=LQQJ4d',
}

const Layout = () => {
  const location = useLocation()
  const [landing, setLanding] = useState({ header: defaultHeader, footer: defaultFooter })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    getPublicLandingPage()
      .then(data => setLanding(data?.content || { header: defaultHeader, footer: defaultFooter }))
      .catch(() => {})
  }, [])

  const header = landing?.header || defaultHeader
  const footer = landing?.footer || defaultFooter
  const navLinks = Array.isArray(header.nav_links) && header.nav_links.length > 0 ? header.nav_links : defaultHeader.nav_links
  const showMarketingShell = location.pathname === '/' || location.pathname === '/patient/register' || location.pathname === '/patient/login'
  const logoSrc = header.logo_url || logo
  const loginPath = normalizeAppPath(header.login_path, '/patient/login')
  const ctaPath = normalizeAppPath(header.cta_path, '/patient/register')

  if (showMarketingShell) {
    return (
      <div className="scroll-smooth">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logoSrc} alt="logo" className="w-10 h-10 object-contain" />
            <h3 className="max-w-[190px] text-xs font-semibold leading-tight text-gray-700 sm:max-w-[260px] sm:text-sm">
              {header.clinic_name}
            </h3>
          </div>

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

          <div className="hidden items-center gap-4 lg:flex">
            {isExternalPath(loginPath) ? (
              <a
                href={loginPath}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
              >
                {header.login_label || 'Log in'}
              </a>
            ) : (
              <NavLink
                to={loginPath}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
              >
                {header.login_label || 'Log in'}
              </NavLink>
            )}

            {isExternalPath(ctaPath) ? (
              <a
                href={ctaPath}
                className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
              >
                {header.cta_label || 'Book Appointment'}
              </a>
            ) : (
              <NavLink
                to={ctaPath}
                className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
              >
                {header.cta_label || 'Book Appointment'}
              </NavLink>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <MdClose className="text-[20px]" /> : <MdMenu className="text-[20px]" />}
          </button>
          </div>

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

        <Outlet />

        <footer className="fixed bottom-0 left-0 right-0 text-gray-50 flex items-center justify-around bg-[rgb(43,125,111)] py-4">
          <p>{footer.copyright}</p>

          <a
            target="_blank"
            rel="noreferrer"
            href={footer.facebook_url}
            className="text-xl hover:scale-110 transition"
          >
            <FaFacebook />
          </a>
        </footer>
      </div>
    )
  }

  return <Outlet />
}

export default Layout
