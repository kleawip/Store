import { CartReminderReport, GstReport, GstReportQuery, ReportRange, ProductReport, ProductReportQuery, SalesReport, SalesReportQuery } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { authorize } from "../auth/guard";
import type { Database } from "../db/client";
import { cartReminderStats } from "../marketing/cart-reminders";
import { gstCsv, gstReport, istRange, productReport, salesReport } from "../reports/service";

/** Owner-only reports (revenue and GST). */
export const adminReportRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const read = { preHandler: authorize(db, "reports.read") };

  app.get("/reports/sales", read, async (request) => SalesReport.parse(await salesReport(db, SalesReportQuery.parse(request.query))));
  app.get("/reports/products", read, async (request) => ProductReport.parse(await productReport(db, ProductReportQuery.parse(request.query))));
  app.get("/reports/cart-reminders", read, async (request) => {
    const query = ReportRange.parse(request.query);
    return CartReminderReport.parse({ ...query, ...(await cartReminderStats(db, istRange(query.from, query.to))) });
  });
  app.get("/reports/gst", read, async (request, reply) => {
    const query = GstReportQuery.parse(request.query);
    const report = GstReport.parse(await gstReport(db, query));
    if (query.format === "json") return report;
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="kleawip-gst-${query.section}-${query.from}-to-${query.to}.csv"`)
      .send(gstCsv(report, query.section));
  });
};
