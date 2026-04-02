'use strict';

var adb = require('./adb');
var WebSocket = require('ws');

var TAG = '[TYT-CDP]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

function cdpConnect(port) {
  return new Promise(function (resolve, reject) {
    // CDP WebSocket is directly at ws://host:port — NOT /json
    var ws   = new WebSocket('ws://127.0.0.1:' + port);
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; try { ws.close(); } catch (_) {} reject(new Error('CDP connect timeout')); }
    }, 10000);

    ws.on('open', function () {
      if (!done) { done = true; clearTimeout(timer); resolve(ws); }
    });
    ws.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('CDP WS error: ' + e.message)); }
    });
  });
}

function cdpSend(ws, id, method, params) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('CDP response timeout: ' + method)); }, 10000);

    function onMsg(raw) {
      var msg; try { msg = JSON.parse(raw); } catch (_) { return; }
      if (msg.id === id) {
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        if (msg.error) reject(new Error(method + ' error: ' + JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    }
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
}

async function inject(appId, scriptCode, onProgress) {
  onProgress = onProgress || function () {};
  log('INFO', 'inject start', { appId: appId, bytes: scriptCode.length });

  onProgress('Getting debug port via ADB…');
  var port = await adb.getDebugPort(appId);
  log('INFO', 'Got debug port', { port: port });

  onProgress('Connecting to CDP on port ' + port + '…');
  var ws = await cdpConnect(port);
  log('INFO', 'CDP connected');

  try {
    onProgress('Enabling Page domain…');
    await cdpSend(ws, 1, 'Page.enable');

    // Try addScriptToEvaluateOnNewDocument first (Tizen 6+)
    // Fall back to script element injection (TizenBrew's approach for older firmware)
    onProgress('Registering injection script…');
    var injected = false;

    try {
      var result = await cdpSend(ws, 2, 'Page.addScriptToEvaluateOnNewDocument', { source: scriptCode });
      log('INFO', 'addScriptToEvaluateOnNewDocument succeeded', { id: result && result.identifier });
      onProgress('Script registered (document-start)');
      injected = true;
    } catch (e) {
      log('WARN', 'addScriptToEvaluateOnNewDocument failed, trying script element injection', { error: e.message });
    }

    if (!injected) {
      // TizenBrew's approach: Runtime.evaluate to append a script element
      // This runs immediately in the current page context
      var escapedCode = scriptCode.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
      var evalScript = [
        '(function() {',
        '  var s = document.createElement("script");',
        '  s.textContent = `' + escapedCode + '`;',
        '  (document.head || document.documentElement).appendChild(s);',
        '  s.remove();',
        '})()'
      ].join('\n');

      await cdpSend(ws, 3, 'Runtime.evaluate', {
        expression: evalScript,
        includeCommandLineAPI: false,
        returnByValue: true
      });
      log('INFO', 'Script injected via Runtime.evaluate + script element');
      onProgress('Script injected (immediate)');
      injected = true;
    }

    try { ws.close(); } catch (_) {}
    log('INFO', 'inject complete');
  } catch (e) {
    try { ws.close(); } catch (_) {}
    throw e;
  }
}

module.exports = { inject: inject };