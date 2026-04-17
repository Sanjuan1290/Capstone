import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FaFacebook } from 'react-icons/fa'
import logo from '../../assets/logo.png'
import { getPublicLandingPage } from '../../services/landing.service'

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

  if (showMarketingShell) {
    return (
      <div className="scroll-smooth">
        <header className="flex items-center justify-between px-10 py-4 bg-white shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="logo" className="w-10 h-10 object-contain" />
            <h3 className="text-sm font-semibold text-gray-700 leading-tight max-w-[220px]">
              {header.clinic_name}
            </h3>
          </div>

          <ul className="flex items-center gap-8 list-none">
            {navLinks.map((nl, index) => (
              <li key={`${nl.path}-${index}`}>
                <a
                  href={location.pathname === '/' ? nl.path : '/'}
                  className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
                >
                  {nl.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4">
            <NavLink
              to={header.login_path || '/patient/login'}
              className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
            >
              {header.login_label || 'Log in'}
            </NavLink>

            <NavLink
              to={header.cta_path || '/patient/register'}
              className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
            >
              {header.cta_label || 'Book Appointment'}
            </NavLink>
          </div>
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
