-- Current tax configuration keeps only tax_name and tax_percentage.
-- Preserve existing statutory discount identities on their own preset records.
-- The migration runner guards this additive column and validates stored settings.
ALTER TABLE discount_presets ADD COLUMN statutory_category VARCHAR(12) NOT NULL DEFAULT 'other';

UPDATE discount_presets p
JOIN branch_billing_settings b ON b.branch_id=p.branch_id
SET p.statutory_category=JSON_UNQUOTE(JSON_EXTRACT(b.policy_json,CONCAT('$.discount_categories."',p.id,'"')))
WHERE JSON_UNQUOTE(JSON_EXTRACT(b.policy_json,CONCAT('$.discount_categories."',p.id,'"'))) IN ('senior','pwd');

UPDATE branch_billing_settings
SET policy_json=JSON_OBJECT(
  'tax_name',JSON_UNQUOTE(JSON_EXTRACT(policy_json,'$.tax_name')),
  'tax_percentage',CASE
    WHEN JSON_CONTAINS_PATH(policy_json,'one','$.tax_percentage') THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(policy_json,'$.tax_percentage')) AS DECIMAL(5,2))
    WHEN JSON_UNQUOTE(JSON_EXTRACT(policy_json,'$.enabled')) IN ('true','1') THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(policy_json,'$.tax_rate')) AS DECIMAL(5,2))
    ELSE 0 END),
    version=version+1,updated_at=CURRENT_TIMESTAMP
WHERE JSON_LENGTH(policy_json)<>2
   OR NOT JSON_CONTAINS_PATH(policy_json,'all','$.tax_name','$.tax_percentage');
