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
              log('INFO', 'File saved', { path: 'downloads/' + filename });
              resolve('downloads/' + filename);
            } catch (e) { reject(e); }
          }, function (e) { reject(e); }, 'UTF-8');
        };
        reader.onerror = function () { reject(new Error('FileReader error')); };
        reader.readAsArrayBuffer(blob);
      }, function (e) { reject(new Error('filesystem.resolve failed: ' + e.message)); });
    });
  }

  function packageInstall(tizenPath) {
    return new Promise(function (resolve, reject) {
      log('INFO', 'Calling tizen.package.install', { path: tizenPath });
      try {
        tizen.package.install(tizenPath, {
          onprogress: function (id, pct) { log('INFO', 'Install progress', { id: id, pct: pct }); },
          oncomplete: function (id)      { log('INFO', 'Install complete', { id: id }); resolve(id); },
          onerror:    function (e, id)   {
            log('ERROR', 'Install error', { id: id, error: e ? e.message || String(e) : 'unknown' });
            reject(new Error('pkg install error: ' + (e ? e.message || String(e) : 'unknown')));
          }
        });
      } catch (e) {
        log('ERROR', 'tizen.package.install threw', { error: e.message });
        reject(e);
      }
    });
  }

  async function installFromUrl(url) {
    if (!url || url === '__ping__') {
      log('INFO', 'Ping received — service is alive');
      return;
    }
    log('INFO', 'installFromUrl start', { url: url });
    try {
      log('INFO', 'Fetching WGT', { url: url });
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching WGT');
      var blob = await res.blob();
      log('INFO', 'WGT downloaded', { bytes: blob.size });
      var path = await saveBlob(blob, 'TizenYouTube_update.wgt');
      await packageInstall(path);
      log('INFO', 'installFromUrl complete');
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

  // ── Entry point — wrap everything so crashes are visible in sdb dlog ──────
  try {
    var ctrl = getCtrl();
    log('INFO', 'Service started', { action: ctrl.tytAction || '(none)', keys: Object.keys(ctrl) });

    switch (ctrl.tytAction) {
      case 'installFromUrl':
        if (ctrl.tytUrl) {
          installFromUrl(ctrl.tytUrl);
        } else {
          log('ERROR', 'installFromUrl called without tytUrl');
        }
        break;

      case 'installLatestFromGitHub':
        var payload = {};
        try { payload = ctrl.tytPayload ? JSON.parse(ctrl.tytPayload) : {}; } catch (_) {}
        installLatestFromGitHub(payload.repo);
        break;

      case '__ping__':
        log('INFO', 'Ping — service alive');
        break;

      default:
        // Also handle the ping sent via installFromUrl('__ping__')
        if (ctrl.tytUrl === '__ping__') {
          log('INFO', 'Ping via tytUrl — service alive');
        } else {
          log('WARN', 'Unknown or missing action', { action: ctrl.tytAction, url: ctrl.tytUrl });
        }
    }
  } catch (e) {
    console.log(TAG + '[FATAL] Unhandled exception in service: ' + e.message);
  }
})();