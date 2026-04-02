(function () {
  // ── YouTube TV launcher ───────────────────────────────────────────────────
  // Two modes:
  //   1. launchAppControl → launches the built-in YouTube Smart TV app
  //      (keeps WGT alive, future injection possible via service)
  //   2. window.location fallback → navigates WGT to youtube.com/tv
  //      (WGT context destroyed, no injection possible)
  //
  // Mode 1 is preferred. It opens YouTube in its own process and returns
  // control to this app. The user sees YouTube; we stay resident.
  // Mode 2 is the fallback if the built-in app is not found.
  //
  // Samsung YouTube Smart TV app IDs (known values across firmwares):
  var YOUTUBE_APP_IDS = [
    'com.samsung.tv.apps.youtube',   // Tizen 5.x+
    '111299001912',                  // older firmwares
    'youtube.global.fresco'          // some 2019+ models
  ];

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
      Logger.warn('youtube', 'Script load failed', { path: path, status: xhr.status });
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

  function storeInjections(scripts) {
    try {
      var cfg      = window.AppConfig && window.AppConfig.debug ? window.AppConfig.debug : {};
      var endpoint = (cfg.serverIp && cfg.serverPort)
        ? 'http://' + cfg.serverIp + ':' + cfg.serverPort + '/tv-log' : '';
      sessionStorage.setItem('__TYT_REMOTE_LOG_CFG__', JSON.stringify({
        endpoint: cfg.remoteLogging ? endpoint : ''
      }));
      sessionStorage.setItem('__TYT_INJECT__', scripts.join('\n;\n'));
      Logger.info('youtube', 'Injection scripts stored', {
        files: INJECTION_FILES,
        totalBytes: scripts.reduce(function (s, x) { return s + x.length; }, 0)
      });
    } catch (e) {
      Logger.warn('youtube', 'sessionStorage failed', { error: e.message });
    }
  }

  // ── Try launching built-in YouTube app ───────────────────────────────────
  // Keeps WGT alive. User sees YouTube; we stay resident in background.
  function tryLaunchBuiltinYouTube(onFail) {
    var ids   = YOUTUBE_APP_IDS.slice();
    var tried = [];

    function tryNext() {
      if (!ids.length) {
        Logger.warn('youtube', 'Built-in YouTube not found, falling back', { tried: tried });
        onFail();
        return;
      }
      var appId = ids.shift();
      tried.push(appId);
      Logger.info('youtube', 'Trying built-in YouTube app', { appId: appId });
      try {
        tizen.application.launch(
          appId,
          function () {
            Logger.info('youtube', 'Built-in YouTube launched', { appId: appId });
          },
          function (e) {
            Logger.debug('youtube', 'App ID not found', { appId: appId, error: e.message });
            tryNext();
          }
        );
      } catch (e) {
        Logger.debug('youtube', 'launch() threw', { appId: appId, error: e.message });
        tryNext();
      }
    }

    tryNext();
  }

  // ── Fallback: navigate WGT to youtube.com/tv ──────────────────────────────
  // WGT context is destroyed — injections do NOT work via this path.
  function fallbackNavigation() {
    Logger.warn('youtube', 'Using direct navigation fallback — injections inactive');
    window.location.href = 'https://www.youtube.com/tv';
  }

  function launch() {
    Logger.begin('youtube', 'launch');

    loadAllScripts(function (scripts) {
      // Prepend version
      try {
        var ver = tizen.application.getCurrentApplication().appInfo.version;
        scripts[0] = 'window.__TYT_VERSION__="' + ver + '";\n' + scripts[0];
      } catch (e) {}

      storeInjections(scripts);

      // Try built-in YouTube first (keeps WGT alive)
      if (window.tizen && tizen.application && tizen.application.launch) {
        tryLaunchBuiltinYouTube(fallbackNavigation);
      } else {
        fallbackNavigation();
      }

      Logger.end('youtube', 'launch');
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