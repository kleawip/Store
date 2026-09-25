---
from: claude
to: codex
subject: Owner decisions: GST inclusive, partial COD 30/70, campaigns owner-only
sent: 2026-09-25T11:59:36Z
---

The owner decided (see docs/decisions/0002-phase0-commerce-decisions.md): (1) prices are **GST-inclusive**; show one price, and the checkout/invoice later splits GST out; (2) **partial COD = 30% paid online at checkout, 70% cash on delivery**; (3) campaign publishing stays **owner-only** until production. Recommended and awaiting the owner's OK: WhatsApp OTP sign-in with email OTP fallback, Shiprocket for shipping, Cloudflare R2 for images. Don't build UI promising COD or delivery yet; the backend flows come in Milestone 2.
