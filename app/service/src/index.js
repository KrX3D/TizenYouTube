'use strict';

module.exports.onStart = function () {
  var TAG = '[TYT-SVC]';
  function log(level, msg, data) {
    console.log(TAG + '[' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : ''));
  }

  log('INFO', 'Service started', { nodeVersion: process.version });

  var http      = require('http');
  var WebSocket = require('ws');
  var cdp       = require('./cdp');
  var installer = require('./installer');

  var PORT = 8082;
  var server = http.createServer(function (req, res) {
    res.writeHead(200); res.end('TYT Service OK');
  });

  var wss = new WebSocket.Server({ server: server });

  wss.on('connection', function (ws) {
    log('INFO', 'Client connected');

    ws.on('message', function (raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch (e) {
        log('WARN', 'Invalid JSON from client', { raw: String(raw).slice(0, 100) });
        return;
      }

      var id     = msg.id || null;
      var action = msg.action;
      log('INFO', 'Action received', { action: action, id: id });

      function reply(status, data) {
        try {
          ws.send(JSON.stringify({ id: id, action: action, status: status, data: data || null }));
        } catch (_) {}
      }

      switch (action) {

        case 'ping':
          reply('ok', { alive: true });
          break;

        case 'inject': {
          var appId    = msg.appId;
          var scriptB64 = msg.script;
          if (!appId || !scriptB64) { reply('error', { message: 'Missing appId or script' }); break; }
          var script;
          try { script = Buffer.from(scriptB64, 'base64').toString('utf8'); }
          catch (e) { reply('error', { message: 'base64 decode: ' + e.message }); break; }

          reply('progress', { step: 'Connecting to debugger…' });
          cdp.inject(appId, script, function (step) {
            reply('progress', { step: step });
          })
          .then(function ()  { reply('ok', { message: 'Injection complete' }); })
          .catch(function (e) { reply('error', { message: e.message }); });
          break;
        }

        case 'installFromUrl': {
          var url = msg.url;
          if (!url || url === '__ping__') { reply('ok', { message: 'ping' }); break; }
          reply('progress', { step: 'Downloading…' });
          installer.installFromUrl(url, function (step) { reply('progress', { step: step }); })
          .then(function ()  { reply('ok', { message: 'Installer launched' }); })
          .catch(function (e) { reply('error', { message: e.message }); });
          break;
        }

        case 'installLatestFromGitHub': {
          var repo = msg.repo || 'KrX3D/TizenYouTube';
          reply('progress', { step: 'Fetching release info…' });
          installer.installLatestFromGitHub(repo, function (step) { reply('progress', { step: step }); })
          .then(function ()  { reply('ok', { message: 'Installer launched' }); })
          .catch(function (e) { reply('error', { message: e.message }); });
          break;
        }

        default:
          reply('error', { message: 'Unknown action: ' + action });
      }
    });

    ws.on('close', function () { log('INFO', 'Client disconnected'); });
    ws.on('error', function (e) { log('WARN', 'WS error', { error: e.message }); });
  });

  server.listen(PORT, '127.0.0.1', function () {
    log('INFO', 'Service listening', { port: PORT });
  });

  server.on('error', function (e) {
    log('ERROR', 'Server error', { error: e.message });
  });
};