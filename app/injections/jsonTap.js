(function () {
  // Logs every /youtubei/ JSON payload as-is for debugging.
  // This is intentionally verbose.

  if (!window.__TYT_HANDLERS__) {
    window.__TYT_HANDLERS__ = [];
  }

  function emit(url, json) {
    if (!window.__TYT_LOG__) {
      try { console.log('[TYT][json-tap]', url, json); } catch (_) {}
      return;
    }
    window.__TYT_LOG__('INFO', 'json-tap', 'youtubei payload', {
      url: url,
      payload: json
    });
  }

  window.__TYT_HANDLERS__.push({
    match: function (url) {
      return url.indexOf('/youtubei/') !== -1;
    },
    patch: function (url, json) {
      emit(url, json);
      return json;
    }
  });

  if (window.__TYT_LOG__) {
    window.__TYT_LOG__('INFO', 'json-tap', 'JSON tap handler registered');
  }
})();
