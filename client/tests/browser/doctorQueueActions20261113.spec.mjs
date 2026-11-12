import {test,expect} from '@playwright/test'
import {mockClinic} from './helpers/clinic20261111.mjs'
async function setup(page,status='called'){
 await page.clock.install({time:new Date('2026-11-13T02:00:00+08:00')})
 await mockClinic(page,'doctor')
 const rows=[{id:1,queue_number:1,type:'derma',status,patient_name:'First Patient',appointment_id:101},{id:2,queue_number:2,type:'derma',status:'waiting',patient_name:'Next Patient',appointment_id:102}]
 const requests=[]
 await page.route('**/api/doctor/appointments?*',route=>route.fulfill({json:[]}))
 await page.route('**/api/doctor/queue',route=>route.fulfill({json:rows}))
 await page.route('**/api/doctor/queue/call-next',route=>{
  const body=route.request().postDataJSON();requests.push(body)
  if(body.return_called_queue_id){rows[0].status='waiting';rows[1].status='called';return route.fulfill({json:{returnedPatient:rows[0],nextPatient:rows[1],message:'Patient returned to waiting and the next patient called.'}})}
  return route.fulfill({json:{alreadyActive:true,nextPatient:rows[0],message:status==='in_consultation'?'A patient is currently in consultation. Complete that visit before calling the next patient.':'A patient has already been called. Start or return that patient before calling the next one.'}})
 })
 await page.goto('/doctor/appointments')
 return {rows,requests}
}
test('Call Next displays the active queue warning and unanswered calls can advance safely',async({page})=>{
 const {requests}=await setup(page)
 await page.getByRole('button',{name:'Call Next',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('DER-001')
 await expect(page.getByRole('alert')).toContainText('already been called')
 await page.getByRole('button',{name:'Patient not here',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog).toContainText('Their appointment stays open')
 await dialog.getByRole('button',{name:'Return to Waiting & Call Next',exact:true}).click()
 await expect.poll(()=>requests.length).toBe(2)
 expect(requests[1]).toEqual({return_called_queue_id:1})
 await expect(page.getByRole('alert')).toContainText('DER-002')
 await expect(page.getByRole('alert')).toContainText('returned to waiting')
 await expect(page.getByText('1 waiting · 1 called',{exact:true})).toBeVisible()
 await page.screenshot({path:'../QA_REPORT/shared-operations-2026-11-13/browser-artifacts/doctor-queue.png',fullPage:true})
})
test('Call Next network/API failures are visible to the doctor',async({page})=>{
 await setup(page)
 await page.route('**/api/doctor/queue/call-next',route=>route.fulfill({status:409,json:{message:'Queue changed. Review the current called patient.'}}))
 await page.getByRole('button',{name:'Call Next',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('Queue changed. Review the current called patient.')
})
test('an active consultation has no skip action and explains why Call Next is blocked',async({page})=>{
 await setup(page,'in_consultation')
 await expect(page.getByRole('button',{name:'Patient not here',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Call Next',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('Complete that visit')
})
