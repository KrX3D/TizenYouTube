(function () {
  var statusTextEl    = document.getElementById('statusText');
  var versionTextEl   = document.getElementById('versionText');
  var networkTextEl   = document.getElementById('networkText');
  var gearBtn         = document.getElementById('gearBtn');
  var debugBtn        = document.getElementById('debugBtn');
  var playlistBtn     = document.getElementById('playlistBtn');
  var settingsOverlay = document.getElementById('settingsOverlay');
  var playlistOverlay = document.getElementById('playlistOverlay');
  var settingsList    = document.getElementById('settingsList');
  var debugOverlay    = document.getElementById('debugOverlay');
  var debugPanel      = document.getElementById('debugPanel');
  var debugLogs       = document.getElementById('debugLogs');
  var apiOutputEl     = document.getElementById('apiOutput');
  var svcDot          = document.getElementById('svcDot');

  var activeOverlay = null;

  // ── Toast ─────────────────────────────────────────────────────────────────
  window.AppToast = function (msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = [
      'position:fixed;bottom:40px;left:50%;transform:translateX(-50%)',
      'background:#1e2e50;border:2px solid #3a4a70;border-radius:10px',
      'padding:14px 28px;font-size:20px;color:#d0d8f0',
      'z-index:600;pointer-events:none;max-width:900px;text-align:center'
    ].join(';');
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity 0.5s'; t.style.opacity = '0'; }, 3000);
    setTimeout(function () { t.remove(); }, 3600);
  };

  // ── Service dot ───────────────────────────────────────────────────────────
  function setSvcDot(state) {
    // state: 'ok' | 'fail' | 'unknown'
    if (!svcDot) return;
    svcDot.className = 'svc-dot ' + state;
    svcDot.title = state === 'ok' ? 'Service: running' :
                   state === 'fail' ? 'Service: unreachable' : 'Service: unknown';
  }

  function pingService() {
    setSvcDot('unknown');
    RuntimePatchBridge.installFromUrl('__ping__', function (err) {
      if (err) {
        setSvcDot('fail');
        Logger.debug('service', 'Ping failed', { error: err.message });
      } else {
        setSvcDot('ok');
        Logger.debug('service', 'Ping OK');
      }
    });
  }

  // ── Update badge ──────────────────────────────────────────────────────────
  function updateBadge() {
    var badge = document.getElementById('updateBadge');
    if (!badge) return;
    var info = AppUpdate && AppUpdate.getAvailable();
    if (info) {
      badge.textContent = '⬆ v' + info.version;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Settings definition ───────────────────────────────────────────────────
  var SETTINGS_DEF = [
    { section: 'Debug' },
    { id: 'debug.enabled',       label: 'Debug logging',         type: 'bool',
      get: function () { return AppConfig.debug.enabled; },
      set: function (v) { AppConfig.debug.enabled = v; } },
    { id: 'debug.remoteLogging', label: 'Remote log server',     type: 'bool',
      get: function () { return AppConfig.debug.remoteLogging; },
      set: function (v) { AppConfig.debug.remoteLogging = v; } },
    { id: 'debug.serverIp',      label: 'Log server IP',         type: 'string',
      get: function () { return AppConfig.debug.serverIp; },
      set: function (v) { AppConfig.debug.serverIp = v; } },
    { id: 'debug.serverPort',    label: 'Log server port',       type: 'number',
      get: function () { return AppConfig.debug.serverPort; },
      set: function (v) { AppConfig.debug.serverPort = parseInt(v, 10) || 3030; } },

    { section: 'Debug Console' },
    { id: 'console.enabled',  label: 'Enable (Yellow key)',      type: 'bool',
      get: function () { return AppConfig.console.enabled; },
      set: function (v) { AppConfig.console.enabled = v; } },
    { id: 'console.position', label: 'Position',                 type: 'choice',
      choices: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      get: function () { return AppConfig.console.position; },
      set: function (v) { AppConfig.console.position = v; } },
    { id: 'console.width',    label: 'Width (px)',               type: 'number',
      get: function () { return AppConfig.console.width; },
      set: function (v) { AppConfig.console.width = parseInt(v, 10) || 900; } },
    { id: 'console.height',   label: 'Height (px)',              type: 'number',
      get: function () { return AppConfig.console.height; },
      set: function (v) { AppConfig.console.height = parseInt(v, 10) || 500; } },

    { section: 'YouTube' },
    { id: 'youtube.apiKey',       label: 'Data API key',         type: 'string',
      get: function () { return AppConfig.youtube.apiKey; },
      set: function (v) { AppConfig.youtube.apiKey = v; } },
    { id: 'youtube.clientId',     label: 'OAuth Client ID',      type: 'string',
      get: function () { return AppConfig.youtube.clientId || ''; },
      set: function (v) { AppConfig.youtube.clientId = v; } },
    { id: 'youtube.clientSecret', label: 'OAuth Client Secret',  type: 'string',
      get: function () { return AppConfig.youtube.clientSecret || ''; },
      set: function (v) { AppConfig.youtube.clientSecret = v; } },
    { id: 'action.oauthLogin',  label: '🔑 Sign in with YouTube', type: 'action',
      action: function () {
        settingsOverlay.classList.add('hidden');
        activeOverlay = null;
        setTimeout(function () { Auth.showLoginUI(); }, 200);
      }},
    { id: 'action.oauthLogout', label: '⏏ Sign out',             type: 'action',
      action: function () { Auth.clearToken(); AppToast('Signed out.'); } },
    { id: 'action.oauthStatus', label: 'Auth status',            type: 'action',
      action: function () {
        var t = Auth.getToken();
        AppToast(t ? (Auth.isValid() ? '✓ Signed in' : '⚠ Token needs refresh') : '✗ Not signed in');
      }},

    { section: 'Updates' },
    { id: 'action.checkUpdate',   label: '↻ Check for updates',  type: 'action',
      action: function () {
        AppUpdate.check(false).then(function () { updateBadge(); });
      }},
    { id: 'action.installUpdate', label: '⬇ Install latest',     type: 'action',
      action: function () {
        // Always install latest from GitHub regardless of whether it is
        // "newer" than current — user explicitly requested it.
        AppToast('Fetching latest release…');
        AppUpdate.installLatestForce(function (msg, pct) {
          AppToast(msg);
          if (pct === 100) updateBadge();
        });
      }},

    { section: 'Diagnostics' },
    { id: 'action.keyDiag',   label: '🔑 Show key codes',        type: 'action',
      action: function () {
        Logger.info('diag', 'KEY values', {
          yellow: KEY.YELLOW, red: KEY.RED, green: KEY.GREEN, blue: KEY.BLUE
        });
        AppToast('Y:' + KEY.YELLOW + ' R:' + KEY.RED + ' G:' + KEY.GREEN + ' B:' + KEY.BLUE);
      }},
    { id: 'action.testLog',   label: 'Send test log',            type: 'action',
      action: function () {
        Logger.begin('test', 'Manual test log');
        Logger.info('test', 'Test from settings', { source: 'settings' });
        Logger.end('test', 'Manual test log');
      }},

    { section: 'Actions' },
    { id: 'action.reset', label: '✗ Reset defaults',             type: 'action',
      action: function () { AppConfig.reset(); location.reload(); }}
  ];

  // ── Build settings UI ─────────────────────────────────────────────────────
  function buildSettings() {
    settingsList.innerHTML = '';
    SETTINGS_DEF.forEach(function (def) {
      if (def.section) {
        var hdr = document.createElement('div');
        hdr.className = 'settings-section-header';
        hdr.textContent = def.section;
        settingsList.appendChild(hdr);
        return;
      }
      var row = document.createElement('div');
      row.className = 'settings-row';
      row.setAttribute('tabindex', '0');
      var lbl = document.createElement('span'); lbl.className = 'settings-label'; lbl.textContent = def.label;
      var val = document.createElement('span'); val.className = 'settings-value'; refreshValue(val, def);
      row.appendChild(lbl); row.appendChild(val);
      settingsList.appendChild(row);
      row.addEventListener('keydown', function (e) {
        if (e.keyCode === KEY.ENTER || e.keyCode === KEY.RIGHT) { e.stopPropagation(); activateSetting(def, val); }
        if (e.keyCode === KEY.LEFT && (def.type === 'choice' || def.type === 'bool')) { e.stopPropagation(); activateBack(def, val); }
      });
      row.addEventListener('click', function () { activateSetting(def, val); });
    });
  }

  function refreshValue(el, def) {
    if (def.type === 'action') { el.textContent = '▶'; el.style.color = '#f0c040'; return; }
    if (def.type === 'bool') {
      var bv = def.get(); el.textContent = bv ? '✓ ON' : '✗ OFF'; el.style.color = bv ? '#4fc' : '#f44'; return;
    }
    if (def.type === 'choice') { el.textContent = def.get(); el.style.color = '#4fc'; return; }
    var sv = String(def.get() || '');
    if (def.id.indexOf('Secret') >= 0 || def.id.indexOf('apiKey') >= 0) {
      sv = sv ? sv.slice(0, 4) + '…(' + sv.length + ')' : '';
    }
    el.textContent = sv.length > 30 ? sv.slice(0, 27) + '…' : (sv || '(not set)');
    el.style.color = sv ? '#4fc' : '#556';
  }

  function activateSetting(def, valEl) {
    if (def.type === 'bool') {
      def.set(!def.get()); refreshValue(valEl, def);
      AppConfig.save(); // auto-save on every change
    } else if (def.type === 'choice') {
      cycleChoice(def, valEl, 1);
      AppConfig.save();
    } else if (def.type === 'action') {
      def.action();
    } else {
      showInputDialog(def.label, String(def.get() || ''), function (v) {
        def.set(v); refreshValue(valEl, def);
        AppConfig.save();
      });
    }
  }

  function activateBack(def, valEl) {
    if (def.type === 'bool')   { def.set(!def.get()); refreshValue(valEl, def); AppConfig.save(); }
    if (def.type === 'choice') { cycleChoice(def, valEl, -1); AppConfig.save(); }
  }

  function cycleChoice(def, valEl, dir) {
    var c = def.choices;
    def.set(c[(c.indexOf(def.get()) + dir + c.length) % c.length]);
    refreshValue(valEl, def);
  }

  var inputDialogOpen = false;
  function showInputDialog(label, current, cb) {
    var dlg       = document.getElementById('inputDialog');
    var field     = document.getElementById('inputDialogField');
    var okBtn     = document.getElementById('inputOk');
    var cancelBtn = document.getElementById('inputCancel');
    document.getElementById('inputDialogLabel').textContent = label;
    field.value = current;
    field.removeAttribute('readonly');
    dlg.classList.remove('hidden');
    inputDialogOpen = true;
    setTimeout(function () { field.focus(); }, 50);

    function close(save) {
      dlg.classList.add('hidden');
      field.setAttribute('readonly', '');
      inputDialogOpen = false;
      if (save) cb(field.value);
      // Restore focus to first settings row
      var rows = settingsList.querySelectorAll('.settings-row');
      if (rows.length) setTimeout(function () { rows[0].focus(); }, 50);
    }

    field.onkeydown = function (e) {
      e.stopPropagation();
      if (e.keyCode === 13)       { close(true); }
      if (e.keyCode === KEY.BACK) { close(false); }
      if (e.keyCode === KEY.DOWN) { e.preventDefault(); okBtn.focus(); }
    };
    okBtn.onkeydown = function (e) {
      e.stopPropagation();
      if (e.keyCode === 13)                             { close(true); }
      if (e.keyCode === KEY.BACK)                       { close(false); }
      if (e.keyCode === KEY.RIGHT)                      { cancelBtn.focus(); }
      if (e.keyCode === KEY.LEFT || e.keyCode===KEY.UP) { field.focus(); }
    };
    cancelBtn.onkeydown = function (e) {
      e.stopPropagation();
      if (e.keyCode === 13 || e.keyCode === KEY.BACK) { close(false); }
      if (e.keyCode === KEY.LEFT)                     { okBtn.focus(); }
      if (e.keyCode === KEY.UP)                       { field.focus(); }
    };
    okBtn.onclick     = function () { close(true); };
    cancelBtn.onclick = function () { close(false); };
  }

  // ── Readonly inputs (playlist + any standalone inputs) ────────────────────
  function initReadonlyInputs() {
    // Only the playlist input — inputDialogField is managed separately
    var inputs = [document.getElementById('playlistId')].filter(Boolean);
    inputs.forEach(function (input) {
      input.setAttribute('readonly', '');
      input.addEventListener('keydown', function (e) {
        if (input.hasAttribute('readonly')) {
          if (e.keyCode === KEY.ENTER) {
            e.stopPropagation(); e.preventDefault();
            input.removeAttribute('readonly');
            input.blur(); input.focus();
          }
          return;
        }
        if (e.keyCode === KEY.LEFT || e.keyCode === KEY.RIGHT) { e.stopPropagation(); return; }
        if (e.keyCode === KEY.ENTER) {
          e.stopPropagation(); e.preventDefault();
          input.setAttribute('readonly', '');
          input.blur();
        }
        if (e.keyCode === KEY.BACK) {
          e.stopPropagation(); e.preventDefault();
          input.setAttribute('readonly', '');
          input.blur();
        }
      });
      input.addEventListener('blur', function () {
        input.setAttribute('readonly', '');
        // Re-focus the fetchBtn so navigation continues without needing Enter
        setTimeout(function () {
          if (activeOverlay === 'playlist') {
            var btn = document.getElementById('fetchBtn');
            if (btn) btn.focus();
          }
        }, 80);
      });
    });
  }

  // ── Overlays ──────────────────────────────────────────────────────────────
  function openSettings() {
    Logger.info('settings', 'Settings opened');
    buildSettings();
    settingsOverlay.classList.remove('hidden');
    activeOverlay = 'settings';
    settingsList.scrollTop = 0;
    var first = settingsList.querySelector('.settings-row');
    if (first) first.focus();
  }

  function openPlaylist() {
    playlistOverlay.classList.remove('hidden');
    activeOverlay = 'playlist';
    var btn = document.getElementById('fetchBtn');
    if (btn) btn.focus();
  }

  function openDebugConsole() {
    if (!AppConfig.console.enabled) { AppToast('Debug console disabled — enable in Settings'); return; }
    applyDebugStyle();
    renderDebugLogs();
    debugOverlay.classList.remove('hidden');
    debugPanel.setAttribute('tabindex', '0');
    activeOverlay = 'debug';
    debugPanel.focus();
    Logger.info('debug-console', 'Opened');
  }

  function closeOverlay() {
    settingsOverlay.classList.add('hidden');
    playlistOverlay.classList.add('hidden');
    debugOverlay.classList.add('hidden');
    activeOverlay = null;
    setTimeout(function () {
      var f = getMainFocusable();
      if (f.length) f[0].focus();
    }, 150);
  }

  function applyDebugStyle() {
    var c = AppConfig.console, p = debugPanel;
    p.style.width   = Math.min(parseInt(c.width)  || 900, window.innerWidth  - 40) + 'px';
    p.style.height  = Math.min(parseInt(c.height) || 500, window.innerHeight - 80) + 'px';
    p.style.opacity = String(Math.min(Math.max(parseFloat(c.opacity) || 0.93, 0.4), 1));
    p.style.top = p.style.bottom = p.style.left = p.style.right = 'auto';
    if (c.position.indexOf('top')  >= 0) p.style.top    = '60px'; else p.style.bottom = '20px';
    if (c.position.indexOf('left') >= 0) p.style.left   = '20px'; else p.style.right  = '20px';
  }

  function renderDebugLogs() {
    var entries = Logger.getLogs();
    var COLORS  = { DEBUG: '#6688aa', INFO: '#4fc', WARN: '#fa0', ERROR: '#f44' };
    debugLogs.innerHTML = '';
    var lastCtx = null;
    entries.forEach(function (e) {
      if (e.context !== lastCtx) {
        var sep = document.createElement('div'); sep.className = 'dl-separator';
        sep.textContent = '── ' + e.context.toUpperCase() + ' ──';
        debugLogs.appendChild(sep); lastCtx = e.context;
      }
      var row = document.createElement('div'); row.className = 'dl-row';
      row.innerHTML =
        '<span class="dl-ts">'  + esc(e.ts.slice(11, 23)) + '</span>' +
        '<span class="dl-lvl" style="color:' + (COLORS[e.level] || '#fff') + '">' + esc(e.level.padEnd(5)) + '</span>' +
        '<span class="dl-msg">' + esc(e.message) + '</span>';
      if (e.data) {
        var d = document.createElement('div'); d.className = 'dl-data';
        try { d.textContent = JSON.stringify(e.data); } catch (_) {}
        row.appendChild(d);
      }
      debugLogs.appendChild(row);
    });
    debugLogs.scrollTop = 0;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Focus navigation ──────────────────────────────────────────────────────
  function getMainFocusable() {
    return Array.from(document.querySelectorAll('button, [tabindex="0"]'))
      .filter(function (el) { return !el.closest('.overlay') && el.offsetParent !== null; });
  }

  function getOverlayFocusable() {
    var scope = activeOverlay === 'settings' ? settingsOverlay
              : activeOverlay === 'playlist' ? playlistOverlay : null;
    if (!scope) return [];
    return Array.from(scope.querySelectorAll('.settings-row, button, input'))
      .filter(function (el) { return el.offsetParent !== null; });
  }

  function moveFocus(dir) {
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT' && !active.hasAttribute('readonly')) return;
    var list = (activeOverlay === 'settings' || activeOverlay === 'playlist')
      ? getOverlayFocusable() : getMainFocusable();
    if (!list.length) return;
    var idx = list.indexOf(active);
    idx = dir === 'next' ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length;
    list[idx].focus();
    list[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── Global keydown ────────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (inputDialogOpen) return;

    var kc = e.keyCode;

    // Yellow, Red, Green all toggle debug console
    if (kc === KEY.YELLOW || kc === KEY.RED || kc === KEY.GREEN ||
        kc === 403 || kc === 404 || kc === 405) {
      e.preventDefault();
      Logger.debug('keys', 'Debug key', { kc: kc });
      if (activeOverlay === 'debug') { closeOverlay(); }
      else {
        settingsOverlay.classList.add('hidden');
        playlistOverlay.classList.add('hidden');
        activeOverlay = null;
        openDebugConsole();
      }
      return;
    }

    if (kc === KEY.BACK) {
      e.preventDefault();
      if (activeOverlay) { closeOverlay(); return; }
      tizen.application.getCurrentApplication().exit();
      return;
    }

    if (activeOverlay === 'debug') {
      if (kc === KEY.UP)   { e.preventDefault(); debugLogs.scrollTop -= 80; }
      if (kc === KEY.DOWN) { e.preventDefault(); debugLogs.scrollTop += 80; }
      return;
    }

    var active = document.activeElement;
    if (active && active.tagName === 'INPUT' && !active.hasAttribute('readonly')) return;

    if (kc === KEY.UP   || kc === KEY.LEFT)  { e.preventDefault(); moveFocus('prev'); }
    if (kc === KEY.DOWN || kc === KEY.RIGHT) { e.preventDefault(); moveFocus('next'); }
    if (kc === KEY.ENTER) {
      if (active && active.tagName !== 'INPUT') { e.preventDefault(); active.click(); }
    }
  });

  // ── Network ───────────────────────────────────────────────────────────────
  function initNetwork() {
    Logger.begin('network', 'initNetwork');
    if (typeof webapis === 'undefined' || !webapis.network) {
      Logger.warn('network', 'webapis.network unavailable');
      if (networkTextEl) networkTextEl.textContent = 'Net N/A';
      Logger.end('network', 'initNetwork'); return;
    }
    try {
      var connected = webapis.network.isConnectedToGateway();
      var type      = webapis.network.getActiveConnectionType();
      var ip        = webapis.network.getIp();
      var names     = { 0: 'Disconnected', 1: 'WiFi', 2: 'Cellular', 3: 'Ethernet' };
      networkTextEl.textContent = (names[type] || '?') + ' ' + ip + ' GW:' + (connected ? '✓' : '✗');
      Logger.info('network', 'Status', { type: names[type], ip: ip, gateway: connected });
      if (!connected) { statusTextEl.textContent = 'No network!'; statusTextEl.style.color = '#f44'; }
      webapis.network.addNetworkStateChangeListener(function (v) {
        var ns = webapis.network.NetworkState;
        if (v === ns.GATEWAY_DISCONNECTED) {
          statusTextEl.textContent = 'Network lost!'; statusTextEl.style.color = '#f44';
        } else if (v === ns.GATEWAY_CONNECTED) {
          statusTextEl.style.color = ''; initNetwork();
        }
      });
    } catch (e) { Logger.error('network', 'Error', { error: e.message }); }
    Logger.end('network', 'initNetwork');
  }

  // ── Playlist ──────────────────────────────────────────────────────────────
  async function fetchPlaylistItems() {
    Logger.begin('youtube', 'fetchPlaylistItems');
    var apiKey     = AppConfig.youtube.apiKey;
    var playlistId = document.getElementById('playlistId').value.trim();
    if (!apiKey)     { apiOutputEl.textContent = 'No API key — set in ⚙ Settings.'; Logger.warn('youtube', 'No API key'); Logger.end('youtube', 'fetchPlaylistItems'); return; }
    if (!playlistId) { apiOutputEl.textContent = 'Enter a playlist ID.'; Logger.warn('youtube', 'No playlist ID'); Logger.end('youtube', 'fetchPlaylistItems'); return; }
    apiOutputEl.textContent = 'Fetching…';
    Logger.info('youtube', 'Fetching', { playlistId: playlistId });
    try {
      var url  = 'https://www.googleapis.com/youtube/v3/playlistItems?' +
        new URLSearchParams({ part: 'snippet', playlistId: playlistId, maxResults: '5', key: apiKey });
      var res  = await fetch(url);
      var data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || 'HTTP ' + res.status);
      var items = (data.items || []).map(function (it, i) {
        return (i + 1) + '. ' + ((it.snippet && it.snippet.title) || '(no title)');
      });
      apiOutputEl.textContent = items.length ? 'Fetched ' + items.length + ' items:\n' + items.join('\n') : 'No items.';
      Logger.info('youtube', 'Done', { count: items.length });
    } catch (err) {
      apiOutputEl.textContent = 'Error: ' + err.message;
      Logger.error('youtube', 'Failed', { error: err.message });
    }
    Logger.end('youtube', 'fetchPlaylistItems');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    Logger.begin('main', 'init');
    statusTextEl.textContent = 'Running';

    var app = tizen.application.getCurrentApplication();
    versionTextEl.textContent = 'v' + app.appInfo.version;
    Logger.info('main', 'Started', {
      id:       app.appInfo.id,
      version:  app.appInfo.version,
      service:  AppIdentity.serviceAppId,
      repo:     AppIdentity.githubRepoFull(),
      platform: tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
    });

    AppKeys.init();
    initNetwork();
    initReadonlyInputs();

    Logger.onLog(function () { if (activeOverlay === 'debug') renderDebugLogs(); });

    gearBtn.addEventListener('click', openSettings);
    playlistBtn.addEventListener('click', openPlaylist);
    if (debugBtn) debugBtn.addEventListener('click', openDebugConsole);
    document.getElementById('fetchBtn').addEventListener('click', fetchPlaylistItems);
    document.getElementById('playlistCloseBtn').addEventListener('click', closeOverlay);
    document.getElementById('launchBtn').addEventListener('click', function () {
      Logger.info('main', 'Launching YouTube TV');
      window.YouTubeTV.launch();
    });

    // Startup update check — silent
    AppUpdate.startupCheck();
    setTimeout(updateBadge, 6000);

    // Ping service at startup and log result alongside version info
    setTimeout(function () {
      RuntimePatchBridge.installFromUrl('__ping__', function (err) {
        if (err) {
          setSvcDot('fail');
          Logger.warn('main', 'Service not available at startup', { error: err.message });
        } else {
          setSvcDot('ok');
          Logger.info('main', 'Service is running', { id: AppIdentity.serviceAppId });
        }
      });
    }, 1500);

    var f = getMainFocusable();
    if (f.length) f[0].focus();

    Logger.end('main', 'init');
  }

  window.addEventListener('load', init);
})();