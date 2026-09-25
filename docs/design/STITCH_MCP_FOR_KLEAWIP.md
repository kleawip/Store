# Google Stitch for Kleawip — read before design work

This note explains the screen-design workflow in plain language. It is for the Kleawip project team and any coding assistant working in this folder. Use the approved Kleawip Brand and Digital Experience Guidelines as the visual source of truth in Stitch.

## What we are doing

We will use Google Stitch to create the first visual designs for the Kleawip ecommerce website. The client should review and approve the designs before we turn them into working website screens. Do not start by inventing a separate hand-coded look.

Design goals already agreed:

- Mobile-first: design the phone layout first, then tablet and desktop.
- Use the Kleawip brand guide and the real Kleawip catalogue/product photos as references.
- Keep the main theme light with Kleawip blue; include a user-selectable dark theme.
- Create a distinctive, considered retail design. Avoid generic AI-looking layouts, filler copy, invented trust claims, or made-up prices.
- Show all relevant screen states during review: normal, loading, empty, error, selected variants, and mobile navigation where applicable.
- Generate related screens from one shared design system so they feel like one store.

## Connect Stitch to Codex

1. Open Google Stitch Settings and create a new API key. If a key has appeared in a screenshot, chat, pasted text clipping, or project file, revoke that key first and create a replacement.
2. In Stitch, open **Setup MCP** and choose **Codex**. MCP is the connection that lets Codex ask Stitch to create and retrieve screen designs.
3. Copy Stitch's generated Codex configuration into the local Codex configuration file at `~/.codex/config.toml`. This is a user-level file on the Mac, outside the Kleawip project.
4. Put the fresh key only in that local Codex configuration (or another private local secret store you control). Never put the key in `WEBSITE DATA/project`, Git, a client proposal, Graphify, or a screenshot.
5. Save the configuration and restart/reconnect Codex. Then ask Codex to check whether Stitch is available.

The connection uses Google's Stitch MCP endpoint and an `X-Goog-Api-Key` header. Keep the key value private; this documentation intentionally contains no key.

## Screen-design sequence

1. Read the brand guide, the approved scope and the confirmed product information.
2. Create one Kleawip Stitch project and one shared design system (colours, type, spacing, buttons, cards, form controls, and light/dark themes).
3. Design the core phone screens first: home, product listing, product detail, search, cart, sign-in/account entry, then the key admin dashboard and order workflow.
4. Add the remaining approved screens in related groups, reusing the design system and real product data. Do not claim the full 82 customer screens and 73+ admin views are all uniquely designed pages; many share templates and components.
5. Review the Stitch previews with the client. Record approved/revise decisions and feedback in project documentation.
6. Only after the screen group is approved, implement that group locally and test it before moving to the next group.

## Important content checks

- Use Kleawip-owned product photos from the existing website when the Stitch workflow supports image references. Do not use competitor product photos as Kleawip content.
- Current catalogue pages contain placeholder-looking prices. Do not treat those as approved prices; show a neutral price placeholder in design reviews until the client confirms the final price list.
- Do not invent customer reviews, customer logos, partner claims, shipping promises, discounts, policies, or product performance claims. Use only client-approved content or visibly labelled design placeholders.
- Confirm the bulk-buy flow (quote request or online bulk checkout) and obtain written permission before showing client logos on the “Clients We Work With” screen.

## If Stitch is not connected

Do not silently replace Stitch with a locally invented design. Tell the user that the connection is unavailable and give simple setup steps. The user should enter or replace the API key themselves; do not ask them to paste it into chat.
