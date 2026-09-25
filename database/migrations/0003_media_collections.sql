CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"original_key" text NOT NULL,
	"url" text NOT NULL,
	"original_filename" text NOT NULL,
	"original_mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"uploaded_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "banner_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "banner_alt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_media" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_staff_id_staff_users_id_fk" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_sha256_key" ON "media_assets" USING btree ("sha256");--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_banner_asset_id_media_assets_id_fk" FOREIGN KEY ("banner_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_option_value_id_product_option_values_id_fk" FOREIGN KEY ("option_value_id") REFERENCES "public"."product_option_values"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;