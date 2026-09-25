CREATE TYPE "public"."fulfilment_status" AS ENUM('unfulfilled', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'rto_initiated', 'returned_to_origin');--> statement-breakpoint
CREATE TYPE "public"."refund_method" AS ENUM('gateway', 'manual');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"method" "refund_method" NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"failure_reason" text,
	"created_by_staff_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_paise" > 0),
	CONSTRAINT "refunds_gateway_has_payment" CHECK ("refunds"."method" = 'manual' OR "refunds"."payment_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfilment_status" "fulfilment_status" DEFAULT 'unfulfilled' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cod_collected_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_staff_id_staff_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_key" ON "refunds" USING btree ("provider_refund_id");