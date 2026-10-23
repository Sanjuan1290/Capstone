// Form groups are display-only. Never hydrate historical fields from live database.
// These sections are also reused by the current-record read-only viewer.
export const REVIEW_FORM_TEMPLATES = Object.freeze({
  accredited_seller: { title: 'Seller Details', sections: [
    ['Seller Information', ['name','fullName','firstName','lastName','role','status','accreditationDate']],
    ['Network Assignment', ['groupId','sellerGroupId','groupName','networkName','reportsUnderUserId','reportsUnderName','managerName','headUserId']],
  ] },
  seller_group: { title: 'Network Details', sections: [
    ['Network Information', ['name','networkName','groupType','status','description','headUserId']],
    ['Broker Information', ['broker','broker_name','broker_license_number','realty_name','broker_prc_number']],
  ] },
  seller_group_project_rates: { title: 'Project Commission Rates', sections: [
    ['Network & Project', ['groupId','projectId','name','networkName','status']],
    ['Rates', ['poolRate','companyProfitRate','divisionManagerRate','salesDirectorRate','unitManagerRate','salesAgentRate','rates']],
  ] },
  lot_project_listing: { title: 'Listing Details', sections: [
    ['Unit Information', ['unitCode','unitId','listingId','lotType','lotAreaSqm','status','soldSubstatus']],
    ['Prices & Charges', ['netSellingPrice','cashPricePerSqm','installmentPricePerSqm','reservationFee','legalMiscRate','legalMiscAmount','annualInterestRate']],
    ['Requirements', ['cadastralLots','documentRequirements']],
  ] },
  lot_project_client_profile: { title: 'Buyer Details', sections: [
    ['Buyer Information', ['buyerType','buyerName','buyerFullName','firstName','lastName','buyer_first_name','buyer_last_name','buyer_email','buyer_contact_number']],
    ['Address & Employment', ['buyer_present_address','buyer_permanent_address','buyer_employment_status','buyer_monthly_income']],
    ['Seller Assignment', ['assignedSellerId','assignedAccreditedSellerId','sellerName','saleChannel']],
  ] },
  lot_project_payment: { title: 'Payment Details', sections: [
    ['Payment Information', ['paymentType','paymentMethod','paymentDate','amount','paymentAmount','referenceId','paymentStatus']],
    ['Buyer Account', ['listingId','accountId','paymentId','buyerName']],
  ] },
  lot_project_reservation: { title: 'Reservation Details', sections: [
    ['Reservation', ['unitCode','listingId','accountId','reservationDate','reservationFee','status']],
    ['Buyer & Seller', ['buyerName','assignedSellerId','sellerName','saleChannel']],
  ] },
  lot_project_commission: { title: 'Commission Details', sections: [
    ['Seller', ['sellerName','commissionRole','sellerDisplayName']],
    ['Commission', ['commissionRate','commissionBaseAmount','grossCommissionAmount','releasedCommissionAmount','commissionStatus']],
  ] },
  lot_project_settings: { title: 'Project Settings', sections: [
    ['General Settings', ['name','status','reservationFee','annualInterestRate','legalMiscRate','companyName','companyEmail','reservationContactName','reservationContactEmail']],
  ] },
  lot_project_account: {title:'Buyer Account',sections:[
    ['Reservation Information',['account_reference','account_status','buyer_name_snapshot','reservation_date','reservation_fee','listingId','accountId']],
    ['Seller / Commission',['assignedSellerId','assignedAccreditedSellerId','sellerName','saleChannel','commissionRate']],
  ]},
  lot_project_commission_account: {title:'Seller / Commission',sections:[
    ['Assigned Seller',['assignedSellerId','assignedAccreditedSellerId','sellerName','saleChannel','previousSellerId','newSellerId']],
    ['Commission Distribution',['commissionRate','commissionBaseAmount','grossCommissionAmount','commissionDistribution','hierarchy']],
  ]},
  lot_project_cancellation: {title:'Cancellation Details',sections:[
    ['Account & Cancellation',['account_reference','account_status','cancellation_reason','cancellation_status','refund_amount','settlementStatus']],
  ]},
  lot_project_payment_proof: {title:'Payment Proof',sections:[
    ['Payment',['paymentId','paymentType','paymentMethod','amount','paymentDate','referenceId']],
    ['Proof Review',['proofStatus','proofSequence','malwareScanStatus','verifiedAt']],
  ]},
  lot_project_signed_receipt: {title:'Signed Receipt',sections:[
    ['Payment',['paymentId','paymentType','amount','paymentDate','referenceId']],
    ['Acknowledgement',['signedCopyStatus','signedCopyId','uploadedAt']],
  ]},
  lot_project_penalty_schedule: {title:'Penalty Schedule',sections:[
    ['Schedule',['scheduleId','description','due_date','due_amount','schedule_status']],
    ['Penalty',['penalty_amount','penaltyRate','waiverAmount','waiverReason']],
  ]},
  lot_project_lmf_schedule: {title:'LMF Schedule',sections:[
    ['Schedule',['scheduleId','description','due_date','due_amount','schedule_status']],
    ['Legal & Miscellaneous',['lmfAmount','waiverAmount','waiverReason']],
  ]},
  lot_project_buyer_form: {title:'Buyer Form',sections:[
    ['Buyer',['buyerName','firstName','middleName','lastName','email','contactNo','buyerType']],
    ['Submission',['status','submittedAt','reviewedAt','rejectionReason','form']],
  ]},
  lot_project_listing_import: {title:'Listing Import',sections:[
    ['Import Information',['reference','filename','status','totalRows','importedRows','removedRows','importedAt']],
    ['Imported Units',['entries','rows','units']],
  ]},
  lot_project_network_profit_release: {title:'Network Profit Release',sections:[
    ['Network & Payment',['network','networkId','projectId','amount','stage','releaseDate','paymentReference']],
  ]},
})

