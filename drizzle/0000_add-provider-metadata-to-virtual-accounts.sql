ALTER TABLE "pay"."virtual_accounts" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "pay"."virtual_accounts" ADD COLUMN IF NOT EXISTS "provider_ref" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_reference_idx" ON "pay"."payouts" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payouts_merchant_idx" ON "pay"."payouts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recipients_merchant_idx" ON "pay"."recipients" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "pay"."refunds" USING btree ("payment_reference");--> statement-breakpoint
CREATE INDEX "vaccounts_merchant_idx" ON "pay"."virtual_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_event_idx" ON "pay"."webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_merchant_idx" ON "pay"."webhook_deliveries" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "pay"."webhook_deliveries" USING btree ("status","next_attempt_at");