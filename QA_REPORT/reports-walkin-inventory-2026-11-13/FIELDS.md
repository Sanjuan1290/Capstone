# Reports & Analytics field review — 2026-11-13

Reviewed against repository HEAD 71161a2 plus the local corrections recorded in RESULTS.md. This is source, SQL and synthetic-data verification; it does not certify the values currently visible on the hosted website.

## Scope and dates

- Super Admin detail API: `/api/branches/analytics/report-details`. Each of the five sections receives the same `from`, `to`, and optional physical `branch_id`.
- Branch comparison: `/api/branches/analytics/all`. The page filters the returned branch rows to the selected branch. Daily chart: `/api/branches/analytics/trends`, with the selected branch passed to the API.
- Branch Admin, Staff and Super Admin branch workspace reports use the shared `readBranchReport` handler in `server/routers/branchReports.js`, through permission-guarded branch report routes.
- Historical appointment measures use `appointments.appointment_date`, inclusive of both selected dates. Counts include guest, registered and walk-in appointments, including cancelled requests unless a metric explicitly filters status.
- Billed measures use `DATE(COALESCE(finalized_at,created_at))`. Draft, legacy pending and voided bills are excluded. Historical bill and line snapshots are used rather than current catalog prices.
- Collections use separate payment, void and refund event dates. A later refund can make a later period negative; it does not rewrite the original collection period. Negative charts now remain within their plotted range.
- Outstanding balances, inventory quantities, expiry and current operations are explicitly current snapshots, not historical closing balances. Expiry boundaries use the clinic's Philippine date. Pooled database connections set the configured clinic time zone before report queries run.
- Failed report SQL now produces a visible error instead of silently substituting zero collections. No patient contact information or clinical notes are included in the aggregate report exports.

## Super Admin fields

| Section / visible fields | Source and calculation | Verification |
| --- | --- | --- |
| Overview: Appointments, Completed Visits, Unique Patients | Count appointments, completed statuses, and distinct patient IDs within the selected appointment dates and branch | Actual loader SQL executed against synthetic data |
| Overview: No-show Rate | No-show / (completed + no-show), zero when denominator is zero | Fixture: 1 / 2 = 50%; denominator explained in UI |
| Overview: Net Collections | Completed/voided payments received in period minus void and refund events in period | Fixture net 100; refund-only date -200 |
| Overview: Outstanding | Current ready/partially-paid bill total minus completed payments net of recorded refunds, floored at zero per bill | Fixture 200; unconfirmed bills excluded |
| Overview: Appointment Activity, Net Collections Trend | Actual daily appointment trend API; monthly collection event ledger | Trend and comparison route handlers execute their real SQL in tests; removed hidden 20-row truncation |
| Overview: Low Stock, Out of Stock | Current nonarchived inventory; whole available quantities after pending clinical reservations when unified stock-out is enabled | Fixture physical 10, reserved 8, available 2 produces low-stock alert |
| Branch Comparison: branch, appointments, completed, net billed, net collected | Appointment/billing ownership uses physical branch; collection event legs use the bill's branch | Branch 1: 4 appointments, 1 completed, billed 1200, collected 100; branch 2 collected 500 |
| Appointments & Patients: total, unique, new, returning, completed, no-show | Same scoped appointment set; new means first-ever recorded appointment across the clinic occurs in the selected period and selected branch; remaining unique patients are returning | Corrected row-array/object bug; 3 unique = 2 new + 1 returning in fixture |
| Appointment Status, Booking Sources, Department Activity | Group the same scoped appointments by status, source and clinic type | Group totals reconcile to 4; guest_online included |
| Financial: gross billed, total discounts, net billed | Sum saved bill subtotal, discount amount and total amount on confirmed bill dates | Fixture 1300 gross, 100 discount, 1200 net; pending 9999 and draft 2000 excluded |
| Financial: gross received, net collections, outstanding | Event ledger and current receivables, as above | Gross 1000, voided 700, refunded 200, net 100; outstanding 200 |
| Revenue by Month, Collections by Payment Method | Net event ledger grouped by month/payment method | Refund-only periods plotted as negative amounts |
| Payment Breakdown: method, transactions, received, voided, refunded, net | Transactions count payment events, not adjustment events; net = received - voided - refunded | Reconciles to Financial totals |
| Discounted Bills, Promotion Savings | Bills with saved positive promotion discount; finalization date and branch apply | Fixture 1 bill, savings 100 |
| Doctor Workload; Doctors: branch, doctor, bookings, patients, completed, no-show | Appointment doctor and physical appointment branch; distinct patients per doctor/branch | Shared doctor whose home branch differs remains included; table up to 50 rows, chart top 12 |
| Top Billed Services; Services: branch, service, bills, quantity, billed value | `billing_items.item_type='service'`; saved line totals before bill-level discounts | Fixture service total 1280 excludes supply line 20; table top 50, chart top 12 |
| Promotion Performance: branch, offer, bills, savings | Saved appointment promotion title and bill promotion discount; grouped by branch/promotion | No current promotion catalog re-pricing |
| Inventory: products, out/low stock, expired batches, expiring batches (30 days), selling-value estimate | Active branch-item records; reservation-aware availability; positive nonarchived batches for expiry; physical stock × current selling price for valuation | Products 3, low 1, out 1, expired 1, expiring 1, value 700 |
| Inventory by Category: category, products, selling-value estimate | Group active branch-item records and physical selling values | PDF includes the category selling values; decimal strings formatted as currency |
| Stock Movements: type, actions, quantity | `inventory_logs` within selected logged dates and physical branch | Movement categories remain distinct; quantities are movements, not current stock |
| Stockroom & Treatment Room: branch, room, type, products, quantity | Current location stock joined only to active inventory from the same physical branch | Fixture branch 1 stockroom total 14; archived/foreign inventory excluded |
| Most Used Medicines & Supplies: item, unit, branch, net used | Clinical use + checkout dispensing - clinical/dispensing returns in selected log dates | Net 4; branch name displayed; top 30 positive net-use rows |
| Print / Save PDF | Fetches all five sections with the selected scope, includes comparison and category values, snapshot notes and Philippine generation time | Browser verifies all sections and filters; unit test covers MySQL decimal strings and HTML escaping |

