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

  function launch() {
    Logger.begin('youtube', 'launch');

    loadAllScripts(function (scripts) {
      // Prepend version from host app
      try {
        var ver = tizen.application.getCurrentApplication().appInfo.version;
        scripts[0] = 'window.__TYT_VERSION__="' + ver + '";\n' + scripts[0];
      } catch (e) {
        Logger.warn('youtube', 'Could not read version for preamble', { error: e.message });
      }

      // Store remote logging config so bootstrap.js can pick it up
      try {
        var cfg = window.AppConfig && window.AppConfig.debug ? window.AppConfig.debug : {};
        var endpoint = (cfg.serverIp && cfg.serverPort)
          ? 'http://' + cfg.serverIp + ':' + cfg.serverPort + '/tv-log'
          : '';
        sessionStorage.setItem('__TYT_REMOTE_LOG_CFG__', JSON.stringify({
          endpoint: cfg.remoteLogging ? endpoint : ''
        }));
      } catch (e) {
        Logger.warn('youtube', 'Could not store remote log config', { error: e.message });
      }

      // Store injection scripts — NOTE: sessionStorage is same-origin only.
      // When window.location navigates to youtube.com/tv the scripts stored here
      // are NOT accessible from that context (different origin).
      // This storage is kept for future service-worker or relay-page approach.
      // The actual injection mechanism for the WGT context works as follows:
      //   The WGT navigates to youtube.com/tv, which runs in the SAME browsing
      //   context as this WGT. The WGT's JavaScript context is replaced by YT's,
      //   so the scripts cannot be auto-injected post-navigation without a hook.
      //   TizenBrew handles this via its service app which can execute scripts.
      //   For now: injection is not active after navigation — this is a known gap.
      try {
        sessionStorage.setItem('__TYT_INJECT__', scripts.join('\n;\n'));
        Logger.info('youtube', 'Injection scripts ready', {
          files:      INJECTION_FILES,
          totalBytes: scripts.reduce(function (s, x) { return s + x.length; }, 0)
        });
      } catch (e) {
        Logger.warn('youtube', 'sessionStorage unavailable', { error: e.message });
      }

      Logger.info('youtube', 'Navigating to YouTube TV');
      Logger.end('youtube', 'launch');
      window.location.href = 'https://www.youtube.com/tv';
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