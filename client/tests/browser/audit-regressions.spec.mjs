import {test,expect} from '@playwright/test'

const permissions=['dashboard','billing','checkout','appointments','inventory','system_setup','patient_records','doctor_schedules']
async function mockPortal(page,role){
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname
  const send=data=>route.fulfill({json:data})
  if(p.endsWith('/check-auth'))return send({authenticated:true,user:{id:8,full_name:'Synthetic QA User',email:'qa@example.invalid',role:role==='superadmin'?'admin':role,account_role:role,branch_id:1,branch_name:'Synthetic QA Branch',permissions,must_change_password:false,onboarding_completed_at:'2026-11-01',is_profile_complete:1}})
  if(p.endsWith('/settings')){await new Promise(resolve=>setTimeout(resolve,150));return send({id:8,full_name:'Synthetic QA User',email:'qa@example.invalid',phone:'09170000000',birthdate:'1996-01-01',gender:'Female',address:'Synthetic Address',phone_verified_at:'2026-11-01',email_verified_at:'2026-11-01'})}
  if(p.includes('/events/'))return route.fulfill({contentType:'text/event-stream',body:': synthetic\n\n'})
  if(p==='/api/branches/me')return send({branch_id:1,branch_name:'Synthetic QA Branch',permissions})
  if(p.endsWith('/clinic-settings'))return send({clinic_name:'Synthetic QA Branch'})
  if(p.endsWith('/notifications'))return send({items:[],unread:0})
  if(p.endsWith('/branches')||p==='/api/branches'||p==='/api/branches/')return send([{id:1,name:'Synthetic QA Branch',is_active:1}])
  return send([])
 })
}
for(const role of ['admin','staff','doctor','patient'])test(`${role} Settings loads asynchronously without changing hook order`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await mockPortal(page,role)
 await page.goto(`/${role}/settings`)
 await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible()
 await expect(page.getByText('qa@example.invalid',{exact:true}).first()).toBeVisible()
 await expect(page.getByRole('button',{name:'Change Password',exact:true})).toBeVisible()
 expect(errors).toEqual([])
 await page.reload()
 await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible()
 expect(errors).toEqual([])
})
test('legacy billing redirect retains the Super Admin physical branch without a runtime ReferenceError',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await mockPortal(page,'superadmin')
 await page.goto('/superadmin/branches/1/billing/transactions')
 await expect(page).toHaveURL(/\/superadmin\/branches\/1\/billing\?tab=history$/)
 expect(errors).toEqual([])
})
