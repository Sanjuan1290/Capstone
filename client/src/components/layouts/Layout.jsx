import { Outlet, NavLink } from "react-router-dom"
import logo from "../../assets/logo.png"
import { FaFacebook } from "react-icons/fa";


const Layout = () => {

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Services", path: "/services" },
    { name: "Doctors", path: "/doctors" },
    { name: "Contact", path: "/contact" }
  ]

  return (
    <>
      <header className="flex items-center justify-between px-10 py-4 bg-white shadow-sm">

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
              <NavLink
                to={nl.path}
                className={({ isActive }) =>
                  `text-sm font-medium transition ${
                    isActive
                      ? "text-blue-600"
                      : "text-gray-600 hover:text-blue-600"
                  }`
                }
              >
                {nl.name}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-4">
          <NavLink
            to="/login"
            className="text-sm font-medium text-gray-600 hover:text-blue-600 transition"
          >
            Log in
          </NavLink>

          <NavLink
            to="/bookAppointment"
            className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Book Appointment
          </NavLink>
        </div>

      </header>

      <Outlet />

      <footer className="text-gray-50 flex items-center justify-around bg-[rgb(43,125,111)]">
        <p>©2023 by Carait Medical and Dermatology Clinic</p>
        <NavLink target="_blank" to={"https://www.facebook.com/carait.mdc?mibextid=LQQJ4d"}>
          <FaFacebook />
        </NavLink>
      </footer>
    </>
  )
}

export default Layout