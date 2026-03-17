const Services = () => {

  const services = [
    {
      name: 'MEDICAL CONSULTATIONS',
      description: 'Consultations for medical concerns for all ages (baby to adult) and surgical procedures (minor excision, circumcision etc)',
      image: '/services/medical_consultation.png',
      bg: 'bg-blue-50'
    },
    {
      name: 'VACCINATIONS',
      description: 'It can be so tempting to put off your next appointment. At Carait Medical and Dermatology Clinic, we make it easier than ever to schedule Vaccinations.',
      image: '/services/vaccination.png',
      bg: 'bg-green-50'
    },
    {
      name: 'DERMATOLOGIC CONSULTS AND PROCEDURES',
      description: 'Concern on SKIN, HAIR and NAILS for ALL AGES. Dermatologic procedures include laser for rejuvenation and scars; intense pulse light treatment for anti-aging and hair removal; electrocautery for warts and syringoma; chemical peeling; skin biopsy.',
      image: '/services/dermatologic_consults_procedures.png',
      bg: 'bg-purple-50'
    },
    {
      name: 'ACUPUNCTURE',
      description: 'Acupuncture for pain relief, vertigo, migraine, insomnia and smoking cessation and more.',
      image: '/services/acupuncture.png',
      bg: 'bg-yellow-50'
    },
    {
      name: 'ANIMAL BITE CENTER (ABC)',
      description: 'We offer vaccines for Pre-exposure prophylaxis and Post-exposure animal bite—to be administered by our doctor who is trained on Rabies and Animal Bite Management.',
      image: '/services/animal_bite_center(ABC).png',
      bg: 'bg-red-50'
    }
  ]

  return (
    <section id="services" className="py-24 px-10 bg-gradient-to-b from-gray-50 to-white">

      {/* TITLE */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-800">OUR SERVICES</h1>
        <p className="text-gray-600 mt-4 max-w-2xl mx-auto text-lg">
          We provide a wide range of medical and dermatological services focused
          on patient wellness, modern treatments, and quality healthcare.
        </p>
      </div>

      {/* GRID */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 max-w-7xl mx-auto">

        {services.map((s, i) => (
          <div
            key={i}
            className={`rounded-2xl p-8 shadow-sm hover:shadow-xl transition duration-300 transform hover:-translate-y-2 ${s.bg}`}
          >

            {/* IMAGE */}
            <div className="flex justify-center mb-6 overflow-hidden">
              <img
                src={s.image}
                alt={s.name}
                className="w-32 h-32 object-contain transition duration-300 hover:scale-110"
              />
            </div>

            {/* TITLE */}
            <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">
              {s.name}
            </h3>

            {/* DESCRIPTION */}
            <p className="text-gray-600 text-sm leading-relaxed text-center">
              {s.description}
            </p>

          </div>
        ))}

      </div>

    </section>
  )
}

export default Services