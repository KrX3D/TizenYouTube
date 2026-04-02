'use strict';

var net = require('net');

var TAG = '[TYT-ADB]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

async function shellCommand(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function (resolve, reject) {
    var socket  = net.createConnection({ host: '127.0.0.1', port: 26101 });
    var allData = Buffer.alloc(0);
    var done    = false;
    var state   = 'transport';

    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch (_) {}
        resolve(allData.toString());
      }
    }, timeoutMs);

    socket.on('connect', function () {
      log('DEBUG', 'SDB connected');
      var msg = 'host:transport-any';
      socket.write(('0000' + msg.length.toString(16)).slice(-4) + msg);
    });

    socket.on('data', function (chunk) {
      allData = Buffer.concat([allData, chunk]);
      var str = allData.toString('utf8', 0, Math.min(allData.length, 512));

      if (state === 'transport') {
        if (allData.length >= 4) {
          var status = str.slice(0, 4);
          if (status === 'OKAY') {
            state   = 'shell';
            allData = Buffer.alloc(0);
            var shellMsg = 'shell:' + cmd;
            socket.write(('0000' + shellMsg.length.toString(16)).slice(-4) + shellMsg);
          } else if (status === 'FAIL') {
            done = true; clearTimeout(timer); socket.destroy();
            reject(new Error('SDB transport FAIL: ' + str.slice(8)));
          }
        }
        return;
      }

      if (state === 'shell') {
        if (allData.length >= 4) {
          var st = str.slice(0, 4);
          if (st === 'OKAY') {
            state   = 'data';
            allData = Buffer.alloc(0);
          } else if (st === 'FAIL') {
            done = true; clearTimeout(timer); socket.destroy();
            reject(new Error('SDB shell FAIL: ' + str.slice(8)));
          }
        }
        return;
      }

      // state === 'data' — look for debug port in output
      // TizenBrew format: "... debug : 12345 ..." or "... : 12345"
      var dataStr = allData.toString();
      if (dataStr.indexOf('debug') !== -1) {
        // Match patterns like "debug : 12345" or "debug12345" or ": 12345"
        var m = dataStr.match(/debug[^:]*:[^\d]*(\d+)/i) ||
                dataStr.match(/:[\s]*(\d+)/);
        if (m) {
          var port = parseInt(m[1], 10);
          if (!isNaN(port) && port > 1024 && port < 65535) {
            done = true; clearTimeout(timer);
            try { socket.destroy(); } catch (_) {}
            log('INFO', 'Port found early', { port: port });
            resolve(dataStr);
            return;
          }
        }
      }
    });

    socket.on('end',   function () { if (!done) { done = true; clearTimeout(timer); resolve(allData.toString()); } });
    socket.on('error', function (e) { if (!done) { done = true; clearTimeout(timer); reject(new Error('SDB error: ' + e.message)); } });
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

  var output = await shellCommand(cmd, 12000);
  log('DEBUG', 'Raw output', { output: output.trim().slice(0, 200) });

  // Match TizenBrew's port extraction:
  // dataString.substr(dataString.indexOf(':') + 1, 6).replace(' ', '')
  var colonIdx = output.indexOf(':');
  if (colonIdx >= 0) {
    var portStr = output.substr(colonIdx + 1, 6).replace(/\s/g, '');
    var port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 1024) {
      log('INFO', 'Debug port', { port: port });
      return port;
    }
  }

  // Fallback regex
  var m = output.match(/:\s*(\d{4,5})/);
  if (m) {
    var p = parseInt(m[1], 10);
    if (!isNaN(p) && p > 1024) return p;
  }

  throw new Error('Could not find debug port in: ' + output.trim().slice(0, 100));
}

module.exports = { getDebugPort: getDebugPort };