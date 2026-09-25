import { SellerDetails } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import { recordAudit, type DbOrTx } from "../audit";
import type { Database } from "../db/client";
import { siteSettings } from "../db/schema";
import { GST_STATE_NUMBERS } from "../domain/gst-states";
import { ApiError } from "../errors";

/**
 * Owner-controlled switches. Each defaults to the safe value until the owner changes it.
 *  instagramEmbedsVerified: Instagram's official embed renders blank on localhost and can fail on a domain
 *  that isn't set up for it. Embedded videos stay unpublishable until the owner confirms they play on the
 *  production domain.
 */
export const SETTING_DEFAULTS = { instagramEmbedsVerified: false } as const;
export type SiteSettings = { -readonly [K in keyof typeof SETTING_DEFAULTS]: (typeof SETTING_DEFAULTS)[K] extends boolean ? boolean : never };

export async function getSettings(db: DbOrTx): Promise<SiteSettings> {
  const rows = await db.select().from(siteSettings);
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { instagramEmbedsVerified: stored.instagramEmbedsVerified === true };
}

export async function updateSettings(db: Database, patch: Partial<SiteSettings>, actorStaffId: string) {
  await db.transaction(async (tx) => {
    const before = await getSettings(tx);
    for (const [key, value] of Object.entries(patch)) {
      await tx
        .insert(siteSettings)
        .values({ key, value, updatedByStaffId: actorStaffId })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedByStaffId: actorStaffId, updatedAt: new Date() } });
    }
    await recordAudit(tx, { entityType: "staff", entityId: actorStaffId, action: "settings.updated", actorStaffId, before, after: patch });
  });
  return getSettings(db);
}


// ---- Seller details printed on tax invoices (owner only) ----

const SELLER_KEY = "seller";

export async function getSeller(db: DbOrTx): Promise<SellerDetails | null> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, SELLER_KEY));
  const parsed = SellerDetails.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

export async function updateSeller(db: Database, input: SellerDetails, sellerStateCode: string, actorStaffId: string) {
  const mismatch = (path: string, message: string) => new ApiError(422, "VALIDATION_FAILED", "Seller details don't match", message, [{ path, code: "state_mismatch", message }]);
  if (input.stateCode !== sellerStateCode) {
    throw mismatch("stateCode", `Taxes are calculated for a seller in ${sellerStateCode}. Change SELLER_STATE_CODE on the server first if the business is registered elsewhere.`);
  }
  if (input.gstin.slice(0, 2) !== GST_STATE_NUMBERS[input.stateCode]) {
    throw mismatch("gstin", `A ${input.stateCode} GSTIN starts with ${GST_STATE_NUMBERS[input.stateCode]}.`);
  }
  await db.transaction(async (tx) => {
    const before = await getSeller(tx);
    await tx
      .insert(siteSettings)
      .values({ key: SELLER_KEY, value: input, updatedByStaffId: actorStaffId })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: input, updatedByStaffId: actorStaffId, updatedAt: new Date() } });
    await recordAudit(tx, { entityType: "staff", entityId: actorStaffId, action: "settings.seller_updated", actorStaffId, before, after: input });
  });
  return input;
}
