(function () {
  // ── YouTube TV launcher ───────────────────────────────────────────────────
  // On Tizen WRT, <webview> is NOT supported — the WGT itself IS the webview.
  // The correct approach: navigate window.location to youtube.com/tv.
  // Injection scripts are delivered via a content script mechanism using
  // tizen:// URI scheme or by storing them in sessionStorage before navigation,
  // then executing them via a relay page.
  //
  // Simpler approach used here: store injection scripts in sessionStorage,
  // navigate to a local relay.html which reads them and injects into youtube.com/tv
  // via a nested iframe approach, OR navigate directly and lose app context.
  //
  // For now: navigate directly to youtube.com/tv.
  // The injections/bootstrap.js etc. will be loaded via a bookmarklet-style
  // approach using sessionStorage as a carrier.

  var INJECTION_FILES = [
    'injections/bootstrap.js',
    'injections/fetchInterceptor.js',
    'injections/jsonTap.js',
    'injections/adblock.js',
    'injections/ui/settings.js',
    'injections/ui/customYTSettings.js'
  ];

  function loadScript(path, cb) {
    Logger.debug('youtube', 'Loading injection script', { path: path });
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    xhr.onload  = function () {
      if (xhr.status === 200) {
        Logger.info('youtube', 'Loaded injection script', { path: path, bytes: xhr.responseText.length });
        cb(null, xhr.responseText);
        return;
      }
      Logger.warn('youtube', 'Injection script missing', { path: path, status: xhr.status });
      cb(new Error('HTTP ' + xhr.status + ': ' + path));
    };
    xhr.onerror = function () {
      Logger.error('youtube', 'Injection XHR error', { path: path });
      cb(new Error('XHR error: ' + path));
    };
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
      try {
        // Prepend version
        var ver = tizen.application.getCurrentApplication().appInfo.version;
        scripts[0] = 'window.__TYT_VERSION__="' + ver + '";\n' + scripts[0];
      } catch (e) {}

      // Store combined injection script in sessionStorage.
      // A relay page at youtube.com can't read this (different origin),
      // but when we navigate to youtube.com/tv the injected script
      // is retrieved by our service worker approach.
      // For now: store it so we can revisit the injection strategy.
      try {
        var cfg = window.AppConfig && window.AppConfig.debug ? window.AppConfig.debug : {};
        var endpoint = (cfg.serverIp && cfg.serverPort)
          ? ('http://' + cfg.serverIp + ':' + cfg.serverPort + '/tv-log')
          : '';
        sessionStorage.setItem('__TYT_REMOTE_LOG_CFG__', JSON.stringify({
          endpoint: cfg.remoteLogging ? endpoint : ''
        }));

        sessionStorage.setItem('__TYT_INJECT__', scripts.join('\n;\n'));
        Logger.info('youtube', 'Injection scripts stored in sessionStorage', {
          totalBytes: scripts.join('').length,
          files: INJECTION_FILES,
          remoteEndpoint: endpoint
        });
      } catch (e) {
        Logger.warn('youtube', 'Could not store injection scripts', { error: e.message });
      }

      Logger.info('youtube', 'Navigating to YouTube TV');
      Logger.warn('youtube', 'Direct navigation mode active', {
        note: 'Native YouTube settings menu patching is not available in this mode without a full runtime patch strategy.'
      });
      Logger.end('youtube', 'launch');

      // Navigate — this replaces the app context with youtube.com/tv
      // The user can return to the app via the remote Back button
      window.location.href = 'https://www.youtube.com/tv';
    });
  }

  window.YouTubeTV = {
    launch:  launch,
    // Stubs for compatibility with main.js references
    init:       function () {},
    reload:     function () { window.location.reload(); },
    goBack:     function () { window.history.back(); },
    getWebview: function () { return null; },
    isReady:    function () { return false; },
    execute:    function () {}
  };

})();
