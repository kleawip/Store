import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { storageFromConfig } from "./media/from-config";
import { DEFAULT_COMMERCE_SETTINGS } from "./checkout/settings";
import { MockShippingProvider, ShiprocketProvider } from "./shipping/provider";
import { DevGateway, RazorpayGateway } from "./payments/gateway";
import { expireUnpaidOrders } from "./orders/service";
import { deliverDueNotifications } from "./notifications/outbox";
import { ChannelNotificationSender, fileOutboxChannel, resendEmailChannel, whatsAppCloudChannel } from "./notifications/senders";
import { ChannelOtpSender, FileOutboxOtpSender, ResendEmailOtpSender, WhatsAppCloudOtpSender, type OtpSender } from "./messaging/otp-senders";

const config = loadConfig();
const { db, close } = createDatabase(config.DATABASE_URL);
const storage = storageFromConfig(config);

// Real providers when configured; otherwise (development only) codes go to a local, git-ignored file.
// Never fall back to the file outbox in production, whatever other guards change.
const isProduction = (config.NODE_ENV as string) === "production";
const devOutbox = isProduction ? undefined : new FileOutboxOtpSender(config.OTP_OUTBOX_FILE);
const whatsapp: OtpSender | undefined = config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN
  ? new WhatsAppCloudOtpSender({
      phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: config.WHATSAPP_ACCESS_TOKEN,
      templateName: config.WHATSAPP_OTP_TEMPLATE,
      languageCode: config.WHATSAPP_TEMPLATE_LANGUAGE,
      graphVersion: config.WHATSAPP_GRAPH_VERSION,
    })
  : devOutbox;
const email: OtpSender | undefined = config.RESEND_API_KEY
  ? new ResendEmailOtpSender({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM })
  : devOutbox;
const otpSender = new ChannelOtpSender({ whatsapp, email });

const shipping = config.SHIPROCKET_EMAIL && config.SHIPROCKET_PASSWORD
  ? new ShiprocketProvider({ email: config.SHIPROCKET_EMAIL, password: config.SHIPROCKET_PASSWORD, pickupPincode: config.PICKUP_PINCODE, pickupLocation: config.SHIPROCKET_PICKUP_LOCATION })
  : isProduction ? null : new MockShippingProvider(config.PICKUP_PINCODE);
const payments = config.RAZORPAY_KEY_ID
  ? new RazorpayGateway({ keyId: config.RAZORPAY_KEY_ID, keySecret: config.RAZORPAY_KEY_SECRET!, webhookSecret: config.RAZORPAY_WEBHOOK_SECRET! })
  : new DevGateway();
const commerce = {
  ...DEFAULT_COMMERCE_SETTINGS,
  sellerStateCode: config.SELLER_STATE_CODE,
  maxCodBalancePaise: config.MAX_COD_BALANCE_PAISE,
  shipping: { flatPaise: config.SHIPPING_FLAT_PAISE, freeAbovePaise: config.SHIPPING_FREE_ABOVE_PAISE ?? null },
};
const app = await buildApp({
  db,
  storage,
  otpSender,
  shipping,
  commerce,
  payments,
  courierWebhookToken: config.COURIER_WEBHOOK_TOKEN ?? null,
  storefrontOrigins: config.STOREFRONT_ORIGIN.split(",").map((origin) => origin.trim()),
  cookieSecure: config.COOKIE_SECURE,
  trustedProxyHops: config.TRUST_PROXY,
  logger: true,
});

// Customer notifications: real channels when configured; in development, a local git-ignored file.
const notifier = new ChannelNotificationSender({
  whatsapp: config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN
    ? whatsAppCloudChannel({ phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID, accessToken: config.WHATSAPP_ACCESS_TOKEN, languageCode: config.WHATSAPP_TEMPLATE_LANGUAGE, graphVersion: config.WHATSAPP_GRAPH_VERSION })
    : isProduction ? undefined : fileOutboxChannel(config.NOTIFICATION_OUTBOX_FILE),
  email: config.RESEND_API_KEY
    ? resendEmailChannel({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM })
    : isProduction ? undefined : fileOutboxChannel(config.NOTIFICATION_OUTBOX_FILE),
});
let delivering = false;
const notificationTimer = setInterval(() => {
  if (delivering) return;
  delivering = true;
  deliverDueNotifications(db, notifier)
    .catch((error) => app.log.error({ err: error }, "notification delivery failed"))
    .finally(() => { delivering = false; });
}, 15_000);
notificationTimer.unref();

// Release stock held by unpaid orders once their payment window lapses (every minute).
const expiryTimer = setInterval(() => {
  expireUnpaidOrders(db).catch((error) => app.log.error({ err: error }, "order expiry failed"));
}, 60_000);
expiryTimer.unref();

app.addHook("onClose", async () => {
  clearInterval(expiryTimer);
  clearInterval(notificationTimer);
  await close();
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await app.listen({ port: config.PORT, host: config.HOST });
