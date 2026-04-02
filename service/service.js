(function () {
  'use strict';

  // Service runs in isolation — AppIdentity from config.js is NOT available here.
  // Repo identity is duplicated here intentionally as the service is self-contained.
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
    } catch (e) { log('ERROR', 'getRequestedAppControl', { error: e.message }); return {}; }
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
              resolve('downloads/' + filename);
            } catch (e) { reject(e); }
          }, reject, 'UTF-8');
        };
        reader.onerror = function () { reject(new Error('FileReader error')); };
        reader.readAsArrayBuffer(blob);
      }, function (e) { reject(new Error('filesystem: ' + e.message)); });
    });
  }

  function packageInstall(tizenPath) {
    return new Promise(function (resolve, reject) {
      try {
        tizen.package.install(tizenPath, {
          onprogress: function (id, pct) { log('INFO', 'progress', { pct: pct }); },
          oncomplete: function (id)      { log('INFO', 'complete', { id: id }); resolve(id); },
          onerror:    function (e)       { reject(new Error('pkg: ' + (e.message || e))); }
        });
      } catch (e) { reject(e); }
    });
  }

  async function installFromUrl(url) {
    log('INFO', 'installFromUrl', { url: url });
    var res  = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var blob = await res.blob();
    log('INFO', 'downloaded', { bytes: blob.size });
    var path = await saveBlob(blob, 'TizenYouTube_update.wgt');
    await packageInstall(path);
    log('INFO', 'installFromUrl done');
  }

  async function installLatestFromGitHub(repo) {
    repo = repo || DEFAULT_REPO;
    log('INFO', 'installLatestFromGitHub', { repo: repo });
    var res  = await fetch('https://api.github.com/repos/' + repo + '/releases/latest');
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
    var asset = (data.assets || []).find(function (a) { return /\.wgt$/i.test(a.name || ''); });
    if (!asset) throw new Error('No .wgt asset in latest release');
    await installFromUrl(asset.browser_download_url);
  }

  var ctrl = getCtrl();
  log('INFO', 'Service started', ctrl);

  switch (ctrl.tytAction) {
    case 'installFromUrl':
      if (ctrl.tytUrl) installFromUrl(ctrl.tytUrl).catch(function (e) { log('ERROR', 'installFromUrl', { error: e.message }); });
      else log('ERROR', 'missing tytUrl');
      break;
    case 'installLatestFromGitHub':
      var payload = {};
      try { payload = ctrl.tytPayload ? JSON.parse(ctrl.tytPayload) : {}; } catch (_) {}
      installLatestFromGitHub(payload.repo).catch(function (e) { log('ERROR', 'installLatestFromGitHub', { error: e.message }); });
      break;
    default:
      log('WARN', 'No known action', { action: ctrl.tytAction || '(none)' });
  }
})();