(function () {
  // Bootstrap — runs inside the YouTube TV renderer context
  // Sets up communication channel back to the host app and
  // marks the page as patched so we don't double-inject.

  if (window.__TYT_PATCHED__) return;
  window.__TYT_PATCHED__ = true;
  window.__TYT_VERSION__  = '0.1.0';

  function safeJsonParse(v) {
    try { return JSON.parse(v); } catch (_) { return null; }
  }

  var remoteCfg = safeJsonParse(sessionStorage.getItem('__TYT_REMOTE_LOG_CFG__')) || {};
  var endpoint = remoteCfg.endpoint || '';

  window.__TYT_LOG__ = function (level, context, message, data) {
    var payload = {
      app: 'TizenYouTube',
      layer: 'injection',
      ts: new Date().toISOString(),
      level: level || 'INFO',
      context: context || 'bootstrap',
      message: message || '',
      data: data || null
    };
    console.log('[TYT][' + payload.level + '][' + payload.context + '] ' + payload.message, payload.data || '');
    if (!endpoint) return;
    fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function () {});
  };

  window.__TYT_LOG__('INFO', 'bootstrap', 'Bootstrap injected', {
    version: window.__TYT_VERSION__,
    href: location.href,
    remoteLogging: !!endpoint
  });
})();
