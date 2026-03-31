# TizenYouTube (Starter)

A minimal Samsung Tizen TV web app starter that runs on **Tizen 5.5+** and helps you verify:

- app launch,
- remote debug logs,
- first YouTube Data API integration using `playlistItems.list`.

## Is YouTube API v3 the newest?

For the public **YouTube Data API**, `v3` is still the current production version. This starter uses:

- `GET https://www.googleapis.com/youtube/v3/playlistItems`

Important: this API does **not** expose everything the official YouTube TV app can do (private/internal APIs, account UX, DRM player flows, recommendation engine behavior, etc.).

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

### Option B: Forward logs to your own server

From a web app, direct UDP syslog is usually not available due to sandbox/network limitations.
Use HTTP(S) ingestion instead (e.g., tiny local endpoint) and post logs from JS.

## GitHub Action secrets

The included workflow expects:

- `TIZEN_AUTHOR_KEY_B64` — Base64-encoded author certificate (`.p12`)
- `TIZEN_AUTHOR_KEY_PW` — password for that certificate

Without these secrets, build can run but signed packaging step will fail.

The workflow uses an explicit profile with both **author** and **distributor** entries, which resolves the common `Both an author and a first distributor must be required` packaging error.

## License

This repository uses the **MIT License**, which is a good default for starter templates and sample apps.
If you want stronger copyleft requirements, switch to GPL-3.0.
