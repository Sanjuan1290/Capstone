-- CARAIT inventory pricing cleanup (safe revision)
-- Selling Price is the single patient-facing inventory price.
-- Legacy inventory.price historically represented acquisition/material cost,
-- so it MUST NOT be used to infer Selling Price.

START TRANSACTION;

-- Leave unreviewed legacy selling_price values NULL. Admin must explicitly review/set them.
-- Only mirror an already-approved Selling Price into the legacy price field for backwards
-- compatibility with older read paths.
UPDATE inventory
SET price = selling_price
WHERE selling_price IS NOT NULL
  AND selling_price > 0
  AND (price IS NULL OR ABS(price - selling_price) > 0.0001);

-- inventory_batches.unit_cost is acquisition/receipt history. Never overwrite it with
-- a patient-facing Selling Price.

COMMIT;
