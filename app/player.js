(function () {
  // ── YouTube OAuth Device Flow + IFrame Player ─────────────────────────────
  // The "Sign in with QR code" on YouTube TV uses OAuth 2.0 Device Authorization.
  // You need a Google Cloud project with:
  //   - OAuth 2.0 client ID, type: "TV and Limited Input devices"
  //   - YouTube Data API v3 enabled
  //   - Redirect URI: urn:ietf:wg:oauth:2.0:oob
  //
  // Set your client_id / client_secret in Settings or hardcode here for dev.
  // Access token is stored in localStorage under 'ytOauthToken'.

  var STORAGE_KEY_TOKEN = 'ytOauthToken';
  var devicePollTimer = null;

  // ── Token management ───────────────────────────────────────────────────────
  window.YTPlayer = {

    getToken: function () {
      try {
        var t = localStorage.getItem(STORAGE_KEY_TOKEN);
        return t ? JSON.parse(t) : null;
      } catch (e) { return null; }
    },

    saveToken: function (token) {
      token.obtained_at = Date.now();
      try { localStorage.setItem(STORAGE_KEY_TOKEN, JSON.stringify(token)); } catch (e) {}
      Logger.info('player', 'OAuth token saved', { expires_in: token.expires_in });
    },

    clearToken: function () {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      Logger.info('player', 'OAuth token cleared');
    },

    isTokenValid: function () {
      var t = this.getToken();
      if (!t || !t.access_token) return false;
      if (!t.expires_in || !t.obtained_at) return true; // assume valid
      return (Date.now() - t.obtained_at) < ((t.expires_in - 60) * 1000);
    },

    // Start the Device Flow — returns the user_code + verification_url to display
    startDeviceFlow: async function () {
      Logger.begin('player', 'startDeviceFlow');
      var cfg = window.AppConfig;
      if (!cfg.youtube.clientId) {
        Logger.warn('player', 'No OAuth client_id set in settings');
        Logger.end('player', 'startDeviceFlow');
        return null;
      }

      try {
        var res = await fetch('https://oauth2.googleapis.com/device/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cfg.youtube.clientId,
            scope: 'https://www.googleapis.com/auth/youtube.readonly'
          })
        });
        var data = await res.json();
        Logger.info('player', 'Device flow started', {
          user_code: data.user_code,
          verification_url: data.verification_url,
          expires_in: data.expires_in
        });
        Logger.end('player', 'startDeviceFlow');
        return data; // { device_code, user_code, verification_url, expires_in, interval }
      } catch (e) {
        Logger.error('player', 'Device flow failed', { error: e.message });
        Logger.end('player', 'startDeviceFlow');
        return null;
      }
    },

    // Poll for token after user has entered the code on their device
    pollForToken: function (deviceCode, interval, onSuccess, onError) {
      Logger.info('player', 'Polling for OAuth token', { interval: interval });
      var self = this;
      var cfg  = window.AppConfig;

      if (devicePollTimer) clearInterval(devicePollTimer);
      devicePollTimer = setInterval(async function () {
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
            clearInterval(devicePollTimer);
            devicePollTimer = null;
            self.saveToken(data);
            if (onSuccess) onSuccess(data);
          } else if (data.error === 'access_denied') {
            clearInterval(devicePollTimer);
            devicePollTimer = null;
            Logger.warn('player', 'OAuth access denied by user');
            if (onError) onError('denied');
          }
          // 'authorization_pending' → keep polling
        } catch (e) {
          Logger.error('player', 'Token poll error', { error: e.message });
        }
      }, (interval || 5) * 1000);
    },

    stopPoll: function () {
      if (devicePollTimer) { clearInterval(devicePollTimer); devicePollTimer = null; }
    },

    // ── IFrame player ──────────────────────────────────────────────────────
    currentVideoId: null,

    extractVideoId: function (input) {
      input = (input || '').trim();
      // Already an ID (11 chars)
      if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
      // youtu.be/ID
      var m = input.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
      // ?v=ID or &v=ID
      m = input.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
      return null;
    },

    play: function (input) {
      Logger.begin('player', 'play');
      var videoId = this.extractVideoId(input);
      if (!videoId) {
        Logger.warn('player', 'Could not extract video ID', { input: input });
        Logger.end('player', 'play');
        return false;
      }

      var container = document.getElementById('playerContainer');
      container.innerHTML = '';

      var iframe = document.createElement('iframe');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'autoplay; encrypted-media');
      // autoplay=1, mute=0, controls=1, rel=0 (no related videos)
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId
        + '?autoplay=1&rel=0&controls=1&modestbranding=1&playsinline=1';

      container.appendChild(iframe);
      this.currentVideoId = videoId;
      Logger.info('player', 'Playing video', { videoId: videoId });
      Logger.end('player', 'play');
      return true;
    },

    stop: function () {
      Logger.info('player', 'Stopping video');
      var container = document.getElementById('playerContainer');
      container.innerHTML = '<div class="player-placeholder">Stopped</div>';
      this.currentVideoId = null;
    }
  };

  // ── Wire up player controls ────────────────────────────────────────────────
  window.addEventListener('load', function () {
    var videoInput = document.getElementById('videoInput');
    var playBtn    = document.getElementById('playBtn');
    var stopBtn    = document.getElementById('stopBtn');
    if (!videoInput || !playBtn || !stopBtn) return;

    playBtn.addEventListener('click', function () {
      var val = videoInput.value.trim();
      if (!val) {
        Logger.warn('player', 'No video input provided');
        return;
      }
      YTPlayer.play(val);
    });

    stopBtn.addEventListener('click', function () {
      YTPlayer.stop();
    });
  });
})();