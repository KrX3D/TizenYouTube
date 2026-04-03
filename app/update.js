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
      status(onStatus, 'Downloading and installing…', 10);
      RuntimePatchBridge.installFromUrl(info.wgtUrl, function (err) {
        if (err) {
          Logger.warn('update', 'Service failed, trying direct', { error: err.message });
          directInstall(info.wgtUrl, onStatus);
        } else {
          status(onStatus, 'Installer launched — reopen app when done', 100);
          Logger.end('update', 'installLatest');
        }
      }, null); // suppress per-step progress toasts from service
      return true;
    }
    return directInstall(info.wgtUrl, onStatus);
  }

  // directInstall: try tizen.download first (async, no UI freeze).
  // Falls back to fetch+tizen.filesystem if tizen.download is unavailable.
  function directInstall(url, onStatus) {
    Logger.info('update', 'Direct install', { url: url });
    var filename = 'TizenYouTube_update.wgt';

    // tizen.download runs off the main thread — no freeze, has progress callbacks
    if (typeof tizen !== 'undefined' && tizen.download &&
        typeof DownloadRequest !== 'undefined') {
      Logger.info('update', 'Using tizen.download API');
      return new Promise(function (resolve) {
        status(onStatus, 'Downloading…', 5);
        var req;
        try { req = new DownloadRequest(url, 'downloads', filename); }
        catch (e) {
          Logger.warn('update', 'DownloadRequest ctor failed, using fetch fallback', { error: e.message });
          fetchBlobInstall(url, filename, onStatus).then(resolve);
          return;
        }

        tizen.download.start(req, {
          onprogress: function (id, received, total) {
            var pct = total > 0 ? Math.round(received / total * 70) : 10;
            status(onStatus, 'Downloading… ' + Math.round(received / 1024) + ' KB', pct);
          },
          oncompleted: function (id, fullPath) {
            Logger.info('update', 'tizen.download complete', { path: fullPath });
            status(onStatus, 'Installing…', 80);
            // fullPath is a virtual fs path; resolve downloads dir for the file:// URI
            tizen.filesystem.resolve('downloads', function (dir) {
              var base = dir.toURI();
              if (base.charAt(base.length - 1) !== '/') base += '/';
              launchSystemInstaller(base + filename)
                .then(function () {
                  status(onStatus, 'Installer launched — reopen app when done', 100);
                  Logger.info('update', 'tizen.download install success');
                  Logger.end('update', 'installLatest');
                  resolve(true);
                })
                .catch(function (e) {
                  Logger.error('update', 'Installer launch failed', { error: e.message });
                  status(onStatus, 'Install failed: ' + e.message, -1);
                  Logger.end('update', 'installLatest');
                  resolve(false);
                });
            }, function (e) {
              Logger.error('update', 'resolve downloads failed', { error: e.message });
              status(onStatus, 'Install failed: ' + e.message, -1);
              Logger.end('update', 'installLatest');
              resolve(false);
            });
          },
          onpaused:   function (id) { Logger.warn('update', 'Download paused', { id: id }); },
          oncanceled: function (id) {
            Logger.error('update', 'Download canceled');
            status(onStatus, 'Download canceled', -1);
            Logger.end('update', 'installLatest');
            resolve(false);
          },
          onfailed: function (id, error) {
            Logger.warn('update', 'tizen.download failed, fetch fallback', { error: error.message });
            fetchBlobInstall(url, filename, onStatus).then(resolve);
          }
        });
      });
    }

    // Fallback: fetch blob then write via tizen.filesystem (synchronous — may freeze UI)
    return fetchBlobInstall(url, filename, onStatus);
  }

  // Fetch WGT and save via tizen.filesystem (synchronous write, may freeze for large files)
  async function fetchBlobInstall(url, filename, onStatus) {
    Logger.info('update', 'fetchBlob install');
    status(onStatus, 'Downloading…', 0);
    try {
      var res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var blob = await res.blob();
      status(onStatus, 'Saving to device — this may take a minute…', 50);
      var fileUri = await saveBlob(blob, filename);
      status(onStatus, 'Launching installer…', 75);
      await launchSystemInstaller(fileUri);
      status(onStatus, 'Installer launched — reopen app when done', 100);
      Logger.info('update', 'fetchBlob install success');
      Logger.end('update', 'installLatest');
      return true;
    } catch (e) {
      Logger.error('update', 'fetchBlob install failed', { error: e.message });
      status(onStatus, 'Install failed: ' + e.message, -1);
      Logger.end('update', 'installLatest');
      return false;
    }
  }

  function saveBlob(blob, filename) {
    return new Promise(function (resolve, reject) {
      tizen.filesystem.resolve('downloads', function (dir) {
        try { dir.deleteFile(dir.toURI() + '/' + filename); } catch (_) {}
        try { dir.deleteFile(dir.toURI() + filename); } catch (_) {}
        var file   = dir.createFile(filename);
        var reader = new FileReader();
        reader.onload = function () {
          file.openStream('w', function (stream) {
            try {
              stream.writeBytes(Array.prototype.slice.call(new Uint8Array(reader.result)));
              stream.close();
              var base = dir.toURI();
              if (base.charAt(base.length - 1) !== '/') base += '/';
              resolve(base + filename);
            } catch (e) { reject(e); }
          }, reject, 'UTF-8');
        };
        reader.onerror = function () { reject(new Error('FileReader error')); };
        reader.readAsArrayBuffer(blob);
      }, function (e) { reject(new Error('filesystem: ' + e.message)); });
    });
  }

  // Use the Samsung system package manager via AppControl — no extra privilege required,
  // same approach as TizenBrewInstaller when running on-TV.
  function launchSystemInstaller(fileUri) {
    return new Promise(function (resolve, reject) {
      Logger.info('update', 'Launching system installer', { uri: fileUri });
      try {
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
          function () { resolve(); },
          function (e) { reject(new Error((e && e.message) || 'launchAppControl failed')); }
        );
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

  // installLatestForce — always installs from GitHub regardless of version comparison.
  // Used when user explicitly clicks "Install latest" in settings.
  async function installLatestForce(onStatus) {
    Logger.begin('update', 'installLatestForce');
    status(onStatus, 'Fetching latest release…', 0);
    var info;
    try { info = await fetchLatest(); }
    catch (e) { status(onStatus, 'Fetch failed: ' + e.message, -1); Logger.end('update', 'installLatestForce'); return false; }
    if (!info.wgtUrl) { status(onStatus, 'No WGT in release', -1); Logger.end('update', 'installLatestForce'); return false; }

    Logger.info('update', 'Force install', { version: info.version, url: info.wgtUrl });
    status(onStatus, 'Installing v' + info.version + '…', 10);

    if (window.RuntimePatchBridge && RuntimePatchBridge.isAvailable()) {
      status(onStatus, 'Downloading and installing via service…', 20);
      RuntimePatchBridge.installFromUrl(
        info.wgtUrl,
        function (err) {
          if (err) {
            Logger.warn('update', 'Service install failed — falling back to direct install', { error: err.message });
            directInstall(info.wgtUrl, onStatus).then(function () {
              Logger.end('update', 'installLatestForce');
            });
          } else {
            status(onStatus, 'Installer launched — reopen app when done', 100);
            Logger.end('update', 'installLatestForce');
          }
        },
        null // suppress per-step progress toasts from service
      );
      return true;
    }
    var result = await directInstall(info.wgtUrl, onStatus);
    Logger.end('update', 'installLatestForce');
    return result;
  }

  window.AppUpdate = {
    check:               check,
    installLatest:       installLatest,
    installLatestForce:  installLatestForce,
    startupCheck:        startupCheck,
    getAvailable:        function () { return _available; },
    currentVersion:      currentVersion
  };
})();