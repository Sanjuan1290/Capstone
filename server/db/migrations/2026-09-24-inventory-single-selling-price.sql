-- CARAIT inventory pricing cleanup
-- Selling Price becomes the single user-facing inventory price.
-- Existing nullable/legacy fields are retained for backwards compatibility.

START TRANSACTION;

-- Legacy items created before Selling Price became required inherit their existing
-- inventory price when it is a positive value.
UPDATE inventory
SET selling_price = price
WHERE (selling_price IS NULL OR selling_price <= 0)
  AND price IS NOT NULL
  AND price > 0;

-- Keep the legacy inventory.price field mirrored so older reports/service-pricing
-- code sees the same value as the single Selling Price.
UPDATE inventory
SET price = selling_price
WHERE selling_price IS NOT NULL
  AND selling_price > 0
  AND (price IS NULL OR ABS(price - selling_price) > 0.0001);

-- Batch unit_cost is no longer user-facing. Mirror the item Selling Price only for
-- legacy compatibility when the batch value is empty/zero; no UI depends on it.
UPDATE inventory_batches b
JOIN inventory i ON i.id = b.inventory_id
SET b.unit_cost = i.selling_price
WHERE i.selling_price IS NOT NULL
  AND i.selling_price > 0
  AND (b.unit_cost IS NULL OR b.unit_cost <= 0);

COMMIT;
