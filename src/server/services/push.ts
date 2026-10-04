import webpush from 'web-push';

export type PushConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

export function initWebPush(cfg: PushConfig) {
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
}

/** The web-push request options this app uses (see web-push's sendNotification options). */
export type PushOptions = {
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** Seconds the push service keeps an undelivered message. */
  TTL?: number;
  /** Collapses pending messages with the same topic (max 32 URL-safe base64 chars). */
  topic?: string;
};

export async function sendPush(subscription: webpush.PushSubscription, payload: any, opts?: PushOptions) {
  await webpush.sendNotification(subscription, JSON.stringify(payload), opts);
}
