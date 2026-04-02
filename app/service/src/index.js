'use strict';

module.exports.onStart = function () {
  var TAG = '[TYT-SVC]';
  function log(level, msg, data) {
    console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
  }

  log('INFO', 'Service started', { nodeVersion: process.version });

  var cdp       = require('./cdp');
  var installer = require('./installer');

  function getCtrl() {
    try {
      var req = tizen.application.getCurrentApplication().getRequestedAppControl();
      if (!req || !req.appControl) return {};
      var out = {};
      (req.appControl.data || []).forEach(function (item) {
        if (item.value && item.value.length) out[item.key] = item.value[0];
      });
      return out;
    } catch (e) {
      log('ERROR', 'getRequestedAppControl failed', { error: e.message });
      return {};
    }
  }

  try {
    var ctrl = getCtrl();
    log('INFO', 'Action received', { action: ctrl.tytAction || '(none)' });

    switch (ctrl.tytAction) {

      case 'inject': {
        // Script is base64-encoded to safely pass through ApplicationControlData
        var appId = ctrl.tytAppId;
        var scriptB64 = ctrl.tytScript;
        if (!appId || !scriptB64) {
          log('ERROR', 'inject: missing tytAppId or tytScript');
          break;
        }
        var script;
        try {
          script = Buffer.from(scriptB64, 'base64').toString('utf8');
        } catch (e) {
          log('ERROR', 'base64 decode failed', { error: e.message });
          break;
        }
        log('INFO', 'Injecting into app', { appId: appId, scriptBytes: script.length });
        cdp.inject(appId, script)
          .then(function () { log('INFO', 'CDP injection complete'); })
          .catch(function (e) { log('ERROR', 'CDP injection failed', { error: e.message }); });
        break;
      }

      case 'installFromUrl':
        installer.installFromUrl(ctrl.tytUrl);
        break;

      case 'installLatestFromGitHub': {
        var payload = {};
        try { payload = ctrl.tytPayload ? JSON.parse(ctrl.tytPayload) : {}; } catch (_) {}
        installer.installLatestFromGitHub(payload.repo || 'KrX3D/TizenYouTube');
        break;
      }

      default:
        // Handle ping sent via installFromUrl('__ping__')
        if (ctrl.tytUrl === '__ping__') {
          log('INFO', 'Ping — service alive');
        } else {
          log('WARN', 'Unknown action', { action: ctrl.tytAction });
        }
    }
  } catch (e) {
    console.log(TAG + '[FATAL] ' + e.message + '\n' + e.stack);
  }
};