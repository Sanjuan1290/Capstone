'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const path=require('node:path')
const root=path.resolve(__dirname,'../..')
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const load=(db,broadcast=()=>{})=>{
  const module={exports:{}}
  const fakeRequire=name=>name==='../db/connect'?db:name==='./sse'?{broadcast}:require(name)
  vm.runInNewContext(`(function(require,module,exports){${read('utils/publicationNotifications.js')}\n})`,{})(fakeRequire,module,module.exports)
  return module.exports
}
test('publication jobs queue once per item and do not require email or SMS providers',async()=>{
  const queries=[]
  const fakeDb={query:async(q,args)=>{queries.push([q,args]);return [{affectedRows:1}]}}
  const w=load(fakeDb)
  await w.queuePublication({kind:'promotion',entityId:3,branchId:1})
  await w.queuePublication({kind:'announcement',entityId:99,branchId:1})
  assert.equal(queries.length,2)
  assert.ok(queries.every(([sql])=>sql.includes('INSERT IGNORE INTO clinic_publication_notification_jobs')))
  assert.rejects(()=>w.queuePublication({kind:'weird',entityId:4,branchId:1}),/Invalid/)
})
test('one recipient is notified once after repeated worker runs, from the same DB transaction as the delivery ledger',async()=>{
  const state={job:{id:5,kind:'promotion',entity_id:3,branch_id:1,status:'pending'},ledger:new Set(),notifications:[],broadcasts:[]}
  const db={
    async query(sql,args=[]){
      if(sql.includes('FROM clinic_publication_notification_jobs j'))return [[state.job].filter(j=>j.status==='pending')]
      if(sql.startsWith('UPDATE clinic_publication_notification_jobs SET status=\'sending\'')){state.job.status='sending';return [{affectedRows:1}]}
      if(sql.startsWith('SELECT title,description,id FROM clinic_promotions'))return [[{id:3,title:'Special',description:'25% off'}]]
      if(sql.includes('SELECT p.id FROM patients p'))return [state.ledger.has('3:22')?[]:[{id:22}]]
      if(sql.startsWith('UPDATE clinic_publication_notification_jobs SET status=\'completed\'')){state.job.status='completed';return [{affectedRows:1}]}
      if(sql.startsWith('UPDATE clinic_publication_notification_jobs SET status=\'pending\'')){state.job.status='pending';return [{affectedRows:1}]}
      throw Error('Unexpected query: '+sql.slice(0,80))
    },
    async getConnection(){return {
      async beginTransaction(){},async commit(){},async rollback(){},release(){},
      async query(sql,args){
        if(sql.startsWith('INSERT IGNORE INTO clinic_promotion_notifications')){const key=`${args[0]}:${args[1]}`;if(state.ledger.has(key))return [{affectedRows:0}];state.ledger.add(key);return [{affectedRows:1}]}
        if(sql.startsWith('INSERT INTO notifications')){state.notifications.push(args);return [{insertId:82}]}
        if(sql.startsWith('UPDATE clinic_promotion_notifications'))return [{affectedRows:1}]
        throw Error('Unexpected transaction query '+sql.slice(0,50))
      },
    }}
  }
  const worker=load(db,(...args)=>state.broadcasts.push(args))
  await worker.runPublicationNotifications()
  await worker.runPublicationNotifications()
  assert.equal(state.job.status,'completed')
  assert.equal(state.notifications.length,1)
  assert.equal(state.broadcasts.length,1)
  assert.equal(state.notifications[0][0],22)
})
test('the endpoints queue activation, but linked promotional posts share the offer notification',()=>{
  const promotions=read('routers/branchPromotions.js')
  const posts=read('routers/branchAnnouncements.js')
  assert.match(promotions,/if\(data\.is_active\)await queuePublication/)
  assert.match(posts,/values\.type==='promotion' && !values\.promotion_id/)
  assert.match(posts,/post\?\.type==='promotion' && !post\.promotion_id/)
  assert.match(posts,/AS effective_status/)
  assert.match(read('server.js'),/startPublicationNotificationWorker/)
  assert.match(read('db\/migrations\/2026-11-05-automatic-inapp-notifications.sql'),/UNIQUE KEY uniq_publication_event/)
})
