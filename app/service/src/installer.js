'use strict';

var fs       = require('fs');
// node-fetch v2 CommonJS — explicit default handling for webpack bundles
var nodeFetch = require('node-fetch');
var fetch    = (typeof nodeFetch === 'function') ? nodeFetch : nodeFetch.default;

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
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching WGT');
  var buf = await res.buffer();
  log('INFO', 'Downloaded', { bytes: buf.length });
  onProgress('Saving to /tmp…');

  fs.writeFileSync(TEMP_WGT, buf);
  log('INFO', 'Saved', { path: TEMP_WGT });
  onProgress('Launching system installer…');

  await launchSystemInstaller('file://' + TEMP_WGT);
  onProgress('System installer launched — close and reopen app when done');
}

async function installLatestFromGitHub(repo, onProgress) {
  onProgress = onProgress || function () {};
  repo = repo || 'KrX3D/TizenYouTube';
  log('INFO', 'Fetching release', { repo: repo });
  onProgress('Fetching latest release from GitHub…');

  var res  = await fetch('https://api.github.com/repos/' + repo + '/releases/latest');
  var data = await res.json();
  if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);

  var asset = (data.assets || []).find(function (a) { return /\.wgt$/i.test(a.name || ''); });
  if (!asset) throw new Error('No .wgt asset in release ' + (data.tag_name || '?'));

  log('INFO', 'Asset found', { name: asset.name, tag: data.tag_name });
  onProgress('Found v' + (data.tag_name || '?') + ' — downloading…');
  await installFromUrl(asset.browser_download_url, onProgress);
}

function launchSystemInstaller(fileUri) {
  return new Promise(function (resolve, reject) {
    log('INFO', 'launchAppControl operation/install', { uri: fileUri });
    try {
      var ctrl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/install',
        fileUri,
        'application/widget',
        null,
        []
      );
      tizen.application.launchAppControl(
        ctrl, null,
        function ()  { log('INFO', 'Installer launched'); resolve(); },
        function (e) {
          var msg = (e && e.message) ? e.message : String(e);
          log('ERROR', 'Installer failed', { error: msg });
          reject(new Error(msg));
        }
      );
    } catch (e) {
      log('ERROR', 'launchAppControl threw', { error: e.message });
      reject(e);
    }
  });
}

module.exports = { installFromUrl: installFromUrl, installLatestFromGitHub: installLatestFromGitHub };