# Rapor Digital Pesantren (RDP)

Web application for pesantren student/teacher records, score entry, period locking, grade ledgers, and printable Arabic/Indonesian report cards (Rapor).

## Architecture

- **Production (Cloudflare Workers + D1 + Static Assets):**
  - Entry point: `worker.js`
  - Static frontend & vendor bundles: `public/` (`public/rdp_pesantren.html`, `public/vendor/`, `public/assets/`)
  - Database: Cloudflare D1 (`rdp-db`, configured in `wrangler.jsonc`)
- **Local Fallback (Node.js + SQLite):**
  - HTTP server: `server.js` (serves `rdp_pesantren.html` and local assets)
  - SQLite layer: `db.js` (`node:sqlite` `DatabaseSync`, default `rdp.db`)

## Local Development

Requirements: Node.js 22+ (tested on Node 24 with built-in `node:sqlite`).

```powershell
npm install
npm start
```

By default the local server listens on `http://localhost:3000`.

### Environment Variables (`server.js` / `db.js`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listening port |
| `HOST` | `0.0.0.0` | Bind address |
| `DB_PATH` | `./rdp.db` | SQLite database file path |
| `TRUST_PROXY` | unset | Set to `1` or `true` behind a reverse proxy to honor `X-Forwarded-Proto` / `CF-Connecting-IP` |

## Cloudflare Workers Deployment

`rdp_pesantren.html` (root, used by `server.js`) and `public/rdp_pesantren.html` (served by Workers Assets) must be kept identical before deploying:

```powershell
Copy-Item .\rdp_pesantren.html .\public\rdp_pesantren.html -Force
npx wrangler deploy --dry-run
npx wrangler deploy
```

## Monitoring & Health Check

- **Health endpoint:** `GET /api/health`
  - Executes `SELECT 1 AS ok` against D1/SQLite and returns HTTP `200` (`{ "ok": true, "db": "ok", "timestamp": "..." }`), or HTTP `503` (`{ "ok": false, "db": "error" }`) on database error.
- **Public branding endpoint:** `GET /api/public/branding`
- **Cloudflare Observability:** Enabled in `wrangler.jsonc` (`"observability": { "enabled": true }`).

## Database Backup, Restore & Emergency Rollback

### Backup D1 before risky migrations
```powershell
npx wrangler d1 export rdp-db --remote --output=backup_d1.sql
```
Admin users can also download a D1-compatible SQL dump directly in the app (**Backup Restore** → `GET /api/backup/db`).

### Restore D1 from SQL dump
```powershell
npx wrangler d1 execute rdp-db --remote --yes --file=backup_d1.sql
```

### Emergency Worker Rollback
List recent deployments/versions and revert instantly (< 1 minute) if a release introduces a regression:
```powershell
npx wrangler deployments list
npx wrangler rollback <VERSION_ID>
```

## Initial Default Passwords

- Bulk-imported **students** without an existing user account receive username = `NISN` (or `NIS` fallback) and initial password `mtswihebat`.
- Bulk-imported **teachers** with an empty password or `guru123` receive username = `NUPTK` and initial password `guru123`.
- Users should change default passwords immediately after first login via **Ganti Password** (`PUT /api/me/password`).
