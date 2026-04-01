(function () {
  var MAX_LOGS = 300;
  var logs = [];
  var listeners = [];
  var currentContext = null;
  var contextStart = null;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function pad3(n) { return n < 100 ? (n < 10 ? '00' : '0') + n : '' + n; }

  function ts() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
      + '.' + pad3(d.getMilliseconds());
  }

  function createEntry(level, context, message, data) {
    return {
      ts: ts(),
      level: level,
      context: context,
      message: message,
      data: data || null,
      uptime: Math.round(performance.now())
    };
  }

  // Format a log entry for the remote file — structured, readable
  function formatForRemote(entry) {
    var lines = [];
    var sep = entry.context !== currentContext;

    if (sep) {
      lines.push('');
      lines.push('─────────────────────────────────────────────────────────────────────');
      lines.push('[' + entry.ts + '] ▶ ' + entry.context.toUpperCase());
      lines.push('─────────────────────────────────────────────────────────────────────');
    }

    var prefix = '  [' + entry.level.padEnd(5) + '] ' + entry.ts.slice(11) + '  ';
    lines.push(prefix + entry.message);

    if (entry.data) {
      try {
        JSON.stringify(entry.data, null, 2).split('\n').forEach(function (l) {
          lines.push('           ' + l);
        });
      } catch(e) {}
    }

    currentContext = entry.context;
    return lines.join('\n');
  }

  function sendToRemote(entry) {
    var cfg = window.AppConfig;
    if (!cfg || !cfg.debug.enabled || !cfg.debug.remoteLogging) return;
    var endpoint = 'http://' + cfg.debug.serverIp + ':' + cfg.debug.serverPort + '/tv-log';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _formatted: formatForRemote(entry),
        app: 'TizenYouTube',
        ts: entry.ts,
        level: entry.level,
        context: entry.context,
        message: entry.message,
        data: entry.data,
        uptime: entry.uptime
      })
    }).catch(function () {});
  }

  function log(level, context, message, data) {
    var entry = createEntry(level, context, message, data);
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) logs.pop();
    console.log('[' + entry.level + '][' + entry.context + '] ' + entry.message);
    sendToRemote(entry);
    listeners.forEach(function (fn) { try { fn(entry); } catch(e) {} });
    return entry;
  }

  // Mark beginning of a logical function/block in the log
  function begin(context, label, data) {
    currentContext = null; // force separator on next log
    return log('INFO', context, '▶ BEGIN ' + (label || ''), data);
  }

  function end(context, label, data) {
    var entry = log('INFO', context, '◀ END ' + (label || ''), data);
    currentContext = null; // force separator after block
    return entry;
  }

  window.Logger = {
    debug:  function (ctx, msg, data) { return log('DEBUG', ctx, msg, data); },
    info:   function (ctx, msg, data) { return log('INFO',  ctx, msg, data); },
    warn:   function (ctx, msg, data) { return log('WARN',  ctx, msg, data); },
    error:  function (ctx, msg, data) { return log('ERROR', ctx, msg, data); },
    begin:  begin,
    end:    end,
    getLogs: function () { return logs; },
    onLog:  function (fn) { listeners.push(fn); }
  };
})();