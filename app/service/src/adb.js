'use strict';

var net = require('net');

var TAG = '[TYT-ADB]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

function sendAdb(socket, msg) {
  var hex = ('0000' + msg.length.toString(16)).slice(-4);
  socket.write(hex + msg);
}

// Full ADB host protocol:
// 1. Connect to 127.0.0.1:26101 (Tizen SDB daemon)
// 2. Send host:transport-any → OKAY (select the only device — the TV itself)
// 3. Send shell:command → OKAY
// 4. Read shell output stream
async function shellDirect(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function (resolve, reject) {
    var socket  = net.createConnection({ host: '127.0.0.1', port: 26101 });
    var buf     = Buffer.alloc(0);
    var done    = false;
    var state   = 'transport'; // transport → shell → data

    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch (_) {}
        log('DEBUG', 'Timeout — returning collected data', { bytes: buf.length, str: buf.toString('utf8').slice(0, 100) });
        resolve(buf.toString('utf8'));
      }
    }, timeoutMs);

    socket.on('connect', function () {
      log('DEBUG', 'SDB connected, sending host:transport-any');
      sendAdb(socket, 'host:transport-any');
    });

    socket.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      var str = buf.toString('utf8');

      if (state === 'transport') {
        if (buf.length < 4) return;
        var prefix = str.slice(0, 4);
        if (prefix === 'OKAY') {
          state = 'shell';
          buf   = buf.slice(4);
          log('DEBUG', 'Transport OKAY — sending shell cmd', { cmd: cmd });
          sendAdb(socket, 'shell:' + cmd);
        } else if (prefix === 'FAIL') {
          // Some Tizen SDB builds don't need transport-any — skip straight to shell
          log('DEBUG', 'transport-any FAIL — trying direct shell');
          state = 'direct';
          buf   = Buffer.alloc(0);
          sendAdb(socket, 'shell:' + cmd);
        }
        return;
      }

      if (state === 'direct' || state === 'shell') {
        if (buf.length < 4) return;
        var p2 = str.slice(0, 4);
        if (p2 === 'OKAY') {
          state = 'data';
          buf   = buf.slice(4);
          log('DEBUG', 'Shell OKAY — reading output');
        } else if (p2 === 'FAIL') {
          done = true; clearTimeout(timer); socket.destroy();
          var errMsg = buf.length > 8 ? buf.slice(8).toString('utf8') : 'unknown';
          reject(new Error('SDB shell FAIL: ' + errMsg));
          return;
        } else {
          // No OKAY prefix — treat as raw data
          state = 'data';
          log('DEBUG', 'No OKAY on shell — treating as raw data');
        }
      }

      if (state === 'data') {
        var dataStr = buf.toString('utf8');
        log('DEBUG', 'Shell output chunk', { str: dataStr.trim().slice(0, 100) });

        // TizenBrew extraction: substr(indexOf(':') + 1, 6).replace(' ', '')
        var colonIdx = dataStr.indexOf(':');
        if (colonIdx >= 0) {
          var portStr = dataStr.substr(colonIdx + 1, 6).replace(/\s/g, '');
          var port    = parseInt(portStr, 10);
          if (!isNaN(port) && port > 1024 && port < 65535) {
            done = true; clearTimeout(timer);
            try { socket.destroy(); } catch (_) {}
            log('INFO', 'Port found', { port: port });
            resolve(dataStr);
            return;
          }
        }
      }
    });

    socket.on('end', function () {
      if (!done) { done = true; clearTimeout(timer); resolve(buf.toString('utf8')); }
    });

    socket.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('SDB error: ' + e.message)); }
    });
  });
}

async function getDebugPort(appId) {
  var isTizen3 = false;
  try {
    isTizen3 = tizen.systeminfo
      .getCapability('http://tizen.org/feature/platform.version')
      .startsWith('3.0');
  } catch (_) {}

  var cmd = '0 debug ' + appId + (isTizen3 ? ' 0' : '');
  log('INFO', 'getDebugPort', { appId: appId, cmd: cmd });

  var output = await shellDirect(cmd, 12000);
  log('DEBUG', 'SDB raw output', { output: JSON.stringify(output.slice(0, 200)) });

  if (!output || !output.trim()) {
    throw new Error('Empty SDB output — is app running and SDB accessible?');
  }

  // TizenBrew's exact port extraction
  var colonIdx = output.indexOf(':');
  if (colonIdx >= 0) {
    var portStr = output.substr(colonIdx + 1, 6).replace(/\s/g, '');
    var port    = parseInt(portStr, 10);
    if (!isNaN(port) && port > 1024 && port < 65535) {
      log('INFO', 'Debug port', { port: port });
      return port;
    }
  }

  throw new Error('No debug port in: ' + JSON.stringify(output.trim().slice(0, 100)));
}

module.exports = { getDebugPort: getDebugPort };