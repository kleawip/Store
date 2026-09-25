// Delivery channels for customer notifications. Credentials come from the server environment only.
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { NotificationSender, OutgoingMessage } from "./outbox";

type Fetch = typeof fetch;
type ChannelSender = (message: OutgoingMessage) => Promise<{ providerMessageId: string | null }>;

/** WhatsApp Cloud API template message ("utility" templates approved in the client's WhatsApp Business account). */
export function whatsAppCloudChannel(config: { phoneNumberId: string; accessToken: string; languageCode: string; graphVersion: string }, fetchImpl: Fetch = fetch): ChannelSender {
  return async ({ to, whatsapp }) => {
    const response = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: whatsapp.template,
          language: { code: config.languageCode },
          components: [{ type: "body", parameters: whatsapp.variables.map((text) => ({ type: "text", text: text || "-" })) }],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { code?: number } } | null;
    // Meta's error code only: never echo the token or message contents.
    if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}${body?.error?.code ? `, code ${body.error.code}` : ""})`);
    return { providerMessageId: body?.messages?.[0]?.id ?? null };
  };
}

/** Plain-text email through Resend (sending domain verified with SPF/DKIM). */
export function resendEmailChannel(config: { apiKey: string; from: string }, fetchImpl: Fetch = fetch): ChannelSender {
  return async ({ to, email }) => {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [to], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    if (!response.ok) throw new Error(`Email send failed (${response.status})`);
    return { providerMessageId: body?.id ?? null };
  };
}

/** DEVELOPMENT ONLY: appends messages to a local, git-ignored file instead of sending them. */
export function fileOutboxChannel(path: string): ChannelSender {
  return async ({ channel, to, whatsapp, email }) => {
    await mkdir(dirname(path), { recursive: true });
    const summary = channel === "whatsapp" ? `${whatsapp.template} [${whatsapp.variables.join(" | ")}]` : `${email.subject} :: ${email.text.replace(/\n+/g, " ")}`;
    await appendFile(path, `${new Date().toISOString()} ${channel} ${to} ${summary}\n`, { mode: 0o600 });
    return { providerMessageId: null };
  };
}

/** Routes each message to its channel's sender. */
export class ChannelNotificationSender implements NotificationSender {
  constructor(private readonly channels: Partial<Record<OutgoingMessage["channel"], ChannelSender>>) {}
  has(channel: OutgoingMessage["channel"]) {
    return !!this.channels[channel];
  }
  async send(message: OutgoingMessage) {
    return this.channels[message.channel]!(message);
  }
}

/** Tests: records messages; can be told to fail. */
export class MemoryNotificationSender implements NotificationSender {
  readonly sent: OutgoingMessage[] = [];
  failing = false;
  channels: OutgoingMessage["channel"][] = ["whatsapp", "email"];
  has(channel: OutgoingMessage["channel"]) {
    return this.channels.includes(channel);
  }
  async send(message: OutgoingMessage) {
    if (this.failing) throw new Error("simulated failure");
    this.sent.push(message);
    return { providerMessageId: `mem_${this.sent.length}` };
  }
}
