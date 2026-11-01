const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {PREFIX,parsePost,readablePost}=require('../utils/announcementDocument')
test('email uses plain readable text not stored formatting data',()=>{
 const raw=PREFIX+JSON.stringify({ops:[{insert:'Book Now',attributes:{bold:true}},{insert:'\n'}]})
 assert.equal(readablePost(raw),'Book Now')
 assert.match(fs.readFileSync(path.join(__dirname,'../utils/marketingCampaigns.js'),'utf8'),/escapeHtml\(readablePost\(announcement\.body\)\)/)
})
test('server rejects unsafe Quill document attributes',()=>{
 const s=PREFIX+JSON.stringify({ops:[{insert:'x',attributes:{link:'javascript:alert(1)'}}]})
 assert.equal(parsePost(s),null)
 const good=PREFIX+JSON.stringify({ops:[{insert:'x',attributes:{link:'https://caraitclinic.com'}}]})
 assert.ok(parsePost(good))
})
test('existing plain text and markdown remain supported',()=>{
 assert.equal(readablePost('## Hello\n**world**'),'## Hello\n**world**')
 assert.equal(parsePost('not quill'),null)
})
test('branch announcement endpoint uses strict validation and branch filter',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../routers/branchAnnouncements.js'),'utf8')
 assert.match(s,/parsePost\(content\)/)
 assert.match(s,/WHERE a\.branch_id=\?/)
})
