import { IMPORT_COLUMNS, ImportReport } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { MAX_IMPORT_BYTES } from "../imports/catalogue-import";
import { csvCell } from "../imports/csv";
import { commitImport, importReport, validateImport } from "../imports/service";

type IdParams = { Params: { id: string } };

// Neutral placeholder rows: clearly DEMO values, never real prices or SKUs.
const TEMPLATE_ROWS: string[][] = [
  [...IMPORT_COLUMNS],
  ["demo-towel", "DEMO Towel", "automotive", "40 × 60 cm", "1200 GSM", "Replace with approved copy", "Pack", "Single", "", "", "", "", "DEMO-TOWEL-P1", "", "", "", "", "1", "own", "0", "10", ""],
  ["demo-towel", "", "", "", "", "", "Pack", "Pack of 2", "", "", "", "", "DEMO-TOWEL-P2", "", "", "", "", "2", "shared:DEMO-TOWEL-P1", "", "5", ""],
];

export const adminImportRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const write = { preHandler: authorize(db, "catalogue.write") };

  app.get("/catalogue/template", write, async (_request, reply) => {
    const csv = TEMPLATE_ROWS.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="kleawip-catalogue-template.csv"')
      .send("﻿" + csv);
  });

  // multipart/form-data with one "file" part (.csv, UTF-8, ≤ 2 MB). Validates only; nothing is written.
  app.post("/catalogue", write, async (request, reply) => {
    const fail = (code: string, message: string) =>
      new ApiError(422, "VALIDATION_FAILED", "Validation failed", message, [{ path: "file", code, message }]);
    if (!request.isMultipart()) throw fail("required", "Send the CSV as multipart/form-data with a \"file\" part.");
    let upload: { buffer: Buffer; filename: string } | undefined;
    for await (const part of request.parts({ limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } })) {
      if (part.type === "file" && part.fieldname === "file") {
        const buffer = await part.toBuffer();
        if (part.file.truncated) throw fail("too_large", "The file is larger than 2 MB. Split it into smaller files.");
        upload = { buffer, filename: part.filename || "import.csv" };
      }
    }
    if (!upload) throw fail("required", "Choose a CSV file to import.");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(upload.buffer);
    if (text.includes("\u0000")) throw fail("not_csv", "This does not look like a CSV text file. Export it from Excel or Sheets as CSV (UTF-8).");
    const report = await validateImport(db, { filename: upload.filename, csv: text }, staffOf(request).staffId);
    return reply.status(201).send(ImportReport.parse(report));
  });

  app.get<IdParams>("/catalogue/:id", write, async (request) => ImportReport.parse(await importReport(db, request.params.id)));

  app.post<IdParams>("/catalogue/:id/commit", write, async (request) => {
    return ImportReport.parse(await commitImport(db, request.params.id, staffOf(request).staffId));
  });
};
