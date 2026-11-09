# Frontend testing

Date: 2026-11-09. Workspace: CAPSTONE; Windows, Node v22.15.0. No deployment, commit, push, production migration, or production application-data writes were performed. Source database access was limited to metadata and the migration ledger; the metadata copy contains no patient/application rows. All mutations used a separate loopback MySQL 8.0.41 instance (port 33409, database carait_qa_20261109) and synthetic accounts. External provider delivery was blocked by the audit network guard.

## Build, syntax and lint

Production prebuild25/25 PASS; Vite PASS. Client ESLint PASS with warnings retained. All active relative named-import build checks pass. Dormant Doctor request modules and the separate WEBSITE tree still have static missing imports. The original Cloudflare getNotificationDestination export failure is resolved in the current source.

## Real browser navigation

288 renders: 288 PASS, 0 FAIL, 0 BLOCKED. 144 route paths were opened at widths1440 and390 using the built React application, actual Express API and isolated MySQL. All five roles and public pages were included. No collected page exceptions, API5xx or horizontal overflow remained. [Raw page evidence](evidence/browser-pages-results.json).

This is a navigation/render/empty-state check. Routes with synthetic ID1 may show controlled empty/not-found states or redirect to their supported route. This does not exercise every page's search/filter/save/edit/delete/modal/button. Those scenarios are NOT TESTED except where separately recorded below.

## Node regression tests

349/370 PASS; 21 FAIL; 0 skipped. Full command/log: evidence/client-node.json and client-node.log. Recurring error-reference and Maps fallback regressions pass. Remaining named failures are listed in REMAINING_ISSUES.md.

## Playwright interaction tests (API mocks)

| Test | Status | Failure detail if any |
| --- | --- | --- |
| admin Settings loads asynchronously without changing hook order | PASS |  |
| staff Settings loads asynchronously without changing hook order | PASS |  |
| doctor Settings loads asynchronously without changing hook order | PASS |  |
| patient Settings loads asynchronously without changing hook order | PASS |  |
| legacy billing redirect retains the Super Admin physical branch without a runtime ReferenceError | PASS |  |
| admin: two billing tabs and accurate payment filters | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| superadmin: two billing tabs and accurate payment filters | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| staff: two billing tabs and accurate payment filters | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('navigation', { name: 'Billing', exact: true }).getByRole('link', { name: 'Payments', exact: true }) Expected: visible |
| admin: three requests resolve independently in shared checkout | PASS |  |
| superadmin: three requests resolve independently in shared checkout | PASS |  |
| Staff sees pending requests without approval controls | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Charge Reductions' }) Expected: visible |
| notification navigation waits for read acknowledgement and keeps Super Admin branch | PASS |  |
| deleted notification stays in its portal with an actionable error | PASS |  |
| dedicated history retains cancelled and expired attempts and receipt details | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Activity Timeline' }) Expected: visible |
| Doctor quantity validation and request-only reduction flow | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('region', { name: 'Request charge reduction' }) Expected: visible |
| admin: walk-in submission sends only visit data once | FAIL | Test timeout of 12000ms exceeded. |
| superadmin: walk-in submission sends only visit data once | FAIL | Test timeout of 12000ms exceeded. |
| staff: walk-in submission sends only visit data once | FAIL | Test timeout of 12000ms exceeded. |
| lost partial payment response retries the same key and preserves the remaining balance | FAIL | Test timeout of 12000ms exceeded. |
| a paid bill opens its saved receipt with the promotion total | FAIL | Test timeout of 12000ms exceeded. |
| admin: scheduled manual booking never serializes its button event | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| superadmin: scheduled manual booking never serializes its button event | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| staff: scheduled manual booking never serializes its button event | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Appointment request created', exact: true }) Expected: visible |
| billing-only Staff can view bills without checkout, cash tools, or Admin actions | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('heading', { name: 'Payments', exact: true }) Expected: visible |
| mobile billing tabs and checkout fit the available viewport | FAIL | Error: expect(locator).toBeVisible() failed Locator: getByRole('button', { name: 'Pending Payments', exact: true }) Expected: visible |
| Admin applies a clearly labelled direct reduction with reason and confirmation | PASS |  |
| Staff retains permission to close only their own cash drawer inside collapsed tools | FAIL | Test timeout of 12000ms exceeded. |

Mocked UI success is not native database end-to-end proof. Native workflow results are recorded independently in END_TO_END_TEST_RESULTS.md. Browser tests were not removed or skipped to obtain a pass. Failed selectors/fixtures remain visible until reconciled with the current accepted UX and behavior.
