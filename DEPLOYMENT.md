# Vercel deployment guide

This version is a single Next.js project. The frontend is served from normal Next routes, and the backend Fastify app is mounted through `src/app/api/[...path]/route.ts`, so every backend request goes to the same deployed domain under `/api`.

## What changed

- The old separate `server` project was moved into `src/server`.
- Next.js now exposes the backend through `/api/*` on the same Vercel URL.
- Demo mode was added and works without a hosted database.
- Demo data is seeded in memory with fake contacts, fake SMS conversations, and a fake Android gateway device.
- Real PostgreSQL mode still works when `DATABASE_URL` is configured.
- Old local `.env` files were removed from this deployable copy. Use `.env.example` as a safe template.

## Demo mode

Default demo OTP code:

```txt
000000
```

On the pairing screen, either type `000000` or click **Enter demo mode (000000)**. This creates a demo pair token and opens seeded fake conversations/contacts.

Demo mode does not need `DATABASE_URL`. It is meant for presentations, screenshots, and quick client demos.

## Local development

Requires Node.js 20 or newer.

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
yarn dev
```

Open:

```txt
http://localhost:5173
```

For local demo mode, copy the example env file if you want to customize values:

```bash
cp .env.example .env.local
```

Keep `NEXT_PUBLIC_API_BASE_URL` empty. Empty means the browser calls the same origin, for example `/api/health`.

## Deploy demo-only on Vercel

Use this path when you only need the web app to be presentable with fake data.

1. Push this folder to GitHub, GitLab, or Bitbucket.
2. In Vercel, create a new project from that repository.
3. Framework preset: **Next.js**.
4. Root directory: choose this folder if it lives inside a larger repository. If this folder is the repository root, leave the root directory as default.
5. Build/install commands are already set in `vercel.json`:

```json
{
  "installCommand": "yarn install --non-interactive",
  "buildCommand": "yarn build",
  "devCommand": "yarn dev"
}
```

6. Add these environment variables in Vercel Project Settings -> Environment Variables:

```txt
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_DEMO_MODE_CODE=000000
DEMO_MODE_ENABLED=true
DEMO_MODE_CODE=000000
API_KEY=replace-with-any-strong-random-string
```

7. Deploy.
8. Open your Vercel URL and click **Enter demo mode (000000)**.

## Deploy with real database mode

Use this path when the Android SMS gateway and real SMS data should work.

1. Create a hosted PostgreSQL database. Neon, Supabase, Railway, or a Vercel Marketplace Postgres integration are fine.
2. Add the database connection string to Vercel:

```txt
DATABASE_URL=postgres://...
```

3. Add a strong Android gateway key:

```txt
API_KEY=<generate-a-long-random-secret>
```

4. Keep the API on the same deployed domain:

```txt
NEXT_PUBLIC_API_BASE_URL=
```

5. Keep demo mode enabled if you still want the demo login to work next to real data:

```txt
DEMO_MODE_ENABLED=true
NEXT_PUBLIC_DEMO_MODE_CODE=000000
DEMO_MODE_CODE=000000
```

6. Optional web push variables:

```txt
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

7. Optional Telegram webhook variables:

```txt
TELEGRAM_MODE=webhook
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321
TELEGRAM_WEBHOOK_SECRET=<random-secret>
```

8. Redeploy after setting or changing environment variables.

The backend applies SQL migrations automatically on first API runtime startup when `DATABASE_URL` is present. You can also run migrations manually from a local machine that has the same `DATABASE_URL`:

```bash
yarn migrate
```

## Android gateway settings

After deployment, use this backend base URL in the Android gateway:

```txt
https://your-project.vercel.app/api
```

The Android app must send the same `API_KEY` through `X-Api-Key`.

## Presentation checklist

1. Open the deployed Vercel URL.
2. Clear old local storage or use the app sign-out button if you previously paired a real device.
3. Click **Enter demo mode (000000)**.
4. Show the **Demo** badge in the messages header.
5. Open seeded conversations such as Sahar Abbasi, GoToSafar Support, Hotel Atlas, or Demo OTP Service.
6. Search contacts by name or phone number.
7. Send a fake SMS from the composer. Demo mode immediately stores the outgoing message and adds a fake auto-reply.

## Important notes

- Do not commit real `.env`, `.env.local`, or secrets.
- Demo mode data is in memory. It is seeded again when the serverless runtime cold-starts.
- For production traffic, use a real `DATABASE_URL`.
- Long-lived SSE sockets are reduced for Vercel serverless compatibility. The frontend also polls every 12 seconds, so demo and real conversation refreshes still work.
