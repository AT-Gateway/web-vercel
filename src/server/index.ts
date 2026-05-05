import { getApiRuntime } from './app';
import { startTelegramPoller } from './telegram/poller';

async function main() {
  const runtime = await getApiRuntime();
  const { app, cfg, repo, hub, pool } = runtime;

  await app.listen({ port: cfg.port, host: '0.0.0.0' });

  // Optional local/dev polling mode. Do not use polling on Vercel serverless.
  const poller = startTelegramPoller(cfg, repo, hub);

  const close = async () => {
    try {
      poller.stop();
      hub.stopPings();
      await app.close();
    } finally {
      await pool?.end();
    }
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
