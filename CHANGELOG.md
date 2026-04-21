# Changelog

All notable changes to this project will be documented in this file.

## [v2026-04-09-1]

### Added
- Final i18n hardening pass and tooling:
  - `scripts/audit-i18n.mjs`
  - `npm run audit:i18n`
  - `npm run release:check`
  - `npm run lint:quality`
- Health and readiness endpoints:
  - `GET /api/health/live`
  - `GET /api/health`
- E2E smoke testing foundation with Playwright:
  - `playwright.config.ts`
  - `tests/e2e/smoke.spec.ts`
  - support for external target via `E2E_BASE_URL`
- Ops scripts for reliability:
  - `scripts/backup-db.sh` (daily backup)
  - `scripts/restore-smoke-check.sh` (restore validation)
  - `scripts/monitor-smoke.sh` (health smoke check)
  - `scripts/release-build-push.sh` (versioned docker release)

### Changed
- Docker workflow now supports explicit version injection via `APP_VERSION` build arg and uses `NEXT_PUBLIC_APP_VERSION` at runtime display.

## [v2026-04-06-5]
- Previous release (existing in production before this changelog bootstrap).
