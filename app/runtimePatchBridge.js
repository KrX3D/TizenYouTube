(function () {
  function hasTizen() {
    return !!(window.tizen && tizen.application && tizen.application.launchAppControl);
  }

  function getServiceAppId() {
    var cfg = window.AppConfig && window.AppConfig.runtimePatch;
    return (cfg && cfg.serviceAppId) || 'krx3dYtV01.RuntimePatchService';
  }

  function requestService(payload, cb) {
    if (!hasTizen()) {
      cb(new Error('Tizen application APIs unavailable'));
      return;
    }

    var appId = getServiceAppId();
    if (!appId) {
      cb(new Error('runtimePatch.serviceAppId is empty'));
      return;
    }

    try {
      var appControl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/service',
        null,
        null,
        null,
        [
          new tizen.ApplicationControlData('runtimePatchPayload', [JSON.stringify(payload)])
        ]
      );

      tizen.application.launchAppControl(
        appControl,
        appId,
        function () { cb(null, { appId: appId }); },
        function (e) { cb(new Error((e && e.message) || 'launchAppControl failed')); }
      );
    } catch (e) {
      cb(e);
    }
  }

  window.RuntimePatchBridge = {
    isAvailable: function () {
      return hasTizen() && !!getServiceAppId();
    },
    launchPatchedYouTube: function (payload, cb) {
      requestService(payload, cb || function () {});
    },
    installFromGitHub: function (repo, packageId, cb) {
      if (typeof packageId === 'function') { cb = packageId; packageId = null; }
      requestService({
        contractVersion: 1,
        action: 'installFromGitHub',
        repo: repo,
        packageId: packageId || 'krx3dYtV01'
      }, cb || function () {});
    }
  };
})();
