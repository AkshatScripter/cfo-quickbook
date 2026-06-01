CREATE TYPE "public"."activity_status" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('Open', 'Paid', 'Voided', 'Draft');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'company', 'customer');--> statement-breakpoint
CREATE TABLE "cfo_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"status" "activity_status" DEFAULT 'success' NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_api_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" text,
	"error_code" text,
	"error_message" text,
	"request_data" jsonb,
	"happened_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_calculated_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"report_type" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"data" jsonb NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"qb_id" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text,
	"account_sub_type" text,
	"current_balance" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"raw_data" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"realm_id" text NOT NULL,
	"company_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_sync_at" timestamp,
	"sync_error" text
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"qb_id" text NOT NULL,
	"vendor_id" text,
	"vendor_name" text,
	"account_id" text,
	"account_name" text,
	"category" text,
	"total_amount" numeric(12, 2),
	"expense_date" date,
	"raw_data" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"qb_id" text NOT NULL,
	"invoice_number" text,
	"customer_id" text,
	"customer_name" text,
	"total_amount" numeric(12, 2),
	"balance" numeric(12, 2),
	"due_date" date,
	"txn_date" date,
	"status" "invoice_status" DEFAULT 'Open' NOT NULL,
	"raw_data" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"qb_id" text NOT NULL,
	"customer_id" text,
	"customer_name" text,
	"total_amount" numeric(12, 2),
	"payment_date" date,
	"payment_method" text,
	"invoice_ids" jsonb,
	"raw_data" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"realm_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token_type" text DEFAULT 'bearer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_qb_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text NOT NULL,
	"qb_id" text NOT NULL,
	"txn_type" text NOT NULL,
	"txn_date" date,
	"amount" numeric(12, 2),
	"customer_ref" text,
	"customer_name" text,
	"vendor_ref" text,
	"vendor_name" text,
	"description" text,
	"raw_data" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"company_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cfo_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" text,
	"entity_type" text,
	"entity_id" text,
	"event_type" text,
	"raw_payload" jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
