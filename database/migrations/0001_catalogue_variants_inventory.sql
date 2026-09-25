CREATE TYPE "public"."inventory_reason" AS ENUM('received', 'count_correction', 'damaged', 'returned_restock', 'order_committed', 'order_released', 'order_fulfilled', 'other');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_staff_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"tracked" boolean DEFAULT true NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"committed" integer DEFAULT 0 NOT NULL,
	"unavailable" integer DEFAULT 0 NOT NULL,
	"incoming" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_non_negative" CHECK ("inventory_items"."on_hand" >= 0 AND "inventory_items"."committed" >= 0 AND "inventory_items"."unavailable" >= 0 AND "inventory_items"."incoming" >= 0),
	CONSTRAINT "inventory_items_available_non_negative" CHECK ("inventory_items"."on_hand" - "inventory_items"."committed" - "inventory_items"."unavailable" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"reason" "inventory_reason" NOT NULL,
	"on_hand_delta" integer DEFAULT 0 NOT NULL,
	"committed_delta" integer DEFAULT 0 NOT NULL,
	"unavailable_delta" integer DEFAULT 0 NOT NULL,
	"note" text,
	"actor_staff_id" uuid,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"swatch" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_option_values" (
	"variant_id" uuid NOT NULL,
	"option_value_id" uuid NOT NULL,
	CONSTRAINT "variant_option_values_variant_id_option_value_id_pk" PRIMARY KEY("variant_id","option_value_id")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"option_key" text NOT NULL,
	"status" "variant_status" DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"price_paise" integer,
	"mrp_paise" integer,
	"tax_rate_basis_points" integer,
	"hsn_code" text,
	"pack_quantity" integer DEFAULT 1 NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"inventory_units_per_sale" integer DEFAULT 1 NOT NULL,
	"max_order_quantity" integer DEFAULT 10 NOT NULL,
	"weight_grams" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_sku_format" CHECK ("variants"."sku" ~ '^[A-Z0-9][A-Z0-9-]{1,63}$'),
	CONSTRAINT "variants_price_positive" CHECK ("variants"."price_paise" IS NULL OR "variants"."price_paise" > 0),
	CONSTRAINT "variants_mrp_not_below_price" CHECK ("variants"."mrp_paise" IS NULL OR ("variants"."price_paise" IS NOT NULL AND "variants"."mrp_paise" >= "variants"."price_paise")),
	CONSTRAINT "variants_tax_rate_range" CHECK ("variants"."tax_rate_basis_points" IS NULL OR "variants"."tax_rate_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "variants_quantities_positive" CHECK ("variants"."pack_quantity" >= 1 AND "variants"."inventory_units_per_sale" >= 1 AND "variants"."max_order_quantity" >= 1)
);
--> statement-breakpoint
ALTER TABLE "product_media" ADD COLUMN "option_value_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "specifications" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "content_sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_id_product_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_option_values" ADD CONSTRAINT "variant_option_values_option_value_id_product_option_values_id_fk" FOREIGN KEY ("option_value_id") REFERENCES "public"."product_option_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_key" ON "collections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" USING btree ("inventory_item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_values_option_code_key" ON "product_option_values" USING btree ("option_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_product_code_key" ON "product_options" USING btree ("product_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_key" ON "variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_product_option_key" ON "variants" USING btree ("product_id","option_key");--> statement-breakpoint
CREATE INDEX "variants_inventory_item_idx" ON "variants" USING btree ("inventory_item_id");