import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const editor = read('client/src/pages/adminPage/Admin_Announcements.jsx')
const offers = read('client/src/pages/adminPage/Admin_Promotions.jsx')
const backend = read('server/routers/branchAnnouncements.js')

const section = (source, start, end) => {
  const begin = source.indexOf(start)
  assert.ok(begin >= 0, `Missing ${start}`)
  const finish = source.indexOf(end, begin)
  assert.ok(finish > begin, `Missing ${end}`)
  return source.slice(begin, finish)
}

const getValidatePost = () => {
  const fn = section(backend, 'const validatePost = body => {', '\nconst uniqueSlug')
  const context = {
    URL,
    idOk: value => Number.isSafeInteger(Number(value)) && Number(value)>0,
    QUILL_PREFIX: '\\x00',
    parsePost: () => true,
    readablePost: () => true,
    bad: (message, statusCode=400) => Object.assign(new Error(message), {statusCode}),
    clean: (value, max=255) => String(value ?? '').trim().slice(0, max),
    slug: value => String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    dateTime: value => value ? String(value).replace('T', ' ')+':00' : null,
  }
  return vm.runInNewContext(`${fn}\nvalidatePost`, context)
}
const postPayload = (type, promotionId=17) => ({
  type, title: 'Holiday Clinic Announcement', caption: 'Offer details', body: 'Clinic information about the offer',
  promotion_id: promotionId, cta_url: '/patient/book?branch_id=30002&promotion_id=17', status: 'draft',
})

test('all post types may link the same branch-owned promotion as a booking destination', () => {
  const validate = getValidatePost()
  for (const type of ['news','article','promotion']) {
    const result = validate(postPayload(type))
    assert.equal(result.type, type)
    assert.equal(result.promotion_id, 17)
    assert.equal(result.cta_url, '/patient/book?branch_id=30002&promotion_id=17')
  }
})

test('server still rejects unsafe or inconsistent promotion identifiers and booking URLs', () => {
  const validate = getValidatePost()
  assert.throws(() => validate(postPayload('news', -1)), /valid clinic promotion/)
  assert.throws(() => validate({...postPayload('article'), cta_url:'/patient/book?branch_id=30002&promotion_id=18'}), /does not match/)
  assert.throws(() => validate({...postPayload('news'), cta_url:'https://example.test/phishing'}), /clinic booking destination/)
  assert.match(backend, /SELECT id FROM clinic_promotions WHERE id=\? AND branch_id=\?/)
  assert.match(backend, /Booking destination must use this clinic branch/)
})

test('Post editor always displays promotion choices and keeps selection across Post Type changes', () => {
  assert.match(editor, /<optgroup label="Book with a clinic promotion">\{\(bookingOptions\?\.promotions\|\|\[\]\)\.map/)
  assert.doesNotMatch(editor, /form\.type==='promotion'&&<optgroup/)
  assert.match(editor, /const update=\(key,value\)=>setForm\(current=>\(\{\.\.\.current,\[key\]:value\}\)\)/)
  const selectCode = section(editor, '  const selectBooking=(choice)=>', '\n  const onImage=')
  let form = {type:'news',cta_url:'',promotion_id:null}
  const context = {
    bookingOptions: {branch_id:30002,promotions:[{id:17,title:'Holiday Special'}],services:[]},
    setForm: update => {form = update(form)},
  }
  const selectBooking = vm.runInNewContext(`${selectCode}\nselectBooking`,context)
  selectBooking('promotion:17')
  assert.equal(form.type, 'news')
  assert.equal(form.promotion_id, 17)
  assert.equal(form.cta_url, '/patient/book?branch_id=30002&promotion_id=17')
})

test('promotion data refreshes after saving or hiding an offer, and when opening a post editor', () => {
  assert.match(editor, /const refreshBookingOptions = useCallback/)
  assert.match(editor, /void refreshBookingOptions\(\)/)
  assert.match(editor, /onPromotionsChanged=\{refreshBookingOptions\}/)
  assert.equal((offers.match(/await onPromotionsChanged\?\.\(\)/g)||[]).length,2)
})

test('direct email buttons are removed from Posts and Offers, but Email Campaigns remains available', () => {
  for (const source of [editor,offers]) {
    assert.doesNotMatch(source, /Email Patients/)
    assert.doesNotMatch(source, /Send by Email/)
    assert.doesNotMatch(source, /onEmailOffer/)
  }
  assert.match(editor, /\['emails','Email Campaigns'\]/)
  assert.match(editor, /startMarketingCampaign/)
  assert.match(offers, /Create Promo Post/)
})
