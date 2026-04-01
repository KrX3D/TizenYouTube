(function () {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  var statusTextEl   = document.getElementById('statusText');
  var versionTextEl  = document.getElementById('versionText');
  var networkTextEl  = document.getElementById('networkText');
  var gearBtn        = document.getElementById('gearBtn');
  var settingsOverlay = document.getElementById('settingsOverlay');
  var settingsList   = document.getElementById('settingsList');
  var debugOverlay   = document.getElementById('debugOverlay');
  var debugPanel     = document.getElementById('debugPanel');
  var debugLogs      = document.getElementById('debugLogs');
  var apiOutputEl    = document.getElementById('apiOutput');

  // ── State ─────────────────────────────────────────────────────────────────
  var activeOverlay = null; // 'settings' | 'debug' | null

  // ── Key codes ─────────────────────────────────────────────────────────────
  var KEY = {
    UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
    ENTER: 13, BACK: 10009,
    YELLOW: 405, RED: 403, GREEN: 404, BLUE: 406
  };

  // ── Register remote keys ──────────────────────────────────────────────────
  function registerKeys() {
    try {
      var supported = tizen.tvinputdevice.getSupportedKeys();
      ['ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue',
       'MediaPlayPause','MediaPlay','MediaPause','MediaStop'].forEach(function (name) {
        if (supported.some(function (k) { return k.name === name; })) {
          tizen.tvinputdevice.registerKey(name);
        }
      });
    } catch (e) {
      Logger.warn('main', 'Key registration failed', { error: e.message });
    }
  }

  // ── Settings definition ───────────────────────────────────────────────────
  var SETTINGS_DEF = [
    { section: 'Debug' },
    { id: 'debug.enabled',       label: 'Debug logging enabled',  type: 'bool',
      get: function () { return AppConfig.debug.enabled; },
      set: function (v) { AppConfig.debug.enabled = v; } },
    { id: 'debug.remoteLogging', label: 'Remote log server',       type: 'bool',
      get: function () { return AppConfig.debug.remoteLogging; },
      set: function (v) { AppConfig.debug.remoteLogging = v; } },
    { id: 'debug.serverIp',      label: 'Log server IP',           type: 'string',
      get: function () { return AppConfig.debug.serverIp; },
      set: function (v) { AppConfig.debug.serverIp = v; } },
    { id: 'debug.serverPort',    label: 'Log server port',         type: 'number',
      get: function () { return AppConfig.debug.serverPort; },
      set: function (v) { AppConfig.debug.serverPort = parseInt(v, 10) || 3030; } },

    { section: 'Debug Console' },
    { id: 'console.enabled',     label: 'Enable (Yellow key)',     type: 'bool',
      get: function () { return AppConfig.console.enabled; },
      set: function (v) { AppConfig.console.enabled = v; } },
    { id: 'console.position',    label: 'Position',               type: 'choice',
      choices: ['top-left','top-right','bottom-left','bottom-right'],
      get: function () { return AppConfig.console.position; },
      set: function (v) { AppConfig.console.position = v; } },
    { id: 'console.width',       label: 'Width (px)',             type: 'number',
      get: function () { return AppConfig.console.width; },
      set: function (v) { AppConfig.console.width = parseInt(v, 10) || 900; } },
    { id: 'console.height',      label: 'Height (px)',            type: 'number',
      get: function () { return AppConfig.console.height; },
      set: function (v) { AppConfig.console.height = parseInt(v, 10) || 500; } },
    { id: 'console.opacity',     label: 'Opacity (0.1–1.0)',      type: 'number',
      get: function () { return AppConfig.console.opacity; },
      set: function (v) { AppConfig.console.opacity = parseFloat(v) || 0.93; } },

    { section: 'YouTube' },
    { id: 'youtube.apiKey',      label: 'API key',                type: 'string',
      get: function () { return AppConfig.youtube.apiKey; },
      set: function (v) { AppConfig.youtube.apiKey = v; } },

    { section: 'Actions' },
    { id: 'action.testLog',      label: 'Send test log now',      type: 'action',
      action: function () {
        Logger.begin('test', 'Manual test log');
        Logger.info('test', 'Test event from settings', { source: 'settings-action' });
        Logger.end('test', 'Manual test log');
      }},
    { id: 'action.save',         label: '✓ Save & close',         type: 'action',
      action: function () {
        AppConfig.save();
        Logger.info('settings', 'Settings saved');
        closeOverlay();
      }},
    { id: 'action.reset',        label: '✗ Reset to defaults',    type: 'action',
      action: function () {
        AppConfig.reset();
        location.reload();
      }}
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

      var lbl = document.createElement('span');
      lbl.className = 'settings-label';
      lbl.textContent = def.label;

      var val = document.createElement('span');
      val.className = 'settings-value';
      refreshValue(val, def);

      row.appendChild(lbl);
      row.appendChild(val);
      settingsList.appendChild(row);

      row.addEventListener('keydown', function (e) {
        if (e.keyCode === KEY.ENTER || e.keyCode === KEY.RIGHT) {
          e.stopPropagation();
          activateSetting(def, val);
        }
        if (e.keyCode === KEY.LEFT && def.type === 'choice') {
          e.stopPropagation();
          cycleChoice(def, val, -1);
        }
      });
      row.addEventListener('click', function () { activateSetting(def, val); });
    });
  }

  function refreshValue(el, def) {
    if (def.type === 'action') { el.textContent = '▶ press Enter'; el.style.color = '#f0c040'; return; }
    if (def.type === 'bool')   { el.textContent = def.get() ? '✓ ON' : '✗ OFF'; el.style.color = def.get() ? '#4fc' : '#f44'; return; }
    if (def.type === 'choice') { el.textContent = def.get(); el.style.color = '#4fc'; return; }
    var v = String(def.get() || '');
    el.textContent = v.length > 34 ? v.slice(0, 31) + '…' : (v || '(not set)');
    el.style.color = v ? '#4fc' : '#666';
  }

  function activateSetting(def, valEl) {
    if (def.type === 'bool')   { def.set(!def.get()); refreshValue(valEl, def); }
    else if (def.type === 'choice') { cycleChoice(def, valEl, 1); }
    else if (def.type === 'action') { def.action(); }
    else { showInputDialog(def.label, String(def.get() || ''), function (v) { def.set(v); refreshValue(valEl, def); }); }
  }

  function cycleChoice(def, valEl, dir) {
    var c = def.choices;
    var next = (c.indexOf(def.get()) + dir + c.length) % c.length;
    def.set(c[next]);
    refreshValue(valEl, def);
  }

  // Inline input dialog
  var inputDialogOpen = false;
  function showInputDialog(label, current, cb) {
    var dlg = document.getElementById('inputDialog');
    document.getElementById('inputDialogLabel').textContent = label;
    var field = document.getElementById('inputDialogField');
    field.value = current;
    dlg.classList.remove('hidden');
    inputDialogOpen = true;
    setTimeout(function () { field.focus(); }, 50);

    function close(save) {
      dlg.classList.add('hidden');
      inputDialogOpen = false;
      if (save) cb(field.value);
      var rows = settingsList.querySelectorAll('.settings-row');
      if (rows.length) rows[0].focus();
    }

    document.getElementById('inputOk').onclick     = function () { close(true); };
    document.getElementById('inputCancel').onclick  = function () { close(false); };
    field.onkeydown = function (e) {
      if (e.keyCode === 13)      { e.stopPropagation(); close(true); }
      if (e.keyCode === KEY.BACK){ e.stopPropagation(); close(false); }
    };
  }

  // ── Overlay management ────────────────────────────────────────────────────
  function openSettings() {
    Logger.info('settings', 'Settings opened');
    buildSettings();
    settingsOverlay.classList.remove('hidden');
    activeOverlay = 'settings';
    var first = settingsList.querySelector('.settings-row');
    if (first) first.focus();
  }

  function openDebugConsole() {
    if (!AppConfig.console.enabled) {
      Logger.warn('debug-console', 'Console disabled in settings');
      return;
    }
    applyDebugStyle();
    renderDebugLogs();
    debugOverlay.classList.remove('hidden');
    debugPanel.setAttribute('tabindex', '0');
    activeOverlay = 'debug';
    debugPanel.focus();
    Logger.info('debug-console', 'Debug console opened');
  }

  function closeOverlay() {
    settingsOverlay.classList.add('hidden');
    debugOverlay.classList.add('hidden');
    activeOverlay = null;
    var f = getMainFocusable();
    if (f.length) f[0].focus();
  }

  function applyDebugStyle() {
    var c = AppConfig.console;
    var p = debugPanel;
    p.style.width   = c.width  + 'px';
    p.style.height  = c.height + 'px';
    p.style.opacity = c.opacity;
    p.style.top = p.style.bottom = p.style.left = p.style.right = '';
    if (c.position.indexOf('top')    >= 0) p.style.top    = '60px'; else p.style.bottom = '20px';
    if (c.position.indexOf('left')   >= 0) p.style.left   = '20px'; else p.style.right  = '20px';
  }

  // ── Debug log rendering ───────────────────────────────────────────────────
  function renderDebugLogs() {
    var entries = Logger.getLogs();
    var COLORS  = { DEBUG: '#888', INFO: '#4fc', WARN: '#fa0', ERROR: '#f44' };
    debugLogs.innerHTML = '';
    var lastCtx = null;

    entries.forEach(function (e) {
      if (e.context !== lastCtx) {
        var sep = document.createElement('div');
        sep.className = 'dl-separator';
        sep.textContent = '── ' + e.context.toUpperCase() + ' ──';
        debugLogs.appendChild(sep);
        lastCtx = e.context;
      }

      var row = document.createElement('div');
      row.className = 'dl-row';

      row.innerHTML =
        '<span class="dl-ts">'  + esc(e.ts.slice(11, 23))   + '</span>' +
        '<span class="dl-lvl" style="color:' + (COLORS[e.level]||'#fff') + '">' + esc(e.level.padEnd(5)) + '</span>' +
        '<span class="dl-msg">' + esc(e.message) + '</span>';

      if (e.data) {
        var d = document.createElement('div');
        d.className = 'dl-data';
        try { d.textContent = JSON.stringify(e.data); } catch(x) {}
        row.appendChild(d);
      }

      debugLogs.appendChild(row);
    });

    // stay scrolled to top (newest first)
    debugLogs.scrollTop = 0;
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function getMainFocusable() {
    return Array.from(document.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
      .filter(function (el) { return !el.closest('.overlay') && el.offsetParent !== null; });
  }

  function getOverlayFocusable() {
    var scope = activeOverlay === 'settings' ? settingsOverlay : null;
    if (!scope) return [];
    return Array.from(scope.querySelectorAll('.settings-row:not(.hidden), button, input'))
      .filter(function (el) { return el.offsetParent !== null; });
  }

  function moveFocus(dir) {
    var list = activeOverlay === 'settings' ? getOverlayFocusable() : getMainFocusable();
    if (!list.length) return;
    var idx = list.indexOf(document.activeElement);
    idx = dir === 'next' ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length;
    list[idx].focus();
    list[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── Global key handler ────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (inputDialogOpen) return; // field handles its own keys

    // Yellow — toggle debug console
    if (e.keyCode === KEY.YELLOW) {
      e.preventDefault();
      activeOverlay === 'debug' ? closeOverlay() : (activeOverlay === null ? openDebugConsole() : null);
      return;
    }

    // Back — close overlay or exit app
    if (e.keyCode === KEY.BACK) {
      e.preventDefault();
      if (activeOverlay) { closeOverlay(); return; }
      tizen.application.getCurrentApplication().exit();
      return;
    }

    // Debug console: scroll only
    if (activeOverlay === 'debug') {
      if (e.keyCode === KEY.UP)   { e.preventDefault(); debugLogs.scrollTop -= 80; }
      if (e.keyCode === KEY.DOWN) { e.preventDefault(); debugLogs.scrollTop += 80; }
      return;
    }

    if (e.keyCode === KEY.UP   || e.keyCode === KEY.LEFT)  { e.preventDefault(); moveFocus('prev'); }
    if (e.keyCode === KEY.DOWN || e.keyCode === KEY.RIGHT) { e.preventDefault(); moveFocus('next'); }
    if (e.keyCode === KEY.ENTER) {
      if (document.activeElement && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        document.activeElement.click();
      }
    }
  });

  // ── Network ───────────────────────────────────────────────────────────────
  function initNetwork() {
    Logger.begin('network', 'initNetwork');
    if (typeof webapis === 'undefined' || !webapis.network) {
      Logger.warn('network', 'webapis.network unavailable');
      networkTextEl.textContent = 'Net API N/A';
      Logger.end('network', 'initNetwork');
      return;
    }
    try {
      var connected = webapis.network.isConnectedToGateway();
      var type      = webapis.network.getActiveConnectionType();
      var ip        = webapis.network.getIp();
      var names     = {0:'Disconnected',1:'WiFi',2:'Cellular',3:'Ethernet'};
      networkTextEl.textContent = (names[type]||'?') + '  ' + ip + '  GW:' + (connected?'✓':'✗');
      Logger.info('network', 'Network status', { type: names[type], ip: ip, gateway: connected });

      if (!connected) { statusTextEl.textContent = 'No network!'; statusTextEl.style.color = '#f44'; }

      webapis.network.addNetworkStateChangeListener(function (v) {
        var ns = webapis.network.NetworkState;
        if (v === ns.GATEWAY_DISCONNECTED) {
          Logger.warn('network', 'Gateway disconnected');
          statusTextEl.textContent = 'Network lost!'; statusTextEl.style.color = '#f44';
        } else if (v === ns.GATEWAY_CONNECTED) {
          Logger.info('network', 'Gateway connected');
          statusTextEl.textContent = 'Connected'; statusTextEl.style.color = '';
          initNetwork();
        }
      });
    } catch (e) {
      Logger.error('network', 'Network API error', { error: e.message });
    }
    Logger.end('network', 'initNetwork');
  }

  // ── YouTube ───────────────────────────────────────────────────────────────
  async function fetchPlaylistItems() {
    Logger.begin('youtube', 'fetchPlaylistItems');
    var apiKey     = AppConfig.youtube.apiKey;
    var playlistId = document.getElementById('playlistId').value.trim();

    if (!apiKey) {
      apiOutputEl.textContent = 'No API key — set it in ⚙ Settings.';
      Logger.warn('youtube', 'API key missing');
      Logger.end('youtube', 'fetchPlaylistItems');
      return;
    }
    if (!playlistId) {
      apiOutputEl.textContent = 'Enter a playlist ID first.';
      Logger.warn('youtube', 'Playlist ID missing');
      Logger.end('youtube', 'fetchPlaylistItems');
      return;
    }

    var url = 'https://www.googleapis.com/youtube/v3/playlistItems?' +
      new URLSearchParams({ part:'snippet,contentDetails,status', playlistId:playlistId, maxResults:'5', key:apiKey });

    Logger.info('youtube', 'Requesting playlist', { playlistId: playlistId });
    try {
      var res  = await fetch(url);
      var data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || 'HTTP ' + res.status);
      var items = (data.items||[]).map(function (it, i) {
        return (i+1) + '. ' + ((it.snippet && it.snippet.title) || '(no title)');
      });
      apiOutputEl.textContent = items.length ? 'Fetched ' + items.length + ' items:\n' + items.join('\n') : 'No items found.';
      Logger.info('youtube', 'Playlist fetched', { count: items.length });
    } catch (err) {
      apiOutputEl.textContent = 'Error: ' + err.message;
      Logger.error('youtube', 'Playlist fetch failed', { error: err.message });
    }
    Logger.end('youtube', 'fetchPlaylistItems');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    Logger.begin('main', 'init');
    statusTextEl.textContent = 'Running';

    var app = tizen.application.getCurrentApplication();
    versionTextEl.textContent = app.appInfo.id + '  v' + app.appInfo.version;
    Logger.info('main', 'App started', {
      id: app.appInfo.id,
      version: app.appInfo.version,
      platform: tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
    });

    registerKeys();
    initNetwork();

    // Update debug console live if open
    Logger.onLog(function () { if (activeOverlay === 'debug') renderDebugLogs(); });

    gearBtn.addEventListener('click', openSettings);
    document.getElementById('fetchBtn').addEventListener('click', fetchPlaylistItems);

    var f = getMainFocusable();
    if (f.length) f[0].focus();

    Logger.end('main', 'init');
  }

  window.addEventListener('load', init);
})();