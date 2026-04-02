'use strict';

var adb = require('./adb');

// Use the same aliased ws packages as index.js — ws-new (v8) for modern Tizen nodes,
// ws-old (v4) for the ancient v4.4.3 runtime on Tizen 3.
var _wsLib = (process.version === 'v4.4.3') ? require('ws-old') : require('ws-new');
var WebSocket = (typeof _wsLib === 'function') ? _wsLib : (_wsLib.WebSocket || _wsLib);

var TAG = '[TYT-CDP]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

function cdpConnect(port) {
  return new Promise(function (resolve, reject) {
    // CDP WebSocket — direct port connection, no /json path
    var ws   = new WebSocket('ws://127.0.0.1:' + port);
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; try { ws.close(); } catch (_) {} reject(new Error('CDP connect timeout port ' + port)); }
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
    var timer = setTimeout(function () { reject(new Error('CDP timeout: ' + method)); }, 10000);
    function onMsg(raw) {
      var msg; try { msg = JSON.parse(raw); } catch (_) { return; }
      if (msg.id === id) {
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        if (msg.error) reject(new Error(method + ' CDP error: ' + JSON.stringify(msg.error)));
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

  onProgress('Getting debug port via SDB…');
  var port = await adb.getDebugPort(appId);
  log('INFO', 'Got port', { port: port });

  onProgress('Connecting to CDP on port ' + port + '…');
  var ws = await cdpConnect(port);
  log('INFO', 'CDP connected');

  try {
    onProgress('Enabling Page domain…');
    await cdpSend(ws, 1, 'Page.enable');
    log('INFO', 'Page domain enabled');

    onProgress('Registering script for document-start…');
    var injected = false;

    try {
      var result = await cdpSend(ws, 2, 'Page.addScriptToEvaluateOnNewDocument', { source: scriptCode });
      log('INFO', 'addScriptToEvaluateOnNewDocument OK', { id: result && result.identifier });
      onProgress('Script registered ✓');
      injected = true;
    } catch (e) {
      log('WARN', 'addScriptToEvaluateOnNewDocument failed, trying Runtime.evaluate fallback', { error: e.message });
    }

    if (!injected) {
      // TizenBrew's older approach: append script element via Runtime.evaluate
      var escaped = scriptCode
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\${/g, '\\${');
      var evalCode = [
        '(function(){',
        '  try {',
        '    var s=document.createElement("script");',
        '    s.textContent=`' + escaped + '`;',
        '    (document.head||document.documentElement).appendChild(s);',
        '    s.remove();',
        '  } catch(e) { console.error("[TYT] inject error:",e); }',
        '})()'
      ].join('\n');
      await cdpSend(ws, 3, 'Runtime.evaluate', {
        expression: evalCode,
        includeCommandLineAPI: false,
        returnByValue: true
      });
      log('INFO', 'Script injected via Runtime.evaluate');
      onProgress('Script injected via evaluate ✓');
    }

    try { ws.close(); } catch (_) {}
    log('INFO', 'inject complete');
  } catch (e) {
    try { ws.close(); } catch (_) {}
    throw e;
  }
}

module.exports = { inject: inject };