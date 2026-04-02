'use strict';

var fs        = require('fs');
var path      = require('path');
var JSZip     = require('jszip');
var xml2js    = require('xml2js');
var nodeFetch = require('node-fetch');
var fetch     = (typeof nodeFetch === 'function') ? nodeFetch : nodeFetch.default;
var adb       = require('./adb.js');

var TAG = '[TYT-INST]';
function log(level, msg, data) {
  console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
}

var INSTALL_DIR = '/home/owner/share/tmp/sdk_tools';

function mkdirRecursive(dir) {
  if (fs.existsSync(dir)) return;
  var parent = path.dirname(dir);
  if (!fs.existsSync(parent)) mkdirRecursive(parent);
  fs.mkdirSync(dir);
}

function parsePackage(buffer) {
  var parser = new xml2js.Parser();
  return JSZip.loadAsync(buffer).then(function (zip) {
    var isWgt = Object.keys(zip.files).indexOf('config.xml') !== -1;
    var configFile = isWgt ? zip.files['config.xml'] : zip.files['tizen-manifest.xml'];
    if (!configFile) throw new Error('No config.xml or tizen-manifest.xml in package');
    return configFile.async('string').then(function (xmlString) {
      return parser.parseStringPromise(xmlString).then(function (result) {
        var packageId = isWgt
          ? result.widget['tizen:application'][0].$.package
          : result.manifest.$.package;
        return { packageId: packageId, isWgt: isWgt };
      });
    });
  });
}

function installPackage(packagePath, packageId, adbClient) {
  return new Promise(function (resolve, reject) {
    log('INFO', 'vd_appinstall', { packageId: packageId, path: packagePath });
    var stream = adbClient.createStream('shell:0 vd_appinstall ' + packageId + ' ' + packagePath);
    var data = '';

    stream.on('data', function (chunk) {
      var s = chunk.toString();
      data += s + '\n';
      log('DEBUG', 'vd_appinstall output', { out: s.trim().slice(0, 100) });
      if (data.indexOf('spend time') !== -1) {
        log('INFO', 'Install succeeded (spend time seen)');
        resolve(data);
      }
    });

    stream.on('error', function (e) { reject(new Error('ADB error: ' + e)); });
    stream.on('end',   function ()  { resolve(data); });
    stream.on('close', function ()  { resolve(data); });
  });
}

async function installFromUrl(url, onProgress) {
  onProgress = onProgress || function () {};
  log('INFO', 'installFromUrl', { url: url });

  onProgress('Downloading WGT…');
  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  var buffer = await res.buffer();
  log('INFO', 'Downloaded', { bytes: buffer.length });

  onProgress('Parsing package…');
  var pkg = await parsePackage(buffer);
  log('INFO', 'Parsed', pkg);

  onProgress('Saving…');
  mkdirRecursive(INSTALL_DIR);
  var filePath = INSTALL_DIR + '/package.' + (pkg.isWgt ? 'wgt' : 'tpk');
  fs.writeFileSync(filePath, buffer);
  log('INFO', 'Saved', { path: filePath });

  onProgress('Connecting ADB…');
  var client = await adb.createAdbConnection();
  log('INFO', 'ADB connected for install');

  onProgress('Installing via vd_appinstall…');
  var result = await installPackage(filePath, pkg.packageId, client);
  log('INFO', 'Result', { result: result.trim().slice(0, 100) });

  try { client._stream.end(); client._stream.destroy(); } catch (_) {}

  onProgress('Done — restart app to use new version');
  return result;
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

  log('INFO', 'Asset', { name: asset.name, tag: data.tag_name });
  onProgress('Found v' + (data.tag_name || '?') + '…');
  return installFromUrl(asset.browser_download_url, onProgress);
}

module.exports = { installFromUrl: installFromUrl, installLatestFromGitHub: installLatestFromGitHub };
