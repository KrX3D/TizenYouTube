# TizenYouTube (Starter)

Minimal Samsung Tizen TV web app starter for Tizen 5.5+.
 
## Quick debug notes

- `26101` is for **SDB** between PC and TV.
- Your app should **not** use `localhost:26101` for API/logging.
- For app log forwarding, use your PC/server LAN IP (for example `http://192.168.1.10:3030/tv-log`).
- If another project (like TizenBrew) uses `localhost:26101`, that is specific to that project's internal flow.

## Log collection

```powershell
pwsh -File .\scripts_collect_logs.ps1 -TvIp 192.168.1.50
pwsh -File .\scripts_log_receiver.ps1 -Port 3030
```

Set app endpoint to `http://<PC_IP>:3030/tv-log` and use **Send test log to server**.

## CI secrets

- `TIZEN_AUTHOR_KEY_B64`
- `TIZEN_AUTHOR_KEY_PW`

## Generate signing key (one-time)

You can generate a reusable author key with this manual workflow:

- Workflow: **Generate Tizen Author Key** (`.github/workflows/generate-author-key.yml`)
- It outputs an artifact containing:
  - `author.p12`
  - `TIZEN_AUTHOR_KEY_B64.txt`

Then set repo secrets:
- `TIZEN_AUTHOR_KEY_B64` = contents of `TIZEN_AUTHOR_KEY_B64.txt`
- `TIZEN_AUTHOR_KEY_PW` = password you entered in the workflow

## Release behavior

- Push to `main`: creates next semantic tag (`vX.Y.Z`), builds WGT, and publishes release.
- Tag push (`v*.*.*`): builds `.wgt`, uploads artifact, and publishes GitHub Release.
- `workflow_dispatch`: build manually; set `release_version` + `publish_release=true` to publish release.

## Icons

- Runtime icon file is `app/icon.png` (from `config.xml`).
- Put your source icon at `assets/icons/icon-512.png`.
- Optional alt: `assets/icons/icon-512_alternative.png`.
- CI uses `assets/icons/icon-512.png` first, then `.github/assets/icon.png`, otherwise generates a placeholder.
