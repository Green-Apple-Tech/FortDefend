# FortDefend Roadmap

FortDefend is now focused on Windows PC patch management with one combined endpoint agent.

## Current Direction

- One Windows agent for heartbeat, monitoring, scripting, patching, and reboot coordination.
- Patch Manager is the primary product surface.
- Legacy non-Windows enrollment paths are removed from the active product.
- Optional Intune integration remains for Windows inventory, sync, and reboot actions.

## Near-Term Priorities

1. Harden the combined Windows agent installer and auto-update path.
2. Expand patch policy controls: maintenance windows, deferrals, per-group rules, and failure handling.
3. Add OS update orchestration for Windows Update.
4. Improve reboot coordination with user activity, unsaved-work detection, and reboot deadlines.
5. Add smart pre-patch workflows for closing or saving apps before patching.

## Later

- AI-assisted endpoint maintenance with whitelisted actions.
- MSP client-site rollups and white-label patch reports.
- Richer patch catalog metadata and vendor update intelligence.
