// Customer message texts. WhatsApp business-initiated messages must use templates pre-approved by Meta, so each
// event names a template (to be submitted from the client's WhatsApp Business account, category "utility") and the
// ordered body variables it takes. Emails are rendered here as plain text. Wording is a draft for client approval.

export type NotificationEvent = "order_confirmed" | "order_shipped" | "order_out_for_delivery" | "order_delivered" | "order_cancelled" | "return_update" | "cart_reminder";

/** Marketing messages: sent only while the customer is opted in (checked again at send time). */
export const MARKETING_EVENTS: ReadonlySet<NotificationEvent> = new Set(["cart_reminder"]);

export type NotificationParams = {
  name: string;
  orderNumber?: string;
  /** Pre-formatted amounts, e.g. "₹1,299.00". */
  total?: string;
  codBalance?: string | null;
  refund?: string | null;
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  returnNumber?: string;
  returnStatus?: "approved" | "rejected" | "refunded";
  detail?: string | null;
  // Cart reminders.
  firstItem?: string;
  otherItems?: number;
  cartUrl?: string;
  unsubscribeUrl?: string;
};

export type RenderedNotification = {
  whatsapp: { template: string; variables: string[] };
  email: { subject: string; text: string };
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const SIGN_OFF = "\n\nThank you for shopping with Kleawip.";

export function renderNotification(event: NotificationEvent, p: NotificationParams): RenderedNotification {
  const hi = `Hi ${firstName(p.name)},`;
  switch (event) {
    case "order_confirmed": {
      const cod = p.codBalance ? ` Please keep ${p.codBalance} ready to pay on delivery.` : "";
      return {
        whatsapp: { template: "kleawip_order_confirmed", variables: [firstName(p.name), p.orderNumber ?? "", p.total ?? "", p.codBalance ?? "-"] },
        email: { subject: `Order ${p.orderNumber} confirmed`, text: `${hi}\n\nWe've received your order ${p.orderNumber} (total ${p.total}).${cod} We'll message you when it ships.${SIGN_OFF}` },
      };
    }
    case "order_shipped":
      return {
        whatsapp: { template: "kleawip_order_shipped", variables: [firstName(p.name), p.orderNumber ?? "", p.courier ?? "our courier", p.awb ?? "-", p.trackingUrl ?? "-"] },
        email: { subject: `Order ${p.orderNumber} has shipped`, text: `${hi}\n\nYour order ${p.orderNumber} is on its way with ${p.courier ?? "our courier"} (AWB ${p.awb ?? "-"}).${p.trackingUrl ? `\nTrack it: ${p.trackingUrl}` : ""}${SIGN_OFF}` },
      };
    case "order_out_for_delivery": {
      const cod = p.codBalance ? ` Please keep ${p.codBalance} ready.` : "";
      return {
        whatsapp: { template: "kleawip_out_for_delivery", variables: [firstName(p.name), p.orderNumber ?? "", p.codBalance ?? "-"] },
        email: { subject: `Order ${p.orderNumber} is out for delivery`, text: `${hi}\n\nYour order ${p.orderNumber} will be delivered today.${cod}${SIGN_OFF}` },
      };
    }
    case "order_delivered":
      return {
        whatsapp: { template: "kleawip_order_delivered", variables: [firstName(p.name), p.orderNumber ?? ""] },
        email: { subject: `Order ${p.orderNumber} delivered`, text: `${hi}\n\nYour order ${p.orderNumber} has been delivered. If anything isn't right, you can request a return from your orders page.${SIGN_OFF}` },
      };
    case "order_cancelled": {
      const refund = p.refund ? ` A refund of ${p.refund} has been started to your original payment method; banks usually take 5–7 working days.` : "";
      return {
        whatsapp: { template: "kleawip_order_cancelled", variables: [firstName(p.name), p.orderNumber ?? "", p.refund ?? "-"] },
        email: { subject: `Order ${p.orderNumber} cancelled`, text: `${hi}\n\nYour order ${p.orderNumber} has been cancelled.${refund}${SIGN_OFF}` },
      };
    }
    case "cart_reminder": {
      const more = p.otherItems ? ` and ${p.otherItems} more item${p.otherItems === 1 ? "" : "s"}` : "";
      return {
        whatsapp: { template: "kleawip_cart_reminder", variables: [firstName(p.name), `${p.firstItem ?? "Your items"}${more}`, p.cartUrl ?? ""] },
        email: {
          subject: "You left something in your bag",
          text: `${hi}\n\n${p.firstItem ?? "Your items"}${more} ${p.otherItems ? "are" : "is"} still in your Kleawip bag.\nPick up where you left off: ${p.cartUrl}${SIGN_OFF}\n\nDon't want reminders like this? Unsubscribe: ${p.unsubscribeUrl}`,
        },
      };
    }
    case "return_update": {
      const lines = {
        approved: `Your return ${p.returnNumber} for order ${p.orderNumber} has been approved. We'll arrange the pickup and keep you posted.`,
        rejected: `We couldn't accept return ${p.returnNumber} for order ${p.orderNumber}${p.detail ? `: ${p.detail}` : "."}`,
        refunded: `We've received your return ${p.returnNumber} and refunded ${p.refund ?? "the amount"}. Banks usually take 5–7 working days.`,
      };
      const text = lines[p.returnStatus ?? "approved"];
      return {
        whatsapp: { template: `kleawip_return_${p.returnStatus ?? "approved"}`, variables: [firstName(p.name), p.returnNumber ?? "", p.orderNumber ?? "", p.refund ?? p.detail ?? "-"] },
        email: { subject: `Return ${p.returnNumber}: ${p.returnStatus}`, text: `${hi}\n\n${text}${SIGN_OFF}` },
      };
    }
  }
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
