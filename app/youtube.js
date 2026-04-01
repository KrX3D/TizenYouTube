(function () {
  // ── YouTube TV webview loader ─────────────────────────────────────────────
  // Opens youtube.com/tv in a Tizen <webview> element which runs in a separate
  // renderer process but allows executeScript() injection from this app.
  //
  // Injection approach:
  //   1. webview loads youtube.com/tv
  //   2. On loadstop we inject our bootstrap script
  //   3. Bootstrap sets up communication channel and marks page as patched
  //   4. fetchInterceptor monkey-patches fetch()/XHR to intercept /youtubei/ calls
  //   5. Feature handlers registered via window.__TYT_HANDLERS__ patch JSON responses
  //
  // All injection scripts live in app/injections/*.js

  var webviewEl    = null;
  var isLoaded     = false;
  var pendingQueue = [];

  // Scripts to inject on every page load, in order
  var INJECTION_FILES = [
    'injections/bootstrap.js',
    'injections/fetchInterceptor.js',
    'injections/adblock.js'
  ];

  // ── Load injection script text ────────────────────────────────────────────
  // Tizen WGT has filesystem access to its own package files via XMLHttpRequest
  function loadScript(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', path, true);
    xhr.onload = function () {
      if (xhr.status === 200) cb(null, xhr.responseText);
      else cb(new Error('Failed to load ' + path + ': ' + xhr.status));
    };
    xhr.onerror = function () { cb(new Error('XHR error loading ' + path)); };
    xhr.send();
  }

  function loadAllScripts(cb) {
    var scripts  = [];
    var remaining = INJECTION_FILES.length;
    if (remaining === 0) { cb(scripts); return; }

    INJECTION_FILES.forEach(function (path, i) {
      loadScript(path, function (err, text) {
        if (err) {
          Logger.warn('youtube', 'Script load failed', { path: path, error: err.message });
          scripts[i] = '/* failed: ' + path + ' */';
        } else {
          scripts[i] = text;
        }
        remaining--;
        if (remaining === 0) cb(scripts);
      });
    });
  }

  // ── Create and mount the webview ──────────────────────────────────────────
  function createWebview() {
    Logger.begin('youtube', 'createWebview');

    var container = document.getElementById('youtubeContainer');
    if (!container) {
      Logger.error('youtube', 'youtubeContainer element not found');
      Logger.end('youtube', 'createWebview');
      return;
    }

    // Remove existing webview if any
    if (webviewEl) {
      webviewEl.remove();
      webviewEl = null;
      isLoaded  = false;
    }

    webviewEl = document.createElement('webview');
    webviewEl.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    webviewEl.setAttribute('allowtransparency', 'true');
    webviewEl.setAttribute('partition', 'persist:youtube');

    // ── Event: page started loading ───────────────────────────────────────
    webviewEl.addEventListener('loadstart', function (e) {
      Logger.info('youtube', 'Page loading', { url: e.url || 'unknown' });
      isLoaded = false;
      showLoadingIndicator(true);
    });

    // ── Event: page fully loaded → inject scripts ─────────────────────────
    webviewEl.addEventListener('loadstop', function () {
      Logger.info('youtube', 'Page loaded — injecting scripts');
      isLoaded = true;
      showLoadingIndicator(false);

      loadAllScripts(function (scripts) {
        // Prepend version info to bootstrap so injected code knows the host
        // app version without needing a separate CI patch step.
        // tizen.application is available here in the host app context.
        try {
          var appVersion = tizen.application.getCurrentApplication().appInfo.version;
          var versionPreamble = 'window.__TYT_VERSION__ = "' + appVersion + '";';
          scripts[0] = versionPreamble + '\n' + scripts[0];
          Logger.debug('youtube', 'Version preamble injected', { version: appVersion });
        } catch (e) {
          Logger.warn('youtube', 'Could not read app version for preamble', { error: e.message });
        }

        scripts.forEach(function (code, i) {
          try {
            webviewEl.executeScript({ code: code }, function (results) {
              Logger.debug('youtube', 'Script injected', { file: INJECTION_FILES[i] });
            });
          } catch (e) {
            Logger.error('youtube', 'Inject failed', {
              file:  INJECTION_FILES[i],
              error: e.message
            });
          }
        });

        // Flush any queued calls that arrived before load completed
        pendingQueue.forEach(function (fn) { fn(); });
        pendingQueue = [];
      });
    });

    // ── Event: load error ─────────────────────────────────────────────────
    webviewEl.addEventListener('loadabort', function (e) {
      Logger.error('youtube', 'Load aborted', { reason: e.reason, url: e.url });
      showError('Failed to load YouTube TV. Check your network connection.');
      showLoadingIndicator(false);
    });

    // ── Event: console messages from webview ──────────────────────────────
    webviewEl.addEventListener('consolemessage', function (e) {
      if (AppConfig.debug.enabled) {
        Logger.debug('yt-console', e.message);
      }
    });

    container.appendChild(webviewEl);

    var url = 'https://www.youtube.com/tv';
    Logger.info('youtube', 'Navigating to YouTube TV', { url: url });
    webviewEl.src = url;

    Logger.end('youtube', 'createWebview');
  }

  // ── Execute script in the webview ─────────────────────────────────────────
  // Safe to call at any time — queues if page not loaded yet
  function executeInWebview(code, cb) {
    if (!webviewEl) { Logger.warn('youtube', 'executeInWebview: no webview'); return; }
    if (!isLoaded) {
      pendingQueue.push(function () { executeInWebview(code, cb); });
      return;
    }
    try {
      webviewEl.executeScript({ code: code }, cb || function () {});
    } catch (e) {
      Logger.error('youtube', 'executeScript error', { error: e.message });
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function showLoadingIndicator(show) {
    var el = document.getElementById('ytLoading');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function showError(msg) {
    var el = document.getElementById('ytError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  // ── Navigation helpers ────────────────────────────────────────────────────
  function navigate(url) {
    if (!webviewEl) { createWebview(); return; }
    Logger.info('youtube', 'Navigating', { url: url });
    webviewEl.src = url;
  }

  function reload() {
    if (!webviewEl) { createWebview(); return; }
    Logger.info('youtube', 'Reloading');
    webviewEl.reload();
  }

  function goBack() {
    if (webviewEl && webviewEl.canGoBack()) {
      webviewEl.back();
      Logger.info('youtube', 'Going back');
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.YouTubeTV = {
    init:       createWebview,
    execute:    executeInWebview,
    navigate:   navigate,
    reload:     reload,
    goBack:     goBack,
    getWebview: function () { return webviewEl; },
    isReady:    function () { return isLoaded; }
  };

})();