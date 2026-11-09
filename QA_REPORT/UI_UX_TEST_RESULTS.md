# UI and UX results

Real desktop/mobile navigation: 288/288 PASS at 1440px and390px. Three reproducible Super Admin horizontal overflows were fixed with minimum-width constraints on cards and the report branch filter. Four Settings screens load and refresh without hook-order errors. Legacy billing redirects retain branch identity. Admin direct reduction now requires a reason, confirmation and disabled submission state.

Evidence: [live page checks](evidence/browser-pages-results.json), [browser interactions](evidence/browser-results.json). Screenshots are local generated artifacts under evidence/browser-artifacts/ and excluded from Git.

| Check | Status / limit |
| --- | --- |
| No collected runtime exceptions/API5xx/overflow in navigation sweep | PASS for the recorded route/viewport fixture |
| Admin direct reduction reason/confirmation / single approved row | PASS in Playwright mock test and independent native monetary checks |
| Settings delayed load and refresh | PASS for Admin/Staff/Doctor/Patient |
| Every visible button/link and every CRUD dialog | NOT TESTED; failing existing interactions remain in FRONTEND_TEST_RESULTS.md |
| Network retry, failed upload, response-loss payments, cashier-closing UI | Partial / FAIL / BLOCKED; native duplicate-payment assertion passes, browser interaction suite still has failures |
| All search/filter/pagination states | NOT TESTED for every page; directory API search and response shape pass |
| Screen-reader/keyboard accessibility and all dropdown labels | NOT TESTED comprehensively |
| Physical receipt/prescription paper layout, all browsers | BLOCKED / NOT TESTED; no printer used |
| Exact real clinic Google Maps destination | BLOCKED; saved URL preserved/validated, but synthetic links do not establish intended real-world pin |

No general redesign was performed. Purchase Cost per Unit was not added to any form/template/workflow. Large primary JS chunk remains a performance concern; no Lighthouse or real mobile network performance claim is made.
