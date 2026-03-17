const Doctors = () => {
  const doctors = [
    {
      name: 'DR. MAGTANGOL JOSE C. CARAIT IV',
      specialize: 'Family Medicine Specialist',
      description: 'Dr. Carait is a Fellow of the Philippine Academy of Family Physicians (PAFP). He is also a certified medical acupuncturist and a member of the Philippine Institute of Traditional and Alternative Health Care (PITAHC).',
      image: '/doctors/tanjol.png'
    },
    {
      name: 'DR. PAULA KARINA GONZALES-CARAIT',
      specialize: 'Dermatologist',
      description: 'Dr. Gonzales-Carait is a Board-certified Dermatologist. She is a Fellow of the Philippine Dermatological Society and the Philippine Society of Venereology Inc.',
      image: '/doctors/paula.png'
    }
  ];

  return (
    <section id="doctors" className="py-24 px-10 bg-gray-50 scroll-mt-24">

      {/* SECTION TITLE */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-800">OUR DOCTORS</h1>
        <p className="text-gray-600 mt-4 max-w-2xl mx-auto text-lg">
          Meet our team of experienced and compassionate doctors, committed to providing high-quality medical and dermatological care.
        </p>
      </div>

      {/* DOCTORS GRID */}
      <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-10 max-w-7xl mx-auto">

        {doctors.map((doc, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition transform hover:-translate-y-2 flex flex-col items-center text-center"
          >

            {/* DOCTOR IMAGE */}
            <div className="w-32 h-32 mb-4 rounded-full overflow-hidden border-4 border-blue-100">
              <img
                src={doc.image}
                alt={doc.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* NAME */}
            <h3 className="text-xl font-semibold text-gray-800 mb-1">{doc.name}</h3>

            {/* SPECIALTY */}
            <p className="text-blue-600 font-medium mb-3">{doc.specialize}</p>

            {/* DESCRIPTION */}
            <p className="text-gray-600 text-sm leading-relaxed">{doc.description}</p>

          </div>
        ))}

      </div>

    </section>
  );
};

export default Doctors;