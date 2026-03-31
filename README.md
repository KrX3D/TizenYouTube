# TizenYouTube (Starter)

A minimal Samsung Tizen TV web app starter that runs on **Tizen 5.5+** and helps you verify:

- app launch,
- remote debug logs,
- first YouTube Data API integration using `playlistItems.list`.

## Project structure

- `app/` — Tizen Web App source (`config.xml`, `index.html`, `main.js`)
- `.github/workflows/build-wgt.yml` — GitHub Action to build a signed `.wgt`
- No binary assets are committed; CI generates a tiny placeholder `icon.png` during build.

## Local development

1. Install Tizen Studio CLI and TV extensions.
2. Ensure `config.xml` has `required_version="5.5"`.
3. Build:

```bash
cd app
tizen build-web
```

4. Package (after cert profile is configured):

```bash
tizen package -t wgt -s <profile-name> -- ./
```

## Debug logs from TV to PC

`26101` is used by **SDB (debug tooling)** between your PC and TV.
Your app does **not** connect to port `26101`, and you should **not** set app host to `localhost` for this.
For app HTTP logging, use your PC LAN IP (example `http://192.168.1.10:3030/tv-log`).

### Option A: `sdb dlog` (recommended)

1. Enable developer mode on TV.
2. Connect TV and PC to same network.
3. On PC:

```bash
sdb connect <TV_IP>:26101
sdb devices
sdb dlog | grep TizenYouTube
```

4. Launch app and press **Emit test debug log**.

### PowerShell helper (save `sdb dlog` to file)

Use `scripts_collect_logs.ps1` from your PC:

```powershell
pwsh -File .\scripts_collect_logs.ps1 -TvIp 192.168.1.50
```

It will:
- connect to TV,
- print devices,
- stream `sdb dlog` filtered for `TizenYouTube`,
- save logs next to the script as `tizen_dlog_yyyyMMdd_HHmmss.log`.

### Option B: Forward logs to your own server (HTTP)

Start a local receiver on your PC:

```powershell
pwsh -File .\scripts_log_receiver.ps1 -Port 3030
```

Then in TV app set endpoint to `http://<PC_IP>:3030/tv-log` and press **Send test log to server**.
The app also sends a `startup` event automatically when endpoint is set.

## GitHub Action secrets

The included workflow expects:

- `TIZEN_AUTHOR_KEY_B64` — Base64-encoded author certificate (`.p12`)
- `TIZEN_AUTHOR_KEY_PW` — password for that certificate

Without these secrets, build can run but signed packaging step will fail.

Releases are created automatically on `v*.*.*` tag pushes, or manually via `workflow_dispatch` by setting `release_version` and `publish_release=true`.

The workflow uses an explicit profile with both **author** and **distributor** entries, which resolves the common `Both an author and a first distributor must be required` packaging error.

## Icons

For this app, Tizen currently reads the icon from:

- `app/config.xml` → `<icon src="icon.png"/>`
- File path must be: `app/icon.png`

So the required runtime file name is **`icon.png`** in the `app/` root.

Recommended workflow:
- Keep your source design files in `assets/icons/` (example: `assets/icons/icon-512.png`).
- During CI/local build, copy/resize to `app/icon.png`.
- Use square PNG; `512x512` source is ideal, and output `app/icon.png` can be `117x117` or higher.
