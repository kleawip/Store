import type { ImportReport } from "@kleawip/contract";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { catalogueImports } from "../db/schema";
import { ApiError, notFound } from "../errors";
import { applyPlan, capIssues, planImport, resolvePlan } from "./catalogue-import";

/** A validated import can be committed for one hour; after that staff re-upload so they review current data. */
export const IMPORT_TTL_MS = 60 * 60 * 1000;

type Row = typeof catalogueImports.$inferSelect;
const emptySummary = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 };

async function evaluate(db: Parameters<typeof resolvePlan>[0], csv: string) {
  const planned = planImport(csv);
  if (!planned.plan || planned.errors.length) {
    return { plan: planned.plan, resolution: null, summary: emptySummary, errors: planned.errors, warnings: planned.warnings };
  }
  const resolved = await resolvePlan(db, planned.plan);
  return {
    plan: planned.plan,
    resolution: resolved.resolution,
    summary: resolved.resolution.summary,
    errors: [...planned.errors, ...resolved.errors],
    warnings: [...planned.warnings, ...resolved.warnings],
  };
}

function toReport(row: Row): ImportReport {
  const report = row.report as Omit<ImportReport, "importId" | "filename" | "status" | "createdAt" | "committedAt" | "canCommit">;
  const fresh = Date.now() - row.createdAt.getTime() < IMPORT_TTL_MS;
  return {
    ...report,
    importId: row.id,
    filename: row.filename,
    status: row.status,
    canCommit: row.status === "validated" && report.errors.length === 0 && fresh,
    createdAt: row.createdAt.toISOString(),
    committedAt: row.committedAt?.toISOString() ?? null,
  };
}

/** Validates a CSV and stores it with its report. Nothing in the catalogue changes. */
export async function validateImport(db: Database, file: { filename: string; csv: string }, actorStaffId: string) {
  const result = await evaluate(db, file.csv);
  const report = {
    rowCount: result.plan?.rowCount ?? 0,
    summary: result.summary,
    errors: capIssues(result.errors),
    warnings: capIssues(result.warnings),
  };
  const [row] = await db
    .insert(catalogueImports)
    .values({ filename: file.filename.slice(0, 200), csv: file.csv, status: result.errors.length ? "failed" : "validated", report, createdByStaffId: actorStaffId })
    .returning();
  return toReport(row!);
}

export async function getImport(db: Database, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Import not found.");
  const [row] = await db.select().from(catalogueImports).where(eq(catalogueImports.id, id));
  if (!row) throw notFound("Import not found.");
  return row;
}

export const importReport = async (db: Database, id: string) => toReport(await getImport(db, id));

/**
 * Applies a validated import in ONE transaction. The stored CSV is re-validated against the catalogue as it
 * is now (it may have changed since review); any problem aborts the whole import with nothing written.
 */
export async function commitImport(db: Database, id: string, actorStaffId: string) {
  const row = await getImport(db, id);
  const blocked = (code: string, message: string) => new ApiError(422, "VALIDATION_FAILED", "Import cannot be applied", message, [{ path: "import", code, message }]);
  if (row.status === "committed") throw blocked("already_committed", "This import was already applied.");
  if (row.status === "failed") throw blocked("has_errors", "This import has errors. Fix the file and upload it again.");
  if (Date.now() - row.createdAt.getTime() >= IMPORT_TTL_MS) throw blocked("expired", "This validation is over an hour old. Upload the file again so you review current data.");

  await db.transaction(async (tx) => {
    // Lock the import row so a double-click cannot apply it twice.
    const [locked] = await tx.select().from(catalogueImports).where(eq(catalogueImports.id, id)).for("update");
    if (locked!.status !== "validated") throw blocked("already_committed", "This import was already applied.");

    const result = await evaluate(tx, row.csv);
    if (result.errors.length || !result.plan || !result.resolution) {
      const first = result.errors[0];
      throw blocked("catalogue_changed", `The catalogue changed since this file was checked${first ? ` (row ${first.row}: ${first.message})` : ""}. Upload it again.`);
    }
    await applyPlan(tx, result.plan, result.resolution, { importId: id, filename: row.filename, actorStaffId });
    await tx
      .update(catalogueImports)
      .set({ status: "committed", committedAt: new Date(), report: { ...(row.report as object), summary: result.summary, warnings: capIssues(result.warnings) } })
      .where(eq(catalogueImports.id, id));
  });
  return importReport(db, id);
}
