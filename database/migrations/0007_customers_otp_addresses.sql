CREATE TYPE "public"."customer_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text DEFAULT '' NOT NULL,
	"landmark" text DEFAULT '' NOT NULL,
	"city" text NOT NULL,
	"state_code" text NOT NULL,
	"pincode" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_pincode_format" CHECK ("addresses"."pincode" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "addresses_phone_format" CHECK ("addresses"."phone" ~ '^\+91[6-9][0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"name" text DEFAULT '' NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_format" CHECK ("customers"."phone" ~ '^\+91[6-9][0-9]{9}$'),
	CONSTRAINT "customers_email_lowercase" CHECK ("customers"."email" IS NULL OR "customers"."email" = lower("customers"."email"))
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"channel" "otp_channel" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_key" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_key" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "otp_challenges_phone_created_idx" ON "otp_challenges" USING btree ("phone","created_at");