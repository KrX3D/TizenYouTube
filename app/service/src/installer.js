'use strict';

var fs        = require('fs');
var nodeFetch = require('node-fetch');
var fetch     = (typeof nodeFetch === 'function') ? nodeFetch : nodeFetch.default;

var TAG = '[TYT-INST]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

var TEMP_WGT = '/tmp/TizenYouTube_update.wgt';

async function installFromUrl(url, onProgress) {
  onProgress = onProgress || function () {};
  if (!url || url === '__ping__') { log('INFO', 'Ping'); return; }

  log('INFO', 'Downloading', { url: url });
  onProgress('Downloading WGT…');

  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var buf = await res.buffer();
  log('INFO', 'Downloaded', { bytes: buf.length });

  onProgress('Saving…');
  fs.writeFileSync(TEMP_WGT, buf);
  log('INFO', 'Saved to /tmp');

  onProgress('Installing…');
  await packageInstall(TEMP_WGT);
  onProgress('Done — close and reopen app to use new version');
}

async function installLatestFromGitHub(repo, onProgress) {
  onProgress = onProgress || function () {};
  repo = repo || 'KrX3D/TizenYouTube';
  log('INFO', 'Fetching release', { repo: repo });
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

function packageInstall(path) {
  return new Promise(function (resolve, reject) {
    log('INFO', 'tizen.package.install', { path: path });
    try {
      tizen.package.install(path, {
        onprogress: function (id, pct) {
          log('INFO', 'Install progress', { id: id, pct: pct });
        },
        oncomplete: function (id) {
          log('INFO', 'Install complete', { id: id });
          resolve(id);
        },
        onerror: function (e, id) {
          var msg = (e && e.message) ? e.message : String(e);
          log('ERROR', 'Install error', { id: id, error: msg });
          reject(new Error('pkg install error: ' + msg));
        }
      });
    } catch (e) {
      log('ERROR', 'tizen.package.install threw', { error: e.message });
      // Fallback: try launchAppControl operation/install
      log('INFO', 'Trying launchAppControl fallback');
      tryLaunchInstaller('file://' + path, resolve, reject);
    }
  });
}

function tryLaunchInstaller(fileUri, resolve, reject) {
  try {
    var ctrl = new tizen.ApplicationControl(
      'http://tizen.org/appcontrol/operation/install',
      fileUri,
      'application/widget',
      null, []
    );
    tizen.application.launchAppControl(
      ctrl, null,
      function () { log('INFO', 'Fallback installer launched'); resolve(); },
      function (e) {
        var msg = (e && e.message) ? e.message : String(e);
        log('ERROR', 'Fallback installer failed', { error: msg });
        reject(new Error('install fallback: ' + msg));
      }
    );
  } catch (e) {
    reject(new Error('install threw: ' + e.message));
  }
}

module.exports = { installFromUrl: installFromUrl, installLatestFromGitHub: installLatestFromGitHub };