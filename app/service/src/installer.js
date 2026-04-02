'use strict';

const fs    = require('fs');
const fetch = require('node-fetch');

const TAG = '[TYT-INST]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

// Use /tmp — accessible to service process, survives install process
const TEMP_WGT = '/tmp/TizenYouTube_update.wgt';

async function downloadToTemp(url) {
  log('INFO', 'Downloading', { url: url });
  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var buf = await res.buffer();
  fs.writeFileSync(TEMP_WGT, buf);
  log('INFO', 'Saved', { path: TEMP_WGT, bytes: buf.length });
  return TEMP_WGT;
}

function launchSystemInstaller(path) {
  return new Promise(function (resolve, reject) {
    var uri = 'file://' + path;
    log('INFO', 'Launching system installer', { uri: uri });
    try {
      var ctrl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/install',
        uri,
        'application/widget',
        null,
        []
      );
      tizen.application.launchAppControl(
        ctrl, null,
        function ()  { log('INFO', 'System installer launched'); resolve(); },
        function (e) {
          var msg = (e && e.message) ? e.message : String(e);
          log('ERROR', 'Installer launch failed', { error: msg });
          reject(new Error(msg));
        }
      );
    } catch (e) {
      log('ERROR', 'launchAppControl threw', { error: e.message });
      reject(e);
    }
  });
}

async function installFromUrl(url) {
  if (!url || url === '__ping__') { log('INFO', 'Ping'); return; }
  try {
    var path = await downloadToTemp(url);
    await launchSystemInstaller(path);
    log('INFO', 'Install initiated');
  } catch (e) {
    log('ERROR', 'installFromUrl failed', { error: e.message });
  }
}

async function installLatestFromGitHub(repo) {
  log('INFO', 'installLatestFromGitHub', { repo: repo });
  try {
    var res  = await fetch('https://api.github.com/repos/' + repo + '/releases/latest');
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
    var asset = (data.assets || []).find(function (a) { return /\.wgt$/i.test(a.name || ''); });
    if (!asset) throw new Error('No .wgt asset in release');
    log('INFO', 'Asset found', { name: asset.name });
    await installFromUrl(asset.browser_download_url);
  } catch (e) {
    log('ERROR', 'installLatestFromGitHub failed', { error: e.message });
  }
}

module.exports = { installFromUrl: installFromUrl, installLatestFromGitHub: installLatestFromGitHub };