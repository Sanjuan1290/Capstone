# Carait Clinic — Doctor appointment confirmation alerts + light-only UI

Based on `AllCodes(20261111-024447).txt` and the preceding generated inventory/SMS/queue patch. No live database, GitHub repository, Render deployment or Cloudflare site was changed.

## What changed

- Doctor gets existing **in-app notification** when an appointment is confirmed. Admin or Staff confirming a pending appointment now also triggers email and/or SMS according to the shared Super Admin settings.
- **Super Admin → System Setup → Doctor Appointment Notifications** has separate switches for Email and SMS. Settings apply to all branches. Defaults: email **ON**, SMS **OFF** (SMS incurs provider charges).
- Email uses your existing Resend service (`RESEND_API_KEY`, `EMAIL_FROM`, optional `CLIENT_URL`), and SMS uses your existing Semaphore configuration (`SEMAPHORE_API_KEY`, optional `SEMAPHORE_SENDER_NAME`). Valid doctor email/phone must be present. The message includes date, time, branch and clinic type. Private patient details are not sent externally.
- Sending begins only after an appointment actually changes to **confirmed**, so repeating a confirm request does not normally resend. Confirmation is not rolled back when a provider fails. Provider failures are logged; **automatic retry/delivery history is not implemented**.
- The email/SMS dispatch runs without delaying the response. The existing in-app notification remains independent of the Email/SMS switches.
- All Patient, Doctor, Staff and Admin/branch-workspace theme toggles are removed. Old browser dark selection is cleared; light mode stays active. Dark CSS and Tailwind dark classes were removed. Database `theme_preference` columns remain for safe backwards compatibility but no longer control the UI.
- New additive MySQL/TiDB migration: `server/db/migrations/2026-11-11-doctor-confirmation-notifications.sql`. It creates/initializes the global settings table. It is registered in `server/scripts/branchMigrations.js`.

## Before deploying

1. Back up the current repository and database. Compare the patch against your current `main` branch before applying.
2. If you already applied **the previous inventory/SMS/queue patch**, use `carait_doctor_notifications_light_only_20261111.patch` (incremental). If not, use `carait_all_updates_20261111.patch` (cumulative). **Do not apply both.**
3. Run `git apply --check <chosen-patch>`, review `git diff`, then run `git apply <chosen-patch>`.
4. Run the registered database migrations on a test database first. Existing data is not deleted. The new settings endpoint returns an error until the table exists.
5. Check `RESEND_API_KEY`, `EMAIL_FROM`, `CLIENT_URL`, and your Semaphore credentials before switching SMS on. Doctor accounts need valid email/phone details.
6. Verify one confirmed appointment in each branch through Admin and Staff portals. Test Email-only, SMS-only, both ON, both OFF, missing contact details and provider outages. Check the Doctor's in-app bell independently.
7. Run frontend build, backend tests, and browser checks against the current repository. Do not deploy from this exported file alone.

## Test results in this environment

- **17 focused tests passed**: doctor setting validation and dispatch, provider failure handling, auth route wiring, all portal light-mode checks, previous registration quota, queue labels, and pending stock tests.
- **178 JSX files parse without errors**, and the backend source passes Node syntax checks.
- **No real MySQL/TiDB migration**, Resend email, Semaphore SMS, complete frontend build, or browser-based end-to-end test was run here.
- The new notification dispatch is *best effort*: if the server crashes or providers fail after an appointment is confirmed, there is no automatic resend. Production-grade delivery tracking/retries would require a separate durable notification queue.
- The earlier optional stock-out workflow from the previous patch is **still off by default** and still requires database/payment testing.