Products are branch-item records, not deduplicated products across branches. Expiry counts are batches. Physical inventory value can include expired stock still held by the clinic; it is neither acquisition cost, revenue nor profit. Quantities of different units are not a single comparable physical measure.

## Branch report fields

The shared branch report query results previously destructured multiple single-row aggregates incorrectly. Appointment totals, patient mix, inventory alerts, current operations and receivables now read the actual returned rows.

| Visible data | Source / definition |
| --- | --- |
| Clinic heading, address, phone, email and footer | Authenticated/workspace physical branch plus clinic report-footer setting |
| Selected range / report generation date | Applied preset/custom range; displayed independently of current-snapshot sections |
| Gross Billed, Net Billed, discounts, paid/partial bill counts | Saved confirmed bill subtotal/discount/total and statuses, by finalization date; pending/draft/void excluded from billed sums |
| Net Collections, refunded/voided helper, Collection Trend | Event-dated payment/void/refund UNION, grouped by month; historical earlier payment with an in-period void produces negative adjustment |
| Outstanding Now | Current ready/partially-paid receivables, independent of selected bill-date range |
| Clinic Performance | Union of appointment months and collection months; missing values zero-filled, negative collection values supported |
| Appointments, unique patients, Completion Rate | Scoped appointment count/distinct patients; completion rate = completed / all appointments |
| Cancelled / No-show, status bars and percentages | Separate grouped statuses; cancelled + no-show summary; rounded percentages may not sum to exactly 100 |
| Patient Mix | First recorded appointment **at this branch** in/before the period; helper now states that definition. Super Admin's organization-wide first-appointment definition is different and is described above |
| Monthly Appointments | General Medicine and Dermatology counts grouped by appointment month |
| Appointment Source | Guest/online/walk-in source values from scoped appointments |
| Doctor Activity: doctor, clinic assignment, appointments, patients, completed, completion rate | Appointment's doctor without incorrectly requiring their home branch to equal the visit branch; top 10 appointment counts; completed / appointments |
| Payments by Method | Received - voided - refunded for each payment method, by event date |
| Top Services by Gross Billed Amount | Confirmed service line totals only, excluding supplies; top 10 returned, chart top 8 |
| Most Used Medicines / Supplies | Clinical use + dispensed - returns, positive net quantities; top 30 combined rows queried, then top 10 per item type; chart top 8 |
| Usage table: total used, consultation use, checkout dispensing, returns, usage records, billed | Quantities from movement types; distinct **reference type + reference ID** avoids ID collisions. Usage records are consultations/bills, not unique patient visits. Billed value uses saved supply billing lines on bill dates and may differ from movement-period quantities |
| Today Remaining, Future Scheduled, Awaiting Approval, Walk-in Queue | Current branch appointment/queue status subqueries; not filtered to the historical reporting period |
| Current Inventory Health | Physical active-batch stock × selling price; current available-stock alerts; expiry counts are positive active batches. Removed misleading purchase-cost valuation from UI/PDF |
| Inventory Movement and print stock tables | Movement reason/action/quantity totals, monthly stock-in/out totals and current physical category values from the same branch API |
| Print / Save PDF | Same applied branch data and selected dates; escapes displayed strings and preserves snapshot notes |

Every branch query still includes the authenticated/workspace physical branch predicate. Removing doctors' home-branch join restrictions does not remove appointment/queue branch ownership checks.

## Inventory Activity and Audit Logs

All 16 application movement INSERT sites use the shared transactional writer. The recorded item total is physical quantity in nonarchived batches across rooms, before pending reservations. Transfers between rooms keep the same item total. Each consumed batch has its own sequential before/after pair.

`quantity_before` and `quantity_after` are nullable DECIMAL(12,2). New `inventory.movement_recorded` audit events retain the same quantities, movement type, moved quantity, batch/reference identifiers and actor in the same database transaction. A failed audit write propagates and rolls back the movement transaction. Free-text clinical notes are not copied to the new audit event.

Whole-unit values display as `1`, `12`, etc. Real historical fractional quantities remain visible rather than being silently rounded. Historical movements with no recorded balances show **Not recorded**. Existing movement history is not backfilled or rewritten, and old activity is not fabricated as new audit events.
