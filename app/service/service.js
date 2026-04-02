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
        // Delete existing file safely
        try {
          dir.deleteFile(dir.toURI() + filename);
        } catch (_) {
          try { dir.deleteFile(dir.toURI() + '/' + filename); } catch (_2) {}
        }

        var file = dir.createFile(filename);
        var reader = new FileReader();
        reader.onload = function () {
          file.openStream('w', function (stream) {
            try {
              stream.writeBytes(Array.prototype.slice.call(new Uint8Array(reader.result)));
              stream.close();

              // Build proper file:// URI — dir.toURI() already ends with '/' on some firmware
              var baseUri = dir.toURI();
              if (baseUri.charAt(baseUri.length - 1) !== '/') baseUri += '/';
              var fileUri = baseUri + filename;

              log('INFO', 'File saved', { uri: fileUri, bytes: blob.size });
              resolve(fileUri);
            } catch (e) { reject(e); }
          }, function (e) { reject(new Error('openStream failed: ' + e.message)); }, 'UTF-8');
        };
        reader.onerror = function () { reject(new Error('FileReader error')); };
        reader.readAsArrayBuffer(blob);
      }, function (e) { reject(new Error('filesystem.resolve failed: ' + e.message)); });
    });
  }

  function installWgt(fileUri) {
    return new Promise(function (resolve, reject) {
      log('INFO', 'Launching system installer', { uri: fileUri });
      try {
        // operation/install delegates to Samsung system package manager
        // No packagemanager.install privilege required — same as TizenBrewInstaller TV app
        var appControl = new tizen.ApplicationControl(
          'http://tizen.org/appcontrol/operation/install',
          fileUri,
          'application/widget',
          null,
          []
        );
        tizen.application.launchAppControl(
          appControl,
          null,
          function () {
            log('INFO', 'System installer launched — installation in progress');
            resolve();
          },
          function (e) {
            var msg = (e && e.message) ? e.message : String(e);
            log('ERROR', 'System installer launchAppControl failed', { error: msg });
            reject(new Error(msg));
          }
        );
      } catch (e) {
        log('ERROR', 'installWgt threw', { error: e.message });
        reject(e);
      }
    });
  }

  async function installFromUrl(url) {
    if (!url || url === '__ping__') {
      log('INFO', 'Ping — service is alive');
      return;
    }
    log('INFO', 'installFromUrl start', { url: url });
    try {
      log('INFO', 'Fetching WGT…');
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var blob = await res.blob();
      log('INFO', 'WGT downloaded', { bytes: blob.size });

      var fileUri = await saveBlob(blob, 'TizenYouTube_update.wgt');
      log('INFO', 'Saved, launching installer', { uri: fileUri });

      await installWgt(fileUri);
      log('INFO', 'Installer launched successfully');
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
      if (!asset) throw new Error('No .wgt asset in release');
      log('INFO', 'Asset found', { name: asset.name, url: asset.browser_download_url });
      await installFromUrl(asset.browser_download_url);
    } catch (e) {
      log('ERROR', 'installLatestFromGitHub failed', { error: e.message });
    }
  }

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
          log('INFO', 'Ping via tytUrl — alive');
        } else {
          log('WARN', 'Unknown action', { action: ctrl.tytAction, url: ctrl.tytUrl });
        }
    }
  } catch (e) {
    console.log(TAG + '[FATAL] ' + e.message);
  }
})();