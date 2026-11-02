'use strict'

// The order matters: a service category is NOT a general billing event.
const AREA_DEFINITIONS = [
  ['account_security', ["al.action LIKE 'auth.%'", "al.action LIKE 'security.%'", "al.action LIKE 'account.%'", "al.action LIKE 'password_%'", "al.entity_type IN ('admin','staff','doctor','patient','user_account')"]],
  ['services_pricing', ["al.entity_type IN ('billing_service','billing_service_category','billing_service_material')", "al.action LIKE 'catalog.%'", "al.action LIKE 'system.service_category_%'", "al.action LIKE 'service.%'"]],
  ['patients', ["al.entity_type IN ('patient_profile','patient_record')", "al.action LIKE 'patient.%'"]],
  ['appointments', ["al.entity_type IN ('appointment','appointment_cancellation_reason','queue')", "al.action LIKE 'appointment.%'", "al.action LIKE 'queue.%'"]],
  ['doctor_operations', ["al.entity_type IN ('consultation','prescription_document','doctor_schedule','doctor_unavailable_date')", "al.action LIKE 'clinical.%'", "al.action LIKE 'schedule.%'", "al.action LIKE 'prescription.%'"]],
  ['inventory', ["al.entity_type IN ('inventory_item','inventory_movement_reason','inventory_batch','inventory_stock','inventory_uom','inventory_supplier','inventory_location','inventory_location_type','supply_request','supply_request_group')", "al.action LIKE 'inventory.%'", "al.action LIKE 'supply.%'", "al.action LIKE 'system.uom_%'", "al.action LIKE 'system.supplier_%'"]],
  ['billing', ["al.entity_type IN ('billing_record','billing_payment','billing_adjustment_request','cashier_closing','discount_preset','clinic_payment_settings','billing_payment_refund')", "al.action LIKE 'billing.%'", "al.action LIKE 'payment.%'", "al.action LIKE 'cashier.%'"]],
  ['announcements', ["al.entity_type IN ('announcement','campaign','branch_announcement','marketing_campaign','promotion')", "al.action LIKE 'announcement.%'", "al.action LIKE 'marketing.%'", "al.action LIKE 'campaign.%'"]],
  ['reports', ["al.entity_type='report'", "al.action LIKE 'reports.%'", "al.action LIKE 'report.%'"]],
  ['settings', ["al.entity_type IN ('clinic_settings','booking_policy','booking_settings','branch_settings')", "al.action LIKE 'settings.%'", "al.action LIKE 'booking.policy_%'", "al.action LIKE 'system.%'"]],
  ['audit', ["al.entity_type IN ('audit_archive','audit_log')", "al.action LIKE 'audit.%'"]],
]

const AREA_ALIASES = { service_catalog: 'services_pricing', clinical: 'doctor_operations', doctor_schedule: 'doctor_operations', stock_transfers: 'inventory', clinic_settings: 'settings' }
const knownAreas = AREA_DEFINITIONS.map(([code]) => code)
const normalizeArea = (code) => AREA_ALIASES[code] || code
const areaCaseSql = () => `CASE ${AREA_DEFINITIONS.map(([code, parts]) => `WHEN (${parts.join(' OR ')}) THEN '${code}'`).join(' ')} ELSE 'other' END`

module.exports = { areaCaseSql, normalizeArea, knownAreas }
