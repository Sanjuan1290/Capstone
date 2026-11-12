# Shared operations and doctor queue — QA, 2026-11-13

Implemented the Add Item/optional fields, Refresh removal, independent Walk-in Queue permission, shared operational editing, and the later Doctor Call Next request. User confirmed that Staff with the relevant permission may edit inventory prices, services and schedules; account permission assignment and permanent audit deletion remain Admin-only.

No production migrations, stock/payment operations, real email/SMS delivery or hosting deployment were executed. Password/OTP tests use mocked delivery. No git commit or push was performed by the assistant. During the work, HEAD advanced externally to `f8ecac9`; the final working tree also contains subsequent corrections.

## Behavior

- **Add Item:** modal title, accessible dialog name and submit button use Add Item. Quantity and Selling Price accept blank or zero; blank saves as zero. Batch Expiry is optional, including when a positive quantity is supplied. Invalid dates, negative prices and negative/fractional quantities remain rejected by the shared backend. Removed the mandatory-expiry message and “opening stock” wording from the manual item-creation form/error path. Existing stock edits still use Stock In/Out rather than silently changing quantities from Edit Item.
- **Refresh controls:** removed 52 manual Refresh controls across 51 source files, including icon-only inventory refresh and SMS balance refresh. Existing event/polling updates remain; added automatic focus/event updates to the remaining data views. Error recovery, Discard, and explicit review of a newer saved bill remain available. They do not silently discard unsaved work. Schedule cards now preserve edited fields during a background update.
- **Permissions:** `walk_in_queue` is a separate grant in Admin and Staff account creation/editing. Navigation, Staff home redirect, page guards, queue mutations and supporting intake lookups use the new permission. Queue-only Staff can create a walk-in without gaining scheduled-appointment access. Appointments-only Staff do not implicitly gain queue actions. New defaults include both; the migration preserves prior queue access for existing granted Appointments accounts while retaining any existing explicit queue grant/denial.
- **Shared pages:** Staff Dashboard, Inventory and Doctor Schedules now reuse the same page implementations used by Admin and Super Admin branch workspaces. All three roles also share WalkInQueuePage. Appointment creation, patient records, billing workspace/checkout, System Setup/services, reports and audit views already use shared components. Staff pricing, stock history, batches, Excel tools, schedule edits/unavailable dates, branch movement reasons, discount presets and Cash/QR Ph settings are connected through Staff-authenticated, permission-guarded, branch-owned handlers. Staff availability and unavailable-date reads now retain the selected physical branch and verify assigned doctors. Global setup and account/permission governance are still separate privileged functions; existing financial approval/reversal rules are retained.
- **Actor identity:** protected batch checks verify the current Staff or Admin account's own password and email code. Codes remain bound to role, account, branch, batch and reviewed values. Inventory movement logs use the correct Staff/Admin actor column. Staff Excel creation/undo identities have separate fields, and Admin IDs are not populated with unrelated Staff IDs. Room transfers record both movement and audit balances with unchanged item totals.
- **Doctor Call Next:** the server's already-active response was previously ignored. The doctor now sees an inline warning/error with the queue label (for example DER-001). A called patient has **Patient not here**, followed by confirmation. That action returns the patient to Waiting and calls the next *different* waiting entry under the existing call lock. The appointment remains open; no visit is automatically completed or marked no-show. If nobody else is waiting, the message explains that. A consultation already in progress cannot be skipped. Stale/repeated return requests cannot skip a newly called patient.

## Verification

| Check | Final result |
| --- | --- |
| Production frontend build | Passed; 25 prebuild contracts passed; existing large-bundle warning |
| Microsoft Edge / Chromium browser tests | **47/47 passed**, final production build |
| Focused backend report/inventory/migration/permission/queue regression run | **144/144 passed** |
| Backend syntax | **426 modules** passed; Staff registration and charge reduction smoke checks passed |
| Route binding verification | **254** handler references passed |
| Source graph | **703 files / 1666 imports** resolved |
| Full frontend lint | **0 errors / 23 warnings** |
| Full frontend Node regression suite | **412 passed / 32 failed / 444 total** |
| Full backend Vitest suite | **256 passed / 7 failed / 263 total** |
| Migration verification | Synthetic metadata tests pass for initial/partial/existing actor columns, nullability/type drift, guarded reruns, queue permission registration and pinned SQL hashes |
| Conflict scan / whitespace | No source conflict markers; `git diff --check` passed |

