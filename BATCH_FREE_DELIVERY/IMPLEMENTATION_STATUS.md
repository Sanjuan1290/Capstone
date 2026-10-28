# Batch-Free Inventory: Technical Implementation Status

| Planned phase | Status | Gate |
|---|---|---|
| Phase 0 — Read-only backup reconciliation | **Partially complete** | Historical SQL reviewed. Live balances and physical count not verified. |
| Phase 1 — Architecture/API contracts | **Foundation implemented** | Item/location ledger and branch-controlled Admin API designed. Full contract review pending. |
| Phase 2 — Transactional engine | **Implemented locally, synthetic tests only** | 17 tests green. Real TiDB locks and concurrent requests untested. |
| Phase 3 — Clinical, billing, returns, transfers | **Not implemented** | Blocks release. Batch-linked historical records must stay intact. |
| Phase 4 — React Admin/Staff/Superadmin interface | **Not implemented** | Blocks release. Old UI remains in default mode. |
| Phase 5 — Isolated migration rehearsal | **Not run** | Staging SQL prepared. No real database changed. |
| Phase 6 — Production cutover | **Not authorized/not performed** | NO-GO. Startup and mode guards prevent accidental activation. |
| Phase 7 — Retire old batch controls | **Not performed** | Preserve legacy batch data unchanged. |

## Safety boundaries implemented

- The legacy schema reconciler and core batch mutators check the DB mode marker before touching legacy stock.
- New stock service rejects missing mode confirmation, duplicate conflicts, wrong branch/location, negative balances, and medicine locations without verified expiry.
- A verified, pre-authorized cutover marker is required; the marker is **never** automatically set by the migration.
- No destructive `DROP TABLE`, `TRUNCATE` or automated historical batch deletion.
- New ledger changes and stock mirror updates are intended to run inside the same caller-owned transaction.

## Risks still present in the prototype

- `location_stock` and `inventory.stock` are originally DECIMAL(12,2); the staging migration widens them to DECIMAL(16,4). The real TiDB conversion was not rehearsed.
- The new ledger's `quantity_base` is quantity multiplied by item `unit_size`; implementation includes fixed-point calculations but requires real-world UOM cases to be validated.
- The current service intentionally does **not** implement medication returns or quarantine/release movements until physical reconciliation and a validated original-event return cap exist.
- A global clinical/cashier cutover is required; do not enable manual movements alone because legacy writers would then conflict.
- Existing client bundles must be upgraded together so stale batch-based requests cannot bypass the new engine.

**Release decision: NO-GO.** This artifact records real local implementation progress without representing the complete eight-phase plan as finished.
