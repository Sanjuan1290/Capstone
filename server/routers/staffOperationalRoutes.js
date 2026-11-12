// Reuse the audited physical-branch handlers. No Admin cookie, role or account
// identity is borrowed; every operation still requires the Staff grant.
const { afterSuccessfulMutation } = require('../utils/clinicEvents')
module.exports = function registerStaffOperationalRoutes(router, { auth, can, canAny, ownAssignedDoctor, staff, admin }) {
  const context = (req,res,next) => { req.adminContext = { account_role: 'staff' }; next() }
  const options = { branchContext: context, requireSuper: (req,res,next)=>next(), requirePermission: can, allowAnyPermission: canAny }
  const adapter = Object.fromEntries(['get','post','put','patch','delete'].map(method => [method, (route,...handlers) => {
    if (!route.startsWith('/my/legacy')) return
    const path = route.replace('/my/legacy','/admin-access')
    // The operational read registrar also contains finance reads. Those keep
    // their existing Staff billing handlers and checkout/view permissions.
    if (method === 'get' && !/^\/admin-access\/(?:inventory(?:\/|$)|system-setup$|clinic-settings$|billing\/payment-settings$)/.test(path)) return
    router[method](path,...auth,...handlers)
  }]))
  require('./branchInventoryItems').registerBranchInventoryItems(adapter,options)
  const items = require('./branchInventoryItems')
  router.post('/inventory',...auth,can('inventory'),context,items.createItem)
  router.put('/inventory/:id',...auth,can('inventory'),context,items.updateItem)
  require('./branchOperationalReads').registerBranchOperationalReads(adapter,options)
  require('./branchBatchActions').registerBranchBatchActions(adapter,options)
  // Shared stock movement and room/supplier validation; queue stays on the
  // native Staff endpoints with its independent walk_in_queue grant.
  const inventoryAdapter = Object.fromEntries(['get','post','put','patch','delete'].map(method=>[method,(route,...handlers)=>{
    if (/\/inventory(?:\/|$)/.test(route)) adapter[method](route,...handlers)
  }]))
  require('./branchQueueInventoryWrites').registerBranchQueueInventoryWrites(inventoryAdapter,options)
  require('./branchQueueInventoryWrites').registerBranchMoveStock(inventoryAdapter,options)
  const safe = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next)
  router.get('/admin-access/dashboard',...auth,can('dashboard'),safe(async(req,res)=>{
    const payload=await require('../utils/branchDashboard').loadBranchDashboard({db:require('../db/connect'),branchId:req.branchId,getBookingReadiness:require('../utils/bookingReadiness').getOnlineBookingReadiness})
    res.json(payload)
  }))
  router.get('/admin-access/appointments',...auth,can('appointments'),staff.getAppointments)
  const setup = require('./branchSystemWrites')
  router.get('/admin-access/inventory',...auth,canAny('inventory','system_setup','billing'),staff.getInventory)
  router.get('/admin-access/doctors',...auth,can('doctor_schedules'),staff.getDoctors)
  router.get('/admin-access/doctors/:id/schedules',...auth,can('doctor_schedules'),ownAssignedDoctor,staff.getDoctorSchedules)
  router.get('/admin-access/doctors/:id/unavailable-dates',...auth,can('doctor_schedules'),ownAssignedDoctor,staff.getDoctorUnavailableDatesForStaff)
  router.get('/admin-access/doctors/:id/walk-ins/acceptance',...auth,can('doctor_schedules'),ownAssignedDoctor,require('../utils/walkInAcceptance').handler())
  router.put('/admin-access/doctors/:id/walk-ins/acceptance',...auth,can('doctor_schedules'),ownAssignedDoctor,require('../utils/walkInAcceptance').handler({editable:true}))
  router.put('/admin-access/doctors/:id/schedules',...auth,can('doctor_schedules'),ownAssignedDoctor,afterSuccessfulMutation('schedule.updated'),safe(admin.saveDaySchedule))
  router.put('/admin-access/doctors/:id/unavailable-dates',...auth,can('doctor_schedules'),ownAssignedDoctor,afterSuccessfulMutation('schedule.updated'),safe(admin.saveDoctorUnavailableDateAdmin))
  router.delete('/admin-access/doctors/:id/unavailable-dates/:date',...auth,can('doctor_schedules'),ownAssignedDoctor,afterSuccessfulMutation('schedule.updated'),safe(admin.deleteDoctorUnavailableDateAdmin))
  router.post('/admin-access/billing/discount-presets',...auth,can('system_setup'),safe(require('./branchCatalogWrites').saveDiscount))
  router.put('/admin-access/billing/discount-presets/:id',...auth,can('system_setup'),safe(require('./branchCatalogWrites').saveDiscount))
  router.put('/admin-access/billing/payment-settings',...auth,can('system_setup'),context,safe(require('./branchPaymentSettingsWrites').save))
  for (const method of ['post','put']) router[method](`/admin-access/system-setup/movement-reasons${method==='put'?'/:id':''}`,...auth,can('system_setup'),safe(setup.saveBranchMovementReason))
}
