CREATE TYPE "public"."import_status" AS ENUM('validated', 'committed', 'failed');--> statement-breakpoint
CREATE TABLE "catalogue_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"csv" text NOT NULL,
	"status" "import_status" NOT NULL,
	"report" jsonb NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "catalogue_imports" ADD CONSTRAINT "catalogue_imports_created_by_staff_id_staff_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;