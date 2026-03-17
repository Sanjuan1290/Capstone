import { Outlet } from "react-router-dom"
import logo from "../../assets/logo.png"
import { FaFacebook } from "react-icons/fa"

const Layout = () => {

  const navLinks = [
    { name: "Home", path: "#home" },
    { name: "About", path: "#about" },
    { name: "Services", path: "#services" },
    { name: "Doctors", path: "#doctors" },
    { name: "Contact", path: "#contact" }
  ]

  return (
    <div className="scroll-smooth">

      <header className="flex items-center justify-between px-10 py-4 bg-white shadow-sm sticky top-0 z-50">

        {/* LOGO */}
        <div className="flex items-center gap-3">
          <img src={logo} alt="logo" className="w-10 h-10 object-contain"/>
          <h3 className="text-sm font-semibold text-gray-700 leading-tight max-w-[220px]">
            CARAIT MEDICAL AND DERMATOLOGY CLINIC
          </h3>
        </div>

        {/* NAVIGATION */}
        <ul className="flex items-center gap-8 list-none">
          {navLinks.map((nl) => (
            <li key={nl.path}>
              <a
                href={nl.path}
                className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
              >
                {nl.name}
              </a>
            </li>
          ))}
        </ul>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-4">
          <a
            href="#login"
            className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors duration-300"
          >
            Log in
          </a>

          <a
            href="#book"
            className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
          >
            Book Appointment
          </a>
        </div>

      </header>

      <Outlet />

      <footer className="text-gray-50 flex items-center justify-around bg-[rgb(43,125,111)] py-4">
        <p>©2023 by Carait Medical and Dermatology Clinic</p>

        <a
          target="_blank"
          href="https://www.facebook.com/carait.mdc?mibextid=LQQJ4d"
          className="text-xl hover:scale-110 transition"
        >
          <FaFacebook />
        </a>
      </footer>

    </div>
  )
}

export default Layout