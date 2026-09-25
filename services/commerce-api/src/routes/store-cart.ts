import { Cart, CartLineUpdate, WishlistItem, WishlistMerge, WishlistPut } from "@kleawip/contract";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getCart, mergeGuestCart, newGuestToken, setLineQuantity, type CartOwner } from "../cart/service";
import { listWishlist, mergeWishlist, putWishlist, removeWishlist } from "../cart/wishlist";
import { customerOf, customerSession } from "../customers/guard";
import type { Database } from "../db/client";

export const GUEST_CART_COOKIE = "klw_cart";
const GUEST_CART_MAX_AGE_S = 30 * 24 * 60 * 60;

type SkuParams = { Params: { sku: string } };
type SlugParams = { Params: { slug: string } };

/** Called after a successful OTP sign-in: moves the guest bag into the account and drops the guest cookie. */
export const mergeGuestCartOnSignIn = (db: Database) =>
  async (request: { cookies: Record<string, string | undefined> }, reply: FastifyReply, customerId: string) => {
    const guestToken = request.cookies[GUEST_CART_COOKIE];
    if (!guestToken) return;
    await mergeGuestCart(db, guestToken, customerId);
    reply.clearCookie(GUEST_CART_COOKIE, { path: "/" });
  };

export const storeCartRoutes = (db: Database, { cookieSecure }: { cookieSecure: boolean }): FastifyPluginAsync => async (app) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
  });
  const anyone = { preHandler: customerSession(db, { required: false }) };
  const signedIn = { preHandler: customerSession(db, { required: true }) };

  const ownerFor = (request: FastifyRequest, reply: FastifyReply, create: boolean): CartOwner | null => {
    if (request.customer) return { customerId: request.customer.customerId };
    const existing = request.cookies[GUEST_CART_COOKIE];
    if (existing) return { guestToken: existing };
    if (!create) return null;
    const guestToken = newGuestToken();
    reply.setCookie(GUEST_CART_COOKIE, guestToken, { httpOnly: true, secure: cookieSecure, sameSite: "lax", path: "/", maxAge: GUEST_CART_MAX_AGE_S });
    return { guestToken };
  };

  // ---- Cart (guests allowed; checkout requires sign-in) ----

  app.get("/cart", anyone, async (request, reply) => Cart.parse(await getCart(db, ownerFor(request, reply, false))));

  app.put<SkuParams>("/cart/lines/:sku", anyone, async (request, reply) => {
    const { quantity } = CartLineUpdate.parse(request.body);
    const owner = ownerFor(request, reply, quantity > 0);
    if (owner) await setLineQuantity(db, owner, request.params.sku, quantity);
    return Cart.parse(await getCart(db, owner));
  });

  app.delete<SkuParams>("/cart/lines/:sku", anyone, async (request, reply) => {
    const owner = ownerFor(request, reply, false);
    if (owner) await setLineQuantity(db, owner, request.params.sku, 0);
    return Cart.parse(await getCart(db, owner));
  });

  // ---- Wishlist (signed-in; the storefront keeps a browser list for guests and merges it after sign-in) ----

  app.get("/me/wishlist", signedIn, async (request) => ({ data: z.array(WishlistItem).parse(await listWishlist(db, customerOf(request).customerId)) }));

  app.put<SlugParams>("/me/wishlist/:slug", signedIn, async (request, reply) => {
    await putWishlist(db, customerOf(request).customerId, request.params.slug, WishlistPut.parse(request.body ?? {}).sku);
    return reply.status(204).send();
  });

  app.delete<SlugParams>("/me/wishlist/:slug", signedIn, async (request, reply) => {
    await removeWishlist(db, customerOf(request).customerId, request.params.slug);
    return reply.status(204).send();
  });

  app.post("/me/wishlist/merge", signedIn, async (request) => {
    await mergeWishlist(db, customerOf(request).customerId, WishlistMerge.parse(request.body).items);
    return { data: z.array(WishlistItem).parse(await listWishlist(db, customerOf(request).customerId)) };
  });
};
