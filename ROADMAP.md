# FortDefend — Project Roadmap & Status

## Project Summary (Current)
- FortDefend is live on Railway with JWT auth, 2FA, core device inventory, alerting, and script execution flows.
- Backend hardening is in place (Helmet, API rate limits, heartbeat validation, scoped delete/device routes).
- Frontend has been stabilized back to the original FortDefend UI (pre-v0 sync) to avoid Tailwind build regressions.
- Device detail loading regressions were fixed by aligning requests to `/api/integrations/devices/:id` endpoints and adding timeout/error handling.
- Software view was simplified to prioritize third-party apps by default with an Advanced toggle for full/system software.
- CI/CD is active (GitHub Actions + Railway deploys) with Android build automation and BrowserStack integration in progress.

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
- Integrations API routes for device detail/apps/script history
- Device detail page no longer hangs on infinite loading

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
- Code signing setup still pending end-to-end verification
- CPU shows 0% on some devices — WMI timing issue
- Some device detail sections still display raw enterprise patch/update entries unless filtered in UI
- BrowserStack upload step depends on secrets being present in GitHub repo settings

## Roadmap

### Week 1-2
- [ ] Android proper device names
- [ ] Google Play submission ($25)
- [ ] Android Enterprise basic enrollment
- [ ] BYOD Work Profile (Android)
- [ ] Per-group QR code enrollment
- [x] Device detail page baseline redesign + endpoint alignment
- [ ] Device detail polish (performance, tab UX, richer visuals)
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
- [ ] Reporting reliability improvements for CPU/memory telemetry

### Week 5-6
- [ ] BYOD Work Profile fully polished
- [ ] BYOD Managed Browser (Chromebook)
- [ ] Linux agent for Chromebook (advanced)
- [ ] Android kiosk/MDM mode (company owned)
- [ ] Patch management core feature
- [ ] iOS via Intune/Google MDM

### Week 7-8
- [ ] MSP client portal (read-only client access)
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
- Input validation ✅ partial (heartbeat routes done, continue expanding)
- Code signing ⏳ pending full release pipeline
- Encrypted agent token ❌ roadmap
- Pen test ❌ roadmap

## Remote Control

### Windows/Mac/Linux — MeshCentral
- Tool: MeshCentral (open source, Node.js, HTML5)
- GitHub: github.com/Ylianst/MeshCentral
- Self-host on Railway as separate service
- FortDefend agent installs MeshCentral agent alongside
- Device detail page shows "Remote Control" button
- Opens full HTML5 remote desktop in browser
- Status: ⏳ roadmap

### Android — Screen View (read-only)
Options:
- **scrcpy** — mirror Android screen over ADB (USB only, not remote)
- **Google MDM Screenshot** — via Android Enterprise API, take screenshot remotely
- **FCM command** → Android app captures screenshot → uploads to FortDefend server → displays in dashboard
- **TeamViewer SDK** — embed in Android app for full remote control (paid)

Recommended approach for Android:
1. FortDefend sends FCM push to Android device
2. Android app takes screenshot
3. Uploads to FortDefend API
4. Dashboard shows latest screenshot with timestamp
5. Refresh button to request new screenshot
6. Delayed by ~5-10 seconds but works over any network
- Status: ⏳ roadmap

### Chromebook
- Chrome extension can capture tab screenshots via chrome.tabs.captureVisibleTab API
- Full remote via Chrome Remote Desktop API (Google account required)
- Status: ⏳ roadmap

### iOS
- Not possible without MDM supervision + Apple Remote Desktop
- Via Intune: limited screen capture in managed apps only
- Status: ⏳ future (post MDM integration)

## AI & Automation Stack

### Currently Set Up
- **Cursor** — AI code editor (primary development tool)
- ✅ **GitHub Actions** — set up and running
- ✅ **Maestro** — installed and test files created
- ✅ **v0.dev** — signed in and ready
- ✅ **Java** — installed (OpenJDK 26)
- ✅ **BrowserStack** — paid plan active
- ✅ **EAS** — builds working
- **Railway** — Auto-deploys on every git push

### GitHub Actions Workflows
- android.yml — Builds Android APK on every push to main
- deploy.yml — Checks backend syntax on every push
- BrowserStack auto-upload via GitHub Actions ✅
- Need to add BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY to GitHub secrets

### To Add Next
- **Fastlane** — Automate Google Play Store uploads
- **Automated smoke test gate** — fail deploy on broken device detail/device list paths

### Testing Strategy
| What | Tool | Status |
|---|---|---|
| Android enrollment flow | Maestro | ✅ basic files created |
| Android heartbeat | Maestro | ✅ basic files created |
| Backend API | GitHub Actions | ✅ set up |
| Real device testing | BrowserStack | ✅ set up |
| Auto APK build | EAS + GitHub Actions | ✅ set up |

### Time Savings
- GitHub Actions: ~30-60 min/day saved
- Maestro: ~1-2 hours/day saved (once set up)
- v0.dev: ~1-2 hours/day saved for UI work
- BrowserStack: eliminates need for physical test devices

### v0.dev Usage
- Go to v0.dev
- Screenshot any FortDefend page
- Say "redesign this to look more like Kandji"
- Get React component instantly
- Paste into Cursor for integration

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
