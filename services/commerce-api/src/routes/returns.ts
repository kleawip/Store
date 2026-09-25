import { AdminReturn, AdminReturnListQuery, CustomerReturn, ReturnClose, ReturnDecision, ReturnEligibility, ReturnReceive, ReturnRefund, ReturnReject, ReturnRequest, StaffReturnCreate } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { CommerceSettings } from "../checkout/settings";
import { customerOf, customerSession } from "../customers/guard";
import type { Database } from "../db/client";
import { notFound } from "../errors";
import { renderInvoiceHtml } from "../invoices/render";
import type { InvoiceDocument } from "../invoices/service";
import type { PaymentGateway } from "../payments/gateway";
import {
  adminReturn, approveReturn, cancelReturnByCustomer, closeReturn, creditNoteFor, customerReturns, listAdminReturns, receiveReturn,
  refundReturn, rejectReturn, requestReturn, returnEligibility, staffCreateReturn,
} from "../returns/service";
import { sendInvoice } from "./admin-orders";

type IdParams = { Params: { id: string } };

const noStore = async (_request: unknown, reply: { header: (name: string, value: string) => unknown }) => {
  reply.header("cache-control", "private, no-store");
};

/** Customer returns under /v1/store. */
export const storeReturnRoutes = (db: Database, settings: CommerceSettings): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", noStore);
  const signedIn = { preHandler: customerSession(db, { required: true }) };

  app.get<IdParams>("/orders/:id/returns/eligibility", signedIn, async (request) =>
    ReturnEligibility.parse(await returnEligibility(db, settings, customerOf(request).customerId, request.params.id)),
  );
  app.get<IdParams>("/orders/:id/returns", signedIn, async (request) => ({
    data: z.array(CustomerReturn).parse(await customerReturns(db, customerOf(request).customerId, request.params.id)),
  }));
  app.post<IdParams>("/orders/:id/returns", signedIn, async (request, reply) =>
    reply.status(201).send(CustomerReturn.parse(await requestReturn(db, settings, customerOf(request).customerId, request.params.id, ReturnRequest.parse(request.body)))),
  );
  app.post<IdParams>("/returns/:id/cancel", signedIn, async (request) =>
    CustomerReturn.parse(await cancelReturnByCustomer(db, customerOf(request).customerId, request.params.id)),
  );
};

/** Staff returns under /v1/admin. Handling needs orders.manage; money (refund, close without refund) needs orders.refund. */
export const adminReturnRoutes = (db: Database, gateway: PaymentGateway): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", noStore);
  const read = { preHandler: authorize(db, "orders.read") };
  const manage = { preHandler: authorize(db, "orders.manage") };
  const money = { preHandler: authorize(db, "orders.refund") };
  const detail = async (id: string) => AdminReturn.parse(await adminReturn(db, id));

  app.get("/returns", read, async (request) => {
    const result = await listAdminReturns(db, AdminReturnListQuery.parse(request.query));
    return { data: z.array(AdminReturn).parse(result.data), totalCount: result.totalCount };
  });
  app.get<IdParams>("/returns/:id", read, async (request) => detail(request.params.id));

  app.post<IdParams>("/orders/:id/returns", manage, async (request, reply) => {
    const id = await staffCreateReturn(db, request.params.id, StaffReturnCreate.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(await detail(id));
  });
  app.post<IdParams>("/returns/:id/approve", manage, async (request) => {
    await approveReturn(db, request.params.id, ReturnDecision.parse(request.body ?? {}).note, staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.post<IdParams>("/returns/:id/reject", manage, async (request) => {
    await rejectReturn(db, request.params.id, ReturnReject.parse(request.body).reason, staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.post<IdParams>("/returns/:id/receive", manage, async (request) => {
    await receiveReturn(db, request.params.id, ReturnReceive.parse(request.body ?? {}), staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.post<IdParams>("/returns/:id/refund", money, async (request) => {
    await refundReturn(db, gateway, request.params.id, ReturnRefund.parse(request.body), staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.post<IdParams>("/returns/:id/close", money, async (request) => {
    await closeReturn(db, request.params.id, ReturnClose.parse(request.body).note, staffOf(request).staffId);
    return detail(request.params.id);
  });
  app.get<IdParams>("/returns/:id/credit-note", read, async (request, reply) => {
    const note = await creditNoteFor(db, request.params.id);
    if (!note) throw notFound("No credit note has been issued for this return.");
    return sendInvoice(reply, renderInvoiceHtml(note.document as InvoiceDocument, "issued"));
  });
};
