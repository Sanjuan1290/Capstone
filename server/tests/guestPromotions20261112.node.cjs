const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const express = require('express'), request = require('supertest')
require('express-async-errors')
const root = path.resolve(__dirname, '..')
const load = (file, dependencies) => {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { module, require: name => dependencies[name] || {}, console, process, Date, Buffer, URL, URLSearchParams }, { filename: file })
  return module.exports
}
const fixture = () => {
  const queries = []
  const db = { query: async (sql, values = []) => {
    queries.push(sql)
    if (sql.includes('FROM clinic_announcements')) {
      let rows = [{ id: 10, type: 'news', slug: 'clinic-news', branch_id: 1, promotion_id: null }, { id: 11, type: 'promotion', slug: 'patient-offer', branch_id: 1, promotion_id: null }]
      assert.match(sql, /a\.type<>'promotion' AND a\.promotion_id IS NULL/)
      if (values.at(-1) !== 1) rows = rows.filter(row => row.type !== 'promotion' && row.promotion_id === null)
      if (sql.includes('a.slug=?')) rows = rows.filter(row => row.slug === values[1])
      return [rows]
    }
    if (sql.includes('FROM clinic_promotions p')) return [[{ id: 5, title: 'Patient offer', branch_id: 1, discount_type: 'percentage', discount_value: 20, service_id: 77 }]]
    if (sql.includes('clinic_branches')) return [[{ id: 1, name: 'Synthetic Branch', offers_medical: 1 }]]
    if (sql.includes('clinic_promotion_services')) return [[{ service_id: 77, id: 5, title: 'Patient offer', discount_type: 'percentage', discount_value: 20 }]]
    throw Error('Unexpected query: ' + sql)
  } }
  const patient = load('controllers/patient.controller.js', {
    '../db/connect': db,
    '../utils/billing': { listBillingCatalog: async () => [{ id: 77, service_name: 'Consultation', clinic_type: 'medical', default_price: 650, average_duration_minutes: 60 }] },
    '../utils/promotionPricing': require('../utils/promotionPricing'),
    '../utils/bookingPolicy': { roundReservedDurationMinutes: value => value },
  })
  const sessionSecurity = { verifySessionToken: async token => {
    if (token !== 'registered-patient-session') throw Object.assign(Error('Invalid session'), { statusCode: 401 })
    return { id: 4, role: 'patient' }
  } }
  const authenticate = load('middlewares/auth.middleware.js', { '../db/connect': db, '../utils/sessionSecurity': sessionSecurity })
  const promotionAccess = load('utils/patientPromotionAccess.js', { './sessionSecurity': sessionSecurity })
  const promotions = load('controllers/promotions.controller.js', { '../db/connect': db, '../utils/patientPromotionAccess': promotionAccess })
  const pass = (req, res, next) => next(), noop = (req, res) => res.json({})
  const router = load('routers/patient.router.js', {
    express, '../controllers/patient.controller': patient, '../db/connect': db,
    '../middlewares/auth.middleware': authenticate, '../middlewares/role.middleware': require('../middlewares/role.middleware'),
    '../middlewares/rateLimit.middleware': { loginLimiter: pass, otpRequestLimiter: pass, otpVerifyLimiter: pass, createRateLimiter: () => pass },
    '../controllers/common.controller': new Proxy({}, { get: () => noop }),
    '../controllers/promotions.controller': { getActivePromotions: (req, res) => res.json([{ id: 5, title: 'Patient offer' }]) },
    '../controllers/guestBooking.controller': { create: noop, recover: noop, status: noop, lookup: noop },
    '../controllers/guestPhoneVerification.controller': { requestCode: noop, verifyCode: noop, status: noop },
  })
  const app = express(); app.use(require('cookie-parser')()); app.use('/api/patient', router)
  app.get('/api/auth/promotions', promotions.getPublicPromotions)
  const news = load('routers/branchAnnouncements.js', { express, '../db/connect': db, '../utils/patientPromotionAccess': promotionAccess })
  app.use('/api/news', news.publicRouter)
  return { app, queries }
}
test('guest service API omits promotions and never queries promotion records', async () => {
  const f = fixture()
  const response = await request(f.app).get('/api/patient/guest/booking-services?branch_id=1&clinic_type=medical').expect(200)
  assert.equal(response.body[0].default_price, 650)
  assert.equal(Object.hasOwn(response.body[0], 'current_offer'), false)
  assert.equal(f.queries.some(sql => sql.includes('clinic_promotions')), false)
})
test('guest verification cookie cannot access the protected promotions or patient services API', async () => {
  const f = fixture()
  for (const route of ['promotions', 'booking-services?branch_id=1']) await request(f.app).get('/api/patient/' + route).set('Cookie', 'guest_booking_phone=synthetic-proof').expect(401)
  assert.equal(f.queries.length, 0)
})
test('registered patient sessions retain promotions and discounted booking previews', async () => {
  const f = fixture(), cookie = 'patient_token=registered-patient-session'
  const response = await request(f.app).get('/api/patient/booking-services?branch_id=1&clinic_type=medical').set('Cookie', cookie).expect(200)
  assert.equal(response.body[0].current_offer.id, 5)
  assert.equal(response.body[0].current_offer.quote.current, 520)
  const offers = await request(f.app).get('/api/patient/promotions').set('Cookie', cookie).expect(200)
  assert.equal(offers.body[0].id, 5)
})
test('homepage offers are hidden for anonymous, guest-verified and invalid patient sessions', async () => {
  const f = fixture()
  for (const cookie of ['', 'guest_booking_phone=synthetic-proof', 'patient_token=revoked']) {
    const response = await request(f.app).get('/api/auth/promotions').set('Cookie', cookie).expect(200)
    assert.deepEqual(response.body, [])
    assert.match(response.headers['cache-control'], /private.*no-store/)
  }
  assert.equal(f.queries.length, 0)
})
test('registered patients can still see homepage offers', async () => {
  const f = fixture()
  const response = await request(f.app).get('/api/auth/promotions').set('Cookie', 'patient_token=registered-patient-session').expect(200)
  assert.equal(response.body[0].id, 5)
})
test('public news excludes promotional posts and direct promotion requests cannot bypass sign-in', async () => {
  const f = fixture(), cookie = 'guest_booking_phone=synthetic-proof'
  const list = await request(f.app).get('/api/news?type=all').set('Cookie', cookie).expect(200)
  assert.deepEqual(list.body.map(row => row.type), ['news'])
  const blocked = await request(f.app).get('/api/news?type=promotion').set('Cookie', cookie).expect(403)
  assert.equal(blocked.body.code, 'PATIENT_ACCOUNT_REQUIRED')
  await request(f.app).get('/api/news/1/patient-offer').set('Cookie', cookie).expect(404)
  await request(f.app).get('/api/news/1/clinic-news').set('Cookie', cookie).expect(200)
})
test('registered patients retain promotional news lists and details', async () => {
  const f = fixture(), cookie = 'patient_token=registered-patient-session'
  const list = await request(f.app).get('/api/news?type=all').set('Cookie', cookie).expect(200)
  assert.deepEqual(list.body.map(row => row.type), ['news', 'promotion'])
  const detail = await request(f.app).get('/api/news/1/patient-offer').set('Cookie', cookie).expect(200)
  assert.equal(detail.body.type, 'promotion')
})
test('guest billing keeps regular prices and cannot add a promotion at consultation or checkout', async () => {
  const { applyServicePromotions } = require('../utils/billingServicePromotions')
  const appointment = { appointment_source: 'guest_online', appointment_date: '2026-11-13' }
  const executor = { query() { throw Error('Guest billing must not query offers') } }
  const item = { item_type: 'service', source_type: 'consultation', catalog_service_id: 77, line_total: 650, details_json: '{}' }
  const result = await applyServicePromotions([item], appointment, executor, 1)
  assert.equal(result.total, 0)
  assert.equal(item.line_total, 650)
  assert.equal(JSON.parse(item.details_json).applied_promotion, null)
  for (const source_type of ['consultation', 'staff_service']) await assert.rejects(applyServicePromotions([{ ...item, source_type, details_json: '{"requested_promotion_id":5}' }], appointment, executor, 1), { code: 'GUEST_PROMOTIONS_NOT_ALLOWED' })
  await assert.rejects(applyServicePromotions([item], { ...appointment, promotion_id: 5 }, executor, 1), { code: 'GUEST_PROMOTIONS_NOT_ALLOWED' })
})
