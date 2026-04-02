(function () {
  'use strict';

  var SERVICE_PORT = 8082;
  var SERVICE_URL  = 'ws://127.0.0.1:' + SERVICE_PORT;
  var _ws          = null;
  var _pending     = {};
  var _msgId       = 1;
  var _connected   = false;
  var _onStatus    = null; // global status callback

  function hasTizen() {
    return !!(window.tizen && tizen.application && tizen.application.launchAppControl);
  }

  function getServiceAppId() {
    return window.AppIdentity ? AppIdentity.serviceAppId : 'krx3dYtV01.service';
  }

  // Launch service process via launchAppControl (starts Node.js service)
  function launchServiceProcess(cb) {
    if (!hasTizen()) { cb(new Error('Tizen unavailable')); return; }
    try {
      var ctrl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/service',
        null, null, null,
        [new tizen.ApplicationControlData('tytAction', ['start'])]
      );
      tizen.application.launchAppControl(
        ctrl, getServiceAppId(),
        function ()  { cb(null); },
        function (e) { cb(new Error((e && e.message) || 'launchAppControl failed')); }
      );
    } catch (e) { cb(e); }
  }

  // Connect to persistent service WebSocket, launching it if needed
  function connect(cb, retry) {
    if (_ws && _connected) { cb(null, _ws); return; }

    Logger.debug('bridge', 'Connecting to service', { url: SERVICE_URL });
    var ws    = new WebSocket(SERVICE_URL);
    var timer = setTimeout(function () {
      ws.close();
      if (!retry) {
        // Service not running — launch it then retry once
        Logger.info('bridge', 'Service not running, launching…');
        launchServiceProcess(function (err) {
          if (err) { cb(new Error('Service launch failed: ' + err.message)); return; }
          // Give Node.js time to start up
          setTimeout(function () { connect(cb, true); }, 2500);
        });
      } else {
        cb(new Error('Service unreachable after launch'));
      }
    }, 2000);

    ws.onopen = function () {
      clearTimeout(timer);
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
        if (handler) {
          if (msg.status === 'progress') {
            if (handler.onProgress) handler.onProgress(msg.data && msg.data.step);
            if (_onStatus) _onStatus(msg.data && msg.data.step);
          } else {
            delete _pending[msg.id];
            if (msg.status === 'ok') handler.cb(null, msg.data);
            else handler.cb(new Error((msg.data && msg.data.message) || 'Service error'));
          }
        }
      };
      cb(null, ws);
    };

    ws.onerror = function () { /* timeout handles this */ };
    ws.onclose = function () { clearTimeout(timer); };
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

    // Try connecting to already-running service (for startup status check)
    tryConnect: function (cb) { connect(cb); },

    // Inject scripts into app via ADB+CDP
    inject: function (appId, scriptCode, cb, onProgress) {
      var b64;
      try { b64 = btoa(unescape(encodeURIComponent(scriptCode))); }
      catch (e) { cb(new Error('base64 encode: ' + e.message)); return; }
      send('inject', { appId: appId, script: b64 }, cb, onProgress);
    },

    // Install from URL via service
    installFromUrl: function (url, cb, onProgress) {
      send('installFromUrl', { url: url }, cb, onProgress);
    },

    // Install latest from GitHub via service
    installFromGitHub: function (repo, cb, onProgress) {
      send('installLatestFromGitHub',
        { repo: repo || (window.AppIdentity ? AppIdentity.githubRepoFull() : 'KrX3D/TizenYouTube') },
        cb, onProgress);
    },

    launchPatchedYouTube: function (payload, cb) { cb(new Error('Not implemented')); }
  };
})();