-- Additive: retain the provider explanation for each failed webhook event.
-- Existing attempt locks, events, receipts and financial records are unchanged.
-- The migration runner checks metadata before each ALTER for resumable execution.
ALTER TABLE payment_gateway_webhook_events ADD COLUMN failure_message VARCHAR(255) NULL;
