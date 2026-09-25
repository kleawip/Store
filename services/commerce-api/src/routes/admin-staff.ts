import { ActivityEvent, ActivityQuery, PasswordChange, StaffInvite, StaffMember, StaffSetupLink, StaffSetupRequest, StaffUpdate } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authorize, staffOf } from "../auth/guard";
import type { Database } from "../db/client";
import { activityLog, changeOwnPassword, completeSetup, inviteStaff, listStaff, resetStaffPassword, updateStaff } from "../staff/service";

type IdParams = { Params: { id: string } };

/** Settings → Staff (owner only) and the activity log. */
export const adminStaffRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const manage = { preHandler: authorize(db, "staff.manage") };

  app.get("/staff", manage, async () => ({ data: z.array(StaffMember).parse(await listStaff(db)) }));

  app.post("/staff", manage, async (request, reply) => {
    const link = await inviteStaff(db, StaffInvite.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(StaffSetupLink.parse(link));
  });

  app.patch<IdParams>("/staff/:id", manage, async (request) =>
    StaffMember.parse(await updateStaff(db, request.params.id, StaffUpdate.parse(request.body), staffOf(request).staffId)),
  );

  app.post<IdParams>("/staff/:id/setup-link", manage, async (request) =>
    StaffSetupLink.parse(await resetStaffPassword(db, request.params.id, staffOf(request).staffId)),
  );

  app.get("/activity", { preHandler: authorize(db, "audit.read") }, async (request) => ({
    data: z.array(ActivityEvent).parse(await activityLog(db, ActivityQuery.parse(request.query))),
  }));
};

/** Self-service account routes under /v1/admin/auth. */
export const adminAccountRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });

  // Public: completing an invite or reset with the one-time link. The token itself is the credential.
  app.post("/setup", async (request, reply) => {
    const { token, password } = StaffSetupRequest.parse(request.body);
    await completeSetup(db, token, password);
    return reply.status(204).send();
  });

  app.post("/password", { preHandler: authorize(db, null) }, async (request, reply) => {
    const staff = staffOf(request);
    await changeOwnPassword(db, staff.staffId, staff.sessionId, PasswordChange.parse(request.body));
    return reply.status(204).send();
  });
};
