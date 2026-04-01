
(function () {
  var STORAGE_KEY = 'tizenYouTubeConfig';

  var defaults = {
    debug: {
      enabled: true,
      remoteLogging: true,
      serverIp: '192.168.50.133',
      serverPort: 3030
    },
    console: {
      enabled: true,
      position: 'bottom-right',  // top-left | top-right | bottom-left | bottom-right
      width: 900,
      height: 500,
      opacity: 0.93
    },
    youtube: {
      apiKey: '',
      clientId: '',
      clientSecret: ''
    },
    runtimePatch: {
      enabled: true,
      serviceAppId: 'krx3dYtV02.RuntimePatchService',
      fallbackToDirectNavigation: true
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
      if (stored) return deepMerge(defaults, JSON.parse(stored));
    } catch (e) {}
    return deepMerge(defaults, {});
  }

  window.AppConfig = load();
  window.AppConfig.save  = function () { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window.AppConfig)); } catch(e) {} };
  window.AppConfig.reset = function () { try { localStorage.removeItem(STORAGE_KEY); } catch(e) {} };
})();
