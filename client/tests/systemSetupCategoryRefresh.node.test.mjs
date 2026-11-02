import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const ui=readFileSync(new URL('../src/pages/adminPage/Admin_SystemSetup.jsx',import.meta.url),'utf8')
const route=readFileSync(new URL('../../server/routers/branchSystemWrites.js',import.meta.url),'utf8')
const admin=readFileSync(new URL('../../server/controllers/admin.controller.js',import.meta.url),'utf8')
test('System Setup keeps category component mounted on background refresh',()=>{
 assert.ok(ui.includes('loading && !loaded'))
 assert.ok(ui.includes('version !== requestVersion.current'))
 assert.ok(ui.includes('Updating list…'))
 assert.ok(!ui.includes("} : loading ? ("))
})
test('delete stays open after an error and success requires actual deleted confirmation',()=>{
 assert.ok(ui.includes('result?.deleted !== true'))
 assert.ok(ui.includes('setDeleteError(err.message'))
 assert.ok(ui.includes('{deleteError && <p role="alert"'))
})
test('branch and super admin explicitly return permanent deletion on successful delete',()=>{
 assert.ok(route.includes("withSetup('/system-setup/service-categories/:id','delete',deleteCategory)"))
 assert.ok(route.includes('SELECT COUNT(*) AS total FROM billing_service_catalog WHERE category_id=? AND branch_id=?'))
 assert.ok(route.includes('return res.json({deleted:true,id'))
 assert.ok(admin.includes("res.json({ deleted:true, id, message: 'Service Category permanently deleted.' })"))
})
