import {
  AdminCollection,
  AdminCollectionCreate,
  AdminCollectionProducts,
  AdminCollectionUpdate,
  AdminProduct,
  MediaAsset,
  MediaAssetUpdate,
  MediaListQuery,
  ProductMediaAttach,
  ProductMediaOrder,
  ProductMediaUpdate,
} from "@kleawip/contract";
import type { FastifyPluginAsync } from "fastify";
import { authorize, staffOf } from "../auth/guard";
import { adminProduct } from "../catalogue/admin-service";
import {
  adminCollection,
  createCollection,
  listAdminCollections,
  setCollectionProducts,
  setCollectionStatus,
  updateCollection,
} from "../catalogue/collections";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { MAX_UPLOAD_BYTES } from "../media/process";
import {
  attachProductMedia,
  deleteAsset,
  getAsset,
  listAssets,
  removeProductMedia,
  reorderProductMedia,
  updateAssetAlt,
  updateProductMedia,
  uploadAsset,
} from "../media/service";
import type { MediaStorage } from "../media/storage";

type IdParams = { Params: { id: string } };
type ProductMediaParams = { Params: { id: string; mediaId: string } };

export const adminMediaCollectionRoutes = (db: Database, storage: MediaStorage): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });

  const read = { preHandler: authorize(db, "catalogue.read") };
  const media = { preHandler: authorize(db, "media.write") };
  const write = { preHandler: authorize(db, "catalogue.write") };
  const publish = { preHandler: authorize(db, "catalogue.publish") };

  // ---- Media library ----

  // multipart/form-data: one "file" part, optional "alt" field.
  app.post("/media", media, async (request, reply) => {
    if (!request.isMultipart()) {
      throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "Send the image as multipart/form-data with a \"file\" part.", [
        { path: "file", code: "required", message: "Choose an image to upload." },
      ]);
    }
    let file: { buffer: Buffer; filename: string } | undefined;
    let alt = "";
    for await (const part of request.parts({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } })) {
      if (part.type === "file" && part.fieldname === "file") {
        const buffer = await part.toBuffer();
        if (part.file.truncated) {
          throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "Images must be 15 MB or smaller.", [
            { path: "file", code: "too_large", message: "Images must be 15 MB or smaller." },
          ]);
        }
        file = { buffer, filename: part.filename || "upload" };
      } else if (part.type === "field" && part.fieldname === "alt") {
        alt = String(part.value);
      }
    }
    if (!file) {
      throw new ApiError(422, "VALIDATION_FAILED", "Validation failed", "No file was received.", [
        { path: "file", code: "required", message: "Choose an image to upload." },
      ]);
    }
    const { asset, duplicate } = await uploadAsset(db, storage, file, alt, staffOf(request).staffId);
    // 200 with the existing asset when identical bytes were uploaded before; 201 for a new file.
    return reply.status(duplicate ? 200 : 201).send(MediaAsset.parse(asset));
  });

  app.get("/media", read, async (request) => listAssets(db, MediaListQuery.parse(request.query)));
  app.get<IdParams>("/media/:id", read, async (request) => MediaAsset.parse(await getAsset(db, request.params.id)));

  app.patch<IdParams>("/media/:id", media, async (request) => {
    const { alt } = MediaAssetUpdate.parse(request.body);
    return MediaAsset.parse(await updateAssetAlt(db, request.params.id, alt));
  });

  app.delete<IdParams>("/media/:id", media, async (request, reply) => {
    await deleteAsset(db, storage, request.params.id);
    return reply.status(204).send();
  });

  // ---- Product images ----

  app.post<IdParams>("/products/:id/media", write, async (request, reply) => {
    await attachProductMedia(db, request.params.id, ProductMediaAttach.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(AdminProduct.parse(await adminProduct(db, request.params.id)));
  });

  app.patch<ProductMediaParams>("/products/:id/media/:mediaId", write, async (request) => {
    await updateProductMedia(db, request.params.id, request.params.mediaId, ProductMediaUpdate.parse(request.body), staffOf(request).staffId);
    return AdminProduct.parse(await adminProduct(db, request.params.id));
  });

  app.delete<ProductMediaParams>("/products/:id/media/:mediaId", write, async (request) => {
    await removeProductMedia(db, request.params.id, request.params.mediaId, staffOf(request).staffId);
    return AdminProduct.parse(await adminProduct(db, request.params.id));
  });

  app.put<IdParams>("/products/:id/media/order", write, async (request) => {
    await reorderProductMedia(db, request.params.id, ProductMediaOrder.parse(request.body).mediaIds, staffOf(request).staffId);
    return AdminProduct.parse(await adminProduct(db, request.params.id));
  });

  // ---- Collections ----

  app.get("/collections", read, async () => ({ data: await listAdminCollections(db) }));

  app.post("/collections", write, async (request, reply) => {
    const id = await createCollection(db, AdminCollectionCreate.parse(request.body), staffOf(request).staffId);
    return reply.status(201).send(AdminCollection.parse(await adminCollection(db, id)));
  });

  app.get<IdParams>("/collections/:id", read, async (request) => AdminCollection.parse(await adminCollection(db, request.params.id)));

  app.patch<IdParams>("/collections/:id", write, async (request) => {
    await updateCollection(db, request.params.id, AdminCollectionUpdate.parse(request.body), staffOf(request).staffId);
    return AdminCollection.parse(await adminCollection(db, request.params.id));
  });

  app.put<IdParams>("/collections/:id/products", write, async (request) => {
    await setCollectionProducts(db, request.params.id, AdminCollectionProducts.parse(request.body).productIds, staffOf(request).staffId);
    return AdminCollection.parse(await adminCollection(db, request.params.id));
  });

  for (const [path, status] of [["publish", "published"], ["unpublish", "draft"], ["archive", "archived"]] as const) {
    app.post<IdParams>(`/collections/:id/${path}`, publish, async (request) => {
      await setCollectionStatus(db, request.params.id, status, staffOf(request).staffId);
      return AdminCollection.parse(await adminCollection(db, request.params.id));
    });
  }
};
