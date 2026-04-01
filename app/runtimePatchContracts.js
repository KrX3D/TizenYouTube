(function () {
  var CONTRACT_VERSION = 1;

  function createLaunchPayload(config) {
    config = config || {};
    return {
      contractVersion: CONTRACT_VERSION,
      action: 'launchYouTubePatched',
      targetUrl: 'https://www.youtube.com/tv',
      debug: {
        remoteLogging: !!(config.debug && config.debug.remoteLogging),
        endpoint: (config.debug && config.debug.serverIp && config.debug.serverPort)
          ? ('http://' + config.debug.serverIp + ':' + config.debug.serverPort + '/tv-log')
          : ''
      },
      patches: {
        nativeSettings: true,
        jsonDump: true,
        adblock: true
      },
      timestamp: new Date().toISOString()
    };
  }

  function validatePayload(payload) {
    return !!(payload &&
      payload.contractVersion === CONTRACT_VERSION &&
      payload.action === 'launchYouTubePatched' &&
      typeof payload.targetUrl === 'string');
  }

  window.RuntimePatchContracts = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    createLaunchPayload: createLaunchPayload,
    validatePayload: validatePayload
  };
})();