Browser tests cover all three roles creating items without optional values, positive quantities without expiry, identical schedule editing through each role's own API, preservation of schedule drafts on focus, independent permission pickers and queue-only access, Staff inventory draft preservation, doctor warning/API error display and unanswered-call advancement. They also include prior reports, stock/audit display, queue/service/charge-summary and QR restrictions. Existing QR attempts continue automatic status polling after removal of the Refresh Status button. All browser APIs use synthetic fixtures.

Backend tests execute the actual shared item handlers for Admin, Staff and Super Admin; validate blank/zero fields and invalid input; assert Staff movement attribution; check shared route permission denial and exclusion of account/audit-deletion routes; mock Staff password/OTP delivery; verify migration guards; and execute Doctor queue transitions for active calls, absent patients, no remaining patients, active consultation protection and repeated/stale requests. No completed appointment is fabricated by advancing the queue.

## Remaining regression failures

The isolated committed snapshot `f8ecac9` produced **35** failures in the wide frontend Node suite. The corrected working tree produces **32**, all also present in that snapshot; no additional failing test names were introduced after that checkpoint. Three obsolete portal/permission contracts were updated to the new authorized behavior and now pass. This comparison is against a committed checkpoint taken during the work, not a claim that every failure predates every change in this conversation.

The remaining wide-suite failures largely assert older source text, component placement or workflows (including the former Staff queue modal, former required contact/age fields and older prescription/billing UI). They are not treated as passing or silently removed. The full list follows below. The seven backend failures are the older source contracts recorded in the preceding [reports QA report](../reports-walkin-inventory-2026-11-13/RESULTS.md): two inventory semantics checks and one each for the older consultation supply copy, doctor request destructuring, Open Bill label, consultation workflow wording and autosave wording.

## Deployment

**Not deployed; staging verification and migrations are required.** Use the registered runner, not repeated manual ALTER statements:

```powershell
npm.cmd run migrate --prefix server
npm.cmd run verify:deploy --prefix server
```

These are deployment instructions, not commands executed in this review. The runner retains prior migration history and existing reversal-column guards. Relevant new migrations:

1. `2026-11-13-inventory-movement-balances.sql` — prior review's nullable movement totals.
2. `2026-11-13-walk-in-queue-permission.sql` — copy existing Appointments grants into the independent queue grant without replacing existing entries.
3. `2026-11-13-shared-operation-actors.sql` — nullable legacy Admin creator and separate Staff creator/undo fields for Excel uploads/receipts. Correct existing definitions are skipped, partial application resumes and incompatible definitions fail visibly.

No existing financial records are rewritten. Build/release the matching frontend and backend together after migration verification. Hosted/TiDB smoke testing remains outstanding; the old regression-contract failures above remain visible. Preserve actual financial approvals and account permission controls during deployment review.

## Key changed files

- `client/src/pages/shared/Inventory.jsx` — Add Item labels and optional fields.
- `server/routers/branchInventoryItems.js` — common validation, creation/edits, role-correct stock and Excel identities.
- `client/src/pages/shared/WalkInQueuePage.jsx`, the Admin/Staff wrappers and `client/src/App.jsx` — one queue workflow across branch portals.
- `client/src/config/staffPermissions.js`, Staff/Admin layouts, Staff home, Super Admin account editor and `server/utils/staffPermissions.js` — independent queue grant.
- `server/routers/staffOperationalRoutes.js` and `staff.router.js` — explicit Staff access to shared branch operations, without account or audit-deletion delegation.
- Staff Dashboard/Inventory/Doctor Schedules wrappers, `Admin_Dashboard.jsx`, service portal helper and `ScheduleDayCard.jsx` — shared screens, portal-preserving actions and draft protection.
- `client/src/pages/doctorPage/Doctor_Appointments.jsx`, `doctor.service.js`, `server/controllers/doctor.controller.js`, `server/utils/queueWorkflow.js` — visible Call Next outcomes and unanswered-call handling.
- `server/utils/operationalActors.js`, migration registration/deployment verification and the new SQL files — guarded schema/permission rollout.
- UI data pages/components identified by `refresh-removal.json` in the ignored local evidence — removal of manual controls and automatic update wiring.
- New/updated browser and backend regression files plus this QA folder's reproducible runners.

