(function () {
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
      // Prepend version
      try {
        var ver = tizen.application.getCurrentApplication().appInfo.version;
        scripts[0] = 'window.__TYT_VERSION__="' + ver + '";\n' + scripts[0];
      } catch (e) {}

      // Store remote log config
      try {
        var cfg      = window.AppConfig && window.AppConfig.debug ? window.AppConfig.debug : {};
        var endpoint = (cfg.serverIp && cfg.serverPort)
          ? 'http://' + cfg.serverIp + ':' + cfg.serverPort + '/tv-log' : '';
        sessionStorage.setItem('__TYT_REMOTE_LOG_CFG__', JSON.stringify({
          endpoint: cfg.remoteLogging ? endpoint : ''
        }));
      } catch (e) {}

      // Store combined injection payload
      try {
        sessionStorage.setItem('__TYT_INJECT__', scripts.join('\n;\n'));
        Logger.info('youtube', 'Injection scripts stored', {
          files:      INJECTION_FILES,
          totalBytes: scripts.reduce(function (s, x) { return s + x.length; }, 0)
        });
      } catch (e) {
        Logger.warn('youtube', 'sessionStorage failed', { error: e.message });
      }

      Logger.info('youtube', 'Navigating to YouTube TV');
      Logger.end('youtube', 'launch');

      // Navigate directly to youtube.com/tv
      // NOTE: injection into youtube.com/tv from this WGT context is not
      // currently possible — see relay.html for explanation.
      // TizenTube works because it IS a fork of the YouTube TV webapp.
      // Future work: investigate Tizen WRT userscript injection hooks.
      window.location.href = 'https://www.youtube.com/tv';
    });
  }

  window.YouTubeTV = {
    launch:     launch,
    init:       function () {},
    reload:     function () { window.location.reload(); },
    goBack:     function () { window.history.back(); },
    getWebview: function () { return null; },
    isReady:    function () { return false; },
    execute:    function () {}
  };
})();