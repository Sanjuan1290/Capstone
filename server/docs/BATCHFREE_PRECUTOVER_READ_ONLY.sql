-- CARAIT batch-free migration PRE-CUTOVER. READ ONLY; does not change live data.
-- Run on authorized read-only connection. Results may contain item names;
-- handle according to clinic data privacy procedures. No patient data selected.
-- BEFORE using this SQL, ensure database is a consistent snapshot / writers paused.

-- 1. Item stock mirrors versus allocation totals (must reconcile exactly).
SELECT i.branch_id,i.id AS inventory_id,i.name,
       i.stock AS stored_item_total,
       COALESCE(b.total,0) AS batch_total,
       COALESCE(lb.total,0) AS allocated_batch_total,
       COALESCE(ls.total,0) AS location_stock_total,
       COALESCE(lb.total,0)-COALESCE(ls.total,0) AS batch_vs_location_difference
FROM inventory i
LEFT JOIN (SELECT inventory_id,SUM(quantity) AS total FROM inventory_batches WHERE archived_at IS NULL GROUP BY inventory_id) b ON b.inventory_id=i.id
LEFT JOIN (SELECT inventory_id,SUM(quantity) AS total FROM inventory_location_batches GROUP BY inventory_id) lb ON lb.inventory_id=i.id
LEFT JOIN (SELECT inventory_id,SUM(quantity) AS total FROM inventory_location_stock GROUP BY inventory_id) ls ON ls.inventory_id=i.id
WHERE ABS(COALESCE(i.stock,0)-COALESCE(b.total,0))>0.0001
   OR ABS(COALESCE(i.stock,0)-COALESCE(lb.total,0))>0.0001
   OR ABS(COALESCE(i.stock,0)-COALESCE(ls.total,0))>0.0001
ORDER BY i.branch_id,i.id;

-- 2. Mixed expiries at a single item/location. This blocks medicine cutover.
SELECT i.branch_id,i.id AS inventory_id,i.name,il.id AS location_id,il.name AS location_name,
       COUNT(DISTINCT COALESCE(DATE_FORMAT(b.expiration_date,'%Y-%m-%d'),'NO_EXPIRY')) AS expiry_groups,
       SUM(ilb.quantity) AS physical_quantity
FROM inventory_location_batches ilb
JOIN inventory_batches b ON b.id=ilb.batch_id
JOIN inventory i ON i.id=ilb.inventory_id
JOIN inventory_locations il ON il.id=ilb.location_id
WHERE i.item_type='medicine' AND ilb.quantity>0
GROUP BY i.branch_id,i.id,i.name,il.id,il.name
HAVING expiry_groups>1
ORDER BY i.branch_id,i.id,il.id;

-- 3. Expired or unverified medicine stock; physically reconcile before activation.
SELECT i.branch_id,i.id AS inventory_id,i.name,il.id AS location_id,il.name AS location_name,
       b.id AS historical_batch_id,b.expiration_date,ilb.quantity
FROM inventory_location_batches ilb
JOIN inventory_batches b ON b.id=ilb.batch_id
JOIN inventory i ON i.id=ilb.inventory_id
JOIN inventory_locations il ON il.id=ilb.location_id
WHERE i.item_type='medicine' AND ilb.quantity>0
  AND (b.expiration_date IS NULL OR b.expiration_date<CURDATE())
ORDER BY i.branch_id,i.id,il.id,b.expiration_date;

-- 4. Unexpected negative balances (must be zero results).
SELECT inventory_id,location_id,quantity FROM inventory_location_stock WHERE quantity<0;

-- 5. Existing active stock in deactivated or cross-branch location.
SELECT s.inventory_id,s.location_id,s.quantity
FROM inventory_location_stock s
JOIN inventory i ON i.id=s.inventory_id
JOIN inventory_locations l ON l.id=s.location_id
WHERE s.quantity>0 AND (l.branch_id<>i.branch_id OR l.is_active=0);

-- 6. Any already-selected database mode. Do not auto-create missing tables.
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('inventory_stock_mode','inventory_stock_movements','inventory_stock_eligibility');
