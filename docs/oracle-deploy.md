# Oracle Always Free deployment

This project needs a persistent Node server, a child MCP process, disk sessions, and debug logs. Serverless hosts are a bad fit. Oracle Cloud Always Free is currently the most realistic "free for longer than an afternoon" option, but there is one hard boundary: a human must create the Oracle account, pass card/MFA/CAPTCHA, accept terms, and create the VM.

After the VM exists, the repository can deploy automatically through GitHub Actions over SSH.

## Target architecture

```
GitHub push to master
  -> CI
  -> Deploy to Oracle VPS
  -> Docker Compose
       -> app: Next.js + MCP server
       -> caddy: HTTPS reverse proxy
  -> /opt/ai-dungeon-master/data
       -> sessions
       -> logs
```

## Human setup

1. Create an Oracle Cloud account.
2. Create an Always Free VM:
   - Shape: Ampere A1 Flex if available, otherwise the free AMD micro shape.
   - OS: Ubuntu 22.04 or 24.04.
   - Public IPv4: enabled.
   - Ingress rules: TCP `22`, `80`, and `443`.
3. Keep the SSH private key locally and copy the public IP.

Optional but recommended: reserve the public IP so the app URL does not change after VM restarts.

## GitHub secrets

Add these repository secrets:

| Secret | Required | Example |
| --- | --- | --- |
| `ORACLE_HOST` | Yes | `203.0.113.42` |
| `ORACLE_USER` | No | `ubuntu` |
| `ORACLE_SSH_KEY` | Yes | private SSH key for the VM |
| `ANTHROPIC_API_KEY` | Yes | `sk-ant-...` |
| `ORACLE_DOMAIN` | No | `203.0.113.42.sslip.io` or `game.example.com` |
| `APP_DEBUG_LOG_TOKEN` | Recommended | long random token |
| `APP_DEBUG_LOG_PUBLIC_READ` | No | `false` |

If `ORACLE_DOMAIN` is missing, the workflow uses `<ORACLE_HOST>.sslip.io`, for example `203.0.113.42.sslip.io`. That gives a real DNS name without buying a domain.

## First deploy

Run the GitHub Actions workflow `Deploy to Oracle VPS` manually once. After that, every successful CI run on `master` deploys automatically.

The workflow:

1. Installs Docker and Compose on the VM if needed.
2. Syncs the repository to `/opt/ai-dungeon-master`.
3. Writes `/opt/ai-dungeon-master/.env.production`.
4. Runs `docker compose -f docker-compose.oracle.yml up -d --build --remove-orphans`.
5. Checks `https://<domain>/api/health`.

The game URL is:

```
https://<domain>/game
```

## VM commands

SSH into the VM:

```bash
ssh ubuntu@203.0.113.42
```

Read app logs:

```bash
cd /opt/ai-dungeon-master
sudo docker compose -f docker-compose.oracle.yml logs -f app
```

Read Caddy logs:

```bash
cd /opt/ai-dungeon-master
sudo docker compose -f docker-compose.oracle.yml logs -f caddy
```

Restart:

```bash
cd /opt/ai-dungeon-master
sudo docker compose -f docker-compose.oracle.yml restart
```

## Debug logs

Sessions and server logs are persisted under:

```
/opt/ai-dungeon-master/data/sessions
/opt/ai-dungeon-master/data/logs
```

HTTP debug endpoint:

```bash
curl -H "Authorization: Bearer <APP_DEBUG_LOG_TOKEN>" \
  "https://<domain>/api/debug/logs?traces=true&limit=100"
```

Keep `APP_DEBUG_LOG_PUBLIC_READ=false` for normal playtests. Turn it on only during a live debugging session if you accept that logs are publicly readable.

## Provider notes

Oracle Always Free is not magic: idle CPU/network and quota policies can change, and account creation can fail. The reason it is still the best fit here is that this app needs:

- a long-running Node process;
- a child MCP process;
- persistent disk;
- deploys that do not sleep after fifteen minutes;
- logs we can actually read.

Render/Koyeb-style free app platforms are easier to start but tend to sleep, restrict persistent disk, or become less predictable for stateful playtests.
