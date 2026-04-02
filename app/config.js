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

  var defaults = {
    debug: {
      enabled: true,
      remoteLogging: true,
      serverIp: '192.168.50.133',
      serverPort: 3030
    },
    console: {
      enabled: true,
      position: 'bottom-right',
      width: 900,
      height: 500,
      opacity: 0.93
    },
    youtube: {
      apiKey: '',
      clientId: '',
      clientSecret: ''
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
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return stored ? deepMerge(defaults, JSON.parse(stored)) : deepMerge(defaults, {});
    } catch (e) { return deepMerge(defaults, {}); }
  }

  window.AppConfig = load();
  window.AppConfig.save  = function () { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window.AppConfig)); } catch(e) {} };
  window.AppConfig.reset = function () { try { localStorage.removeItem(STORAGE_KEY); } catch(e) {} };
})();