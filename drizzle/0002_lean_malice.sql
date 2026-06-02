CREATE UNIQUE INDEX "cfo_qb_accounts_realm_qb_idx" ON "cfo_qb_accounts" USING btree ("realm_id","qb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cfo_qb_customers_realm_qb_idx" ON "cfo_qb_customers" USING btree ("realm_id","qb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cfo_qb_expenses_realm_qb_idx" ON "cfo_qb_expenses" USING btree ("realm_id","qb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cfo_qb_invoices_realm_qb_idx" ON "cfo_qb_invoices" USING btree ("realm_id","qb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cfo_qb_payments_realm_qb_idx" ON "cfo_qb_payments" USING btree ("realm_id","qb_id");