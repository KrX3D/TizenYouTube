# TizenYouTube (Starter)

Minimal Samsung Tizen TV web app starter for Tizen 5.5+.

## Quick debug notes

- `26101` is for **SDB** between PC and TV.
- Your app should **not** use `localhost:26101` for API/logging.
- For app log forwarding, use your PC/server LAN IP (for example `http://192.168.1.10:3030/tv-log`).

## Log collection

### A) `sdb dlog` to file

```powershell
pwsh -File .\scripts_collect_logs.ps1 -TvIp 192.168.1.50
```

### B) Local HTTP receiver (PowerShell)

```powershell
pwsh -File .\scripts_log_receiver.ps1 -Port 3030
```

Set app endpoint to `http://<PC_IP>:3030/tv-log` and use **Send test log to server**.
The app also sends a `startup` event automatically when endpoint is set.

## CI secrets

- `TIZEN_AUTHOR_KEY_B64`
- `TIZEN_AUTHOR_KEY_PW`

## Release behavior

- Push to `main`: workflow bumps patch version in `app/config.xml`, commits it, and creates/pushes a new `v*.*.*` tag.
- Tag push (`v*.*.*`): workflow builds `.wgt`, uploads artifact, and publishes GitHub Release.
- `workflow_dispatch`: build manually; set `release_version` + `publish_release=true` to publish release.

## Icons

- Runtime icon file is `app/icon.png` (from `config.xml`).
- Put your source icon at `assets/icons/icon-512.png`.
- Optional alt: `assets/icons/icon-512_alternative.png`.
- CI copies `assets/icons/icon-512.png` to `app/icon.png`, or generates a placeholder if missing.
