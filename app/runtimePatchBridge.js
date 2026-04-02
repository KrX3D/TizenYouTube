(function () {
  'use strict';

  function hasTizen() {
    return !!(window.tizen && tizen.application && tizen.application.launchAppControl);
  }

  function getServiceAppId() {
    return window.AppIdentity ? AppIdentity.serviceAppId : 'krx3dYtV01.service';
  }

  function callService(action, extra, cb) {
    if (!hasTizen()) { cb(new Error('Tizen APIs unavailable')); return; }
    try {
      var data = [new tizen.ApplicationControlData('tytAction', [action])];
      if (extra) {
        Object.keys(extra).forEach(function (k) {
          data.push(new tizen.ApplicationControlData(k, [String(extra[k])]));
        });
      }
      var ctrl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/service',
        null, null, null, data
      );
      tizen.application.launchAppControl(
        ctrl,
        getServiceAppId(),
        function ()  { cb(null); },
        function (e) { cb(new Error((e && e.message) || 'launchAppControl failed')); }
      );
    } catch (e) { cb(e); }
  }

  window.RuntimePatchBridge = {
    isAvailable:     function () { return hasTizen(); },
    getServiceAppId: function () { return getServiceAppId(); },

    installFromUrl: function (url, cb) {
      callService('installFromUrl', { tytUrl: url }, cb || function () {});
    },

    installFromGitHub: function (repo, cb) {
      var r = repo || (window.AppIdentity ? AppIdentity.githubRepoFull() : 'KrX3D/TizenYouTube');
      callService('installLatestFromGitHub',
        { tytPayload: JSON.stringify({ repo: r }) },
        cb || function () {});
    },

    launchPatchedYouTube: function (payload, cb) {
      cb(new Error('Not implemented'));
    }
  };
})();