import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAdminDashboardSections } from '../src/pages/adminPage/dashboardData.mjs'
const appts = async () => []

test('partial stats are retained and failed sections are clearly labelled',async()=>{
 const result = await loadAdminDashboardSections({date:'2026-10-22',getAppointments:appts,getDashboard:async()=>({
  totalPatients:null,pendingApprovals:1,lowStockCount:2,doctorStatus:[{id:1,status:'available'}],bookingReadiness:{medical:{},derma:{}},
  sectionErrors:{totalPatients:'Patient totals temporarily unavailable.'},status:'partial',
 })})
 assert.equal(result.errors.dashboard,undefined)
 assert.match(result.errors.summary,/unavailable/)
 assert.equal(result.dashboard.totalPatients,null)
 assert.equal(result.dashboard.pendingApprovals,1)
})

test('doctor query failure is isolated from booking readiness and summary',async()=>{
 const result = await loadAdminDashboardSections({date:'2026-10-22',getAppointments:appts,getDashboard:async()=>({
  totalPatients:12,pendingApprovals:0,lowStockCount:0,doctorStatus:null,bookingReadiness:{medical:{},derma:{}},
  sectionErrors:{doctorStatus:'Doctor availability temporarily unavailable.'},status:'partial',
 })})
 assert.equal(result.errors.dashboard,undefined)
 assert.match(result.errors.doctors,/availability/)
 assert.equal(result.dashboard.totalPatients,12)
})

test('malformed dashboard responses do not mask failures with zero',async()=>{
 const result=await loadAdminDashboardSections({date:'2026-10-22',getAppointments:appts,getDashboard:async()=>({doctorStatus:[],bookingReadiness:{}})})
 assert.equal(result.dashboard,null)
 assert.match(result.errors.dashboard,/unexpected dashboard/)
})

