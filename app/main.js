(function () {
  const statusEl = document.getElementById('status');
  const versionEl = document.getElementById('version');
  const platformEl = document.getElementById('platform');
  const logOutputEl = document.getElementById('logOutput');
  const apiOutputEl = document.getElementById('apiOutput');
  const logEndpointEl = document.getElementById('logEndpoint');

  // ─── TV Remote key codes ───────────────────────────────────────────────────
  const KEY = {
    UP:     38,
    DOWN:   40,
    LEFT:   37,
    RIGHT:  39,
    ENTER:  13,
    BACK:   10009,
  };

  // Register remote keys with Tizen so they fire as keydown events
  function registerKeys() {
    try {
      var supportedKeys = tizen.tvinputdevice.getSupportedKeys();
      var toRegister = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
                        'MediaFastForward', 'MediaRewind'];
      supportedKeys.forEach(function (key) {
        if (toRegister.indexOf(key.name) >= 0) {
          tizen.tvinputdevice.registerKey(key.name);
        }
      });
    } catch (e) {
      log('Key registration skipped: ' + e.message);
    }
  }

  // ─── Spatial navigation ────────────────────────────────────────────────────
  // Collect all focusable elements in DOM order and move focus with arrow keys.
  function getFocusable() {
    return Array.from(document.querySelectorAll(
      'button, input, [tabindex="0"]'
    )).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function moveFocus(direction) {
    var focusable = getFocusable();
    if (!focusable.length) return;

    var current = document.activeElement;
    var idx = focusable.indexOf(current);

    if (direction === 'next') {
      idx = (idx + 1) % focusable.length;
    } else {
      idx = (idx - 1 + focusable.length) % focusable.length;
    }

    focusable[idx].focus();

    // Scroll focused element into view
    focusable[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function initNavigation() {
    document.addEventListener('keydown', function (e) {
      switch (e.keyCode) {
        case KEY.UP:
        case KEY.LEFT:
          e.preventDefault();
          moveFocus('prev');
          break;

        case KEY.DOWN:
        case KEY.RIGHT:
          e.preventDefault();
          moveFocus('next');
          break;

        case KEY.ENTER:
          // Fire click on focused element if it isn't an input
          if (document.activeElement && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            document.activeElement.click();
          }
          break;

        case KEY.BACK:
          tizen.application.getCurrentApplication().exit();
          break;
      }
    });

    // Set initial focus on first element
    var focusable = getFocusable();
    if (focusable.length) {
      focusable[0].focus();
    }
  }

  // ─── Logging ───────────────────────────────────────────────────────────────
  function log(message) {
    var line = '[TizenYouTube] ' + new Date().toISOString() + ' ' + message;
    console.log(line);
    logOutputEl.textContent = (line + '\n' + logOutputEl.textContent).trim();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    statusEl.textContent = 'App launched successfully.';

    var app = tizen.application.getCurrentApplication();
    versionEl.textContent = 'App ID: ' + app.appInfo.id + ' | Version: ' + app.appInfo.version;
    platformEl.textContent = 'Tizen platform version: ' +
      tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');

    registerKeys();
    initNavigation();

    document.getElementById('debugBtn').addEventListener('click', function () {
      log('Manual debug button pressed. If connected, this appears in sdb dlog.');
    });

    document.getElementById('fetchBtn').addEventListener('click', fetchPlaylistItems);

    logEndpointEl.value = localStorage.getItem('tizenYoutubeLogEndpoint') || 'http://192.168.50.133:3030/tv-log';
    logEndpointEl.addEventListener('change', function () {
      localStorage.setItem('tizenYoutubeLogEndpoint', logEndpointEl.value.trim());
    });

    document.getElementById('sendRemoteLogBtn').addEventListener('click', function () {
      sendRemoteLog('manual-test');
    });

    log('Initialization complete.');
    if (logEndpointEl.value.trim()) {
      sendRemoteLog('startup');
    }
  }

  // ─── YouTube API ───────────────────────────────────────────────────────────
  async function fetchPlaylistItems() {
    var apiKey = document.getElementById('apiKey').value.trim();
    var playlistId = document.getElementById('playlistId').value.trim();

    if (!apiKey || !playlistId) {
      apiOutputEl.textContent = 'Please fill in API key and playlist ID first.';
      return;
    }

    var params = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      playlistId: playlistId,
      maxResults: '5',
      key: apiKey
    });

    var url = 'https://www.googleapis.com/youtube/v3/playlistItems?' + params.toString();
    log('Requesting YouTube API: ' + url.replace(apiKey, '***'));

    try {
      var response = await fetch(url);
      var data = await response.json();

      if (!response.ok) {
        throw new Error((data && data.error && data.error.message) || ('HTTP ' + response.status));
      }

      var items = (data.items || []).map(function (item, idx) {
        return (idx + 1) + '. ' + ((item.snippet && item.snippet.title) || '(no title)');
      });
      apiOutputEl.textContent = items.length
        ? 'Fetched ' + items.length + ' item(s):\n' + items.join('\n')
        : 'Request succeeded but no items found.';
      log('YouTube request succeeded with ' + items.length + ' item(s).');
    } catch (error) {
      apiOutputEl.textContent = 'Request failed: ' + error.message;
      log('YouTube request failed: ' + error.message);
    }
  }

  // ─── Remote log ───────────────────────────────────────────────────────────
  async function sendRemoteLog(eventType) {
    var endpoint = logEndpointEl.value.trim();
    if (!endpoint) {
      log('Remote log endpoint is empty.');
      return;
    }

    var payload = {
      app: 'TizenYouTube',
      ts: new Date().toISOString(),
      eventType: eventType || 'manual-test',
      message: 'Remote log event from TV app',
      startupTime: performance.now()
    };

    try {
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);
      log('Remote log sent to ' + endpoint);
    } catch (error) {
      log('Remote log failed: ' + error.message);
    }
  }

  window.addEventListener('load', init);
})();