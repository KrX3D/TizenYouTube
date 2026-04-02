(function () {
  'use strict';

  // Standard Samsung TV color key codes — these are fixed hardware values
  // Do NOT try to read them from getSupportedKeys() — that API is unreliable
  // on Tizen 5.5 and returns undefined/null for k.code on some firmware.
  // TizenBrew and TizenTube both hardcode these values.
  window.KEY = {
    UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
    ENTER: 13, BACK: 10009,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    PLAY: 415, PAUSE: 19, STOP: 413, PLAY_PAUSE: 10252
  };

  var COLOR_KEYS  = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
  var MEDIA_KEYS  = ['MediaPlay', 'MediaPause', 'MediaStop', 'MediaPlayPause'];

  function init() {
    // Register each key in its own try/catch.
    // One shared try/catch means the first failure silently stops all registrations.
    COLOR_KEYS.concat(MEDIA_KEYS).forEach(function (name) {
      try {
        tizen.tvinputdevice.registerKey(name);
      } catch (e) {
        Logger.debug('keys', 'registerKey skipped: ' + name, { reason: e.message });
      }
    });

    // Optionally override codes from firmware, using keyCode (not code).
    // k.code is a string or undefined on Tizen 5.5 — k.keyCode is the integer.
    try {
      var map = { ColorF0Red: 'RED', ColorF1Green: 'GREEN', ColorF2Yellow: 'YELLOW', ColorF3Blue: 'BLUE' };
      tizen.tvinputdevice.getSupportedKeys().forEach(function (k) {
        var prop = map[k.name];
        if (!prop) return;
        var code = (typeof k.keyCode === 'number' && k.keyCode > 0) ? k.keyCode : null;
        if (code) window.KEY[prop] = code;
      });
    } catch (e) {
      Logger.debug('keys', 'getSupportedKeys unavailable, using defaults', { error: e.message });
    }

    Logger.info('keys', 'Keys registered', {
      red: KEY.RED, green: KEY.GREEN, yellow: KEY.YELLOW, blue: KEY.BLUE
    });

    // Capture-phase listener logs every key for diagnostics
    document.addEventListener('keydown', function (e) {
      var standard = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT, KEY.ENTER, KEY.BACK,
                      KEY.RED, KEY.GREEN, KEY.YELLOW, KEY.BLUE];
      if (standard.indexOf(e.keyCode) === -1) {
        Logger.debug('keys', 'Unhandled key', { keyCode: e.keyCode, key: e.key || '' });
      }
    }, true);
  }

  window.AppKeys = { init: init };
})();