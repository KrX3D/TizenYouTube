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

From a web app, direct UDP syslog is usually not available due to sandbox/network limitations.
A practical replacement is posting JSON logs to an HTTP endpoint you control.

Minimal Node receiver example:

```js
import express from 'express';
import fs from 'node:fs';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/tv-log', (req, res) => {
  fs.appendFileSync('tv.log', JSON.stringify(req.body) + '\n');
  res.status(204).end();
});

app.listen(3030, () => console.log('Log receiver on :3030'));
```

Then from your app you can `fetch('http://<PC_IP>:3030/tv-log', { method: 'POST', body: ... })`.

## GitHub Action secrets

The included workflow expects:

- `TIZEN_AUTHOR_KEY_B64` — Base64-encoded author certificate (`.p12`)
- `TIZEN_AUTHOR_KEY_PW` — password for that certificate

Without these secrets, build can run but signed packaging step will fail.

Releases are created automatically on `v*.*.*` tag pushes, or manually via `workflow_dispatch` by setting `release_version` and `publish_release=true`.

The workflow uses an explicit profile with both **author** and **distributor** entries, which resolves the common `Both an author and a first distributor must be required` packaging error.

## Icons

Yes, you should add your own icon for production.

- Recommended: at least **117x117 PNG** for Tizen app icon usage.
- Practical starter set: `117x117`, `256x256`, and `512x512` PNG (keep source in `/assets/icons`).
- In this repo, CI currently generates a placeholder `app/icon.png` so builds always work.

## License

This repository uses the **MIT License**, which is a good default for starter templates and sample apps.
If you want stronger copyleft requirements, switch to GPL-3.0.
