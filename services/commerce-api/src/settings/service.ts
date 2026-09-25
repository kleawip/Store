import { recordAudit, type DbOrTx } from "../audit";
import type { Database } from "../db/client";
import { siteSettings } from "../db/schema";

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

