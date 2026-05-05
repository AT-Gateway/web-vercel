import { fetch } from 'undici';
import type { AppConfig } from '../config';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';
import { handleTelegramUpdate } from './handleUpdate';

/**
 * Long-poll Telegram updates (dev-friendly; no public HTTPS/webhook needed).
 * Enable with: TELEGRAM_MODE=polling
 */
export function startTelegramPoller(
    cfg: AppConfig,
    repo: ReturnType<typeof createRepo>,
    hub: SseHub
): { stop: () => void } {
    const botToken = cfg.telegram.botToken;
    if (!cfg.telegram.enabled || !botToken || cfg.telegram.mode !== 'polling') {
        return { stop: () => {} };
    }

    const controller = new AbortController();
    let offset = 0;

    async function loop() {
        while (!controller.signal.aborted) {
            try {
                const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        offset,
                        timeout: 25,
                        allowed_updates: ['message', 'edited_message', 'callback_query'],
                    }),
                    signal: controller.signal as any,
                });

                if (!res.ok) {
                    await new Promise((r) => setTimeout(r, 1500));
                    continue;
                }

                const data = (await res.json().catch(() => null)) as any;
                if (!data || data.ok !== true || !Array.isArray(data.result)) {
                    await new Promise((r) => setTimeout(r, 1000));
                    continue;
                }

                for (const upd of data.result) {
                    const id = typeof upd?.update_id === 'number' ? Number(upd.update_id) : null;
                    if (id !== null) offset = id + 1;
                    await handleTelegramUpdate(upd, cfg, repo, hub);
                }
            } catch (err: any) {
                if (controller.signal.aborted) return;
                // eslint-disable-next-line no-console
                console.error('[telegram poller] error:', err?.message ?? err);
                await new Promise((r) => setTimeout(r, 1500));
            }
        }
    }

    loop().catch(() => {});

    return {
        stop: () => controller.abort(),
    };
}
