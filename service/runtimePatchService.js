/*
  Runtime Patch Service
  ---------------------
  Handles runtime launch handoff and self-update installation from GitHub releases.
*/

(function () {
  var DEFAULT_REPO = 'KrX3D/TizenYouTube';
  var DEFAULT_PACKAGE_ID = 'krx3dYtV01';
  var TMP_DIR = '/home/owner/share/tmp/sdk_tools';
  var TMP_WGT = TMP_DIR + '/package.wgt';

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[TYT service]');
    console.log.apply(console, args);
  }

  function logErr() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[TYT service]');
    console.error.apply(console, args);
  }

  function safeRequire(name) {
    try { return require(name); } catch (_) { return null; }
  }

  var fs = safeRequire('fs');
  var cp = safeRequire('child_process');
  var https = safeRequire('https');

  function safeParse(text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function getLaunchPayload() {
    try {
      var req = tizen.application.getCurrentApplication().getRequestedAppControl();
      if (!req || !req.appControl || !req.appControl.data) return null;
      var data = req.appControl.data;
      for (var i = 0; i < data.length; i += 1) {
        if (data[i].key === 'runtimePatchPayload' && data[i].value && data[i].value.length) {
          return safeParse(data[i].value[0]);
        }
      }
    } catch (e) {
      logErr('Failed to read AppControl payload', e);
    }
    return null;
  }

  function launchYouTubeTarget(payload) {
    var targetUrl = (payload && payload.targetUrl) || 'https://www.youtube.com/tv';
    try {
      var appControl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', targetUrl);
      tizen.application.launchAppControl(
        appControl,
        null,
        function () { log('LaunchAppControl success', targetUrl); },
        function (e) { logErr('LaunchAppControl failed', e); }
      );
    } catch (e) {
      logErr('launchYouTubeTarget error', e);
    }
  }

  function httpsGetJson(url) {
    return new Promise(function (resolve, reject) {
      if (!https) return reject(new Error('https module unavailable'));
      var req = https.get(url, {
        headers: {
          'User-Agent': 'TizenYouTubeInstaller/1.0',
          'Accept': 'application/vnd.github+json'
        }
      }, function (res) {
        var body = '';
        res.on('data', function (chunk) { body += chunk; });
        res.on('end', function () {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error('GitHub API HTTP ' + res.statusCode + ': ' + body.slice(0, 240)));
          }
          var parsed = safeParse(body);
          if (!parsed) return reject(new Error('Invalid JSON from GitHub API'));
          resolve(parsed);
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, function () {
        req.destroy(new Error('GitHub API timeout'));
      });
    });
  }

  function downloadBinary(url) {
    return new Promise(function (resolve, reject) {
      if (!https) return reject(new Error('https module unavailable'));
      https.get(url, { headers: { 'User-Agent': 'TizenYouTubeInstaller/1.0' } }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadBinary(res.headers.location));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('Download HTTP ' + res.statusCode));
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { resolve(Buffer.concat(chunks)); });
      }).on('error', reject);
    });
  }

  function ensureTmpDir() {
    if (!fs) throw new Error('fs module unavailable');
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  function runWascmdInstall(packageId, packagePath) {
    return new Promise(function (resolve, reject) {
      if (!cp) return reject(new Error('child_process module unavailable'));
      var cmd = 'wascmd -i ' + packageId + ' -p ' + packagePath;
      log('Executing', cmd);
      cp.exec(cmd, { timeout: 180000 }, function (err, stdout, stderr) {
        var output = String(stdout || '') + String(stderr || '');
        if (err) {
          err.output = output;
          return reject(err);
        }
        resolve(output);
      });
    });
  }

  async function installFromGitHub(payload) {
    var repo = (payload && payload.repo) || DEFAULT_REPO;
    var packageId = (payload && payload.packageId) || DEFAULT_PACKAGE_ID;
    log('installFromGitHub requested', { repo: repo, packageId: packageId });

    try {
      var release = await httpsGetJson('https://api.github.com/repos/' + repo + '/releases/latest');
      var assets = Array.isArray(release.assets) ? release.assets : [];
      var asset = assets.find(function (a) {
        return a && /\.wgt$/i.test(String(a.name || '')) && a.browser_download_url;
      });
      if (!asset) throw new Error('No .wgt asset found in latest release for ' + repo);

      log('Downloading asset', { name: asset.name, url: asset.browser_download_url });
      var wgtBuffer = await downloadBinary(asset.browser_download_url);
      if (!wgtBuffer || !wgtBuffer.length) throw new Error('Downloaded WGT is empty');

      ensureTmpDir();
      fs.writeFileSync(TMP_WGT, wgtBuffer);
      log('Saved package to', TMP_WGT, '(' + wgtBuffer.length + ' bytes)');

      var result = await runWascmdInstall(packageId, TMP_WGT);
      log('Installation command completed', result.slice(0, 800));
    } catch (e) {
      logErr('installFromGitHub failed', e && e.message ? e.message : e, e && e.output ? e.output : '');
    }
  }

  var payload = getLaunchPayload();
  log('Runtime patch service invoked', payload || {});

  if (payload && payload.action === 'installFromGitHub') {
    installFromGitHub(payload);
  } else {
    launchYouTubeTarget(payload);
  }
})();
