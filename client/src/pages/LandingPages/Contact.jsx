import { NavLink } from "react-router-dom"

const Contact = () => {
  return (
    <section id="contact" className="py-24 px-10 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-800 mb-4">CONTACT US</h2>
          <p className="text-gray-600 text-lg max-w-xl mx-auto">
            We'd love to hear from you. Visit us or reach out anytime.
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid md:grid-cols-2 gap-14 items-stretch">

          {/* LEFT — Contact Info */}
          <div className="flex flex-col gap-6 justify-center">
            {/* Address */}
            <div className="bg-blue-50 p-6 rounded-xl hover:shadow-md transition flex gap-4 items-start">
              <div className="bg-blue-600 text-white p-3 rounded-lg mt-1 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-blue-700 mb-1">Our Location</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  A. Bonifacio St., Brgy. Canlalay,<br />
                  Biñan, Laguna 4024
                </p>
              </div>
            </div>

            {/* Phone */}
            <div className="bg-green-50 p-6 rounded-xl hover:shadow-md transition flex gap-4 items-start">
              <div className="bg-green-600 text-white p-3 rounded-lg mt-1 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-green-700 mb-1">Phone Number</h3>
                <p className="text-gray-600 text-sm">(0949) 998 6956</p>
              </div>
            </div>

            {/* Clinic Hours */}
            <div className="bg-[#E6F4F1] p-6 rounded-xl hover:shadow-md transition flex gap-4 items-start">
              <div className="bg-teal-700 text-white p-3 rounded-lg mt-1 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg text-teal-800 mb-1">Clinic Hours</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Monday – Saturday: 9:00 AM – 6:00 PM<br />
                  Sunday: Closed
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT — Google Map */}
          <div className="rounded-2xl overflow-hidden shadow-lg w-full min-h-[400px]">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d43325.4203321316!2d121.06200694781873!3d14.342479587423213!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397d7dd46e3b0cf%3A0x1e83bf84b4d824b3!2scarait%20medical%20and%20dermatological%20clinic!5e1!3m2!1sen!2sph!4v1773723093429!5m2!1sen!2sph"
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: "400px" }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Carait Medical and Dermatological Clinic Location"
            />
          </div>
        </div>

        {/* Bottom CTA Banner */}
        <div className="mt-16 bg-[#E6F4F1] rounded-2xl shadow-lg p-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-semibold text-teal-800 mb-1">Ready to Book an Appointment?</h3>
            <p className="text-teal-700 text-sm">Same-day appointments available whenever possible.</p>
          </div>
          <NavLink
            to="/register"
            className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
          >
            Book Appointment
          </NavLink>
        </div>

      </div>
    </section>
  )
}

export default Contact