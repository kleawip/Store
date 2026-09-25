CREATE TYPE "public"."discount_kind" AS ENUM('percentage', 'fixed_amount', 'free_shipping');--> statement-breakpoint
CREATE TYPE "public"."discount_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"percent_basis_points" integer,
	"amount_paise" integer,
	"max_discount_paise" integer,
	"min_subtotal_paise" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"per_customer_limit" integer DEFAULT 1,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"status" "discount_status" DEFAULT 'active' NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_kind_value" CHECK (("discounts"."kind" = 'percentage' AND "discounts"."percent_basis_points" BETWEEN 1 AND 10000) OR ("discounts"."kind" = 'fixed_amount' AND "discounts"."amount_paise" > 0) OR "discounts"."kind" = 'free_shipping')
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts";--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_discount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_staff_id_staff_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts" USING btree ("code");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_discount_idx" ON "orders" USING btree ("discount_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts" CHECK ("orders"."pay_now_paise" + "orders"."cod_balance_paise" = "orders"."total_paise" AND "orders"."merchandise_paise" - "orders"."discount_paise" + "orders"."shipping_paise" = "orders"."total_paise" AND "orders"."discount_paise" >= 0);