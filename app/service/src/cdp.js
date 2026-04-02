'use strict';

const adbhost = require('adbhost');
const WebSocket = require('ws');

const TAG = '[TYT-CDP]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

// Get the CDP debug port for a running Tizen app via ADB
function getDebugPort(appId) {
  return new Promise(function (resolve, reject) {
    var isTizen3 = false;
    try {
      isTizen3 = tizen.systeminfo
        .getCapability('http://tizen.org/feature/platform.version')
        .startsWith('3.0');
    } catch (_) {}

    log('INFO', 'ADB connect for debug port', { appId: appId });
    var client = adbhost.createConnection({ host: '127.0.0.1', port: 26101 });
    var done = false;

    var timer = setTimeout(function () {
      if (!done) { done = true; reject(new Error('ADB timeout getting debug port')); }
    }, 12000);

    client._stream.on('connect', function () {
      var cmd = 'shell:0 debug ' + appId + (isTizen3 ? ' 0' : '');
      log('DEBUG', 'ADB shell cmd', { cmd: cmd });
      var shell = client.createStream(cmd);

      shell.on('data', function (buf) {
        var str = buf.toString();
        log('DEBUG', 'ADB data', { str: str.trim() });
        if (str.indexOf('debug') !== -1) {
          var m = str.match(/:[\s]*(\d+)/);
          if (m) {
            var port = parseInt(m[1], 10);
            if (!isNaN(port) && port > 0 && !done) {
              done = true;
              clearTimeout(timer);
              log('INFO', 'CDP port found', { port: port });
              setTimeout(function () { try { client._stream.end(); } catch (_) {} }, 300);
              resolve(port);
            }
          }
        }
      });

      shell.on('error', function (e) {
        if (!done) { done = true; clearTimeout(timer); reject(new Error('ADB shell error: ' + e)); }
      });
    });

    client._stream.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('ADB error: ' + e)); }
    });
  });
}

// Use CDP to register a script that runs before every document load
function registerScript(port, scriptCode) {
  return new Promise(function (resolve, reject) {
    log('INFO', 'CDP connect', { port: port });
    var ws = new WebSocket('ws://127.0.0.1:' + port);
    var msgId = 1;
    var done = false;

    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { ws.close(); } catch (_) {}
        reject(new Error('CDP timeout'));
      }
    }, 15000);

    ws.on('open', function () {
      log('INFO', 'CDP open, enabling Page domain');
      ws.send(JSON.stringify({ id: msgId++, method: 'Page.enable' }));
    });

    ws.on('message', function (raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }

      if (msg.id === 1) {
        if (msg.error) {
          done = true; clearTimeout(timer); try { ws.close(); } catch (_) {}
          reject(new Error('Page.enable failed: ' + JSON.stringify(msg.error)));
          return;
        }
        // Page domain enabled — register script
        log('INFO', 'Registering script', { bytes: scriptCode.length });
        ws.send(JSON.stringify({
          id: msgId++,
          method: 'Page.addScriptToEvaluateOnNewDocument',
          params: { source: scriptCode }
        }));
      } else if (msg.id === 2) {
        done = true; clearTimeout(timer); try { ws.close(); } catch (_) {}
        if (msg.error) {
          log('WARN', 'addScriptToEvaluateOnNewDocument failed', { error: msg.error });
          // Try older Tizen 5.x method
          reject(new Error('CDP method unsupported: ' + JSON.stringify(msg.error)));
        } else {
          log('INFO', 'Script registered for document-start injection', { identifier: msg.result && msg.result.identifier });
          resolve();
        }
      }
    });

    ws.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('CDP WS error: ' + e.message)); }
    });

    ws.on('close', function () {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('CDP WS closed unexpectedly')); }
    });
  });
}

// Full pipeline: ADB → CDP port → register script
async function inject(appId, scriptCode) {
  log('INFO', 'Injection pipeline start', { appId: appId, bytes: scriptCode.length });
  var port = await getDebugPort(appId);
  await registerScript(port, scriptCode);
  log('INFO', 'Injection pipeline complete');
}

module.exports = { inject: inject };