# FortDefend Chrome Extension

## Development
1. Open Chrome and go to chrome://extensions
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this chrome-extension/ folder
5. Extension appears in Chrome toolbar

## Enrollment
Users enroll by either:
- Visiting the enrollment URL: https://app.fortdefend.com/enroll?token=XXX&type=chromebook
- Entering the token manually in the extension popup

## Production deployment
1. Zip the chrome-extension/ folder
2. Upload to Chrome Web Store Developer Dashboard
3. For managed Chromebooks: deploy via Google Admin > Devices > Chrome > Apps & extensions

## What it checks
- ChromeOS version (reported to backend for comparison against latest)
- Installed extensions — flags non-Web-Store extensions
- Storage space
- CPU and memory health
- Reports all data to FortDefend API every 4 hours
