const About = () => {
  return (
    <section id="about" className="py-24 px-10 bg-white scroll-mt-24">

      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-14 items-center">

        {/* IMAGE */}
        <div className="relative">
          <img
            src="/aboutClinic.png"
            alt="Carait Medical and Dermatology Clinic"
            className="rounded-2xl shadow-lg w-full object-cover"
          />

          {/* floating badge */}
          <div className="absolute -bottom-6 -right-6 bg-blue-600 text-white px-6 py-4 rounded-xl shadow-lg">
            <p className="text-2xl font-bold">10+</p>
            <p className="text-sm">Years Experience</p>
          </div>
        </div>

        {/* TEXT CONTENT */}
        <div className="flex flex-col gap-6">

          <h2 className="text-4xl font-bold text-gray-800">
            ABOUT OUR CLINIC
          </h2>
          
          <p className="text-gray-600 leading-relaxed text-lg">
            Since its founding in 2015, Carait Medical and Dermatology Clinic has been
            committed to providing patients with affordable, reliable, and efficient
            healthcare services. Our goal is to deliver quality medical and dermatologic
            care that focuses on the overall health and well-being of every patient who
            visits our clinic.
          </p>

          <p className="text-gray-600 leading-relaxed">
            We strive to minimize patient wait times and continuously improve our
            services to make healthcare more convenient and accessible. Whenever
            possible, we also offer same-day appointments to better accommodate urgent
            medical needs. Our clinic is located at A. Bonifacio St., Brgy. Canlalay,
            Biñan, Laguna, where we proudly serve the local community with compassionate
            and patient-centered care.
          </p>

          {/* MISSION VISION */}
          <div className="grid sm:grid-cols-2 gap-6 mt-4">

            <div className="bg-blue-50 p-6 rounded-xl hover:shadow-md transition">
              <h3 className="font-semibold text-lg text-blue-700 mb-2">
                Our Mission
              </h3>
              <p className="text-gray-600 text-sm">
                To provide accessible, compassionate, and high-quality medical
                and dermatological care that improves the health and wellbeing
                of our patients.
              </p>
            </div>

            <div className="bg-green-50 p-6 rounded-xl hover:shadow-md transition">
              <h3 className="font-semibold text-lg text-green-700 mb-2">
                Our Vision
              </h3>
              <p className="text-gray-600 text-sm">
                To be a trusted healthcare provider known for modern treatments,
                patient-centered care, and excellence in dermatological and
                medical services.
              </p>
            </div>

          </div>

        </div>

      </div>

    </section>
  )
}

export default About