(function () {
  'use strict';

  var _available = null;

  function currentVersion() {
    try { return tizen.application.getCurrentApplication().appInfo.version; } catch (e) { return '0.0.0'; }
  }

  function semverGt(a, b) {
    var pa = String(a).split('.').map(Number);
    var pb = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if ((pa[i]||0) > (pb[i]||0)) return true;
      if ((pa[i]||0) < (pb[i]||0)) return false;
    }
    return false;
  }

  async function fetchLatest() {
    var url  = AppIdentity.githubApiBase() + '/releases/latest';
    var res  = await fetch(url);
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
    var tag   = String(data.tag_name || '').replace(/^v/, '');
    var asset = (data.assets || []).find(function (a) { return /\.wgt$/i.test(a.name || ''); });
    return {
      version:    tag,
      wgtUrl:     asset ? asset.browser_download_url : '',
      releaseUrl: data.html_url || ''
    };
  }

  async function check(silent) {
    Logger.begin('update', 'check');
    var cur = currentVersion();
    Logger.info('update', 'Checking', { current: cur, repo: AppIdentity.githubRepoFull() });
    try {
      var info = await fetchLatest();
      if (!info.version) throw new Error('No version in release');
      if (semverGt(info.version, cur)) {
        _available = info;
        Logger.info('update', 'Update available', info);
        AppToast('Update v' + info.version + ' available — see Settings → Updates');
        Logger.end('update', 'check');
        return info;
      } else {
        _available = null;
        if (!silent) AppToast('Already on latest: v' + cur);
        Logger.info('update', 'Up to date', { latest: info.version, current: cur });
        Logger.end('update', 'check');
        return null;
      }
    } catch (e) {
      Logger.error('update', 'Check failed', { error: e.message });
      if (!silent) AppToast('Update check failed: ' + e.message);
      Logger.end('update', 'check');
      return null;
    }
  }

  async function installLatest(onStatus) {
    Logger.begin('update', 'installLatest');
    var info = _available;
    if (!info) {
      try { info = await fetchLatest(); } catch (e) {
        status(onStatus, 'Fetch failed: ' + e.message, -1);
        Logger.end('update', 'installLatest'); return false;
      }
    }
    if (!info.wgtUrl) {
      status(onStatus, 'No WGT asset found in release', -1);
      Logger.end('update', 'installLatest'); return false;
    }

    if (window.RuntimePatchBridge && RuntimePatchBridge.isAvailable()) {
      Logger.info('update', 'Delegating to service', { url: info.wgtUrl });
      status(onStatus, 'Sending to installer service…', 10);
      RuntimePatchBridge.installFromUrl(info.wgtUrl, function (err) {
        if (err) {
          Logger.warn('update', 'Service failed, trying direct', { error: err.message });
          directInstall(info.wgtUrl, onStatus);
        } else {
          status(onStatus, 'Install request sent', 100);
          Logger.end('update', 'installLatest');
        }
      });
      return true;
    }
    return directInstall(info.wgtUrl, onStatus);
  }

  async function directInstall(url, onStatus) {
    Logger.info('update', 'Direct install', { url: url });
    status(onStatus, 'Downloading…', 0);
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var blob = await res.blob();
      status(onStatus, 'Saving…', 50);
      var path = await saveBlob(blob, 'TizenYouTube_update.wgt');
      status(onStatus, 'Installing…', 75);
      await runPackageInstall(path);
      status(onStatus, 'Done — restart app', 100);
      Logger.info('update', 'Direct install success');
      Logger.end('update', 'installLatest');
      return true;
    } catch (e) {
      Logger.error('update', 'Direct install failed', { error: e.message });
      status(onStatus, 'Install failed: ' + e.message, -1);
      Logger.end('update', 'installLatest');
      return false;
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
              resolve('downloads/' + filename);
            } catch (e) { reject(e); }
          }, reject, 'UTF-8');
        };
        reader.onerror = function () { reject(new Error('FileReader error')); };
        reader.readAsArrayBuffer(blob);
      }, function (e) { reject(new Error('filesystem: ' + e.message)); });
    });
  }

  function runPackageInstall(tizenPath) {
    return new Promise(function (resolve, reject) {
      try {
        tizen.package.install(tizenPath, {
          onprogress: function (id, pct) { Logger.debug('update', 'progress', { pct: pct }); },
          oncomplete: function (id)      { resolve(id); },
          onerror:    function (e)       { reject(new Error('pkg: ' + (e.message || e))); }
        });
      } catch (e) { reject(e); }
    });
  }

  function status(cb, msg, pct) {
    Logger.info('update', msg, { pct: pct });
    if (cb) cb(msg, pct); else AppToast(msg);
  }

  function startupCheck() {
    setTimeout(function () { check(true); }, 5000);
  }

  window.AppUpdate = {
    check:          check,
    installLatest:  installLatest,
    startupCheck:   startupCheck,
    getAvailable:   function () { return _available; },
    currentVersion: currentVersion
  };
})();