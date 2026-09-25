CREATE TYPE "public"."payment_method" AS ENUM('prepaid', 'partial_cod');--> statement-breakpoint
CREATE TABLE "checkout_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"total_paise" integer NOT NULL,
	"pay_now_paise" integer NOT NULL,
	"cod_balance_paise" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_quotes_amounts" CHECK ("checkout_quotes"."pay_now_paise" + "checkout_quotes"."cod_balance_paise" = "checkout_quotes"."total_paise" AND "checkout_quotes"."pay_now_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_quotes_customer_idx" ON "checkout_quotes" USING btree ("customer_id","created_at");