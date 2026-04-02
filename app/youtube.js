(function () {
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
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
    'injections/ui/nativeSettingsPatch.js',
    'injections/ui/settings.js',
    'injections/ui/customYTSettings.js'
  ];

  function loadScript(path, cb) {
    Logger.debug('youtube', 'Loading injection script', { path: path });
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    xhr.onload  = function () {
      var looksLocalSuccess = (xhr.status === 0 && typeof xhr.responseText === 'string' && xhr.responseText.length > 0);
      if (xhr.status === 200 || looksLocalSuccess) {
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
=======
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
>>>>>>> main

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

<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
  function launch() {
    Logger.begin('youtube', 'launch');
    var launchStatusEl = document.getElementById('launchStatus');

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

      var useRuntimePatch = !!(window.AppConfig && window.AppConfig.runtimePatch && window.AppConfig.runtimePatch.enabled);
      if (useRuntimePatch && window.RuntimePatchContracts && window.RuntimePatchBridge) {
        var payload = window.RuntimePatchContracts.createLaunchPayload(window.AppConfig);
        Logger.info('youtube', 'Trying runtime patch launch handoff', payload);
        window.RuntimePatchBridge.launchPatchedYouTube(payload, function (err, result) {
          if (!err) {
            Logger.info('youtube', 'Runtime patch handoff success', result || {});
            Logger.end('youtube', 'launch');
            return;
          }
          Logger.error('youtube', 'Runtime patch handoff failed', { error: err.message || String(err) });
          var fallback = !!(window.AppConfig.runtimePatch && window.AppConfig.runtimePatch.fallbackToDirectNavigation);
          if (!fallback) {
            if (launchStatusEl) {
              launchStatusEl.innerHTML = 'Runtime patch failed: <strong>' + (err.message || String(err)) + '</strong>. Stayed on main screen.';
            }
            Logger.end('youtube', 'launch');
            return;
          }
          Logger.warn('youtube', 'Fallback to direct navigation', {});
          Logger.end('youtube', 'launch');
          window.location.href = 'https://www.youtube.com/tv';
        });
        return;
      }

      Logger.warn('youtube', 'Direct navigation mode active', {
        note: 'Runtime patch bridge disabled or unavailable'
      });
      Logger.end('youtube', 'launch');
      window.location.href = 'https://www.youtube.com/tv';
    });
  }

  window.YouTubeTV = {
    launch:  launch,
    // Stubs for compatibility with main.js references
=======
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
>>>>>>> main
    init:       function () {},
    reload:     function () { window.location.reload(); },
    goBack:     function () { window.history.back(); },
    getWebview: function () { return null; },
    isReady:    function () { return false; },
    execute:    function () {}
  };
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api

})();
=======
})();
>>>>>>> main
