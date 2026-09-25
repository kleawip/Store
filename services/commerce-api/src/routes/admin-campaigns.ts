import { CampaignOrder, HeroSlide, HeroSlideInput, RibbonMessage, RibbonMessageInput } from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { authorize, staffOf } from "../auth/guard";
import {
  createRibbon,
  createSlide,
  getRibbon,
  getSlide,
  listRibbon,
  listSlides,
  reorderRibbon,
  reorderSlides,
  setRibbonStatus,
  setSlideStatus,
  updateRibbon,
  updateSlide,
} from "../campaigns/service";
import type { Database } from "../db/client";

type IdParams = { Params: { id: string } };
const STATUS_ACTIONS = [["publish", "published"], ["unpublish", "draft"], ["archive", "archived"]] as const;

export const adminCampaignRoutes = (db: Database): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });

  const read = { preHandler: authorize(db, "catalogue.read") };
  const write = { preHandler: authorize(db, "campaigns.write") };
  const publish = { preHandler: authorize(db, "campaigns.publish") };

  // ---- Hero slides ----

  app.get("/slides", read, async () => ({ data: (await listSlides(db)).map((slide) => HeroSlide.parse(slide)) }));

  app.post("/slides", write, async (request, reply) => {
    const input = HeroSlideInput.required({ internalTitle: true }).parse(request.body);
    const id = await createSlide(db, input, staffOf(request).staffId);
    return reply.status(201).send(HeroSlide.parse(await getSlide(db, id)));
  });

  app.put("/slides/order", write, async (request) => {
    await reorderSlides(db, CampaignOrder.parse(request.body).ids, staffOf(request).staffId);
    return { data: (await listSlides(db)).map((slide) => HeroSlide.parse(slide)) };
  });

  app.get<IdParams>("/slides/:id", read, async (request) => HeroSlide.parse(await getSlide(db, request.params.id)));

  app.patch<IdParams>("/slides/:id", write, async (request) => {
    await updateSlide(db, request.params.id, HeroSlideInput.parse(request.body), staffOf(request).staffId);
    return HeroSlide.parse(await getSlide(db, request.params.id));
  });

  for (const [path, status] of STATUS_ACTIONS) {
    // Taking a slide down (unpublish/archive) is an editing action; putting one live needs publish rights.
    app.post<IdParams>(`/slides/:id/${path}`, status === "published" ? publish : write, async (request) => {
      await setSlideStatus(db, request.params.id, status, staffOf(request).staffId);
      return HeroSlide.parse(await getSlide(db, request.params.id));
    });
  }

  // ---- Announcement ribbon ----

  app.get("/ribbon", read, async () => ({ data: (await listRibbon(db)).map((message) => RibbonMessage.parse(message)) }));

  app.post("/ribbon", write, async (request, reply) => {
    const input = RibbonMessageInput.required({ text: true }).parse(request.body);
    const id = await createRibbon(db, input, staffOf(request).staffId);
    return reply.status(201).send(RibbonMessage.parse(await getRibbon(db, id)));
  });

  app.put("/ribbon/order", write, async (request) => {
    await reorderRibbon(db, CampaignOrder.parse(request.body).ids, staffOf(request).staffId);
    return { data: (await listRibbon(db)).map((message) => RibbonMessage.parse(message)) };
  });

  app.get<IdParams>("/ribbon/:id", read, async (request) => RibbonMessage.parse(await getRibbon(db, request.params.id)));

  app.patch<IdParams>("/ribbon/:id", write, async (request) => {
    await updateRibbon(db, request.params.id, RibbonMessageInput.parse(request.body), staffOf(request).staffId);
    return RibbonMessage.parse(await getRibbon(db, request.params.id));
  });

  for (const [path, status] of STATUS_ACTIONS) {
    app.post<IdParams>(`/ribbon/:id/${path}`, status === "published" ? publish : write, async (request) => {
      await setRibbonStatus(db, request.params.id, status, staffOf(request).staffId);
      return RibbonMessage.parse(await getRibbon(db, request.params.id));
    });
  }
};
