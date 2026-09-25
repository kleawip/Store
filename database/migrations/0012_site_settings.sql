CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_staff_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_staff_id_staff_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;