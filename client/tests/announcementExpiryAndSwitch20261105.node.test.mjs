import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {announcementDisplayStatus,clinicNow} from '../src/utils/announcementStatus.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')

test('published post expires at exactly the configured Philippine wall time',()=>{
  const post={status:'published',expires_at:'2026-11-03 18:00:00'}
  assert.equal(clinicNow(new Date('2026-11-03T09:59:59Z')),'2026-11-03 17:59:59')
  assert.equal(announcementDisplayStatus(post,new Date('2026-11-03T09:59:59Z')),'published')
  assert.equal(announcementDisplayStatus(post,new Date('2026-11-03T10:00:00Z')),'expired')
  assert.equal(announcementDisplayStatus({...post,expires_at:'2026-11-30 18:00:00'},new Date('2026-11-03T10:00:00Z')),'published')
})
test('draft and archived posts keep their workflow statuses; scheduled posts expire',()=>{
  const date=new Date('2026-11-05T12:00:00Z')
  assert.equal(announcementDisplayStatus({status:'draft',expires_at:'2026-10-01 12:00:00'},date),'draft')
  assert.equal(announcementDisplayStatus({status:'archived',expires_at:'2026-10-01 12:00:00'},date),'archived')
  assert.equal(announcementDisplayStatus({status:'scheduled',expires_at:'2026-11-01 12:00:00'},date),'expired')
  assert.equal(announcementDisplayStatus({status:'scheduled',publish_at:'2026-11-01 12:00:00'},date),'published')
})
test('announcements management uses effective status for badge, counters, filters, email selection',()=>{
  const src=read('src/pages/adminPage/Admin_Announcements.jsx')
  assert.match(src,/announcementDisplayStatus\(post\)==='expired'/)
  assert.match(src,/\['expired','Expired'\]/)
  assert.match(src,/posts\.filter\(p=>announcementDisplayStatus\(p\)==='published'\)/)
  assert.match(src,/VisibilitySwitch checked=\{announcementDisplayStatus\(post\)==='published'\}/)
})
test('promotion visibility uses accessible switches, and auto in-app notices replace manual dispatch UI',()=>{
  const promo=read('src/pages/adminPage/Admin_Promotions.jsx')
  const control=read('src/components/ui/VisibilitySwitch.jsx')
  assert.match(promo,/VisibilitySwitch checked=\{Boolean\(form\.is_active\)\}/)
  assert.match(promo,/VisibilitySwitch checked=\{Boolean\(promo\.is_active\)\}/)
  assert.doesNotMatch(promo,/In-app Notification<\/button>/)
  assert.match(control,/role="switch" aria-checked=\{Boolean\(checked\)\}/)
})
