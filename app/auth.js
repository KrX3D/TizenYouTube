(function () {
  // ── YouTube OAuth 2.0 Device Authorization Flow ────────────────────────────
  //
  // Setup (one-time, in Google Cloud Console):
  //   1. Create project → Enable YouTube Data API v3
  //   2. Credentials → Create OAuth client → Type: "TV and Limited Input devices"
  //   3. Copy client_id and client_secret into Settings
  //
  // Flow:
  //   App POSTs to /device/code → gets user_code + verification_url
  //   App shows QR code + short code to user
  //   User visits verification_url on phone/PC, enters code
  //   App polls /token until approved → stores access_token + refresh_token

  var STORAGE_KEY    = 'ytOauthToken';
  var pollTimer      = null;
  var dialogEl       = null;
  var countdownTimer = null;

  // ── QR Code generator (no external lib needed) ────────────────────────────
  // Minimal QR code renderer using the qrcode-generator algorithm embedded.
  // We load it from cdnjs if available, otherwise fall back to URL-only display.
  var QR_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

  function loadQRLib(cb) {
    if (window.QRCode) { cb(); return; }
    var s = document.createElement('script');
    s.src = QR_CDN;
    s.onload  = cb;
    s.onerror = function () { Logger.warn('auth','QR lib failed to load — showing URL only'); cb(); };
    document.head.appendChild(s);
  }

  function renderQR(container, url) {
    container.innerHTML = '';
    if (!window.QRCode) {
      // Fallback: just show the URL styled prominently
      var p = document.createElement('p');
      p.style.cssText = 'font-size:18px;color:#88aacc;word-break:break-all;padding:12px;';
      p.textContent = url;
      container.appendChild(p);
      return;
    }
    try {
      new window.QRCode(container, {
        text:           url,
        width:          220,
        height:         220,
        colorDark:      '#ffffff',
        colorLight:     '#12122a',
        correctLevel:   window.QRCode.CorrectLevel.M
      });
    } catch (e) {
      Logger.warn('auth', 'QR render error', { error: e.message });
    }
  }

  // ── Token storage ─────────────────────────────────────────────────────────
  var Auth = {

    getToken: function () {
      try { var t = localStorage.getItem(STORAGE_KEY); return t ? JSON.parse(t) : null; }
      catch (e) { return null; }
    },

    saveToken: function (data) {
      data.obtained_at = Date.now();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
      Logger.info('auth', 'Token saved', { expires_in: data.expires_in, has_refresh: !!data.refresh_token });
    },

    clearToken: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      Logger.info('auth', 'Token cleared');
    },

    isValid: function () {
      var t = this.getToken();
      if (!t || !t.access_token) return false;
      if (!t.expires_in || !t.obtained_at) return true;
      return (Date.now() - t.obtained_at) < ((t.expires_in - 120) * 1000);
    },

    needsRefresh: function () {
      var t = this.getToken();
      if (!t || !t.refresh_token) return false;
      if (!t.expires_in || !t.obtained_at) return false;
      return (Date.now() - t.obtained_at) >= ((t.expires_in - 120) * 1000);
    },

    // ── Refresh access token using refresh_token ─────────────────────────
    refresh: async function () {
      var t   = this.getToken();
      var cfg = window.AppConfig;
      if (!t || !t.refresh_token) return false;
      Logger.begin('auth', 'refreshToken');
      try {
        var res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     cfg.youtube.clientId,
            client_secret: cfg.youtube.clientSecret,
            refresh_token: t.refresh_token,
            grant_type:    'refresh_token'
          })
        });
        var data = await res.json();
        if (data.access_token) {
          data.refresh_token = data.refresh_token || t.refresh_token; // preserve if not returned
          this.saveToken(data);
          Logger.info('auth', 'Token refreshed');
          Logger.end('auth', 'refreshToken');
          return true;
        }
        Logger.warn('auth', 'Refresh failed', { error: data.error });
      } catch (e) {
        Logger.error('auth', 'Refresh error', { error: e.message });
      }
      Logger.end('auth', 'refreshToken');
      return false;
    },

    // ── Get a valid access token (auto-refreshes if needed) ───────────────
    getAccessToken: async function () {
      if (this.isValid()) return this.getToken().access_token;
      if (this.needsRefresh()) {
        var ok = await this.refresh();
        if (ok) return this.getToken().access_token;
      }
      return null;
    },

    // ── Step 1: Request device + user codes ───────────────────────────────
    startDeviceFlow: async function () {
      Logger.begin('auth', 'startDeviceFlow');
      var cfg = window.AppConfig;
      if (!cfg.youtube.clientId) {
        Logger.warn('auth', 'clientId not set');
        Logger.end('auth', 'startDeviceFlow');
        return null;
      }
      try {
        var res = await fetch('https://oauth2.googleapis.com/device/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cfg.youtube.clientId,
            scope: [
              'https://www.googleapis.com/auth/youtube.readonly',
              'https://www.googleapis.com/auth/youtube'
            ].join(' ')
          })
        });
        var data = await res.json();
        if (!data.device_code) throw new Error(data.error || 'No device_code returned');
        Logger.info('auth', 'Device flow started', {
          user_code:         data.user_code,
          verification_url:  data.verification_url,
          expires_in:        data.expires_in
        });
        Logger.end('auth', 'startDeviceFlow');
        return data;
      } catch (e) {
        Logger.error('auth', 'Device flow error', { error: e.message });
        Logger.end('auth', 'startDeviceFlow');
        return null;
      }
    },

    // ── Step 2: Poll until user approves ──────────────────────────────────
    startPolling: function (deviceCode, interval, onSuccess, onError) {
      this.stopPolling();
      Logger.info('auth', 'Polling for token', { interval: interval });
      var self = this;
      var cfg  = window.AppConfig;

      pollTimer = setInterval(async function () {
        try {
          var res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     cfg.youtube.clientId,
              client_secret: cfg.youtube.clientSecret,
              device_code:   deviceCode,
              grant_type:    'urn:ietf:params:oauth:grant-type:device_code'
            })
          });
          var data = await res.json();

          if (data.access_token) {
            self.stopPolling();
            self.saveToken(data);
            if (onSuccess) onSuccess(data);
          } else if (data.error === 'access_denied') {
            self.stopPolling();
            Logger.warn('auth', 'Access denied by user');
            if (onError) onError('denied');
          } else if (data.error === 'expired_token') {
            self.stopPolling();
            Logger.warn('auth', 'Device code expired');
            if (onError) onError('expired');
          }
          // 'authorization_pending' and 'slow_down' → keep waiting
        } catch (e) {
          Logger.error('auth', 'Poll error', { error: e.message });
        }
      }, Math.max(interval || 5, 5) * 1000);
    },

    stopPolling: function () {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
  };

  // ── Login dialog ──────────────────────────────────────────────────────────
  function createDialog() {
    if (dialogEl) { dialogEl.remove(); }
    dialogEl = document.createElement('div');
    dialogEl.id = 'authDialog';
    dialogEl.style.cssText = [
      'position:fixed;inset:0;z-index:500',
      'background:rgba(0,0,0,0.88)',
      'display:flex;align-items:center;justify-content:center'
    ].join(';');
    document.body.appendChild(dialogEl);
    return dialogEl;
  }

  function showLoginDialog(flowData) {
    var dlg = createDialog();

    dlg.innerHTML = [
      '<div id="authPanel" style="',
        'background:#10102a;',
        'border:2px solid #2a2a50;',
        'border-radius:18px;',
        'padding:40px 50px;',
        'text-align:center;',
        'max-width:760px;',
        'width:90%;',
      '">',

        // Header
        '<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:28px">',
          '<span style="font-size:38px">▶</span>',
          '<h2 style="margin:0;font-size:32px;color:#fff">Sign in to YouTube</h2>',
        '</div>',

        // Instruction
        '<p style="font-size:20px;color:#8899cc;margin:0 0 6px">',
          'On your phone or computer, go to:',
        '</p>',
        '<p style="font-size:28px;font-weight:bold;color:#4fc;margin:0 0 24px;letter-spacing:0.04em">',
          flowData.verification_url,
        '</p>',

        // QR + code side by side
        '<div style="display:flex;align-items:center;justify-content:center;gap:40px;margin-bottom:24px">',

          // QR code
          '<div>',
            '<div id="authQR" style="',
              'background:#fff;',
              'padding:10px;',
              'border-radius:10px;',
              'display:inline-block;',
            '"></div>',
            '<p style="color:#4a4a6a;font-size:14px;margin:8px 0 0">Scan to open</p>',
          '</div>',

          // Divider
          '<div style="color:#2a2a4a;font-size:28px">or</div>',

          // Code box
          '<div>',
            '<p style="color:#8899cc;font-size:17px;margin:0 0 10px">Enter this code:</p>',
            '<div style="',
              'background:#1a1a3a;',
              'border:2px solid #3a3aaa;',
              'border-radius:12px;',
              'padding:18px 32px;',
              'display:inline-block;',
            '">',
              '<span id="authUserCode" style="',
                'font-size:42px;',
                'font-weight:bold;',
                'letter-spacing:10px;',
                'color:#fff;',
                'font-family:monospace;',
              '">' + flowData.user_code + '</span>',
            '</div>',
          '</div>',

        '</div>',

        // Status + countdown
        '<div style="margin-bottom:20px">',
          '<p id="authStatus" style="color:#fa0;font-size:18px;margin:0 0 6px">',
            'Waiting for you to enter the code…',
          '</p>',
          '<p id="authCountdown" style="color:#4a4a6a;font-size:15px;margin:0">',
            'Code expires in ' + flowData.expires_in + 's',
          '</p>',
        '</div>',

        // Buttons
        '<div style="display:flex;gap:16px;justify-content:center">',
          '<button id="authCancelBtn" style="',
            'background:#1a1a30;',
            'border-color:#3a3a5a;',
            'font-size:18px;',
          '">Cancel</button>',
        '</div>',

      '</div>'
    ].join('');

    // Render QR
    loadQRLib(function () {
      renderQR(document.getElementById('authQR'), flowData.verification_url);
    });

    // Countdown
    var remaining = flowData.expires_in;
    countdownTimer = setInterval(function () {
      remaining -= 1;
      var el = document.getElementById('authCountdown');
      if (el) {
        var m = Math.floor(remaining / 60);
        var s = remaining % 60;
        el.textContent = 'Code expires in ' + (m > 0 ? m + 'm ' : '') + s + 's';
      }
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        setStatus('Code expired. Please try again.', '#f44');
        Auth.stopPolling();
      }
    }, 1000);

    // Cancel
    document.getElementById('authCancelBtn').addEventListener('click', function () {
      closeDialog();
    });
    document.getElementById('authCancelBtn').focus();

    // Start polling
    Auth.startPolling(
      flowData.device_code,
      flowData.interval,
      function (token) {
        setStatus('✓ Signed in! Loading…', '#4fc');
        setTimeout(closeDialog, 1200);
        if (window.onAuthSuccess) window.onAuthSuccess(token);
      },
      function (reason) {
        setStatus('Sign-in ' + reason + '. Please try again.', '#f44');
        Auth.stopPolling();
      }
    );
  }

  function setStatus(msg, color) {
    var el = document.getElementById('authStatus');
    if (el) { el.textContent = msg; el.style.color = color || '#fa0'; }
  }

  function closeDialog() {
    Auth.stopPolling();
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (dialogEl) { dialogEl.remove(); dialogEl = null; }
    Logger.info('auth', 'Login dialog closed');
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.Auth = Auth;

  window.Auth.showLoginUI = async function () {
    Logger.begin('auth', 'showLoginUI');
    if (!AppConfig.youtube.clientId || !AppConfig.youtube.clientSecret) {
      Logger.warn('auth', 'OAuth credentials missing');
      // Show a helper dialog instead
      var dlg = createDialog();
      dlg.innerHTML = [
        '<div style="background:#10102a;border:2px solid #3a3a50;border-radius:14px;padding:36px;max-width:680px;text-align:center">',
          '<h2 style="color:#f0c040;margin:0 0 20px">Setup required</h2>',
          '<p style="color:#9090c0;font-size:19px;margin:0 0 12px">',
            'To sign in to YouTube, you need a Google Cloud OAuth client.',
          '</p>',
          '<ol style="text-align:left;color:#8899bb;font-size:17px;line-height:1.9;margin:0 0 24px;padding-left:22px">',
            '<li>Go to <strong style="color:#4fc">console.cloud.google.com</strong></li>',
            '<li>Create a project → Enable <strong>YouTube Data API v3</strong></li>',
            '<li>Credentials → Create OAuth client → <strong>TV and Limited Input devices</strong></li>',
            '<li>Enter the <strong>Client ID</strong> and <strong>Client Secret</strong> in ⚙ Settings</li>',
          '</ol>',
          '<button id="setupCloseBtn" style="font-size:18px">Got it</button>',
        '</div>'
      ].join('');
      document.getElementById('setupCloseBtn').addEventListener('click', closeDialog);
      document.getElementById('setupCloseBtn').focus();
      Logger.end('auth', 'showLoginUI');
      return;
    }

    var data = await Auth.startDeviceFlow();
    if (!data) {
      Logger.error('auth', 'Could not start device flow');
      Logger.end('auth', 'showLoginUI');
      return;
    }
    showLoginDialog(data);
    Logger.end('auth', 'showLoginUI');
  };

})();