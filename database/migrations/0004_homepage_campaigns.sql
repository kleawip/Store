CREATE TYPE "public"."campaign_target_type" AS ENUM('product', 'collection', 'category', 'page');--> statement-breakpoint
CREATE TABLE "hero_slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_title" text NOT NULL,
	"eyebrow" text DEFAULT '' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cta_label" text DEFAULT '' NOT NULL,
	"target_type" "campaign_target_type",
	"target_product_id" uuid,
	"target_collection_id" uuid,
	"target_category_id" uuid,
	"target_page" text,
	"desktop_asset_id" uuid,
	"tablet_asset_id" uuid,
	"mobile_asset_id" uuid,
	"desktop_alt" text DEFAULT '' NOT NULL,
	"tablet_alt" text DEFAULT '' NOT NULL,
	"mobile_alt" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_slides_schedule_order" CHECK ("hero_slides"."ends_at" IS NULL OR "hero_slides"."starts_at" IS NULL OR "hero_slides"."ends_at" > "hero_slides"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "ribbon_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"target_type" "campaign_target_type",
	"target_product_id" uuid,
	"target_collection_id" uuid,
	"target_category_id" uuid,
	"target_page" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ribbon_messages_schedule_order" CHECK ("ribbon_messages"."ends_at" IS NULL OR "ribbon_messages"."starts_at" IS NULL OR "ribbon_messages"."ends_at" > "ribbon_messages"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_target_collection_id_collections_id_fk" FOREIGN KEY ("target_collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_desktop_asset_id_media_assets_id_fk" FOREIGN KEY ("desktop_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_tablet_asset_id_media_assets_id_fk" FOREIGN KEY ("tablet_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_mobile_asset_id_media_assets_id_fk" FOREIGN KEY ("mobile_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ribbon_messages" ADD CONSTRAINT "ribbon_messages_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ribbon_messages" ADD CONSTRAINT "ribbon_messages_target_collection_id_collections_id_fk" FOREIGN KEY ("target_collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ribbon_messages" ADD CONSTRAINT "ribbon_messages_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;