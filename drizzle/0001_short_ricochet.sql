CREATE TABLE "cfo_qb_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"qb_id" text NOT NULL,
	"display_name" text,
	"email" text,
	"phone" text,
	"balance" numeric(12, 2),
	"bill_addr" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_data" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
