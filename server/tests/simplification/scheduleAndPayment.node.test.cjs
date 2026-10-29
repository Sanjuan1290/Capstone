const { test }=require('node:test')
const assert=require('node:assert/strict')
const {validateSchedulePayload,buildSlotsForCalendarDate,isTimeCoveredByWeeklySchedule}=require('../../utils/scheduleWindows')
const {isValidPaymentMethod}=require('../../utils/payments')
const monday=[{day_of_week:'Monday',start_time:'08:00',end_time:'17:00',slot_duration_mins:90,is_active:1}]
test('service-independent 30-minute grid ignores legacy doctor slot size',()=>{
 const slots=buildSlotsForCalendarDate({date:'2026-11-02',schedules:monday})
 assert.deepEqual(slots.slice(0,4).map(x=>x.time),['8:00 AM','8:30 AM','9:00 AM','9:30 AM'])
 assert.equal(slots.at(-1).time,'4:30 PM')
})
test('service must fit fully inside weekly work window',()=>{
 assert.equal(isTimeCoveredByWeeklySchedule({date:'2026-11-02',time:'3:30 PM',schedules:monday,slotDurationOverride:90}),true)
 assert.equal(isTimeCoveredByWeeklySchedule({date:'2026-11-02',time:'4:00 PM',schedules:monday,slotDurationOverride:90}),false)
})
test('doctor changing legacy slot duration cannot affect booking behavior',()=>{
 const payload=validateSchedulePayload({day_of_week:'Monday',start_time:'08:00',end_time:'17:00',slot_duration_mins:15,is_active:1})
 assert.equal(payload.slot_duration_mins,60)
})
test('only cash and verified gateway qrph are valid new payment methods',()=>{
 for(const method of ['cash','qrph']) assert.equal(isValidPaymentMethod(method),true)
 for(const method of ['gcash','maya','bank_transfer','other']) assert.equal(isValidPaymentMethod(method),false)
})
