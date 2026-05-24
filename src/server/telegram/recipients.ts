import type { AppConfig } from '../config';
import type { createRepo, TelegramChatSubscription } from '../db/repo';
import type { TelegramConfig } from '../services/telegram';

export async function getTelegramRecipientsForPairing(
  cfg: AppConfig,
  repo: ReturnType<typeof createRepo>,
  pairingId: string
): Promise<{
  alertsEnabled: boolean;
  subscriptions: TelegramChatSubscription[];
  recipients: TelegramConfig[];
}> {
  if (!cfg.telegram.enabled || !cfg.telegram.botToken) {
    return { alertsEnabled: false, subscriptions: [], recipients: [] };
  }

  const settings = await repo.getTelegramPairingSettings(pairingId);
  if (!settings.alertsEnabled) {
    return { alertsEnabled: false, subscriptions: [], recipients: [] };
  }

  const subscriptions = await repo.listTelegramSubscriptions(pairingId);
  const recipients = subscriptions
    .filter((s) => s.enabled)
    .map((s) => ({ botToken: cfg.telegram.botToken!, chatId: s.chatId }));

  // Backward compatibility: existing TELEGRAM_CHAT_ID / TELEGRAM_ALLOWED_CHAT_IDS still receive alerts.
  for (const chatId of cfg.telegram.allowedChatIds) {
    if (!recipients.some((r) => r.chatId === chatId)) {
      recipients.push({ botToken: cfg.telegram.botToken, chatId });
    }
  }

  return { alertsEnabled: true, subscriptions, recipients };
}
