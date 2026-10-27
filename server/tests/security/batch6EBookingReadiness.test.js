const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 6E online booking readiness', () => {
  it('builds branch-scoped readiness using actual clinic types, active doctors, schedules, services, and shared reasons', async () => {
    // Execute the production utility with an isolated query executor. A source
    // string assertion would reject equivalent TiDB-safe SQL without checking
    // whether its booking decisions are actually correct.
    const vm = require('node:vm')
    const source = read('server', 'utils', 'bookingReadiness.js')
    const context = { module: { exports: {} }, exports: {} }
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, context)(
      name => { if (name !== '../db/connect') throw Error(`Unexpected dependency ${name}`); return {} },
      context.module,
      context.exports
    )
    const {getOnlineBookingReadiness,applyBranchBookingOfferings} = context.module.exports
    const queries=[]
    const groupedResults = [
      [{clinic_type:'medical',total:3},{clinic_type:'derma',total:1}],
      [{clinic_type:'medical',total:2}],
      [{clinic_type:'medical',total:4},{clinic_type:'all',total:1}],
      [{clinic_type:'medical',total:2},{clinic_type:'all',total:1}],
    ]
    const executor={query:async(sql,params)=>{
      queries.push({sql,params})
      return [groupedResults[queries.length-1]]
    }}
    const readiness=await getOnlineBookingReadiness(executor,12)
    expect(queries).toHaveLength(4)
    for(const {sql,params} of queries){
      expect(params).toEqual([12])
      expect(sql).toMatch(/branch_id\s*=\s*\?/)
      expect(sql).toMatch(/GROUP BY/)
    }
    expect(queries[0].sql).toContain('FROM doctors d')
    expect(queries[1].sql).toContain('JOIN doctor_schedules ds')
    expect(queries[2].sql).toContain('FROM billing_service_catalog bsc')
    expect(queries[3].sql).toContain('FROM appointment_reason_options aro')
    expect(readiness.medical.active_doctors).toBe(3)
    expect(readiness.medical.schedulable_doctors).toBe(2)
    expect(readiness.medical.active_services).toBe(5)
    expect(readiness.medical.visit_reasons).toBe(3)
    expect(readiness.medical.bookable).toBe(true)
    expect(readiness.derma.issues).toContain('NO_ONLINE_SCHEDULE')
    expect(readiness.derma.bookable).toBe(false)
    expect(readiness.all_bookable).toBe(false)
    const disabled=applyBranchBookingOfferings(readiness,{offers_medical:0,offers_derma:1})
    expect(disabled.medical.issues).toContain('CLINIC_TYPE_DISABLED')
    expect(disabled.medical.bookable).toBe(false)
    expect(disabled.all_bookable).toBe(false)
    expect(readiness.medical.bookable).toBe(true) // no mutation of original readiness
    await expect(getOnlineBookingReadiness(executor,0)).rejects.toThrow('Invalid branch')
  })

  it('exposes patient readiness and includes the same readiness in the admin dashboard response', () => {
    const patientRouter = read('server', 'routers', 'patient.router.js')
    const patientController = read('server', 'controllers', 'patient.controller.js')
    const adminController = read('server', 'controllers', 'admin.controller.js')
    expect(patientRouter).toContain("router.get('/booking-readiness'")
    // Patient readiness is now evaluated for the selected physical branch.
    expect(patientController).toContain('getOnlineBookingReadiness(db,branch.id)')
    expect(patientController).toContain('validatePatientBranch(req,res)')
    expect(adminController).toContain('const bookingReadiness = await getOnlineBookingReadiness()')
    expect(adminController).toContain('bookingReadiness,')
  })

  it('prevents patients from entering a clinic booking flow when its configuration is incomplete', () => {
    const source = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(source).toContain("status.issue_messages?.[0]")
    expect(source).toContain("'Setup incomplete'")
    expect(source).toContain('Boolean(bookingReadiness?.[form.clinicType]?.bookable)')
    expect(source).toContain('disabled={disabled}')
  })

  it('shows administrators the booking readiness status and direct setup actions', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_Dashboard.jsx')
    expect(source).toContain('Online Booking Readiness')
    expect(source).toContain('Configure Services')
    expect(source).toContain('Configure Visit Reasons')
    expect(source).toContain('Manage Doctors')
    expect(source).toContain('Manage Schedules')
  })
})

