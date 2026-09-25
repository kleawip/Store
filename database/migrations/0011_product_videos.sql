CREATE TYPE "public"."video_playback" AS ENUM('hosted', 'embed');--> statement-breakpoint
CREATE TYPE "public"."video_source" AS ENUM('upload', 'instagram');--> statement-breakpoint
CREATE TABLE "product_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source_type" "video_source" NOT NULL,
	"playback" "video_playback" DEFAULT 'hosted' NOT NULL,
	"video_asset_id" uuid,
	"poster_asset_id" uuid,
	"instagram_url" text,
	"caption" text DEFAULT '' NOT NULL,
	"rights_confirmed_at" timestamp with time zone,
	"rights_confirmed_by_staff_id" uuid,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_videos_source_fields" CHECK (("product_videos"."source_type" = 'upload' AND "product_videos"."instagram_url" IS NULL AND "product_videos"."playback" = 'hosted') OR ("product_videos"."source_type" = 'instagram' AND "product_videos"."instagram_url" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "video_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"original_filename" text NOT NULL,
	"uploaded_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_video_asset_id_video_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."video_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_poster_asset_id_media_assets_id_fk" FOREIGN KEY ("poster_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_rights_confirmed_by_staff_id_staff_users_id_fk" FOREIGN KEY ("rights_confirmed_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_uploaded_by_staff_id_staff_users_id_fk" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_videos_product_idx" ON "product_videos" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "video_assets_sha256_key" ON "video_assets" USING btree ("sha256");