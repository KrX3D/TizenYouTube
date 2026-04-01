/*
  Runtime Patch Service (scaffold)
  --------------------------------
  This is a scaffold contract target for launch handoff from app/runtimePatchBridge.js.

  Expected ApplicationControlData key:
    - runtimePatchPayload: [JSON string]

  Expected payload shape:
    {
      contractVersion: 1,
      action: 'launchYouTubePatched',
      targetUrl: 'https://www.youtube.com/tv',
      debug: { remoteLogging: boolean, endpoint: string },
      patches: { nativeSettings: boolean, jsonDump: boolean, adblock: boolean },
      timestamp: ISOString
    }

  In a full implementation this service would:
    1) receive payload via launchAppControl
    2) validate contractVersion
    3) launch/attach to YouTube runtime with patch pipeline enabled
    4) bridge patch logs back to endpoint
*/

(function () {
  function safeParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function getLaunchPayload() {
    try {
      var req = tizen.application.getCurrentApplication().getRequestedAppControl();
      if (!req || !req.appControl || !req.appControl.data) return null;
      var data = req.appControl.data;
      for (var i = 0; i < data.length; i += 1) {
        if (data[i].key === 'runtimePatchPayload' && data[i].value && data[i].value.length) {
          return safeParse(data[i].value[0]);
        }
      }
    } catch (e) {
      console.error('[TYT service] Failed to read AppControl payload', e);
    }
    return null;
  }

  function launchYouTubeTarget(payload) {
    var targetUrl = (payload && payload.targetUrl) || 'https://www.youtube.com/tv';
    try {
      var appControl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/view',
        targetUrl
      );
      tizen.application.launchAppControl(
        appControl,
        null,
        function () { console.log('[TYT service] LaunchAppControl success', targetUrl); },
        function (e) { console.error('[TYT service] LaunchAppControl failed', e); }
      );
    } catch (e) {
      console.error('[TYT service] launchYouTubeTarget error', e);
    }
  }

  async function installFromGitHub(repo) {
    var targetRepo = repo || 'KrX3D/TizenYouTube';
    try {
      var res = await fetch('https://api.github.com/repos/' + targetRepo + '/releases/latest');
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
      var assets = Array.isArray(data.assets) ? data.assets : [];
      var asset = assets.find(function (a) { return a && a.browser_download_url && /\.wgt$/i.test(a.name || ''); });
      if (!asset) throw new Error('No .wgt asset in latest release');
      var appControl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/view',
        asset.browser_download_url
      );
      tizen.application.launchAppControl(
        appControl,
        null,
        function () { console.log('[TYT service] Opened WGT download URL', asset.browser_download_url); },
        function (e) { console.error('[TYT service] Failed to open WGT URL', e); }
      );
    } catch (e) {
      console.error('[TYT service] installFromGitHub failed', e);
    }
  }

  var payload = getLaunchPayload();
  console.log('[TYT service] Runtime patch service invoked', payload || {});
  if (payload && payload.action === 'installFromGitHub') {
    installFromGitHub(payload.repo);
  } else {
    launchYouTubeTarget(payload);
  }
})();
