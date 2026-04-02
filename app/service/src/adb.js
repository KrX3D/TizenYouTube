'use strict';

var net = require('net');

var TAG = '[TYT-ADB]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

// Tizen SDB daemon at 127.0.0.1:26101 accepts shell commands directly.
// Unlike remote ADB servers, NO host:transport-any step is needed —
// the local daemon serves a single device (itself).
// Protocol: send 4-hex-length + command, receive OKAY/FAIL + data.
function shellDirect(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function (resolve, reject) {
    var socket  = net.createConnection({ host: '127.0.0.1', port: 26101 });
    var allData = Buffer.alloc(0);
    var done    = false;
    var state   = 'await_ok'; // states: await_ok → data

    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch (_) {}
        log('DEBUG', 'Shell timeout — returning collected data', { bytes: allData.length });
        resolve(allData.toString('utf8'));
      }
    }, timeoutMs);

    socket.on('connect', function () {
      log('DEBUG', 'SDB connected, sending shell cmd', { cmd: cmd });
      // Send shell command directly — 4 hex char length prefix + command
      var shellCmd = 'shell:' + cmd;
      var hex      = ('0000' + shellCmd.length.toString(16)).slice(-4);
      socket.write(hex + shellCmd);
    });

    socket.on('data', function (chunk) {
      allData = Buffer.concat([allData, chunk]);

      if (state === 'await_ok') {
        if (allData.length < 4) return;
        var prefix = allData.slice(0, 4).toString('utf8');
        if (prefix === 'OKAY') {
          state   = 'data';
          allData = allData.slice(4); // strip OKAY
          log('DEBUG', 'OKAY received, reading shell output');
        } else if (prefix === 'FAIL') {
          done = true; clearTimeout(timer); socket.destroy();
          // FAIL is followed by 4-hex-length + message
          var errMsg = allData.length > 8 ? allData.slice(8).toString('utf8') : 'unknown';
          reject(new Error('SDB FAIL: ' + errMsg));
          return;
        } else {
          // Some Tizen SDB versions send data without OKAY prefix — treat all as data
          state = 'data';
          log('DEBUG', 'No OKAY prefix, treating as raw data', { prefix: prefix });
        }
      }

      // state === 'data': accumulate and check for debug port
      var str = allData.toString('utf8');
      log('DEBUG', 'SDB data chunk', { str: str.trim().slice(0, 100) });

      // TizenBrew port extraction: substr(indexOf(':') + 1, 6).replace(' ', '')
      if (str.indexOf('debug') !== -1 || str.indexOf(':') !== -1) {
        var colonIdx = str.indexOf(':');
        if (colonIdx >= 0) {
          var portStr = str.substr(colonIdx + 1, 6).replace(/\s/g, '');
          var port    = parseInt(portStr, 10);
          if (!isNaN(port) && port > 1024 && port < 65535) {
            done = true; clearTimeout(timer);
            try { socket.destroy(); } catch (_) {}
            log('INFO', 'Port found', { port: port });
            resolve(str);
            return;
          }
        }
      }
    });

    socket.on('end', function () {
      if (!done) { done = true; clearTimeout(timer); resolve(allData.toString('utf8')); }
    });

    socket.on('error', function (e) {
      if (!done) {
        done = true; clearTimeout(timer);
        reject(new Error('SDB socket error: ' + e.message));
      }
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

  // Command format matching TizenBrew exactly
  var cmd = '0 debug ' + appId + (isTizen3 ? ' 0' : '');
  log('INFO', 'getDebugPort', { appId: appId, cmd: cmd, isTizen3: isTizen3 });

  var output = await shellDirect(cmd, 12000);
  log('DEBUG', 'Raw SDB output', { output: JSON.stringify(output.slice(0, 200)) });

  if (!output || !output.trim()) {
    throw new Error('Empty SDB output — app may not be in debug mode or SDB unavailable');
  }

  // TizenBrew's exact extraction method:
  // const port = Number(dataString.substr(dataString.indexOf(':') + 1, 6).replace(' ', ''));
  var colonIdx = output.indexOf(':');
  if (colonIdx >= 0) {
    var portStr = output.substr(colonIdx + 1, 6).replace(/\s/g, '');
    var port    = parseInt(portStr, 10);
    if (!isNaN(port) && port > 1024 && port < 65535) {
      log('INFO', 'Debug port', { port: port });
      return port;
    }
  }

  throw new Error('Could not find debug port in: ' + JSON.stringify(output.trim().slice(0, 100)));
}

module.exports = { getDebugPort: getDebugPort };