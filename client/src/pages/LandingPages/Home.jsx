const Home = () => {
  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center justify-center px-10 overflow-hidden"
    >
      {/* BACKGROUND IMAGE */}
      <img
        src="/homeBG.png"
        alt="home background"
        className="absolute inset-0 w-full h-full object-cover -z-10"
      />

      {/* OVERLAY (improves text readability) */}
      <div className="absolute inset-0 bg-white/70 -z-10"></div>

      {/* CONTENT */}
      <div className="max-w-5xl mx-auto flex flex-col gap-6 text-center md:text-left">

        <h1 className="text-4xl md:text-5xl font-bold text-gray-800 leading-tight">
          CARAIT MEDICAL AND <br />
          <span className="text-blue-600">DERMATOLOGY CLINIC</span>
        </h1>

        <p className="text-gray-700 text-lg max-w-2xl leading-relaxed">
          Since our founding in 2015, we have been committed to providing
          modern, efficient, and high-quality medical and dermatological care
          to every patient. We focus on wellness and holistic care, ensuring
          personalized treatment for everyone who visits our clinic.
        </p>

        <h3 className="text-xl font-semibold text-gray-800">
          Providers of Comprehensive Care
        </h3>

        {/* BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4">

          <a
            href="#book"
            className="bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-300 shadow-md"
          >
            Book an Appointment
          </a>

          <a
            href="#about"
            className="border border-blue-600 text-blue-600 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition duration-300"
          >
            Learn More
          </a>

        </div>
      </div>
    </section>
  )
}

export default Home