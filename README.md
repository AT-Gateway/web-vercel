# SMS Gateway Web + API

This is now a single deployable Next.js project for Vercel.

- Frontend: Next.js App Router pages.
- Backend: Fastify code under `src/server`.
- API routing: Next catch-all route at `src/app/api/[...path]/route.ts` forwards `/api/*` to the backend.
- Demo mode: enter the demo OTP code `000000` to open fake seeded SMS data without a database.
- Real mode: add `DATABASE_URL` and `API_KEY` to use the Android gateway and real PostgreSQL data.

## Run locally

Requires Node.js 20 or newer.

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
yarn dev
```

Open `http://localhost:5173`.

For local env customization:

```bash
cp .env.example .env.local
```

Keep `NEXT_PUBLIC_API_BASE_URL` empty when frontend and backend run on the same origin.

## Demo login

On the pairing screen:

```txt
000000
```

or click **Enter demo mode (000000)**.

The demo contains seeded contacts, seeded conversations, a fake Android gateway, and an auto-reply when sending a fake message.

## Deploy

Read [`DEPLOYMENT.md`](./DEPLOYMENT.md) for exact Vercel deployment steps.
