const DEFAULT_BOOKING_POLICY_DOCUMENT = Object.freeze({
  title: 'Appointment Booking Policy',
  introduction: 'Please read these guidelines before requesting an appointment at CARAIT Medical and Dermatology Clinic.',
  sections: Object.freeze([
    Object.freeze({
      heading: 'Before you book',
      body: 'Use your correct contact details. You can have only one active booking with each doctor.',
    }),
    Object.freeze({
      heading: 'Arrive on time',
      body: 'Arrive at least 10 minutes before your scheduled appointment.',
    }),
    Object.freeze({
      heading: 'Cancel or reschedule',
      body: 'Cancel or reschedule early if you cannot attend your appointment.',
    }),
    Object.freeze({
      heading: 'Missed appointments',
      body: 'No-shows and suspected fake bookings may require clinic staff review before another request is approved.',
    }),
    Object.freeze({
      heading: 'Appointment confirmation',
      body: 'Submitting a request does not mean your appointment is confirmed. Wait for the clinic to confirm your appointment.',
    }),
  ]),
})

const policyError = (message) => Object.assign(new Error(message), {
  statusCode: 400,
  code: 'BOOKING_POLICY_DOCUMENT_INVALID',
})

const normalizeBookingPolicyDocument = (input = {}) => {
  const title = String(input.title ?? '').trim()
  const introduction = String(input.introduction ?? '').trim()
  const sections = Array.isArray(input.sections) ? input.sections : []

  if (!title || title.length > 120) throw policyError('Enter a policy title of up to 120 characters.')
  if (!introduction || introduction.length > 600) throw policyError('Enter a short introduction of up to 600 characters.')
  if (sections.length < 1 || sections.length > 10) throw policyError('Add between 1 and 10 policy sections.')

  const normalizedSections = sections.map((section, index) => {
    const heading = String(section?.heading ?? '').trim()
    const body = String(section?.body ?? '').trim()
    if (!heading || heading.length > 100) throw policyError(`Section ${index + 1} needs a heading of up to 100 characters.`)
    if (!body || body.length > 1500) throw policyError(`Section ${index + 1} needs details of up to 1,500 characters.`)
    return { heading, body }
  })

  const totalLength = title.length + introduction.length + normalizedSections.reduce((sum, section) => sum + section.heading.length + section.body.length, 0)
  if (totalLength > 8000) throw policyError('The complete policy must be 8,000 characters or fewer.')

  return { title, introduction, sections: normalizedSections }
}

const parseStoredBookingPolicyDocument = (value) => {
  if (!value) return null
  try {
    return normalizeBookingPolicyDocument(typeof value === 'string' ? JSON.parse(value) : value)
  } catch (_) {
    return null
  }
}

const cloneDefaultBookingPolicyDocument = () => JSON.parse(JSON.stringify(DEFAULT_BOOKING_POLICY_DOCUMENT))

module.exports = {
  DEFAULT_BOOKING_POLICY_DOCUMENT,
  cloneDefaultBookingPolicyDocument,
  normalizeBookingPolicyDocument,
  parseStoredBookingPolicyDocument,
}
