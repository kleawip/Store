// OTP delivery (ADR 0002 R1): WhatsApp first, email fallback, SMS can be added as another sender later.
// Provider credentials come from the server environment only.
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type OtpMessage = { channel: "whatsapp" | "email"; to: string; code: string; expiresInMinutes: number };

export interface OtpSender {
  send(message: OtpMessage): Promise<void>;
}

export class OtpDeliveryError extends Error {}

type Fetch = typeof fetch;

/**
 * WhatsApp Cloud API (Meta), "authentication" category template with a copy-code button.
 * The template must be approved in Meta Business Manager with one body variable (the code) and a
 * copy-code (URL-type OTP) button; Meta's authentication templates take the code in both places.
 */
export class WhatsAppCloudOtpSender implements OtpSender {
  constructor(
    private readonly config: { phoneNumberId: string; accessToken: string; templateName: string; languageCode: string; graphVersion: string },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async send({ to, code }: OtpMessage) {
    const response = await this.fetchImpl(`https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: this.config.templateName,
          language: { code: this.config.languageCode },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Never include the code or token in errors; keep Meta's error code for operators.
      const body = (await response.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
      throw new OtpDeliveryError(`WhatsApp send failed (${response.status}${body?.error?.code ? `, code ${body.error.code}` : ""})`);
    }
  }
}

/** Email OTP via Resend's HTTP API. The sending domain must be verified (SPF/DKIM). */
export class ResendEmailOtpSender implements OtpSender {
  constructor(private readonly config: { apiKey: string; from: string }, private readonly fetchImpl: Fetch = fetch) {}

  async send({ to, code, expiresInMinutes }: OtpMessage) {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.config.from,
        to: [to],
        subject: `${code} is your Kleawip sign-in code`,
        text: `Your Kleawip sign-in code is ${code}. It expires in ${expiresInMinutes} minutes.\n\nIf you didn't try to sign in, you can ignore this email. Kleawip will never ask you for this code.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new OtpDeliveryError(`Email send failed (${response.status})`);
  }
}

/** DEVELOPMENT ONLY: writes codes to a local, git-ignored file instead of sending them. */
export class FileOutboxOtpSender implements OtpSender {
  constructor(private readonly path: string) {}

  async send({ channel, to, code }: OtpMessage) {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${new Date().toISOString()} ${channel} ${to} code=${code}\n`, { mode: 0o600 });
  }
}

/** Tests: keeps the last message per destination in memory. */
export class MemoryOtpSender implements OtpSender {
  readonly sent: OtpMessage[] = [];
  failNext = false;
  async send(message: OtpMessage) {
    if (this.failNext) {
      this.failNext = false;
      throw new OtpDeliveryError("simulated failure");
    }
    this.sent.push(message);
  }
  lastCodeFor(to: string) {
    return [...this.sent].reverse().find((message) => message.to === to)?.code;
  }
}

/** Routes each message to the sender for its channel. */
export class ChannelOtpSender implements OtpSender {
  constructor(private readonly senders: Partial<Record<OtpMessage["channel"], OtpSender>>) {}
  has(channel: OtpMessage["channel"]) {
    return !!this.senders[channel];
  }
  async send(message: OtpMessage) {
    const sender = this.senders[message.channel];
    if (!sender) throw new OtpDeliveryError(`No ${message.channel} sender configured`);
    await sender.send(message);
  }
}
