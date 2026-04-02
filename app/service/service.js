(function () {
  'use strict';

  var DEFAULT_REPO = 'KrX3D/TizenYouTube';
  var TAG = '[TYT-SVC]';

  function log(level, msg, data) {
    console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
  }

  function getCtrl() {
    try {
      var req = tizen.application.getCurrentApplication().getRequestedAppControl();
      if (!req || !req.appControl) return {};
      var out = {};
      (req.appControl.data || []).forEach(function (item) {
        if (item.value && item.value.length) out[item.key] = item.value[0];
      });
      return out;
    } catch (e) {
      log('ERROR', 'getRequestedAppControl failed', { error: e.message });
      return {};
    }
  }

  // ── Save blob to downloads folder ─────────────────────────────────────────
  function saveBlob(blob, filename) {
    return new Promise(function (resolve, reject) {
      tizen.filesystem.resolve('downloads', function (dir) {
        try { dir.deleteFile(dir.toURI() + '/' + filename); } catch (_) {}
        var file   = dir.createFile(filename);
        var reader = new FileReader();
        reader.onload = function () {
          file.openStream('w', function (stream) {
            try {
              stream.writeBytes(Array.prototype.slice.call(new Uint8Array(reader.result)));
              stream.close();
              // Return the virtual path tizen.filesystem understands
              var tizenPath = dir.toURI() + '/' + filename;
              log('INFO', 'File saved', { path: tizenPath });
              resolve(tizenPath);
            } catch (e) { reject(e); }
          }, function (e) { reject(e); }, 'UTF-8');
        };
        reader.onerror = function () { reject(new Error('FileReader error')); };
        reader.readAsArrayBuffer(blob);
      }, function (e) { reject(new Error('filesystem.resolve failed: ' + e.message)); });
    });
  }

  // ── Install WGT via system installer (no partner cert needed) ─────────────
  // Uses launchAppControl with operation/install — delegates to Samsung system
  // package installer which has its own privileges. Same as TizenBrewInstaller.
  function installWgt(fileUri) {
    return new Promise(function (resolve, reject) {
      log('INFO', 'Launching system installer', { uri: fileUri });
      try {
        var appControl = new tizen.ApplicationControl(
          'http://tizen.org/appcontrol/operation/install',
          fileUri
        );
        tizen.application.launchAppControl(
          appControl,
          null,  // null = let system pick the installer
          function () {
            log('INFO', 'System installer launched successfully');
            resolve();
          },
          function (e) {
            log('ERROR', 'launchAppControl for install failed', { error: e ? e.message : 'unknown' });
            reject(new Error('install launchAppControl failed: ' + (e ? e.message : 'unknown')));
          }
        );
      } catch (e) {
        log('ERROR', 'installWgt threw', { error: e.message });
        reject(e);
      }
    });
  }

  // ── Main install flow ─────────────────────────────────────────────────────
  async function installFromUrl(url) {
    if (!url || url === '__ping__') {
      log('INFO', 'Ping — service is alive');
      return;
    }
    log('INFO', 'installFromUrl', { url: url });
    try {
      log('INFO', 'Downloading WGT', { url: url });
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching WGT');
      var blob = await res.blob();
      log('INFO', 'Downloaded', { bytes: blob.size });

      var fileUri = await saveBlob(blob, 'TizenYouTube_update.wgt');
      await installWgt(fileUri);
      log('INFO', 'Install initiated — system installer is running');
    } catch (e) {
      log('ERROR', 'installFromUrl failed', { error: e.message });
    }
  }

  async function installLatestFromGitHub(repo) {
    repo = repo || DEFAULT_REPO;
    log('INFO', 'installLatestFromGitHub', { repo: repo });
    try {
      var res  = await fetch('https://api.github.com/repos/' + repo + '/releases/latest');
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      var asset = (data.assets || []).find(function (a) { return /\.wgt$/i.test(a.name || ''); });
      if (!asset) throw new Error('No .wgt asset in release ' + (data.tag_name || '?'));
      log('INFO', 'Found asset', { name: asset.name, url: asset.browser_download_url });
      await installFromUrl(asset.browser_download_url);
    } catch (e) {
      log('ERROR', 'installLatestFromGitHub failed', { error: e.message });
    }
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  try {
    var ctrl = getCtrl();
    log('INFO', 'Service started', { action: ctrl.tytAction || '(none)' });

    switch (ctrl.tytAction) {
      case 'installFromUrl':
        installFromUrl(ctrl.tytUrl);
        break;
      case 'installLatestFromGitHub':
        var payload = {};
        try { payload = ctrl.tytPayload ? JSON.parse(ctrl.tytPayload) : {}; } catch (_) {}
        installLatestFromGitHub(payload.repo);
        break;
      default:
        if (ctrl.tytUrl === '__ping__') {
          log('INFO', 'Ping via tytUrl — service alive');
        } else {
          log('WARN', 'Unknown action', { action: ctrl.tytAction, url: ctrl.tytUrl });
        }
    }
  } catch (e) {
    console.log(TAG + '[FATAL] ' + e.message);
  }
})();