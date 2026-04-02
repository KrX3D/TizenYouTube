(function () {
  if (window.__TYT_PATCHED__) return;
  window.__TYT_PATCHED__ = true;

  function safeJsonParse(v) {
    try { return JSON.parse(v); } catch (_) { return null; }
  }

  var remoteCfg = safeJsonParse(sessionStorage.getItem('__TYT_REMOTE_LOG_CFG__')) || {};
  var endpoint  = remoteCfg.endpoint || '';

  window.__TYT_LOG__ = function (level, context, message, data) {
    var payload = {
      app:     'TizenYouTube',
      layer:   'injection',
      ts:      new Date().toISOString(),
      level:   level   || 'INFO',
      context: context || 'bootstrap',
      message: message || '',
      data:    data    || null
    };
    console.log('[TYT][' + payload.level + '][' + payload.context + '] ' + payload.message,
      payload.data || '');
    if (!endpoint) return;
    fetch(endpoint, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    }).catch(function () {});
  };

  // ── Visible toast to confirm injection is active ──────────────────────────
  // Shows for 10 seconds so you can see it on the TV screen
  function showInjectionToast() {
    try {
      var toast = document.createElement('div');
      toast.id = '__tyt_toast__';
      toast.style.cssText = [
        'position:fixed', 'top:20px', 'right:20px',
        'background:rgba(0,80,0,0.92)', 'color:#7fff7f',
        'padding:12px 22px', 'border-radius:10px',
        'font:bold 18px Arial', 'z-index:2147483647',
        'pointer-events:none', 'border:2px solid #00cc00'
      ].join(';');
      toast.textContent = '✓ TizenYouTube v' + (window.__TYT_VERSION__ || '?') + ' injected';
      document.documentElement.appendChild(toast);
      setTimeout(function () {
        toast.style.transition = 'opacity 0.8s';
        toast.style.opacity    = '0';
        setTimeout(function () { try { toast.remove(); } catch (_) {} }, 900);
      }, 10000);
    } catch (_) {}
  }

  // Show toast once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showInjectionToast);
  } else {
    showInjectionToast();
  }

  window.__TYT_LOG__('INFO', 'bootstrap', 'Bootstrap injected', {
    version:       window.__TYT_VERSION__,
    href:          location.href,
    remoteLogging: !!endpoint
  });
})();