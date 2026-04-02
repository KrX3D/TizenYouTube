'use strict';

const adb = require('./adb');
const WebSocket = require('ws');

const TAG = '[TYT-CDP]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

function registerScript(port, scriptCode) {
  return new Promise(function (resolve, reject) {
    log('INFO', 'CDP WebSocket connect', { port: port });
    var ws = new WebSocket('ws://127.0.0.1:' + port + '/json');
    var timer = setTimeout(function () {
      try { ws.close(); } catch (_) {}
      reject(new Error('CDP timeout'));
    }, 15000);
    var msgId = 1;
    var done  = false;

    ws.on('open', function () {
      log('INFO', 'CDP open — enabling Page domain');
      ws.send(JSON.stringify({ id: msgId++, method: 'Page.enable' }));
    });

    ws.on('message', function (raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }
      if (msg.id === 1) {
        if (msg.error) {
          done = true; clearTimeout(timer); ws.close();
          reject(new Error('Page.enable: ' + JSON.stringify(msg.error)));
          return;
        }
        log('INFO', 'Page domain enabled — registering script');
        ws.send(JSON.stringify({
          id: msgId++,
          method: 'Page.addScriptToEvaluateOnNewDocument',
          params: { source: scriptCode }
        }));
      } else if (msg.id === 2) {
        done = true; clearTimeout(timer);
        try { ws.close(); } catch (_) {}
        if (msg.error) {
          // Try Tizen 5.x fallback method name
          log('WARN', 'addScriptToEvaluateOnNewDocument failed, trying OnDocumentCreation', { err: msg.error });
          var ws2 = new WebSocket('ws://127.0.0.1:' + port + '/json');
          var id2 = 1;
          var t2  = setTimeout(function () { try { ws2.close(); } catch (_) {} reject(new Error('CDP fallback timeout')); }, 10000);
          ws2.on('open', function () {
            ws2.send(JSON.stringify({ id: id2++, method: 'Page.enable' }));
          });
          ws2.on('message', function (r2) {
            var m2; try { m2 = JSON.parse(r2); } catch (_) { return; }
            if (m2.id === 1) {
              ws2.send(JSON.stringify({
                id: id2++,
                method: 'Runtime.evaluate',
                params: { expression: scriptCode, includeCommandLineAPI: false }
              }));
            } else if (m2.id === 2) {
              clearTimeout(t2); try { ws2.close(); } catch (_) {}
              if (m2.error) reject(new Error('CDP fallback failed: ' + JSON.stringify(m2.error)));
              else { log('INFO', 'Script evaluated via Runtime.evaluate (immediate)'); resolve(); }
            }
          });
          ws2.on('error', function (e) { clearTimeout(t2); reject(new Error('CDP ws2 error: ' + e.message)); });
        } else {
          log('INFO', 'Script registered', { id: msg.result && msg.result.identifier });
          resolve();
        }
      }
    });

    ws.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('CDP WS error: ' + e.message)); }
    });
    ws.on('close', function () {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('CDP WS closed early')); }
    });
  });
}

async function inject(appId, scriptCode) {
  log('INFO', 'inject start', { appId: appId, bytes: scriptCode.length });
  var port = await adb.getDebugPort(appId);
  await registerScript(port, scriptCode);
  log('INFO', 'inject complete');
}

module.exports = { inject: inject };