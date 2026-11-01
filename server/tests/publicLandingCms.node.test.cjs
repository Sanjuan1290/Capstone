const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

let row = { content: JSON.stringify({ hero: { heading: 'Published heading' } }), updated_at: '2026-11-01 00:00:00' }
const db = {
  async query(sql, values) {
    if (/SELECT id FROM landing_page_content/i.test(sql)) return [[{ id: 1 }]]
    if (/SELECT content/i.test(sql)) return [[{ ...row }]]
    if (/UPDATE landing_page_content/i.test(sql)) { row.content=values[0]; return [{ affectedRows:1 }] }
    throw new Error(`Unexpected SQL: ${sql}`)
  },
  async getConnection() { return { query: db.query, beginTransaction: async()=>{}, commit:async()=>{}, rollback:async()=>{}, release:()=>{} } }
}
const origLoad = Module._load
Module._load = function (request, ...rest) { if (request === '../db/connect') return db; return origLoad.call(this,request,...rest) }
const cms = require(path.resolve(__dirname,'../utils/landingPageContent.js'))
Module._load = origLoad

const reset = () => { row.content=JSON.stringify({hero:{heading:'Published heading'}}) }

test('Draft saves privately, without changing public content', async () => {
  reset()
  let admin = await cms.getEditorLandingPageContent()
  assert.equal(admin.revision,0)
  admin = await cms.saveLandingPageDraft({hero:{heading:'Private draft'}}, admin.revision)
  assert.equal(admin.content.hero.heading,'Private draft')
  assert.equal(admin.has_draft,true)
  const publicRecord = await cms.getLandingPageContent()
  assert.equal(publicRecord.content.hero.heading,'Published heading')
  assert.equal(publicRecord.content._cms,undefined)
  assert.equal(publicRecord.content.section_order.length,6)
})

test('Publishes only after separate publish operation; old content is retained in history', async () => {
  reset()
  let admin = await cms.getEditorLandingPageContent()
  admin = await cms.saveLandingPageDraft({hero:{heading:'New live heading'},services:{visible:false}},admin.revision)
  const liveBefore = await cms.getLandingPageContent()
  assert.equal(liveBefore.content.hero.heading,'Published heading')
  const published = await cms.publishLandingPageDraft(admin.content,admin.revision)
  assert.equal(published.has_draft,false)
  assert.equal(published.history.length,1)
  const liveAfter = await cms.getLandingPageContent()
  assert.equal(liveAfter.content.hero.heading,'New live heading')
  assert.equal(liveAfter.content.services.visible,false)
  assert.equal(liveAfter.content._cms,undefined)
})

test('Restore creates private draft and leaves published version intact', async () => {
  let admin = await cms.getEditorLandingPageContent()
  assert.equal(admin.history.length,1)
  admin = await cms.restoreLandingPageVersion(admin.history[0].id,admin.revision)
  assert.equal(admin.has_draft,true)
  assert.equal(admin.content.hero.heading,'Published heading')
  assert.equal((await cms.getLandingPageContent()).content.hero.heading,'New live heading')
})

test('Concurrent edits reject stale revision rather than overwriting changes', async () => {
  reset()
  const admin=await cms.getEditorLandingPageContent()
  await cms.saveLandingPageDraft({hero:{heading:'First edit'}},admin.revision)
  await assert.rejects(cms.saveLandingPageDraft({hero:{heading:'Stale edit'}},admin.revision), err=>err.statusCode===409)
  assert.equal((await cms.getEditorLandingPageContent()).content.hero.heading,'First edit')
})

test('Order and visibility options stay in normalized content', () => {
  const normalized=cms.normalizeLandingPageContent({section_order:['contact','services','services','evil'],hero:{visible:false},services:{items:[]}})
  assert.equal(normalized.section_order[0],'contact')
  assert.equal(new Set(normalized.section_order).size,6)
  assert.equal(normalized.hero.visible,false)
  assert.deepEqual(normalized.services.items,[])
})
