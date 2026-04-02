'use strict';

var adbhost = require('adbhost');

var TAG = '[TYT-ADB]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

function createAdbConnection(ip) {
  return new Promise(function (resolve, reject) {
    var client;
    try {
      client = adbhost.createConnection({ host: ip || '127.0.0.1', port: 26101 });
    } catch (e) {
      return reject(new Error('adbhost.createConnection failed: ' + e.message));
    }

    var hasConnected = false;
    var waitTimeout = setTimeout(function () {
      if (hasConnected) resolve(client);
      else reject(new Error('ADB connect timeout'));
    }, 3000);

    client._stream.on('connect', function () {
      hasConnected = true;
      clearTimeout(waitTimeout);
      log('DEBUG', 'ADB connected');
      resolve(client);
    });

    client._stream.on('error', function (e) {
      clearTimeout(waitTimeout);
      reject(new Error('ADB error: ' + e.message + ' (' + (e.code || '') + ')'));
    });

    client._stream.on('close', function () {
      clearTimeout(waitTimeout);
      if (!hasConnected) reject(new Error('ADB closed before connect'));
    });
  });
}

function parsePort(output) {
  if (!output || !output.trim()) return null;
  var colonIdx = output.indexOf(':');
  if (colonIdx >= 0) {
    var portStr = output.substr(colonIdx + 1, 6).replace(/\s/g, '');
    var port = parseInt(portStr, 10);
    if (!isNaN(port) && port > 1024 && port < 65535) return port;
  }
  var nums = output.match(/\b(\d{4,5})\b/g);
  if (nums) {
    for (var i = 0; i < nums.length; i++) {
      var p = parseInt(nums[i], 10);
      if (p > 1024 && p < 65535) return p;
    }
  }
  return null;
}

function getDebugPort(appId) {
  var isTizen3 = false;
  try {
    isTizen3 = tizen.systeminfo
      .getCapability('http://tizen.org/feature/platform.version')
      .startsWith('3.0');
  } catch (_) {}

  var cmd = '0 debug ' + appId + (isTizen3 ? ' 0' : '');
  log('INFO', 'getDebugPort', { appId: appId, cmd: cmd });

  return createAdbConnection().then(function (client) {
    return new Promise(function (resolve, reject) {
      var output = '';
      var done   = false;

      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          log('DEBUG', 'getDebugPort timeout', {
            len: output.length,
            hex: Buffer.from(output.slice(0, 32)).toString('hex'),
            str: JSON.stringify(output.slice(0, 100))
          });
          var port = parsePort(output);
          if (port) resolve(port);
          else reject(new Error('Timeout — no port in: ' + JSON.stringify(output.slice(0, 80))));
        }
      }, 10000);

      var stream = client.createStream('shell:' + cmd);

      stream.on('data', function (chunk) {
        var s = chunk.toString();
        output += s;
        log('DEBUG', 'debug data', {
          hex: Buffer.from(s.slice(0, 32)).toString('hex'),
          str: JSON.stringify(s.slice(0, 100))
        });
        var port = parsePort(output);
        if (port && !done) {
          done = true;
          clearTimeout(timer);
          try { client._stream.end(); client._stream.destroy(); } catch (_) {}
          log('INFO', 'Debug port found', { port: port });
          resolve(port);
        }
      });

      stream.on('error', function (e) {
        if (!done) { done = true; clearTimeout(timer); reject(new Error('stream error: ' + e.message)); }
      });

      stream.on('end', function () {
        if (!done) {
          done = true; clearTimeout(timer);
          var port = parsePort(output);
          if (port) { log('INFO', 'Port on end', { port: port }); resolve(port); }
          else reject(new Error('Stream ended, no port in: ' + JSON.stringify(output.slice(0, 80))));
        }
      });

      stream.on('close', function () {
        if (!done) {
          done = true; clearTimeout(timer);
          var port = parsePort(output);
          if (port) { log('INFO', 'Port on close', { port: port }); resolve(port); }
          else reject(new Error('Stream closed, no port in: ' + JSON.stringify(output.slice(0, 80))));
        }
      });
    });
  });
}

module.exports = { createAdbConnection: createAdbConnection, getDebugPort: getDebugPort };