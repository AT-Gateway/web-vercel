import webpush from 'web-push';

export type PushConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

export function initWebPush(cfg: PushConfig) {
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
}

export async function sendPush(subscription: webpush.PushSubscription, payload: any) {
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
