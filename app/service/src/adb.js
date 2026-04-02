'use strict';

const net = require('net');

const TAG = '[TYT-ADB]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

// ADB host protocol:
//   client → server: 4-hex-digit-length + message
//   server → client: "OKAY" or "FAIL" + 4-hex-digit-length + message
function sendCommand(socket, cmd) {
  var hex = ('0000' + cmd.length.toString(16)).slice(-4);
  socket.write(hex + cmd);
}

function readExact(socket, n) {
  return new Promise(function (resolve, reject) {
    var buf = Buffer.alloc(0);
    function onData(chunk) {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= n) {
        socket.removeListener('data', onData);
        socket.removeListener('error', onErr);
        resolve(buf.slice(0, n));
        // push back any remainder
        if (buf.length > n) socket.unshift(buf.slice(n));
      }
    }
    function onErr(e) {
      socket.removeListener('data', onData);
      reject(e);
    }
    socket.on('data', onData);
    socket.on('error', onErr);
  });
}

async function adbCommand(host, port, cmd) {
  return new Promise(function (resolve, reject) {
    var socket = net.createConnection({ host: host, port: port });
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; socket.destroy(); reject(new Error('ADB timeout')); }
    }, 10000);

    socket.on('connect', async function () {
      try {
        // Send command
        var hex = ('0000' + cmd.length.toString(16)).slice(-4);
        socket.write(hex + cmd);

        // Read OKAY/FAIL (4 bytes)
        var statusBuf = Buffer.alloc(0);
        var lengthBuf = Buffer.alloc(0);
        var msgBuf    = Buffer.alloc(0);

        // Collect all data
        var allData = Buffer.alloc(0);
        socket.on('data', function (chunk) { allData = Buffer.concat([allData, chunk]); });
        socket.on('end', function () {
          try {
            if (!done) {
              done = true; clearTimeout(timer);
              var str = allData.toString();
              resolve(str);
            }
          } catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
        });
        socket.on('error', function (e) {
          if (!done) { done = true; clearTimeout(timer); reject(e); }
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); socket.destroy(); reject(e); }
      }
    });

    socket.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('ADB connect error: ' + e.message)); }
    });
  });
}

// Run a shell command via ADB and return the output string
// Tizen SDB is ADB-compatible on port 26101
async function shellCommand(cmd, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function (resolve, reject) {
    var socket = net.createConnection({ host: '127.0.0.1', port: 26101 });
    var allData = Buffer.alloc(0);
    var done = false;

    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch (_) {}
        // Return whatever we have so far rather than rejecting
        resolve(allData.toString());
      }
    }, timeoutMs);

    socket.on('connect', function () {
      log('DEBUG', 'SDB connected for shell cmd', { cmd: cmd });
      // ADB protocol: 4-hex-length + command
      var msg = 'host:transport-any';
      socket.write(('0000' + msg.length.toString(16)).slice(-4) + msg);
    });

    var state = 'transport'; // → 'transport_ok' → 'shell_ok' → 'data'

    socket.on('data', function (chunk) {
      allData = Buffer.concat([allData, chunk]);
      var str = allData.toString();

      if (state === 'transport') {
        if (allData.length >= 4) {
          var status = str.slice(0, 4);
          if (status === 'OKAY') {
            state = 'shell';
            allData = Buffer.alloc(0);
            var shellCmd = 'shell:' + cmd;
            socket.write(('0000' + shellCmd.length.toString(16)).slice(-4) + shellCmd);
          } else if (status === 'FAIL') {
            done = true; clearTimeout(timer);
            socket.destroy();
            reject(new Error('ADB transport failed: ' + str.slice(8)));
          }
        }
        return;
      }

      if (state === 'shell') {
        if (allData.length >= 4) {
          var st = str.slice(0, 4);
          if (st === 'OKAY') {
            state = 'data';
            allData = Buffer.alloc(0);
          } else if (st === 'FAIL') {
            done = true; clearTimeout(timer);
            socket.destroy();
            reject(new Error('ADB shell failed: ' + str.slice(8)));
          }
        }
        return;
      }

      // state === 'data': accumulate shell output
      // For debug port detection we can resolve early
      if (str.indexOf('debug') !== -1) {
        var m = str.match(/debug[^\d]*(\d+)/i);
        if (m) {
          var port = parseInt(m[1], 10);
          if (!isNaN(port) && port > 0) {
            done = true; clearTimeout(timer);
            socket.destroy();
            resolve(str);
            return;
          }
        }
      }
    });

    socket.on('end', function () {
      if (!done) { done = true; clearTimeout(timer); resolve(allData.toString()); }
    });

    socket.on('error', function (e) {
      if (!done) { done = true; clearTimeout(timer); reject(new Error('SDB socket error: ' + e.message)); }
    });
  });
}

// Get CDP debug port for a Tizen app
async function getDebugPort(appId) {
  var isTizen3 = false;
  try {
    isTizen3 = tizen.systeminfo
      .getCapability('http://tizen.org/feature/platform.version')
      .startsWith('3.0');
  } catch (_) {}

  var cmd = '0 debug ' + appId + (isTizen3 ? ' 0' : '');
  log('INFO', 'Getting debug port', { appId: appId, cmd: cmd });

  var output = await shellCommand(cmd, 12000);
  log('DEBUG', 'Debug port output', { output: output.trim() });

  var m = output.match(/debug[^\d]*(\d+)/i);
  if (!m) throw new Error('No debug port in output: ' + output.trim());
  var port = parseInt(m[1], 10);
  if (isNaN(port) || port <= 0) throw new Error('Invalid port: ' + m[1]);
  log('INFO', 'Debug port', { port: port });
  return port;
}

module.exports = { getDebugPort: getDebugPort };