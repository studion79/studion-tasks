# Operations Runbook

## 1) Release clean

Run local quality checks:

```bash
npm run release:check
```

Build and push a versioned image:

```bash
./scripts/release-build-push.sh v2026-04-09-1
```

## 2) E2E smoke tests

```bash
E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e
```

Optional authenticated flow:

```bash
E2E_BASE_URL=https://tasks.serveur.studio-n.fr \
E2E_USER_EMAIL=admin@example.com \
E2E_USER_PASSWORD='...' \
npm run e2e
```

## 3) Backups and restore checks

The `backup` service in `docker-compose.yml`:
- creates a backup every 24h in `./backups`
- keeps backups for `BACKUP_RETENTION_DAYS` (default 14)
- runs restore smoke-check on day 1 of each month

Manual backup:

```bash
docker compose exec app /app/scripts/backup-db.sh
```

Manual restore smoke-check:

```bash
docker compose exec app /app/scripts/restore-smoke-check.sh
```

## 4) Monitoring

Endpoints:
- `GET /api/health/live` (liveness)
- `GET /api/health` (readiness + DB ping + version)
- `GET /api/admin/notification-deliveries?limit=200` (admin delivery log for push/email notifications)

Manual smoke:

```bash
./scripts/monitor-smoke.sh https://tasks.serveur.studio-n.fr
```

Inspect notification delivery pipeline (admin only):

```bash
curl -s "https://tasks.serveur.studio-n.fr/api/admin/notification-deliveries?limit=200" \
  -H "Cookie: <session-cookie>"
```

## 5) Versioning and changelog

- Keep release entries in `CHANGELOG.md`
- Release tags format: `vYYYY-MM-DD-N`
- Always push two tags on Docker Hub:
  - versioned tag (`vYYYY-MM-DD-N`)
  - `latest`
