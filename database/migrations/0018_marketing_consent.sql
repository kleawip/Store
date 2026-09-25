ALTER TABLE "customers" ADD COLUMN "marketing_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "marketing_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "marketing_opt_in_source" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "unsubscribe_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_unsubscribe_token_key" ON "customers" USING btree ("unsubscribe_token");