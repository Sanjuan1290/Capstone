# Requested Carait Clinic reset

The complete local script is `reset_carait_clinic_system.sql` in this directory.

**Destructive:** it unconditionally deletes all records in the 79 application tables from the current 81-table schema, including patient, financial, audit, staff, doctor, branch, catalog, settings and sequence data. It then inserts exactly one active, unscoped Super Admin as ID 1 using the requested email and a verified bcrypt cost-12 hash of the requested password.

The two technical migration-tracking tables (`schema_migrations` and `schema_migration_locks`) and all table definitions are retained, following the earlier instruction to preserve migration history. The script uses transactional `DELETE`; existing auto-increment counters are retained, while Super Admin ID 1 is explicit. No production/TiDB reset has been executed by the assistant.

1. Export and verify a complete backup of the actual target TiDB database. Stop the Render backend/background workers and user activity.
2. Open `reset_carait_clinic_system.sql`. Run the **entire file** in one persistent SQL connection against the intended TiDB cluster. It is fully qualified for `carait_clinic_system` and includes an executable `COMMIT`. There are no reset-approval session variables. If any statement fails, stop and roll back in that same connection rather than continuing to commit a partial reset.
3. The final account query must return exactly one active Super Admin with ID 1 and a null branch. The final remaining-row query must return zero rows.
4. Sign out and sign back in through the Super Admin portal using the requested credentials. Existing MFA/email verification still applies. All clinic setup has been removed, so application bootstrap/branch/service/settings configuration is required before normal clinic use. The old branch-1 workspace URL is no longer a configured branch.

The file targets the 81-table schema already inspected. If new migrations/tables were installed afterward, update the table list before treating it as an all-application-data reset.

Validation: the exact script was executed on a separate disposable MySQL 8.0 clone populated with synthetic rows in all 81 tables. All application data was removed, the single Super Admin password hash matched, migration metadata stayed unchanged, foreign-key checks were restored, and a fresh connection saw the committed result. The disposable server was stopped. This is local compatibility validation, not a claim of live TiDB execution.

The generated SQL, credential/hash artifacts and local validation tools are ignored by Git to avoid accidentally committing the reset credential. The SQL is not registered as an application migration.
