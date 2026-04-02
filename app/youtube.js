(function () {
  var INJECTION_FILES = [
    'injections/bootstrap.js',
    'injections/fetchInterceptor.js',
    'injections/adblock.js'
  ];

  function loadScript(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    xhr.onload = function () {
      var ok = (xhr.status === 200) || (xhr.status === 0 && xhr.responseText && xhr.responseText.length > 0);
      if (ok) { cb(null, xhr.responseText); return; }
      cb(new Error('HTTP ' + xhr.status + ': ' + path));
    };
    xhr.onerror = function () { cb(new Error('XHR error: ' + path)); };
    xhr.send();
  }

  function loadAllScripts(cb) {
    var scripts   = new Array(INJECTION_FILES.length);
    var remaining = INJECTION_FILES.length;
    INJECTION_FILES.forEach(function (path, i) {
      loadScript(path, function (err, text) {
        scripts[i] = err ? ('/* failed: ' + path + ' */') : text;
        if (--remaining === 0) cb(scripts);
      });
    });
  }

  function buildCombinedScript(scripts) {
    var ver = '0.0.0';
    try { ver = tizen.application.getCurrentApplication().appInfo.version; } catch (_) {}

    var cfg      = window.AppConfig && window.AppConfig.debug ? window.AppConfig.debug : {};
    var endpoint = (cfg.serverIp && cfg.serverPort && cfg.remoteLogging)
      ? 'http://' + cfg.serverIp + ':' + cfg.serverPort + '/tv-log' : '';

    var preamble = [
      'window.__TYT_VERSION__="' + ver + '";',
      'window.__TYT_REMOTE_ENDPOINT__="' + endpoint + '";'
    ].join('\n');

    return preamble + '\n;\n' + scripts.join('\n;\n');
  }

  function navigate() {
    Logger.info('youtube', 'Navigating to YouTube TV');
    window.location.href = 'https://www.youtube.com/tv';
  }

  function launch() {
    Logger.begin('youtube', 'launch');

    loadAllScripts(function (scripts) {
      var combined = buildCombinedScript(scripts);
      Logger.info('youtube', 'Injection scripts built', {
        files: INJECTION_FILES,
        bytes: combined.length
      });

      var appId;
      try { appId = tizen.application.getCurrentApplication().appInfo.id; } catch (_) {}

      if (appId && window.RuntimePatchBridge && RuntimePatchBridge.isAvailable()) {
        Logger.info('youtube', 'Sending injection to service', { appId: appId });

        RuntimePatchBridge.inject(appId, combined, function (err) {
          if (err) {
            Logger.warn('youtube', 'Service inject call failed — navigating without injection', { error: err.message });
            Logger.end('youtube', 'launch');
            navigate();
          } else {
            // launchAppControl success = service started and received the action.
            // ADB + CDP round trip takes ~500ms. Wait 3s to be safe before navigating.
            Logger.info('youtube', 'Inject dispatched to service — waiting 3s for CDP round trip');
            Logger.end('youtube', 'launch');
            setTimeout(navigate, 3000);
          }
        });
      } else {
        Logger.warn('youtube', 'Service unavailable — navigating without injection');
        Logger.end('youtube', 'launch');
        navigate();
      }
    });
  }

  window.YouTubeTV = {
    launch:     launch,
    init:       function () {},
    reload:     function () { window.location.reload(); },
    goBack:     function () { window.history.back(); },
    getWebview: function () { return null; },
    isReady:    function () { return false; },
    execute:    function () {}
  };
})();