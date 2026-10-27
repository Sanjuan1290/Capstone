const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBranchDashboard } = require('../../utils/branchDashboard')

const mockDb = (failSection) => ({
  query: async (sql, params) => {
    assert.deepEqual(params, [1], 'All queries must be branch-scoped')
    const section = sql.includes('pendingApprovals') ? 'pendingApprovals'
      : sql.includes('totalPatients') ? 'totalPatients'
      : sql.includes('lowStockCount') ? 'lowStockCount' : 'doctorStatus'
    if (section === failSection) throw Object.assign(new Error('SQL data is unavailable'), {code: 'ER_BAD_FIELD_ERROR'})
    return [[{pendingApprovals:3,totalPatients:7,lowStockCount:2,doctorStatus:4}[section] !== undefined && section !== 'doctorStatus'
      ? {[section]:{pendingApprovals:3,totalPatients:7,lowStockCount:2}[section]}
      : {id:17,full_name:'QA Doctor',clinic_type:'medical',status:'available'}]]
  },
})

// The four SQL sections are independent. No rejected section may be converted to zero.
test('a failed low-stock query retains all other dashboard data and signals unavailable', async () => {
  const failures = []
  const result = await loadBranchDashboard({db:mockDb('lowStockCount'), branchId:1,
    getBookingReadiness: async (_db,id) => { assert.equal(id,1); return {medical:{bookable:true},derma:{bookable:true}} },
    onSectionError: (key,error)=>failures.push({key,code:error.code}),
  })
  assert.equal(result.pendingApprovals,3)
  assert.equal(result.totalPatients,7)
  assert.equal(result.lowStockCount,null)
  assert.equal(result.doctorStatus.length,1)
  assert.equal(result.status,'partial')
  assert.match(result.sectionErrors.lowStockCount,/unavailable/)
  assert.deepEqual(failures,[{key:'lowStockCount',code:'ER_BAD_FIELD_ERROR'}])
})

test('booking readiness failure does not hide doctor availability',async()=>{
  const result=await loadBranchDashboard({db:mockDb(),branchId:1,getBookingReadiness:async()=>{throw Error('unavailable')}})
  assert.equal(result.bookingReadiness,null)
  assert.ok(result.sectionErrors.bookingReadiness)
  assert.equal(result.doctorStatus.length,1)
})

test('a complete dashboard returns all numbers and no partial errors',async()=>{
  const result=await loadBranchDashboard({db:mockDb(),branchId:1,getBookingReadiness:async()=>({medical:{bookable:true},derma:{bookable:true}})})
  assert.equal(result.status,'ok')
  assert.equal(result.sectionErrors,undefined)
  assert.equal(result.lowStockCount,2)
})

