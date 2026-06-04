# Render quick deployment

Render is the fastest free deployment path for this project. It is not the most robust path: Free web services spin down after 15 minutes without inbound traffic and the filesystem is ephemeral, so sessions and server logs can disappear after a restart or redeploy.

Use this path when the goal is to playtest quickly, get a public URL, and keep GitHub push-to-deploy simple.

## What the Blueprint does

The root `render.yaml` creates one free Node web service:

- builds with `npm ci --include=dev && npm run build`;
- starts with `npm start -- -p $PORT`;
- checks `/api/health`;
- deploys from `master` after GitHub CI checks pass;
- runs live LLM narration in `quality` mode;
- keeps debug logs readable through `/api/debug/logs`;
- writes temporary sessions/logs under `/tmp/ai-dm`.

The explicit `npm ci --include=dev` matters because `NODE_ENV=production` can otherwise omit build-time dependencies.

## GitHub Actions

Render Blueprint auto-deploys from `render.yaml` after GitHub checks pass, so a GitHub Actions deploy workflow is not strictly required.

This repository also includes `.github/workflows/render-deploy.yml` so the Actions sidebar has a visible `Deploy to Render` workflow. To make that workflow actively trigger a deploy, create a Render Deploy Hook for the service and add it as the GitHub repository secret `RENDER_DEPLOY_HOOK_URL`. If the secret is missing, the workflow exits successfully with a notice and Render Blueprint auto-deploy remains the deployment path.

## Setup

1. Open Render.
2. Click `New` -> `Blueprint`.
3. Connect `GauthierJeannenot/ai-dungeon-master`.
4. Render detects `render.yaml`.
5. Set `ANTHROPIC_API_KEY`.
6. Deploy the Blueprint.

The game URL will look like:

```text
https://ai-dungeon-master.onrender.com/game
```

If Render assigns a suffix, use the exact `onrender.com` URL shown in the dashboard.

## Logs

Runtime logs are visible in the Render dashboard.

The app also exposes structured debug logs:

```bash
curl "https://<render-url>/api/debug/logs?traces=true&limit=100"
```

`APP_DEBUG_LOG_PUBLIC_READ=true` is set on purpose for fast live debugging. This makes recent playtest text readable to anyone who knows the debug URL. Flip it to `false` and use the generated `APP_DEBUG_LOG_TOKEN` when you want privacy.

Protected read:

```bash
curl -H "Authorization: Bearer <APP_DEBUG_LOG_TOKEN>" \
  "https://<render-url>/api/debug/logs?traces=true&limit=100"
```

## Limits

Render free is simple, not durable:

- cold start after idle spin-down;
- local files lost after spin-down, restart, or redeploy;
- no persistent disk on the free web service;
- sessions can be lost server-side.

The browser blackbox logger still helps because it republishes recent client actions after a refresh. For a truly durable deployment, use a host with persistent storage, such as a small paid VPS or a managed database/object store for sessions and logs.
