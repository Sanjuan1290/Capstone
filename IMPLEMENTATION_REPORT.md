# Implementation Report

## Shared interface

Added reusable UI under `client/src/components/ui/`:

- `ToastProvider.jsx`
- `Pagination.jsx`
- `FormField.jsx`
- `Modal.jsx`
- `ConfirmDialog.jsx`
- `PageState.jsx`

Legacy `alert()` calls are routed to the toast system while refactored billing pages use the toast API directly.

## Billing catalog

`Admin_BillingCatalog.jsx` no longer uses undefined `loadData`, `setSaving`, or `setServices` calls. Server data stays in the React Query cache. Create, update, archive/delete, refresh, loading, errors, validation, and payment settings use connected API actions.

## Billing and payments

New payment utility rules live in `server/utils/payments.js`. The staff payment route uses one transaction and includes duplicate-payment protection through `SELECT ... FOR UPDATE`.

The current database dump must be combined with the billing hardening migration or started once through the server schema setup.

## Reports

`Admin_Reports.jsx` uses `start_date` and `end_date`. The server applies the same range to appointment, billing, inventory, and supply metrics. Printed output uses a light A4 document regardless of interface theme.

## Barcode scanner

The scanner uses ZXing and supports:

- Live camera scanning
- Camera list and switching
- Rear-camera preference
- Torch control when the device exposes it
- Manual code input
- Barcode image upload
- Permission and HTTPS guidance
- Duplicate scan suppression

## Dark mode

The theme now uses semantic CSS variables for page, surface, raised surface, border, primary text, secondary text, and muted text. Status tones remain visually separate in dark mode. Print output stays light.

## Pagination

A shared pagination component and hook are used across operational lists. Billing and inventory audit data use server pagination. Other bounded UI lists use client pagination.

## Testing

`server/tests/` contains feature folders. `npm test` runs Vitest and Supertest. Database transaction integration tests should later run against an isolated MySQL test database in CI.
