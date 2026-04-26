# FortDefend — Project Roadmap & Status

## What's Built and Working
- Login/signup with 2FA
- Windows agent v1.0.2 — auto-update working
- 3 Windows PCs enrolled: Grandma, CarolePC, AndreTablet
- CPU/RAM/Disk showing in devices table
- Software Manager with 1150+ apps detected
- Devices page with density toggle, row height slider, pagination
- Settings page with Groups, DynaGroups, MSP tabs
- Firebase connected (fortdefend-93087)
- Android app working — no crash — enrolling devices
- Android heartbeat endpoint working
- BrowserStack set up for testing
- Delete device working
- Agent auto-update working
- All migrations up to 032
- Security hardening — helmet, rate limiting, input validation

## Tech Stack
- Backend: Node.js/Express, PostgreSQL/Knex, Railway
- Frontend: React/Vite/TailwindCSS
- Agent: Node.js + pkg (Windows EXE)
- Android: Expo/React Native (FortDefendV2)
- Domain: fortdefend.com (GoDaddy)
- Email: Resend (noreply@fortdefend.com)
- Repo: github.com/Green-Apple-Tech/FortDefend
- Android repo: ~/Documents/FortDefendMobile/FortDefendV2
- Expo account: fortdefend / fortdefendapp@gmail.com
- BrowserStack: set up and paid

## Key IDs
- Org ID: 1e0934d8-f5ab-4b78-8a99-fab9426cf253
- Firebase project: fortdefend-93087
- Expo project ID: 5ae6302c-c074-4963-a0e2-db11eefa0f77
- Android package: com.fortdefend.app

## Data Collection Strategy
| Platform | Method |
|---|---|
| Windows | osquery + WMI |
| Mac | osquery + system_profiler |
| Android | Android Enterprise APIs |
| Chromebook | Google Admin API + Android app |
| iOS | Apple MDM via Intune/Google |

## Architecture
- 30-second heartbeat (minimal payload)
- Full inventory every 15 minutes
- Commands returned in heartbeat response
- FCM for Android push notifications

## Known Issues
- Android device name shows as "Android Device" — needs real device name
- Chromebook — Android app installed but needs testing
- ANDRETABLET — Windows PC with wrong name, ignore
- Certum code signing cert purchased — arriving by mail
- CPU shows 0% on some devices — WMI timing issue

## Roadmap

### Week 1-2
- [ ] Android proper device names
- [ ] Google Play submission ($25)
- [ ] Android Enterprise basic enrollment
- [ ] BYOD Work Profile (Android)
- [ ] Per-group QR code enrollment
- [ ] Device detail page (Addigy-style)
- [ ] Chromebook — test Android app
- [ ] Google Admin API for Chromebook fleet

### Week 3-4
- [ ] osquery integration — Windows agent
- [ ] osquery integration — Mac agent
- [ ] Mac agent (.pkg installer)
- [ ] Stripe billing wired up
- [ ] Code signing cert + sign Windows agent
- [ ] Push notifications (FCM)
- [ ] Android Enterprise full device data

### Week 5-6
- [ ] BYOD Work Profile fully polished
- [ ] BYOD Managed Browser (Chromebook)
- [ ] Linux agent for Chromebook (advanced)
- [ ] Android kiosk/MDM mode (company owned)
- [ ] Patch management core feature
- [ ] iOS via Intune/Google MDM

### Week 7-8
- [ ] MSP client portal
- [ ] Reports page
- [ ] Compliance scoring using osquery
- [ ] Alert system polished
- [ ] Security audit/pen test

### Week 9-10
- [ ] Beta testing with real customers
- [ ] Bug fixes
- [ ] Marketing site polish
- [ ] Play Store live
- [ ] First paying customer

## MSP Model
- MSP pays one Stripe bill based on total device count
- Optional client portal access per client (read-only)
- Groups = organize devices within an org
- MSP Clients = separate orgs managed for other companies

## Security Status
- HTTPS via Railway ✅
- JWT auth ✅
- Rate limiting ✅
- Helmet.js ✅
- Input validation ✅ partial
- Code signing ⏳ cert arriving
- Encrypted agent token ❌ roadmap
- Pen test ❌ roadmap

## Key Commands

### Reinstall Windows agent
```powershell
$url = 'https://app.fortdefend.com/api/agent/installer?org=1e0934d8-f5ab-4b78-8a99-fab9426cf253'; iex (irm $url)
```

### Check device versions
```bash
cd ~/Documents/FortDefend && node -e "require('dotenv').config(); const knex = require('knex')({ client: 'pg', connection: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); knex('devices').select('name','agent_version','last_seen').then(r => { console.log(JSON.stringify(r,null,2)); knex.destroy(); });"
```

### Test Android heartbeat
```bash
curl -s -X POST https://app.fortdefend.com/api/android/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"orgToken":"1e0934d8-f5ab-4b78-8a99-fab9426cf253","deviceName":"Test","os":"Android","source":"android","agentVersion":"1.0.0"}'
```

### Build Android APK
```bash
cd ~/Documents/FortDefendMobile/FortDefendV2 && eas build --platform android --profile preview
```

### Run migrations
```bash
cd ~/Documents/FortDefend && npm run migrate
```
