# Remaining issues and acceptance gaps

Acceptance status: **FAIL / NOT TESTED — not ready to certify**. A successful hosting build is not the final acceptance criterion.

## Reproducible residual findings

| Priority | Finding | Status / next action |
| --- | --- | --- |
| High | Existing regression suites remain red | Server Node 27, client Node 21, Vitest 4, Playwright 17 failures. Investigate each against an accepted contract; preserve meaningful safety assertions. |
| High | Critical interaction coverage is incomplete | NOT TESTED: every visible control on every page; full valid/missing/type/nonexistent/duplicate/role/branch/outage matrix for every endpoint. Navigation and API authentication checks are not substitutes. |
| High | External providers and hosted environments | BLOCKED: actual email/SMS verification and reset delivery, Admin MFA delivery, Cloudinary approval/upload delivery, PayMongo TEST provider/webhook exchange, physical printer, Render/Cloudflare Linux deployment. No automatic deployment authorized. |
| Medium | Disabled inventory location-ledger SQL | FAIL: 5 EXPLAIN statements reference absent optional tables. Current legacy batch mode is guarded. Do not enable cutover or create these tables blindly. Complete the separate ledger migration and reconciliation project before activation. |
| Medium | Dormant Doctor request modules | FAIL static imports: Doctor_Request.jsx references getMyRequests; Doctor_StockTransferRequest.jsx references getTransferAppointments / submitRequest. These are retired/unrouted sources; current active build passes. Resolve before reactivating them. |
| Medium | Separate client/WEBSITE source tree | FAIL: missing restore-website-media.mjs and missing pages/layout/context dependencies. This unrelated app is incomplete and is not the Carait client build root. |
| Medium | Coverage | Measured server Vitest line coverage is only 23.06%; most controller decisions are not instrumented by that runner. Native/browser executions are separate and not added to its percentage. |
| Medium | Rate limits use process-local memory | Reviewed design limitation: separate instances/restarts do not share counters. Distributed deployment abuse testing NOT TESTED. |
| Low | ESLint warnings, bundle size and dependency advisories | Client warnings remain; primary JS chunk exceeds 500kB warning. Quill low advisory and minimatch/nodemon moderate dev advisories remain. No blind dependency downgrade. |
| Low | Overview / ReportsPage import cycle | Detected static cycle; current build/render passes. Remove if touched during future work; no broad refactor applied. |

## Failing server Node assertions

- approved image binds promotion, actor and current branch and saves only verified asset
- readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries
- legacy organization-level readiness still works without a branch filter
- branch doctor schedule endpoint uses weekday order and retains doctor ownership
- deactivated branch is denied
- Super Admin consolidated inventory sums both branches
- billing settings are registered before dynamic bill id
- inactive branch operational actions are disabled while status switch remains accessible
- active/inactive status filter compares strings correctly
- public navigation is responsive and routes back to anchored home sections
- stock requests are confined to the requested branch
- Doctor and billing helpers enforce branch-owned catalog items and bill attribution
- cross-branch inventory expiry uses the Manila date at the UTC boundary
- draft announcement accepts plain-text content
- rejects unsafe external CTA URLs
- rejects protocol-relative redirects
- first-login schema, invitation, login, password reset and UI all use the same flag
- new additive migration stores draft and published policy separately
- public page is routed, linked from the footer, and opened from the booking flow
- appointment validates the doctor and service inside the requested branch transaction
- patient booking explicitly requires branch-owned doctor and service
- Patient promotion API rejects absent branch and cannot return other branch offers
- new compatibility endpoints have branch predicates, not JS-only list filtering
- patient doctor schedules require branch-scoped active doctor
- dashboard and reports separate billed from collected and have date selectors
- substitute Saline with alternative prices patient-specific ₱470, deducts only actual products
- branch and Staff System Setup use the same physical stock allocation summary

## Failing client Node assertions

