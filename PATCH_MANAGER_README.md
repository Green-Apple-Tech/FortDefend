# FortDefend Patch Manager

Windows patching platform: PowerShell agent + Node/Express API + React dashboard.

## Structure

```
agent/          FortDefendAgent.ps1, Install-FortDefendAgent.ps1, manifests.json
server/         Express + Knex + PostgreSQL
client/         React + Vite + Tailwind Patch Manager UI
```

## Backend setup

```bash
cd server
cp .env.example .env   # create from example below
npm install
npm run migrate
npm start
```

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
.\Install-FortDefendAgent.ps1 -ApiUrl "https://app.fortdefend.com"
```

This creates `C:\ProgramData\FortDefend\`, registers the device, stores `config.json`, and schedules daily 2am runs.

Manual run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ProgramData\FortDefend\FortDefendAgent.ps1
```

## API routes

| Route | Auth | Purpose |
|-------|------|---------|
| POST /api/agent/register | none | Register device, get token |
| POST /api/agent/report | X-Device-Token | Agent patch results |
| GET /api/agent/manifests | X-Device-Token | Manifest catalog |
| GET /api/agent/policies/:deviceId | X-Device-Token | Device policies |
| GET /api/devices | JWT | List devices |
| GET /api/devices/:id | JWT | Device detail |
| PATCH /api/devices/:id/policies | JWT | Update policies |
| GET/POST/PATCH /api/manifests | JWT | Catalog admin |

## Before production

1. Spot-check 4–5 `downloadURL` entries in `agent/manifests.json` (vendor URLs drift).
2. Verify `expectedPublisher` strings on a real Windows host.
3. Confirm registry paths match installed app uninstall keys.
4. Wire agent `API_URL` to your production FortDefend server.
