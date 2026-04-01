(function () {
  const statusEl = document.getElementById('status');
  const versionEl = document.getElementById('version');
  const platformEl = document.getElementById('platform');
  const logOutputEl = document.getElementById('logOutput');
  const apiOutputEl = document.getElementById('apiOutput');
  const logEndpointEl = document.getElementById('logEndpoint');

  // ─── TV Remote key codes ───────────────────────────────────────────────────
  const KEY = {
    UP:    38,
    DOWN:  40,
    LEFT:  37,
    RIGHT: 39,
    ENTER: 13,
    BACK:  10009,
  };

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
  function getFocusable() {
    return Array.from(document.querySelectorAll('button, input, [tabindex="0"]'))
      .filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
  }

  function moveFocus(direction) {
    var focusable = getFocusable();
    if (!focusable.length) return;
    var idx = focusable.indexOf(document.activeElement);
    idx = direction === 'next'
      ? (idx + 1) % focusable.length
      : (idx - 1 + focusable.length) % focusable.length;
    focusable[idx].focus();
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
    var focusable = getFocusable();
    if (focusable.length) focusable[0].focus();
  }

  // ─── Network status (Samsung Network API) ─────────────────────────────────
  function initNetwork() {
    // webapis is only available when network.public privilege is declared
    // AND the app was installed with that privilege in config.xml.
    // If it shows "unavailable", reinstall the WGT built after adding the privilege.
    if (typeof webapis === 'undefined' || !webapis.network) {
      log('Network API unavailable — reinstall WGT with network.public privilege in config.xml');
      return;
    }

    try {
      var connected = webapis.network.isConnectedToGateway();
      var type = webapis.network.getActiveConnectionType();
      var typeNames = { 0: 'Disconnected', 1: 'WiFi', 2: 'Cellular', 3: 'Ethernet' };
      log('Network: ' + (typeNames[type] || type) + ' | Gateway: ' + connected);

      if (!connected) {
        statusEl.textContent = 'No network connection!';
        statusEl.style.color = '#f44';
      }

      webapis.network.addNetworkStateChangeListener(function (value) {
        if (value === webapis.network.NetworkState.GATEWAY_DISCONNECTED) {
          log('Network DISCONNECTED');
          statusEl.textContent = 'Network disconnected!';
          statusEl.style.color = '#f44';
        } else if (value === webapis.network.NetworkState.GATEWAY_CONNECTED) {
          log('Network CONNECTED');
          statusEl.textContent = 'App launched successfully.';
          statusEl.style.color = '';
        }
      });
    } catch (e) {
      log('Network API error: ' + e.message);
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
    platformEl.textContent = 'Tizen: ' +
      tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version') +
      ' | Web Inspector: chrome://inspect or http://localhost:9998';

    registerKeys();
    initNavigation();
    initNetwork();

    document.getElementById('debugBtn').addEventListener('click', function () {
      log('Manual debug button pressed.');
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
      log('Remote log FAILED: ' + error.message + ' | endpoint: ' + endpoint);
    }
  }

  window.addEventListener('load', init);
})();