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

function shellDirect(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function (resolve, reject) {
    var socket  = net.createConnection({ host: '127.0.0.1', port: 26101 });
    var buf     = Buffer.alloc(0);
    var done    = false;
    var state   = 'transport';

    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch (_) {}
        var out = buf.toString('utf8');
        log('DEBUG', 'Shell timeout — returning collected data', {
          bytes:  buf.length,
          hex:    buf.slice(0, 64).toString('hex'),
          str:    JSON.stringify(out.slice(0, 100))
        });
        resolve(out);
      }
    }, timeoutMs);

    socket.on('connect', function () {
      log('DEBUG', 'SDB connected — sending host:transport-any');
      sendAdb(socket, 'host:transport-any');
    });

    socket.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      var str = buf.toString('utf8');

      if (state === 'transport') {
        if (buf.length < 4) return;
        var p = str.slice(0, 4);
        log('DEBUG', 'Transport response', { prefix: p, len: buf.length });

        if (p === 'OKAY') {
          state = 'shell';
          buf   = buf.slice(4);
          log('DEBUG', 'Transport OKAY — sending shell cmd', { cmd: cmd });
          sendAdb(socket, 'shell:' + cmd);
        } else if (p === 'FAIL') {
          // Some Tizen SDB builds don't need transport-any — send shell directly
          log('DEBUG', 'transport-any FAIL — trying shell directly');
          state = 'shell_direct';
          buf   = Buffer.alloc(0);
          sendAdb(socket, 'shell:' + cmd);
        } else {
          // Unexpected prefix — log full bytes and try treating as shell data
          log('WARN', 'Unexpected transport prefix', {
            prefix: p,
            hex:    buf.slice(0, 16).toString('hex')
          });
          state = 'shell_direct';
          buf   = Buffer.alloc(0);
          sendAdb(socket, 'shell:' + cmd);
        }
        return;
      }

      if (state === 'shell' || state === 'shell_direct') {
        if (buf.length < 4) return;
        var p2 = str.slice(0, 4);
        log('DEBUG', 'Shell response prefix', { prefix: p2, len: buf.length });

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
          // No protocol prefix — raw data already arriving
          state = 'data';
          log('DEBUG', 'No OKAY on shell response — treating as raw data', {
            prefix: p2,
            hex:    buf.slice(0, 16).toString('hex')
          });
        }
      }

      if (state === 'data') {
        var dataStr = buf.toString('utf8');
        log('DEBUG', 'Shell data chunk', {
          bytes: buf.length,
          hex:   buf.slice(0, 64).toString('hex'),
          str:   JSON.stringify(dataStr.slice(0, 150))
        });

        // TizenBrew's exact port extraction:
        // Number(dataString.substr(dataString.indexOf(':') + 1, 6).replace(' ', ''))
        var colonIdx = dataStr.indexOf(':');
        if (colonIdx >= 0) {
          var portStr = dataStr.substr(colonIdx + 1, 6).replace(/\s/g, '');
          var port    = parseInt(portStr, 10);
          log('DEBUG', 'Port extraction attempt', {
            colonIdx: colonIdx,
            portStr:  portStr,
            port:     port
          });
          if (!isNaN(port) && port > 1024 && port < 65535) {
            done = true; clearTimeout(timer);
            try { socket.destroy(); } catch (_) {}
            log('INFO', 'Port found', { port: port });
            resolve(dataStr);
            return;
          }
        }

        // Also try 'debug' keyword approach as fallback
        if (dataStr.toLowerCase().indexOf('debug') >= 0) {
          var m = dataStr.match(/debug[^:]*:[^\d]*(\d+)/i);
          if (m) {
            var p3 = parseInt(m[1], 10);
            if (!isNaN(p3) && p3 > 1024 && p3 < 65535) {
              done = true; clearTimeout(timer);
              try { socket.destroy(); } catch (_) {}
              log('INFO', 'Port found via regex', { port: p3 });
              resolve(dataStr);
              return;
            }
          }
        }
      }
    });

    socket.on('end', function () {
      if (!done) {
        done = true; clearTimeout(timer);
        var out = buf.toString('utf8');
        log('DEBUG', 'SDB connection ended', {
          bytes: buf.length,
          hex:   buf.slice(0, 64).toString('hex'),
          str:   JSON.stringify(out.slice(0, 100))
        });
        resolve(out);
      }
    });

    socket.on('error', function (e) {
      if (!done) {
        done = true; clearTimeout(timer);
        log('ERROR', 'SDB socket error', { error: e.message });
        reject(new Error('SDB error: ' + e.message));
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

  // TizenBrew's exact command format
  var cmd = '0 debug ' + appId + (isTizen3 ? ' 0' : '');
  log('INFO', 'getDebugPort', { appId: appId, cmd: cmd, isTizen3: isTizen3 });

  var output = await shellDirect(cmd, 12000);

  // Log everything about the raw output for diagnostics
  log('DEBUG', 'getDebugPort raw output', {
    length: output.length,
    empty:  !output || !output.trim(),
    hex:    Buffer.from(output.slice(0, 64)).toString('hex'),
    str:    JSON.stringify(output.slice(0, 150))
  });

  if (!output || !output.trim()) {
    throw new Error('Empty SDB output — is developer mode on and Host PC IP = 127.0.0.1?');
  }

  // TizenBrew's exact extraction
  var colonIdx = output.indexOf(':');
  if (colonIdx >= 0) {
    var portStr = output.substr(colonIdx + 1, 6).replace(/\s/g, '');
    var port    = parseInt(portStr, 10);
    log('DEBUG', 'Port extraction', { colonIdx: colonIdx, portStr: portStr, port: port });
    if (!isNaN(port) && port > 1024 && port < 65535) {
      log('INFO', 'Debug port resolved', { port: port });
      return port;
    }
  }

  // Fallback: scan all number sequences
  var nums = output.match(/\b(\d{4,5})\b/g);
  log('DEBUG', 'All number sequences in output', { nums: nums });
  if (nums) {
    for (var i = 0; i < nums.length; i++) {
      var p = parseInt(nums[i], 10);
      if (p > 1024 && p < 65535) {
        log('INFO', 'Port found via fallback scan', { port: p });
        return p;
      }
    }
  }

  throw new Error('No debug port found in: ' + JSON.stringify(output.trim().slice(0, 100)));
}

module.exports = { getDebugPort: getDebugPort, shellDirect: shellDirect };