- AuthContext preserves a session on unavailable checks and revalidates on tab return
- patient guards show a retry state instead of redirecting on an unavailable auth check
- branch form includes blank, standard, copy, preview and creation guidance
- both checkout portals supply branch scoped cancellation to the shared QR panel
- doctor availability sorts weekdays while preserving booking routes
- featured offers preserve selected promotion while providing bounded scroll controls
- Staff and Admin wrappers bind one shared checkout to their own permitted APIs
- pending clinical adjustments are reviewed on bill, not by a Doctor
- shared Billing navigation and action links retain the selected physical branch
- charge adjustment UI preserves approval, reason and stock separation notices
- unapproved catalog prices and placeholders are not presented as public prices
- redesigned dashboard retains live services, offers, announcements, and booking paths
- prescription prints as two landscape pads without signature box
- existing fields print and duplicate across pads
- long prescription continues on extra sheet without dropping medicine entries
- staff with Checkout and Billing sees the same four billing tasks as Admin
- billing-only staff cannot reach payment or cashier tools via query parameter
- checkout-only staff can still read branch-owned bills but does not gain Admin approvals
- dashboard and reports never display zero-valued KPIs on request failure
- branch activation retains the confirmation flow and readiness details
- branch and super admin explicitly return permanent deletion on successful delete

## Failing Vitest assertions

| Source | Assertion |
| --- | --- |
| server/tests/security/batch2InventorySemantics.test.js | September 28 Batch 2 — inventory semantics, services setup, and prescription quantity uses prescription quantity while keeping legacy dosage readable |
| server/tests/security/batch5InventoryWorkflow.test.js | Batch 5 deferred inventory deduction workflow does not cap actual consumable entry to pre-checked treatment-room stock |
| server/tests/security/billingCheckoutFollowup20260930.test.js | billing checkout follow-up regressions uses clinic-facing billing statuses and provides a return path to payment |
| server/tests/security/recoveryAutosave20260928.test.js | Batch 1 recovery and consultation autosave regressions keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button |

## Failing browser interactions

| Test | Observed failure |
| --- | --- |
| admin: two billing tabs and accurate payment filters | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| superadmin: two billing tabs and accurate payment filters | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| staff: two billing tabs and accurate payment filters | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| Staff sees pending requests without approval controls | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Charge Reductions' }) Expected: visible |
| dedicated history retains cancelled and expired attempts and receipt details | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Activity Timeline' }) Expected: visible |
| Doctor quantity validation and request-only reduction flow | Error: expect(locator).toBeVisible() failed Locator: getByRole('region', { name: 'Request charge reduction' }) Expected: visible |
| admin: walk-in submission sends only visit data once | Test timeout of 12000ms exceeded. |
| superadmin: walk-in submission sends only visit data once | Test timeout of 12000ms exceeded. |
| staff: walk-in submission sends only visit data once | Test timeout of 12000ms exceeded. |
| lost partial payment response retries the same key and preserves the remaining balance | Test timeout of 12000ms exceeded. |
| a paid bill opens its saved receipt with the promotion total | Test timeout of 12000ms exceeded. |
| admin: scheduled manual booking never serializes its button event | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| superadmin: scheduled manual booking never serializes its button event | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| staff: scheduled manual booking never serializes its button event | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| billing-only Staff can view bills without checkout, cash tools, or Admin actions | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Payments', exact: true }) Expected: visible |
| mobile billing tabs and checkout fit the available viewport | Error: expect(locator).toBeVisible() failed Locator: getByRole('button', { name: 'Pending Payments', exact: true }) Expected: visible |
| Staff retains permission to close only their own cash drawer inside collapsed tools | Test timeout of 12000ms exceeded. |

## Contract conflicts requiring deliberate resolution

Several older tests assert exact source strings or retired UI structure. Examples: four billing tabs versus the current two sections; two landscape prescription pads versus the current portrait prescription contract; a substitution price of PHP470 versus the saved catalog price contract of PHP455. The application was not changed to satisfy mutually incompatible assertions. Some browser tests target old navigation names, headings and control names. These failures remain visible and are not all declared harmless; feature owners must confirm the intended behavior and retain equivalent behavioral assertions when updating tests.

## Dependency advisories

| Project | Audit | Counts |
| --- | --- | --- |
| client | FAIL | {"info":0,"low":1,"moderate":0,"high":0,"critical":0,"total":1} |
| server | FAIL | {"info":0,"low":0,"moderate":2,"high":0,"critical":0,"total":2} |

See evidence/client-dependency-audit.json and server-dependency-audit.json for advisory IDs and dependency paths. Email/SMS/Maps destination delivery, registration verification and all unlisted mutations remain BLOCKED or NOT TESTED; no fabricated success is implied.
