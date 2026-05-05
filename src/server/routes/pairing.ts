import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { createRepo } from '../db/repo.js';
import { gen6DigitCode, genPairToken } from '../utils/ids.js';

export async function registerPairingRoutes(app: FastifyInstance, cfg: AppConfig, repo: ReturnType<typeof createRepo>) {
  // Admin: Android sets a short-lived code on the server.
  app.post('/api/pair/start', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const gatewayDeviceId = String(body.gatewayDeviceId ?? '').trim();
    const code = String(body.code ?? '').trim();

    // Optional for now (E2EE is disabled).
    const gatewayPubSpkiB64 = String(body.gatewayPubSpkiB64 ?? '').trim() || 'AA==';

    if (!gatewayDeviceId || !code) {
      return reply.code(400).send({ ok: false, error: 'Missing gatewayDeviceId or code' });
    }

    // Find or create pairing
    let pairing = await repo.getLatestPairingForGateway(gatewayDeviceId);
    if (!pairing) {
      const pairingId = randomUUID();
      await repo.createPairing({ pairingId, gatewayDeviceId, gatewayPubSpkiB64 });
      pairing = (await repo.getPairingById(pairingId))!;
    } else {
      // Best-effort update of pub key if caller provided a non-placeholder value.
      if (gatewayPubSpkiB64 && gatewayPubSpkiB64 !== 'AA==') {
        await repo.updateGatewayPub(pairing.id, gatewayPubSpkiB64);
        pairing = (await repo.getPairingById(pairing.id))!;
      }
    }

    const up = await repo.upsertJoinCode({
      code,
      pairingId: pairing.id,
      gatewayDeviceId,
      gatewayPubSpkiB64: pairing.gatewayPubSpkiB64 || gatewayPubSpkiB64 || 'AA==',
      ttlMs: cfg.joinCodeTtlMs,
      createdByToken: null,
    });

    if (!up.ok) {
      return reply.code(409).send({ ok: false, error: 'Code already in use. Generate a new code.' });
    }

    return {
      ok: true,
      pairingId: pairing.id,
      expiresAt: Date.now() + cfg.joinCodeTtlMs,
    };
  });

  // Public: PWA exchanges a code for a pair token.
  app.post('/api/pair/complete', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const code = String(body.code ?? '').trim();
    const pwaDeviceId = String(body.pwaDeviceId ?? '').trim();
    const deviceLabel = body.deviceLabel ? String(body.deviceLabel).trim() : null;

    // Optional for now (E2EE is disabled).
    const pwaPubSpkiB64 = String(body.pwaPubSpkiB64 ?? '').trim() || 'AA==';

    if (!code || !pwaDeviceId) {
      return reply.code(400).send({ ok: false, error: 'Missing code or pwaDeviceId' });
    }

    const consumed = await repo.consumeJoinCode(code);
    if (!consumed.ok) {
      return reply
        .code(400)
        .send({ ok: false, error: consumed.reason === 'expired' ? 'Expired code' : 'Invalid code' });
    }

    const join = consumed.join;
    const isDemoPairing = cfg.demo.enabled && join.pairingId === cfg.demo.pairingId;

    const pairToken = isDemoPairing ? cfg.demo.pairToken : genPairToken();
    await repo.createPairToken({
      pairToken,
      pairingId: join.pairingId,
      deviceId: pwaDeviceId,
      deviceType: 'pwa',
      deviceLabel,
      pubSpkiB64: pwaPubSpkiB64,
    });

    return {
      ok: true,
      pairToken,
      pairingId: join.pairingId,
      gatewayDeviceId: join.gatewayDeviceId,
      gatewayPubSpkiB64: join.gatewayPubSpkiB64 || 'AA==',
      demo: isDemoPairing,
    };
  });

  // Auth: return pairing info for current token
  app.get('/api/pair/me', async (req) => {
    const p = req.pairAuth!;
    return {
      ok: true,
      pairingId: p.pairingId,
      gatewayDeviceId: p.gatewayDeviceId,
      gatewayPubSpkiB64: p.gatewayPubSpkiB64,
      deviceId: p.deviceId,
      deviceType: p.deviceType,
      deviceLabel: p.deviceLabel,
      createdAt: p.createdAt,
      lastSeenAt: p.lastSeenAt,
      demo: cfg.demo.enabled && p.pairingId === cfg.demo.pairingId,
    };
  });

  // Auth: create a new invite code so another client can pair.
  app.post('/api/pair/invite', async (req, reply) => {
    const p = req.pairAuth!;
    const pairingId = p.pairingId;

    const pairing = await repo.getPairingById(pairingId);
    if (!pairing) return reply.code(404).send({ ok: false, error: 'Pairing not found' });

    // Find a free code.
    let code: string | null = null;
    for (let i = 0; i < 12; i++) {
      const c = gen6DigitCode();
      const up = await repo.upsertJoinCode({
        code: c,
        pairingId,
        gatewayDeviceId: pairing.gatewayDeviceId,
        gatewayPubSpkiB64: pairing.gatewayPubSpkiB64 || 'AA==',
        ttlMs: cfg.joinCodeTtlMs,
        createdByToken: p.pairToken,
      });
      if (up.ok) {
        code = c;
        break;
      }
    }

    if (!code) {
      return reply.code(500).send({ ok: false, error: 'Failed to generate a unique code. Try again.' });
    }

    return { ok: true, code, expiresAt: Date.now() + cfg.joinCodeTtlMs };
  });

  // Auth: list paired devices.
  app.get('/api/pair/devices', async (req) => {
    const p = req.pairAuth!;
    const devices = await repo.listPairTokens(p.pairingId, 50);
    return { ok: true, devices };
  });

  // Auth: revoke a device by deviceId.
  app.post('/api/pair/revokeDevice', async (req, reply) => {
    const p = req.pairAuth!;
    const body = (req.body ?? {}) as any;
    const deviceId = String(body.deviceId ?? '').trim();
    if (!deviceId) return reply.code(400).send({ ok: false, error: 'Missing deviceId' });

    const res = await repo.deletePairTokensByDevice(p.pairingId, deviceId);
    await repo.deletePushSubscription(p.pairingId, deviceId).catch(() => {});

    return { ok: true, deleted: res.deleted };
  });
}
