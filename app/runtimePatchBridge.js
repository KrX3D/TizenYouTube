(function () {
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
=======
  'use strict';

  var SERVICE_PORT = 8082;
  var SERVICE_URL  = 'ws://127.0.0.1:' + SERVICE_PORT;
  var _ws          = null;
  var _connected   = false;
  var _pending     = {};
  var _msgId       = 1;

>>>>>>> main
  function hasTizen() {
    return !!(window.tizen && tizen.application && tizen.application.launchAppControl);
  }

  function getServiceAppId() {
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
    var cfg = window.AppConfig && window.AppConfig.runtimePatch;
    return (cfg && cfg.serviceAppId) || 'krx3dYtV01.RuntimePatchService';
  }

  function requestService(payload, cb) {
    if (!hasTizen()) {
      cb(new Error('Tizen application APIs unavailable'));
      return;
    }

    var appId = getServiceAppId();
    if (!appId) {
      cb(new Error('runtimePatch.serviceAppId is empty'));
      return;
    }

    try {
      var appControl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/service',
        null,
        null,
        null,
        [
          new tizen.ApplicationControlData('runtimePatchPayload', [JSON.stringify(payload)])
        ]
      );

      tizen.application.launchAppControl(
        appControl,
        appId,
        function () { cb(null, { appId: appId }); },
        function (e) { cb(new Error((e && e.message) || 'launchAppControl failed')); }
      );
    } catch (e) {
      cb(e);
    }
  }

  window.RuntimePatchBridge = {
    isAvailable: function () {
      return hasTizen() && !!getServiceAppId();
    },
    launchPatchedYouTube: function (payload, cb) {
      requestService(payload, cb || function () {});
    },
    installFromGitHub: function (repo, packageId, cb) {
      if (typeof packageId === 'function') { cb = packageId; packageId = null; }
      requestService({
        contractVersion: 1,
        action: 'installFromGitHub',
        repo: repo,
        packageId: packageId || 'krx3dYtV01'
      }, cb || function () {});
    }
  };
})();
=======
    return window.AppIdentity ? AppIdentity.serviceAppId : 'krx3dYtV01.service';
  }

  function launchServiceProcess(cb) {
    if (!hasTizen()) { cb(new Error('Tizen unavailable')); return; }
    Logger.info('bridge', 'Launching service process', { id: getServiceAppId() });
    try {
      var ctrl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/service',
        null, null, null,
        [new tizen.ApplicationControlData('tytAction', ['start'])]
      );
      tizen.application.launchAppControl(
        ctrl, getServiceAppId(),
        function ()  { Logger.info('bridge', 'Service process launched'); cb(null); },
        function (e) { cb(new Error((e && e.message) || 'launchAppControl failed')); }
      );
    } catch (e) { cb(e); }
  }

  // Connect to service WebSocket.
  // If not running: launch the service process, wait for startup, retry once.
  function connect(cb, isRetry) {
    if (_ws && _connected) { cb(null, _ws); return; }

    Logger.debug('bridge', 'Connecting to service', { url: SERVICE_URL, retry: !!isRetry });

    var ws   = new WebSocket(SERVICE_URL);
    var done = false;

    // Hard timeout — fires if neither open nor error/close happens in time
    var hardTimer = setTimeout(function () {
      if (done) return;
      done = true;
      try { ws.close(); } catch (_) {}
      if (!isRetry) {
        Logger.info('bridge', 'Connect timed out — launching service');
        launchServiceProcess(function (err) {
          if (err) {
            Logger.warn('bridge', 'Service launch failed', { error: err.message });
            cb(new Error('Service launch failed: ' + err.message));
            return;
          }
          // Wait for Node.js service to start up and bind to port
          setTimeout(function () { connect(cb, true); }, 3000);
        });
      } else {
        cb(new Error('Service unreachable after launch'));
      }
    }, 2000);

    ws.onopen = function () {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      _ws        = ws;
      _connected = true;
      Logger.info('bridge', 'Service connected');

      ws.onclose = function () {
        _ws = null; _connected = false;
        Logger.warn('bridge', 'Service disconnected');
      };
      ws.onerror = function (e) {
        Logger.warn('bridge', 'Service WS error', { error: e.message || 'unknown' });
      };
      ws.onmessage = function (evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch (_) { return; }
        var handler = msg.id && _pending[msg.id];
        if (!handler) return;
        if (msg.status === 'progress') {
          if (handler.onProgress) handler.onProgress(msg.data && msg.data.step);
        } else {
          delete _pending[msg.id];
          if (msg.status === 'ok') handler.cb(null, msg.data);
          else handler.cb(new Error((msg.data && msg.data.message) || 'Service error'));
        }
      };

      cb(null, ws);
    };

    // Connection refused / error fires before open — handle immediately
    ws.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      // Don't close — onclose fires automatically after onerror
      if (!isRetry) {
        Logger.info('bridge', 'Connect refused — launching service');
        launchServiceProcess(function (err) {
          if (err) {
            Logger.warn('bridge', 'Service launch failed', { error: err.message });
            cb(new Error('Service launch failed: ' + err.message));
            return;
          }
          setTimeout(function () { connect(cb, true); }, 3000);
        });
      } else {
        cb(new Error('Service unreachable after launch'));
      }
    };

    // onclose fires after onerror — by then done=true so we ignore it
    ws.onclose = function () {
      if (!done) {
        done = true;
        clearTimeout(hardTimer);
        cb(new Error('Service connection closed unexpectedly'));
      }
    };
  }

  function send(action, payload, cb, onProgress) {
    connect(function (err, ws) {
      if (err) { cb(err); return; }
      var id  = _msgId++;
      var msg = Object.assign({ id: id, action: action }, payload);
      _pending[id] = { cb: cb, onProgress: onProgress };
      try { ws.send(JSON.stringify(msg)); }
      catch (e) { delete _pending[id]; cb(e); }
    });
  }

  window.RuntimePatchBridge = {
    isAvailable:     function () { return hasTizen(); },
    getServiceAppId: function () { return getServiceAppId(); },
    isConnected:     function () { return _connected; },

    tryConnect: function (cb) { connect(cb); },

    inject: function (appId, scriptCode, cb, onProgress) {
      var b64;
      try { b64 = btoa(unescape(encodeURIComponent(scriptCode))); }
      catch (e) { cb(new Error('base64 encode: ' + e.message)); return; }
      send('inject', { appId: appId, script: b64 }, cb, onProgress);
    },

    installFromUrl: function (url, cb, onProgress) {
      send('installFromUrl', { url: url }, cb, onProgress);
    },

    installFromGitHub: function (repo, cb, onProgress) {
      send('installLatestFromGitHub',
        { repo: repo || (window.AppIdentity ? AppIdentity.githubRepoFull() : 'KrX3D/TizenYouTube') },
        cb, onProgress);
    },

    launchPatchedYouTube: function (payload, cb) { cb(new Error('Not implemented')); }
  };
})();
>>>>>>> main
