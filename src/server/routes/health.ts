import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";

export async function registerHealthRoutes(app: FastifyInstance, cfg: AppConfig) {
    app.get("/api/health", async () => {
        return {
            ok: true,
            ts: Date.now(),
            vapidEnabled: cfg.vapid.enabled,
            telegramEnabled: cfg.telegram.enabled,
            databaseConfigured: Boolean(cfg.databaseUrl),
            demoModeEnabled: cfg.demo.enabled,
            demoCode: cfg.demo.enabled ? cfg.demo.code : null,
        };
    });

    app.get("/api/vapidPublicKey", async (_req, reply) => {
        if (!cfg.vapid.enabled || !cfg.vapid.publicKey) {
            return reply.code(503).send({
                ok: false,
                error: "Push is not configured on the server. Set VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY.",
            });
        }

        return { ok: true, key: cfg.vapid.publicKey };
    });
}
