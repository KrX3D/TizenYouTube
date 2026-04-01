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

  var activeOverlay   = null;

  var KEY = {
    UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
    ENTER: 13, BACK: 10009,
    YELLOW: 405, RED: 403, GREEN: 404, BLUE: 406
  };

  // ── Register remote keys ──────────────────────────────────────────────────
  function registerKeys() {
    try {
      var supported = tizen.tvinputdevice.getSupportedKeys();
      var toRegister = ['ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue',
                        'MediaPlayPause','MediaPlay','MediaPause','MediaStop'];
      toRegister.forEach(function (name) {
        try { tizen.tvinputdevice.registerKey(name); } catch (_) {}
      });
      supported.forEach(function (k) {
        if (toRegister.indexOf(k.name) >= 0) {
          tizen.tvinputdevice.registerKey(k.name);
          var code = (k.code !== undefined && k.code !== null)
            ? parseInt(k.code, 10) : k.keyCode;
          if (!code || isNaN(code)) return;
          if (k.name === 'ColorF2Yellow') KEY.YELLOW = code;
          if (k.name === 'ColorF0Red')    KEY.RED    = code;
          if (k.name === 'ColorF1Green')  KEY.GREEN  = code;
          if (k.name === 'ColorF3Blue')   KEY.BLUE   = code;
        }
      });
      Logger.info('main', 'Keys registered', {
        red: KEY.RED, green: KEY.GREEN, yellow: KEY.YELLOW, blue: KEY.BLUE
      });
    } catch (e) {
      Logger.warn('main', 'Key registration failed', { error: e.message });
    }

    document.addEventListener('keydown', function (e) {
      var known = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT,
                   KEY.ENTER, KEY.BACK, KEY.YELLOW, KEY.RED, KEY.GREEN, KEY.BLUE];
      if (known.indexOf(e.keyCode) === -1) {
        Logger.debug('main', 'Unknown key', { keyCode: e.keyCode });
      }
    }, true);
  }

  // ── Readonly inputs ───────────────────────────────────────────────────────
  function initReadonlyInputs() {
    document.querySelectorAll('input:not(#inputDialogField)').forEach(function (input) {
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
        if (e.keyCode === KEY.ENTER) { e.stopPropagation(); e.preventDefault(); input.setAttribute('readonly',''); input.blur(); }
        if (e.keyCode === KEY.BACK)  { e.stopPropagation(); e.preventDefault(); input.setAttribute('readonly',''); input.blur(); }
      });
      input.addEventListener('blur', function () { input.setAttribute('readonly',''); });
    });
  }

  // ── Settings definition ───────────────────────────────────────────────────
  var SETTINGS_DEF = [
    { section: 'Debug' },
    { id: 'debug.enabled',       label: 'Debug logging',          type: 'bool',
      get: function () { return AppConfig.debug.enabled; },
      set: function (v) { AppConfig.debug.enabled = v; } },
    { id: 'debug.remoteLogging', label: 'Remote log server',      type: 'bool',
      get: function () { return AppConfig.debug.remoteLogging; },
      set: function (v) { AppConfig.debug.remoteLogging = v; } },
    { id: 'debug.serverIp',      label: 'Log server IP',          type: 'string',
      get: function () { return AppConfig.debug.serverIp; },
      set: function (v) { AppConfig.debug.serverIp = v; } },
    { id: 'debug.serverPort',    label: 'Log server port',        type: 'number',
      get: function () { return AppConfig.debug.serverPort; },
      set: function (v) { AppConfig.debug.serverPort = parseInt(v,10) || 3030; } },

    { section: 'Debug Console' },
    { id: 'console.enabled',     label: 'Enable (Yellow key)',    type: 'bool',
      get: function () { return AppConfig.console.enabled; },
      set: function (v) { AppConfig.console.enabled = v; } },
    { id: 'console.position',    label: 'Position',               type: 'choice',
      choices: ['top-left','top-right','bottom-left','bottom-right'],
      get: function () { return AppConfig.console.position; },
      set: function (v) { AppConfig.console.position = v; } },
    { id: 'console.width',       label: 'Width (px)',             type: 'number',
      get: function () { return AppConfig.console.width; },
      set: function (v) { AppConfig.console.width = parseInt(v,10) || 900; } },
    { id: 'console.height',      label: 'Height (px)',            type: 'number',
      get: function () { return AppConfig.console.height; },
      set: function (v) { AppConfig.console.height = parseInt(v,10) || 500; } },

    { section: 'YouTube' },
    { id: 'youtube.apiKey',       label: 'Data API key',          type: 'string',
      get: function () { return AppConfig.youtube.apiKey; },
      set: function (v) { AppConfig.youtube.apiKey = v; } },
    { id: 'youtube.clientId',     label: 'OAuth Client ID',       type: 'string',
      get: function () { return AppConfig.youtube.clientId || ''; },
      set: function (v) { AppConfig.youtube.clientId = v; } },
    { id: 'youtube.clientSecret', label: 'OAuth Client Secret',   type: 'string',
      get: function () { return AppConfig.youtube.clientSecret || ''; },
      set: function (v) { AppConfig.youtube.clientSecret = v; } },
    { id: 'action.oauthLogin',    label: '🔑 Sign in with YouTube', type: 'action',
      action: function () {
        settingsOverlay.classList.add('hidden');
        activeOverlay = null;
        setTimeout(function () { Auth.showLoginUI(); }, 200);
      }},
    { id: 'action.oauthLogout',   label: '⏏ Sign out',            type: 'action',
      action: function () { Auth.clearToken(); showToast('Signed out.'); } },
    { id: 'action.oauthStatus',   label: 'Auth status',           type: 'action',
      action: function () {
        var t = Auth.getToken();
        showToast(t ? (Auth.isValid() ? '✓ Signed in and valid' : '⚠ Token needs refresh') : '✗ Not signed in');
      }},

    { section: 'Diagnostics' },
    { id: 'action.yellowTest',    label: '🟡 Yellow key code',     type: 'action',
      action: function () {
        Logger.info('settings', 'KEY values', { yellow: KEY.YELLOW, red: KEY.RED, green: KEY.GREEN, blue: KEY.BLUE });
        showToast('KEY.YELLOW = ' + KEY.YELLOW);
      }},
    { id: 'action.testLog',       label: 'Send test log',         type: 'action',
      action: function () {
        Logger.begin('test','Manual test log');
        Logger.info('test','Test from settings', { source:'settings' });
        Logger.end('test','Manual test log');
      }},

    { section: 'Actions' },
    { id: 'action.checkUpdate',   label: '↻ Check updates',       type: 'action',
      action: function () { checkForUpdates(); } },
    { id: 'action.installLatest', label: '⬇ Install latest (GitHub)', type: 'action',
      action: function () { installLatestFromGitHub(); } },
    { id: 'action.reset',         label: '✗ Reset defaults',      type: 'action',
      action: function () { AppConfig.reset(); location.reload(); }}
  ];

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#1e2e50;border:1px solid #3a4a70;border-radius:10px;padding:14px 28px;font-size:20px;color:#d0d8f0;z-index:600;pointer-events:none';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity 0.5s'; t.style.opacity = '0'; }, 2200);
    setTimeout(function () { t.remove(); }, 2800);
  }

  function compareSemver(a, b) {
    var pa = String(a || '0.0.0').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '0.0.0').split('.').map(function (x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < 3; i += 1) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  async function checkForUpdates() {
    var owner = 'KrX3D';
    var repo = 'TizenYouTube';
    var app = tizen.application.getCurrentApplication();
    var current = app.appInfo.version;
    Logger.info('update', 'Checking for updates', { current: current });
    try {
      var res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/releases/latest');
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
      var latestTag = String(data.tag_name || '').replace(/^v/, '');
      if (!latestTag) throw new Error('No tag_name in release payload');
      if (compareSemver(latestTag, current) > 0) {
        showToast('Update available: v' + latestTag + ' (current v' + current + ')');
        Logger.info('update', 'Update available', { latest: latestTag, current: current, url: data.html_url });
        try {
          var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', data.html_url);
          tizen.application.launchAppControl(ctrl, null, function () {}, function () {});
        } catch (_) {}
      } else {
        showToast('Already on latest version: v' + current);
        Logger.info('update', 'Already latest', { latest: latestTag, current: current });
      }
    } catch (e) {
      Logger.error('update', 'Update check failed', { error: e.message });
      showToast('Update check failed: ' + e.message);
    }
  }

  function installLatestFromGitHub() {
    var repo = 'KrX3D/TizenYouTube';
    if (!window.RuntimePatchBridge || !window.RuntimePatchBridge.installFromGitHub) {
      showToast('Runtime service bridge unavailable');
      return;
    }
    Logger.info('update', 'Request install from GitHub', { repo: repo });
    window.RuntimePatchBridge.installFromGitHub(repo, function (err) {
      if (err) {
        Logger.error('update', 'Install from GitHub failed', { error: err.message || String(err) });
        showToast('Install request failed: ' + (err.message || String(err)));
        return;
      }
      showToast('Installer service request sent');
    });
  }

  // ── Build settings ────────────────────────────────────────────────────────
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
      row.setAttribute('tabindex','0');
      var lbl = document.createElement('span'); lbl.className = 'settings-label'; lbl.textContent = def.label;
      var val = document.createElement('span'); val.className = 'settings-value'; refreshValue(val, def);
      row.appendChild(lbl); row.appendChild(val);
      settingsList.appendChild(row);
      row.addEventListener('keydown', function (e) {
        if (e.keyCode === KEY.ENTER || e.keyCode === KEY.RIGHT) { e.stopPropagation(); activateSetting(def, val); }
        if (e.keyCode === KEY.LEFT && def.type === 'choice')    { e.stopPropagation(); cycleChoice(def, val, -1); }
        if (e.keyCode === KEY.LEFT && def.type === 'number')    { e.stopPropagation(); stepNumber(def, val, -1); }
      });
      row.addEventListener('click', function () { activateSetting(def, val); });
    });
  }

  function refreshValue(el, def) {
    if (def.type === 'action') { el.textContent = '▶'; el.style.color = '#f0c040'; return; }
    if (def.type === 'bool') { var bv = def.get(); el.textContent = bv ? '✓ ON' : '✗ OFF'; el.style.color = bv ? '#4fc' : '#f44'; return; }
    if (def.type === 'choice') { el.textContent = def.get(); el.style.color = '#4fc'; return; }
    var sv = String(def.get() || '');
    if (def.id.indexOf('Secret') >= 0 || def.id.indexOf('apiKey') >= 0) { sv = sv ? sv.slice(0,4) + '…(' + sv.length + ')' : ''; }
    el.textContent = sv.length > 32 ? sv.slice(0,29) + '…' : (sv || '(not set)');
    el.style.color = sv ? '#4fc' : '#556';
  }

  function activateSetting(def, valEl) {
    if (def.type === 'bool')        { def.set(!def.get()); refreshValue(valEl, def); }
    else if (def.type === 'choice') { cycleChoice(def, valEl, 1); }
    else if (def.type === 'number') { stepNumber(def, valEl, 1); }
    else if (def.type === 'action') { def.action(); }
    else { showInputDialog(def.label, String(def.get() || ''), function (v) { def.set(v); refreshValue(valEl, def); }); }
  }

  function cycleChoice(def, valEl, dir) {
    var c = def.choices;
    def.set(c[(c.indexOf(def.get()) + dir + c.length) % c.length]);
    refreshValue(valEl, def);
  }

  function stepNumber(def, valEl, dir) {
    var cur = parseInt(def.get(), 10);
    if (isNaN(cur)) cur = 0;
    var step = (def.id && def.id.indexOf('port') >= 0) ? 1 : 20;
    var next = cur + (dir * step);
    if (next < 0) next = 0;
    def.set(String(next));
    refreshValue(valEl, def);
  }

  var inputDialogOpen = false;
  function showInputDialog(label, current, cb) {
    var dlg   = document.getElementById('inputDialog');
    var field = document.getElementById('inputDialogField');
    var okBtn = document.getElementById('inputOk');
    var cancelBtn = document.getElementById('inputCancel');
    document.getElementById('inputDialogLabel').textContent = label;
    field.value = current;
    field.removeAttribute('readonly');
    dlg.classList.remove('hidden');
    inputDialogOpen = true;
    setTimeout(function () { field.focus(); }, 50);
    function close(save) {
      dlg.classList.add('hidden'); field.setAttribute('readonly','');
      inputDialogOpen = false;
      if (save) cb(field.value);
      var rows = settingsList.querySelectorAll('.settings-row');
      if (rows.length) rows[0].focus();
    }
    field.onkeydown = function (e) {
      e.stopPropagation();
      if (e.keyCode === 13) close(true);
      else if (e.keyCode === KEY.BACK) close(false);
      else if (e.keyCode === KEY.DOWN) { e.preventDefault(); okBtn.focus(); }
    };
    okBtn.onkeydown = function (e) {
      e.stopPropagation();
      if (e.keyCode === 13) close(true);
      else if (e.keyCode === KEY.BACK) close(false);
      else if (e.keyCode === KEY.RIGHT) { e.preventDefault(); cancelBtn.focus(); }
      else if (e.keyCode === KEY.LEFT || e.keyCode === KEY.UP) { e.preventDefault(); field.focus(); }
    };
    cancelBtn.onkeydown = function (e) {
      e.stopPropagation();
      if (e.keyCode === 13 || e.keyCode === KEY.BACK) close(false);
      else if (e.keyCode === KEY.LEFT) { e.preventDefault(); okBtn.focus(); }
      else if (e.keyCode === KEY.UP) { e.preventDefault(); field.focus(); }
    };
    okBtn.onclick = function () { close(true); };
    cancelBtn.onclick = function () { close(false); };
  }

  // ── Overlay management ────────────────────────────────────────────────────
  function openSettings() {
    Logger.info('settings','Settings opened');
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
    var first = document.getElementById('fetchBtn') || document.getElementById('playlistId');
    if (first) first.focus();
  }

  function openDebugConsole() {
    if (!AppConfig.console.enabled) { showToast('Debug console disabled — enable in Settings'); return; }
    applyDebugStyle();
    renderDebugLogs();
    debugOverlay.classList.remove('hidden');
    debugPanel.setAttribute('tabindex','0');
    activeOverlay = 'debug';
    debugPanel.focus();
    Logger.info('debug-console','Opened');
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
    var vw = Math.max(1280, window.innerWidth || 1920);
    var vh = Math.max(720, window.innerHeight || 1080);
    var width = Math.min(Math.max(parseInt(c.width, 10) || 900, 420), vw - 40);
    var height = Math.min(Math.max(parseInt(c.height, 10) || 500, 240), vh - 80);
    var opacity = parseFloat(c.opacity);
    if (isNaN(opacity)) opacity = 0.93;
    opacity = Math.min(Math.max(opacity, 0.4), 1);
    p.style.width = width + 'px';
    p.style.height = height + 'px';
    p.style.opacity = String(opacity);
    p.style.top = p.style.bottom = p.style.left = p.style.right = 'auto';
    if (c.position.indexOf('top')  >= 0) p.style.top    = '60px'; else p.style.bottom = '20px';
    if (c.position.indexOf('left') >= 0) p.style.left   = '20px'; else p.style.right  = '20px';
  }

  function renderDebugLogs() {
    var entries = Logger.getLogs();
    var COLORS  = { DEBUG:'#6688aa', INFO:'#4fc', WARN:'#fa0', ERROR:'#f44' };
    debugLogs.innerHTML = '';
    var lastCtx = null;
    entries.forEach(function (e) {
      if (e.context !== lastCtx) {
        var sep = document.createElement('div'); sep.className = 'dl-separator';
        sep.textContent = '── ' + e.context.toUpperCase() + ' ──';
        debugLogs.appendChild(sep); lastCtx = e.context;
      }
      var row = document.createElement('div'); row.className = 'dl-row';
      row.innerHTML = '<span class="dl-ts">' + esc(e.ts.slice(11,23)) + '</span>' +
        '<span class="dl-lvl" style="color:' + (COLORS[e.level]||'#fff') + '">' + esc(e.level.padEnd(5)) + '</span>' +
        '<span class="dl-msg">' + esc(e.message) + '</span>';
      if (e.data) { var d = document.createElement('div'); d.className = 'dl-data'; try { d.textContent = JSON.stringify(e.data); } catch(x) {} row.appendChild(d); }
      debugLogs.appendChild(row);
    });
    debugLogs.scrollTop = 0;
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Navigation ────────────────────────────────────────────────────────────
  function getMainFocusable() {
    return Array.from(document.querySelectorAll('button, input, [tabindex="0"]'))
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
    idx = dir === 'next' ? (idx+1) % list.length : (idx-1+list.length) % list.length;
    list[idx].focus();
    list[idx].scrollIntoView({ block:'nearest', behavior:'smooth' });
  }

  document.addEventListener('keydown', function (e) {
    if (inputDialogOpen) return;

    if (!activeOverlay && e.keyCode === KEY.DOWN &&
      (document.activeElement === playlistBtn || document.activeElement === gearBtn || document.activeElement === debugBtn)) {
      var launch = document.getElementById('launchBtn');
      if (launch) { e.preventDefault(); launch.focus(); return; }
    }
    if (!activeOverlay && e.keyCode === KEY.UP && document.activeElement && document.activeElement.id === 'launchBtn') {
      if (playlistBtn) { e.preventDefault(); playlistBtn.focus(); return; }
    }

    var isYellow = (e.keyCode === KEY.YELLOW || e.keyCode === 405 || e.key === 'ColorF2Yellow');
    var isDebugFallback = (e.keyCode === KEY.RED || e.keyCode === 403 || e.key === 'ColorF0Red' ||
      e.keyCode === KEY.GREEN || e.keyCode === 404 || e.key === 'ColorF1Green');
    if (e.keyCode === KEY.RED || e.keyCode === KEY.GREEN || e.keyCode === KEY.YELLOW || e.keyCode === KEY.BLUE ||
        e.keyCode === 403 || e.keyCode === 404 || e.keyCode === 405 || e.keyCode === 406) {
      Logger.info('keys', 'Color key pressed', { keyCode: e.keyCode, key: e.key });
    }
    if (isYellow) {
      e.preventDefault();
      Logger.info('debug-console', 'Yellow key pressed', { keyCode: e.keyCode, key: e.key });
      if (activeOverlay === 'debug') closeOverlay();
      else { settingsOverlay.classList.add('hidden'); playlistOverlay.classList.add('hidden'); activeOverlay = null; openDebugConsole(); }
      return;
    }
    if (isDebugFallback) {
      e.preventDefault();
      Logger.info('debug-console', 'Red key debug fallback pressed', { keyCode: e.keyCode, key: e.key });
      if (activeOverlay === 'debug') closeOverlay();
      else { settingsOverlay.classList.add('hidden'); playlistOverlay.classList.add('hidden'); activeOverlay = null; openDebugConsole(); }
      return;
    }

    if (e.keyCode === KEY.BACK) {
      e.preventDefault();
      if (activeOverlay) { closeOverlay(); return; }
      tizen.application.getCurrentApplication().exit();
      return;
    }

    if (activeOverlay === 'debug') {
      if (e.keyCode === KEY.UP)   { e.preventDefault(); debugLogs.scrollTop -= 80; }
      if (e.keyCode === KEY.DOWN) { e.preventDefault(); debugLogs.scrollTop += 80; }
      return;
    }

    var active = document.activeElement;
    if (active && active.tagName === 'INPUT' && !active.hasAttribute('readonly')) return;

    if (e.keyCode === KEY.UP   || e.keyCode === KEY.LEFT)  { e.preventDefault(); moveFocus('prev'); }
    if (e.keyCode === KEY.DOWN || e.keyCode === KEY.RIGHT) { e.preventDefault(); moveFocus('next'); }
    if (e.keyCode === KEY.ENTER) { if (active && active.tagName !== 'INPUT') { e.preventDefault(); active.click(); } }
  });

  // ── Network ───────────────────────────────────────────────────────────────
  function initNetwork() {
    Logger.begin('network','initNetwork');
    if (typeof webapis === 'undefined' || !webapis.network) {
      Logger.warn('network','webapis.network unavailable');
      networkTextEl.textContent = 'Net API N/A';
      Logger.end('network','initNetwork'); return;
    }
    try {
      var connected = webapis.network.isConnectedToGateway();
      var type      = webapis.network.getActiveConnectionType();
      var ip        = webapis.network.getIp();
      var names     = {0:'Disconnected',1:'WiFi',2:'Cellular',3:'Ethernet'};
      networkTextEl.textContent = (names[type]||'?') + '  ' + ip + '  GW:' + (connected?'✓':'✗');
      Logger.info('network','Status',{ type:names[type], ip:ip, gateway:connected });
      if (!connected) { statusTextEl.textContent = 'No network!'; statusTextEl.style.color = '#f44'; }
      webapis.network.addNetworkStateChangeListener(function (v) {
        var ns = webapis.network.NetworkState;
        if (v === ns.GATEWAY_DISCONNECTED) { Logger.warn('network','Disconnected'); statusTextEl.textContent = 'Network lost!'; statusTextEl.style.color = '#f44'; }
        else if (v === ns.GATEWAY_CONNECTED) { Logger.info('network','Connected'); statusTextEl.style.color = ''; initNetwork(); }
      });
    } catch (e) { Logger.error('network','Error',{ error:e.message }); }
    Logger.end('network','initNetwork');
  }

  // ── YouTube playlist ──────────────────────────────────────────────────────
  async function fetchPlaylistItems() {
    Logger.begin('youtube','fetchPlaylistItems');
    var apiKey     = AppConfig.youtube.apiKey;
    var playlistId = document.getElementById('playlistId').value.trim();
    if (!apiKey)     { apiOutputEl.textContent = 'No API key — set in ⚙ Settings.'; Logger.warn('youtube','No API key'); Logger.end('youtube','fetchPlaylistItems'); return; }
    if (!playlistId) { apiOutputEl.textContent = 'Enter a playlist ID first.'; Logger.warn('youtube','No playlist ID'); Logger.end('youtube','fetchPlaylistItems'); return; }
    Logger.info('youtube','Fetching',{ playlistId:playlistId });
    try {
      var url = 'https://www.googleapis.com/youtube/v3/playlistItems?' +
        new URLSearchParams({ part:'snippet', playlistId:playlistId, maxResults:'5', key:apiKey });
      var res  = await fetch(url);
      var data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || 'HTTP '+res.status);
      var items = (data.items||[]).map(function (it,i) { return (i+1)+'. '+((it.snippet&&it.snippet.title)||'(no title)'); });
      apiOutputEl.textContent = items.length ? 'Fetched '+items.length+' items:\n'+items.join('\n') : 'No items.';
      Logger.info('youtube','Done',{ count:items.length });
    } catch (err) {
      apiOutputEl.textContent = 'Error: '+err.message;
      Logger.error('youtube','Failed',{ error:err.message });
    }
    Logger.end('youtube','fetchPlaylistItems');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    Logger.begin('main','init');
    statusTextEl.textContent = 'Running';
    var app = tizen.application.getCurrentApplication();
    versionTextEl.textContent = 'v' + app.appInfo.version;
    Logger.info('main','Started',{ id:app.appInfo.id, version:app.appInfo.version,
      platform: tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version') });

    registerKeys();
    initReadonlyInputs();
    initNetwork();

    Logger.onLog(function () { if (activeOverlay === 'debug') renderDebugLogs(); });

    gearBtn.addEventListener('click', openSettings);
    if (debugBtn) debugBtn.addEventListener('click', openDebugConsole);
    playlistBtn.addEventListener('click', openPlaylist);

    document.getElementById('fetchBtn').addEventListener('click', fetchPlaylistItems);
    document.getElementById('playlistCloseBtn').addEventListener('click', closeOverlay);

    var launchBtn = document.getElementById('launchBtn');
    if (launchBtn) {
      launchBtn.addEventListener('click', function () {
        Logger.info('main','Launching YouTube TV');
        if (window.YouTubeTV) {
          Logger.info('main', 'YouTubeTV launcher available');
          window.YouTubeTV.launch();
        } else {
          Logger.warn('main', 'YouTubeTV launcher missing, fallback navigation used');
          window.location.href = 'https://www.youtube.com/tv';
        }
      });
    }

    var f = getMainFocusable();
    if (f.length) f[0].focus();

    Logger.end('main','init');
  }

  window.addEventListener('load', init);
})();
