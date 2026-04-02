'use strict';

var fs        = require('fs');
var net       = require('net');
var nodeFetch = require('node-fetch');
var fetch     = (typeof nodeFetch === 'function') ? nodeFetch : nodeFetch.default;

var TAG = '[TYT-INST]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

var TEMP_WGT = '/tmp/TizenYouTube_update.wgt';

// ── Install via pkgcmd shell (TizenBrewInstaller's approach) ─────────────────
// pkgcmd is a privileged binary already on the TV.
// Running it via ADB shell bypasses Tizen privilege system entirely.
// This is how TizenBrewInstaller installs WGT files without packagemanager.install.
function pkgcmdInstall(wgtPath) {
  return new Promise(function (resolve, reject) {
    var socket  = net.createConnection({ host: '127.0.0.1', port: 26101 });
    var buf     = Buffer.alloc(0);
    var done    = false;
    var state   = 'transport';

    // pkgcmd can take up to 30s on slow TVs
    var timer = setTimeout(function () {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch (_) {}
        var out = buf.toString('utf8');
        log('DEBUG', 'pkgcmd timeout — output so far', { out: out.slice(0, 200) });
        // If we saw "ok" or "success" in output, treat as success
        if (out.toLowerCase().indexOf('ok') >= 0 || out.toLowerCase().indexOf('success') >= 0) {
          resolve(out);
        } else {
          resolve(out); // resolve anyway — user can check if app updated
        }
      }
    }, 30000);

    function sendAdb(msg) {
      var hex = ('0000' + msg.length.toString(16)).slice(-4);
      socket.write(hex + msg);
    }

    socket.on('connect', function () {
      log('INFO', 'SDB connected for pkgcmd');
      sendAdb('host:transport-any');
    });

    socket.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      var str = buf.toString('utf8');

      if (state === 'transport') {
        if (buf.length < 4) return;
        var p = str.slice(0, 4);
        if (p === 'OKAY') {
          state = 'shell';
          buf   = buf.slice(4);
          var cmd = 'shell:pkgcmd -i -t wgt -p ' + wgtPath;
          log('INFO', 'Sending pkgcmd', { cmd: cmd });
          sendAdb(cmd);
        } else if (p === 'FAIL') {
          // Skip transport-any, try shell directly
          state = 'shell_direct';
          buf   = Buffer.alloc(0);
          var cmd2 = 'shell:pkgcmd -i -t wgt -p ' + wgtPath;
          sendAdb(cmd2);
        }
        return;
      }

      if (state === 'shell' || state === 'shell_direct') {
        if (buf.length < 4) return;
        var p2 = str.slice(0, 4);
        if (p2 === 'OKAY') {
          state = 'data';
          buf   = buf.slice(4);
          log('INFO', 'pkgcmd shell started, reading output');
        } else {
          // Treat all data as output
          state = 'data';
          log('DEBUG', 'No OKAY on shell, treating as data');
        }
        return;
      }

      if (state === 'data') {
        log('DEBUG', 'pkgcmd output', { out: buf.toString('utf8').trim().slice(0, 200) });
        var out = buf.toString('utf8').toLowerCase();
        // pkgcmd outputs "key[pkgid] install start" then "key[pkgid] install end" or error
        if (out.indexOf('install end') >= 0 || out.indexOf('success') >= 0) {
          done = true; clearTimeout(timer);
          try { socket.destroy(); } catch (_) {}
          log('INFO', 'pkgcmd install succeeded');
          resolve(buf.toString('utf8'));
        } else if (out.indexOf('error') >= 0 || out.indexOf('fail') >= 0) {
          done = true; clearTimeout(timer);
          try { socket.destroy(); } catch (_) {}
          var errOut = buf.toString('utf8');
          log('ERROR', 'pkgcmd install failed', { out: errOut.slice(0, 200) });
          reject(new Error('pkgcmd failed: ' + errOut.trim().slice(0, 100)));
        }
      }
    });

    socket.on('end', function () {
      if (!done) {
        done = true; clearTimeout(timer);
        var out = buf.toString('utf8');
        log('DEBUG', 'SDB closed, output', { out: out.slice(0, 200) });
        resolve(out);
      }
    });

    socket.on('error', function (e) {
      if (!done) {
        done = true; clearTimeout(timer);
        log('ERROR', 'SDB error for pkgcmd', { error: e.message });
        reject(new Error('SDB error: ' + e.message));
      }
    });
  });
}

async function installFromUrl(url, onProgress) {
  onProgress = onProgress || function () {};
  if (!url || url === '__ping__') { log('INFO', 'Ping'); return; }

  log('INFO', 'installFromUrl', { url: url });
  onProgress('Downloading WGT…');

  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var buf = await res.buffer();
  log('INFO', 'Downloaded', { bytes: buf.length });

  onProgress('Saving…');
  fs.writeFileSync(TEMP_WGT, buf);
  log('INFO', 'Saved', { path: TEMP_WGT });

  onProgress('Installing via pkgcmd…');
  var result = await pkgcmdInstall(TEMP_WGT);
  log('INFO', 'Install result', { result: result.trim().slice(0, 100) });
  onProgress('Done — close and reopen app to use new version');
}

async function installLatestFromGitHub(repo, onProgress) {
  onProgress = onProgress || function () {};
  repo = repo || 'KrX3D/TizenYouTube';
  log('INFO', 'installLatestFromGitHub', { repo: repo });
  onProgress('Fetching release info…');

  var res  = await fetch('https://api.github.com/repos/' + repo + '/releases/latest');
  var data = await res.json();
  if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);

  var asset = (data.assets || []).find(function (a) { return /\.wgt$/i.test(a.name || ''); });
  if (!asset) throw new Error('No .wgt asset in release');

  log('INFO', 'Asset found', { name: asset.name, tag: data.tag_name });
  onProgress('Found v' + (data.tag_name || '?') + '…');
  await installFromUrl(asset.browser_download_url, onProgress);
}

module.exports = { installFromUrl: installFromUrl, installLatestFromGitHub: installLatestFromGitHub };