import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";
import type { createRepo } from "../db/repo";
import { sendPush } from "../services/push";

export async function registerPushRoutes(
    app: FastifyInstance,
    cfg: AppConfig,
    repo: ReturnType<typeof createRepo>
) {
    app.post("/api/push/subscribe", async (req, reply) => {
        const p = req.pairAuth!;

        if (!cfg.vapid.enabled) {
            return reply.code(400).send({
                ok: false,
                error: "Push is not configured on the server (missing VAPID keys).",
            });
        }

        const body = (req.body ?? {}) as any;
        const deviceId = String(body.deviceId ?? "").trim();
        const subscription = body.subscription;

        if (!deviceId || !subscription) {
            return reply
                .code(400)
                .send({ ok: false, error: "Missing deviceId or subscription" });
        }

        await repo.upsertPushSubscription(p.pairingId, deviceId, subscription);
        return { ok: true };
    });

    app.post("/api/push/test", async (req, reply) => {
        const p = req.pairAuth!;

        if (!cfg.vapid.enabled) {
            return reply.code(400).send({
                ok: false,
                error: "Push is not configured on the server.",
            });
        }

        const subs = await repo.listPushSubscriptions(p.pairingId);

        if (subs.length === 0) {
            return reply.code(404).send({
                ok: false,
                error: "No push subscriptions found for this pairing.",
            });
        }

        const results: Array<{
            deviceId: string;
            ok: boolean;
            statusCode?: number;
            error?: string;
        }> = [];

        for (const s of subs) {
            try {
                await sendPush(s.subscription, {
                    type: "test",
                    title: "SMS Gateway",
                    body: "Test push notification works.",
                    ts: Date.now(),
                });

                results.push({ deviceId: s.deviceId, ok: true });
            } catch (err: any) {
                results.push({
                    deviceId: s.deviceId,
                    ok: false,
                    statusCode: err?.statusCode,
                    error: err?.message || String(err),
                });

                if (err?.statusCode === 404 || err?.statusCode === 410) {
                    await repo
                        .deletePushSubscription(p.pairingId, s.deviceId)
                        .catch(() => {});
                }
            }
        }

        return { ok: true, results };
    });
}
