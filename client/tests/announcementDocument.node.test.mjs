import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {encodeDocument,documentOps,documentText,legacyToOps,safeLink,DOC_PREFIX} from '../src/utils/announcementDocument.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
test('visual editor content saves and extracts readable text without HTML',()=>{
  const value=encodeDocument([{insert:'Healthy skin',attributes:{bold:true}},{insert:'\n',attributes:{header:2}},{insert:'Book a consultation\n'}])
  assert.ok(value.startsWith(DOC_PREFIX))
  assert.equal(documentText(value),'Healthy skin\nBook a consultation')
  assert.equal(documentOps(value)[1].attributes.header,2)
})
test('unsafe formatting is dropped, invalid links never become clickable',()=>{
  assert.equal(safeLink('javascript:alert(1)'),false)
  assert.equal(safeLink('//evil.example'),false)
  assert.equal(safeLink('/patient/book?branch_id=1'),true)
  const value=encodeDocument([{insert:'click',attributes:{link:'javascript:alert(1)',onmouseover:'evil',bold:true}}])
  assert.deepEqual(documentOps(value)[0].attributes,{bold:true})
  assert.throws(()=>encodeDocument([{insert:{image:'https://evil.example'}}]),/plain text/)
})
test('old markdown records remain readable and can be edited without HTML insertion',()=>{
  const ops=legacyToOps('## Clinic Update\n**Important** note\n- Vaccination')
  assert.ok(ops.some(x=>x.attributes?.header===2))
  assert.ok(ops.some(x=>x.attributes?.bold===true))
  assert.ok(ops.some(x=>x.attributes?.list==='bullet'))
})
test('patient services read the branch booking API and do not expose fixed consultation prices',()=>{
  const s=read('client/src/components/services/PatientServices.jsx')
  assert.match(s,/getBookingServices\('',branchId\)/)
  assert.match(s,/serviceBookingPath\(service,branchId\)/)
  assert.doesNotMatch(read('client/src/pages/patientPage/PatientDashboard.jsx'),/CONSULTATION_PRICING/)
})
test('patient dashboard shows eligible promotions and published branch announcements',()=>{
  const dash=read('client/src/pages/patientPage/PatientDashboard.jsx')
  assert.match(dash,/<PatientServices branchId=\{branchId\}/)
  assert.match(dash,/<FeaturedOffers promotions=\{promotions\}/)
  assert.match(dash,/<PatientAnnouncementPromos branchId=\{branchId\}/)
  assert.match(read('client/src/components/promotions/PatientAnnouncementPromos.jsx'),/type=promotion&branch_id=/)
})
test('editor separates publishing and email campaigns, offers search and pagination',()=>{
  const s=read('client/src/pages/adminPage/Admin_Announcements.jsx')
  for(const t of ['Save Draft','Publish Now','Email Campaigns','Find a post','Posts per page','Previous','Next','QuillAnnouncementEditor'])assert.ok(s.includes(t),t)
  assert.match(s,/workspaceTab==='emails'/)
})
