# FortDefend Patch Manager

Windows patching platform: PowerShell agent + Node/Express API + React dashboard.

## Structure

```
agent/                    FortDefendAgent.ps1, Install-FortDefendAgent.ps1, manifests.json
src/routes/patchManager.js  Integrated API at /api/patch/*
client/src/pages/patch/   Patch Manager dashboard pages
Migrations/036_*          Patch Manager tables
```

The standalone `server/` folder is legacy scaffolding; production uses the main Express app in `src/server.js`.

## Backend setup

Patch Manager runs inside the main FortDefend API (`src/server.js`). Apply migration `036_create_patch_manager.js` with your normal Knex workflow, then start the main server.

`.env.example`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fortdefend
JWT_SECRET=change-me
PORT=3001
```

PostgreSQL (once):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Frontend setup

```bash
cd client
npm install
npm run dev
```

Dev JWT (dashboard API calls):

```bash
curl -X POST http://localhost:3001/api/auth/dev-token
# paste token in browser console:
# localStorage.setItem('fortdefend_jwt', '<token>')
```

## Agent install (Windows VM required)

```powershell
cd agent
.\Install-FortDefendAgent.ps1 -ApiUrl "https://app.fortdefend.com" -OrgToken "<your-org-uuid>"
```

This creates `C:\ProgramData\FortDefend\`, registers the device, stores `config.json`, and schedules daily 2am runs.

Manual run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ProgramData\FortDefend\FortDefendAgent.ps1
```

## API routes

| Route | Auth | Purpose |
|-------|------|---------|
| POST /api/patch/agent/register | none | Register Windows device, get patch token |
| POST /api/patch/agent/report | X-Device-Token | Agent patch results |
| GET /api/patch/agent/manifests | X-Device-Token | Manifest catalog |
| GET /api/patch/agent/policies/:deviceId | X-Device-Token | Device policies |
| GET /api/patch/overview | JWT | Dashboard summary |
| GET /api/patch/history | JWT | Patch history |
| GET /api/patch/devices | JWT | Windows devices for patch manager |
| GET /api/patch/devices/:id | JWT | Device detail |
| PATCH /api/patch/devices/:id/policies | JWT | Update policies |
| GET/POST/PATCH /api/patch/manifests | JWT | Catalog admin |

## Before production

1. Spot-check 4–5 `downloadURL` entries in `agent/manifests.json` (vendor URLs drift).
2. Verify `expectedPublisher` strings on a real Windows host.
3. Confirm registry paths match installed app uninstall keys.
4. Wire agent `API_URL` to your production FortDefend server.
