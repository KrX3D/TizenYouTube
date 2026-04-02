<<<<<<< codex/create-samsung-tizen-app-using-youtube-api

(function () {
  var STORAGE_KEY = 'tizenYouTubeConfig';

=======
(function () {
  var STORAGE_KEY = 'tizenYouTubeConfig';

  // ── App identity — change here if repo moves ──────────────────────────────
  window.AppIdentity = {
    githubOwner:      'KrX3D',
    githubRepo:       'TizenYouTube',
    serviceAppId:     'krx3dYtV01.service',
    githubRepoFull:   function () { return window.AppIdentity.githubOwner + '/' + window.AppIdentity.githubRepo; },
    githubApiBase:    function () { return 'https://api.github.com/repos/' + window.AppIdentity.githubRepoFull(); },
    githubReleasesUrl:function () { return 'https://github.com/' + window.AppIdentity.githubRepoFull() + '/releases'; }
  };

>>>>>>> main
  var defaults = {
    debug: {
      enabled: true,
      remoteLogging: true,
      serverIp: '192.168.50.133',
      serverPort: 3030
    },
    console: {
      enabled: true,
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
      position: 'bottom-right',  // top-left | top-right | bottom-left | bottom-right
=======
      position: 'bottom-right',
>>>>>>> main
      width: 900,
      height: 500,
      opacity: 0.93
    },
    youtube: {
      apiKey: '',
      clientId: '',
      clientSecret: ''
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
    },
    runtimePatch: {
      enabled: true,
      serviceAppId: 'krx3dYtV01.RuntimePatchService',
      fallbackToDirectNavigation: true
=======
>>>>>>> main
    }
  };

  function deepMerge(target, source) {
    var result = {};
    for (var k in target) {
      if (!target.hasOwnProperty(k)) continue;
      if (typeof target[k] === 'object' && target[k] !== null) {
        result[k] = deepMerge(target[k], (source && source[k]) ? source[k] : {});
      } else {
        result[k] = (source && source.hasOwnProperty(k)) ? source[k] : target[k];
      }
    }
    return result;
  }

  function load() {
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
    var cfg;
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      cfg = stored ? deepMerge(defaults, JSON.parse(stored)) : deepMerge(defaults, {});
    } catch (e) {
      cfg = deepMerge(defaults, {});
    }
    if (cfg.runtimePatch && !cfg.runtimePatch.serviceAppId) {
      cfg.runtimePatch.serviceAppId = defaults.runtimePatch.serviceAppId;
    }
    return cfg;
=======
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return stored ? deepMerge(defaults, JSON.parse(stored)) : deepMerge(defaults, {});
    } catch (e) { return deepMerge(defaults, {}); }
>>>>>>> main
  }

  window.AppConfig = load();
  window.AppConfig.save  = function () { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window.AppConfig)); } catch(e) {} };
  window.AppConfig.reset = function () { try { localStorage.removeItem(STORAGE_KEY); } catch(e) {} };
<<<<<<< codex/create-samsung-tizen-app-using-youtube-api
})();
=======
})();
>>>>>>> main
