import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveReviewRecordLocation } from '../services/reviewRecordLocation.service.js'
import { getReviewRecordLink } from '../../client/src/utils/reviewRecordLinks.js'
import { dismissReviewRecordQuery } from '../../client/src/utils/reviewRecordNavigation.js'
const source = filename => readFileSync(new URL(`../../${filename}`,import.meta.url),'utf8')
const base = { lot_project_slug:'sample',lot_project_id:10 }

test('View Record selects the exact form section instead of only its parent page',()=>{
  const common = { ...base,entity_type:'lot_project_payment',entity_id:'7',recordLocation:{kind:'listing_profile',listingId:20,accountId:30,paymentId:7} }
  const link = getReviewRecordLink({review:common,actorRole:'auditor',reviewId:60})
  const url = new URL(link,'https://example.test')
  assert.equal(url.searchParams.get('reviewTab'),'payments')
  assert.equal(url.searchParams.get('paymentId'),'7')
  assert.equal(url.pathname,'/portal/lot-projects/sample/listings/20/accounts/30')
  assert.equal(url.searchParams.get('workflowAction'),null)
  const seller = getReviewRecordLink({review:{entity_type:'accredited_seller',entity_id:'22',recordLocation:{kind:'seller',sellerId:22,sellerUserId:77,groupType:'in_house',sellerGroupId:4}},actorRole:'auditor',reviewId:61})
  assert.match(seller,/\/accredited\/sellers\/22\?/)
})

test('invalid buyer account and missing payment never produce a review link',()=>{
 const review = { ...base,entity_type:'lot_project_payment',entity_id:'7',recordLocation:{kind:'listing_profile',listingId:20,accountId:null,paymentId:7}}
 assert.equal(getReviewRecordLink({review,reviewId:10}),null)
 assert.equal(getReviewRecordLink({review:{...review,recordLocation:{kind:'listing_profile',listingId:20,accountId:30,paymentId:null}},reviewId:10}),null)
})

test('buyer profile with multiple historical accounts is ambiguous, not an arbitrary selection',async()=>{
 const db={query:async(sql)=>sql.includes('FROM lot_project_client_profiles')
   ? [[{lot_project_client_profile_id:7,lot_project_id:10,lot_project_listing_id:20}]]
   : [[{lot_project_account_id:1,lot_project_id:10,lot_project_listing_id:20},{lot_project_account_id:2,lot_project_id:10,lot_project_listing_id:20}]]}
 const result=await resolveReviewRecordLocation(db,{...base,entity_type:'lot_project_client_profile',entity_id:7})
 assert.equal(result.entityExists,false)
 assert.match(result.recordUnavailableReason,/Multiple buyer accounts/)
})

test('dismiss view removes section/payment targets without dropping review return',()=>{
 const params=dismissReviewRecordQuery(new URLSearchParams('reviewView=1&reviewId=25&reviewTab=payments&scheduleId=7&paymentId=9&proofId=10'))
 for(const key of ['reviewView','reviewTab','scheduleId','paymentId','proofId']) assert.equal(params.has(key),false)
 assert.equal(params.get('reviewReturnId'),'25')
})

test('Before & After defaults to full saved forms with explicit missing evidence',()=>{
 const form=source('client/src/components/Shared/ReviewFormComparison.jsx')
 const live=source('client/src/components/Shared/ReviewLiveRecordPanel.jsx')
 const templates=source('client/src/utils/reviewFormTemplates.js')
 assert.match(form,/useState\('forms'\)/)
 assert.match(form,/Full Form Comparison/)
 assert.match(form,/Not Recorded/)
 assert.match(form,/import \{ REVIEW_FORM_TEMPLATES \}/)
 assert.match(live,/import \{ REVIEW_FORM_TEMPLATES \}/)
 assert.match(templates,/lot_project_payment_proof/)
 assert.doesNotMatch(live,/onSave=|onSubmit=|useFetchPost|mutation\.mutate/)
})

test('listing profile checks exact account, listing and record identity before showing form',()=>{
 const listing=source('client/src/pages/Lot_Projects/ListingProfile.jsx')
 assert.match(listing,/exactAccount && exactListing/)
 assert.match(listing,/reviewTargetId === Number\(profile\.client\?\.id/)
 assert.match(listing,/reviewScheduleId === reviewTargetId/)
 assert.match(listing,/setActiveTab\(reviewTab\)/)
})
