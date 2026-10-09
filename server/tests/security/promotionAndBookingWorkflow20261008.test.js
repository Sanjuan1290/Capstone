const fs = require('fs')
const path = require('path')
vi.mock('../../db/connect', () => ({ query: vi.fn() }))
const { normalizeBookingSettings, validateBookingSettings, isOnlineAppointmentStartAllowed } = require('../../utils/bookingPolicy')
const root = path.resolve(__dirname, '../../..')
const read = (file) => fs.readFileSync(path.join(root,file),'utf8')

describe('October 2026 booking, no-show and promotions workflow',()=>{
  it('enforces at least a 12-hour online booking notice for legacy settings',()=>{
    expect(normalizeBookingSettings({online_min_lead_minutes:120}).online_min_lead_minutes).toBe(720)
    expect(validateBookingSettings({online_min_lead_minutes:720,pending_confirmation_cutoff_minutes:60}).online_min_lead_minutes).toBe(720)
    const now=new Date('2026-10-08T08:00:00+08:00')
    expect(isOnlineAppointmentStartAllowed({date:'2026-10-08',time:'7:30 PM',minLeadMinutes:720,now})).toBe(false)
    expect(isOnlineAppointmentStartAllowed({date:'2026-10-08',time:'8:00 PM',minLeadMinutes:720,now})).toBe(true)
  })
  it('updates persisted settings and keeps a protected staff confirmation window',()=>{
    const schema=read('server/utils/schema.js')
    expect(schema).toContain('UPDATE booking_settings SET online_min_lead_minutes = 720')
    expect(read('client/src/pages/shared/Appointments.jsx')).toContain('Have you contacted or verified')
  })
  it('updates automatic no-shows every minute and guards manual actions',()=>{
    expect(read('server/utils/reminder.js')).toContain('}, 60 * 1000)')
    for(const role of ['admin','staff']){
      expect(read(`server/controllers/${role}.controller.js`)).toContain('canMarkNoShow(rows[0])')
    }
  })
  it('uses four daily prescription options and numeric custom frequency',()=>{
    const page=read('client/src/pages/doctorPage/Doctor_Consultation.jsx')
    expect(page).toContain("['1x a day', '2x a day', '3x a day', '4x a day']")
    expect(page).toContain('Custom times per day')
  })
  it('persists optional promotion permission during phone OTP registration',()=>{
    expect(read('client/src/pages/auth/Patient/PatientRegister.jsx')).toContain('name="receive_promotions"')
    expect(read('server/controllers/patient.controller.js')).toContain('receive_promotions: normalizedProfile.receive_promotions ? 1 : 0')
  })
  it('integrates the promo lifecycle without automatically discounting bills',()=>{
    const schema=read('server/utils/schema.js'), admin=read('server/routers/admin.router.js'), patient=read('server/routers/patient.router.js')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS clinic_promotions')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS clinic_promotion_services')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS clinic_promotion_notifications')
    expect(read('server/controllers/promotions.controller.js')).toContain('p.receive_promotions = 1')
    expect(admin).toContain("router.post('/promotions/:id/notify'")
    expect(admin).toContain("router.post('/promotions'")
    expect(admin).toContain("router.put('/promotions/:id'")
    expect(patient).toContain("router.get('/promotions'")
    expect(read('client/src/pages/adminPage/Admin_Promotions.jsx')).toContain('Promotions are informational')
    expect(read('client/src/pages/patientPage/BookAppointment.jsx')).toContain('promo.service_ids.includes(Number(service.id))')
    expect(read('client/src/pages/patientPage/PatientDashboard.jsx')).toContain('Current clinic offers')
  })
  it('keeps icon and text separated',()=>{
    expect(read('client/src/index.css')).toContain('.form-control.pl-11 { padding-left: 2.75rem; }')
    expect(read('client/src/index.css')).toContain('.form-control.pl-10 { padding-left: 2.5rem; }')
  })
})