Reproduce the browser run after building with `node QA_REPORT/shared-operations-2026-11-13/run-browser.cjs`. Wide frontend suite: `node --test client/tests/*.node.test.mjs`; backend suite: `npm.cmd test --prefix server`. Logs, JSON and screenshots are local ignored evidence. The temporary committed-snapshot test tree is not part of the source changes.

### Full frontend failing test names

- **authSessionGuard.node.test.mjs:22** - AuthContext preserves a session on unavailable checks and revalidates on tab return
- **authSessionGuard.node.test.mjs:32** - patient guards show a retry state instead of redirecting on an unavailable auth check
- **batch2WalkInWorkflow.node.test.mjs:7** - walk-in now is an explicit choice; scheduled booking remains the default
- **batch2WalkInWorkflow.node.test.mjs:34** - newly created patient is reused after a failed queue attempt; receipt displays its queue number
- **batch3BranchSetup.node.test.mjs:5** - branch form includes blank, standard, copy, preview and creation guidance
- **batch5VisualAndPaymentPreview.node.test.mjs:47** - dark-mode components explicitly handle translucent and weekday surfaces
- **batch5VisualAndPaymentPreview.node.test.mjs:52** - doctor availability sorts weekdays while preserving booking routes
- **batch5VisualAndPaymentPreview.node.test.mjs:58** - featured offers preserve selected promotion while providing bounded scroll controls
- **batch6PatientBirthdate.node.test.mjs:31** - registration, admin and staff intake use shared clinic-date bounds
- **billingRedesign20261105.node.test.mjs:17** - whole quantities and configured fractional precision are validated consistently
- **billingRedesign20261105.node.test.mjs:23** - included usage changes keep service charge stable, while promotion and explicit extras remain itemized
- **billingRedesign20261105.node.test.mjs:50** - Staff and Admin wrappers bind one shared checkout to their own permitted APIs
- **billingRedesign20261105.node.test.mjs:58** - measured extra-supply estimates round half cents the same way as backend billing
- **billingReplacement20261105.node.test.mjs:42** - pending clinical adjustments are reviewed on bill, not by a Doctor
- **branchPortalNavigation20261022.node.test.mjs:17** - shared Billing navigation and action links retain the selected physical branch
- **checkoutPresentation.node.test.mjs:49** - charge adjustment UI preserves approval, reason and stock separation notices
- **fix17AdultForms.node.test.mjs:28** - registration and staff-assisted forms limit date selection, and age-only intake starts at 18
- **fix4Workflow20261111.node.test.mjs:21** - service editor and permissions have item search
- **patientBookingFourStep.node.test.mjs:36** - booking never submits unverified email, stale slots or missing policy acceptance
- **patientCivilStatusRemoval20261112.node.test.mjs:5** - printed walk-in intake omits civil status and retains required patient contact fields
- **patientDashboardRedesign.node.test.mjs:49** - unapproved catalog prices and placeholders are not presented as public prices
- **patientDashboardRedesign.node.test.mjs:55** - redesigned dashboard retains live services, offers, announcements, and booking paths
- **portraitPrescriptionPricingSchedules20261102.node.test.mjs:41** - booking shows service price in selection, review, and success
- **prescriptionPad20261102.node.test.mjs:10** - prescription prints as two landscape pads without signature box
- **prescriptionPad20261102.node.test.mjs:16** - existing fields print and duplicate across pads
- **prescriptionPad20261102.node.test.mjs:46** - long prescription continues on extra sheet without dropping medicine entries
- **staffBillingUnified.node.test.mjs:10** - staff with Checkout and Billing sees the same four billing tasks as Admin
- **staffBillingUnified.node.test.mjs:15** - billing-only staff cannot reach payment or cashier tools via query parameter
- **staffBillingUnified.node.test.mjs:22** - checkout-only staff can still read branch-owned bills but does not gain Admin approvals
- **superAdminDesign.node.test.mjs:23** - dashboard and reports never display zero-valued KPIs on request failure
- **superAdminDesign.node.test.mjs:32** - branch activation retains the confirmation flow and readiness details
- **systemSetupCategoryRefresh.node.test.mjs:18** - branch and super admin explicitly return permanent deletion on successful delete
