(function () {
  // Fetch + XHR interceptor for YouTube TV's /youtubei/ API calls
  // This is where JSON response patching happens.
  // Each feature module registers a handler via window.__TYT_HANDLERS__

  if (window.__TYT_FETCH_PATCHED__) return;
  window.__TYT_FETCH_PATCHED__ = true;

  window.__TYT_HANDLERS__ = window.__TYT_HANDLERS__ || [];

  function applyHandlers(url, json) {
    var result = json;
    window.__TYT_HANDLERS__.forEach(function (h) {
      try {
        if (h.match(url)) result = h.patch(url, result);
      } catch (e) {
        console.warn('[TYT] Handler error:', e.message);
      }
    });
    return result;
  }

  // ── Patch fetch() ─────────────────────────────────────────────────────────
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input.url || '');

    return _fetch(input, init).then(function (response) {
      // Only intercept YouTube internal API calls
      if (url.indexOf('/youtubei/') === -1) return response;
      if (!response.ok) return response;

      // Clone so we can read the body without consuming it
      return response.clone().json().then(function (json) {
        var patched = applyHandlers(url, json);
        // Return a new Response with the patched JSON
        return new Response(JSON.stringify(patched), {
          status:     response.status,
          statusText: response.statusText,
          headers:    response.headers
        });
      }).catch(function () {
        return response; // not JSON — pass through unchanged
      });
    });
  };

  // ── Patch XMLHttpRequest ──────────────────────────────────────────────────
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tyt_url__ = url;
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    var url = xhr.__tyt_url__ || '';

    if (url.indexOf('/youtubei/') !== -1) {
      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState !== 4 || !xhr.responseText) return;
        try {
          var json    = JSON.parse(xhr.responseText);
          var patched = applyHandlers(url, json);
          if (patched !== json) {
            // Override responseText via defineProperty
            Object.defineProperty(xhr, 'responseText', {
              get: function () { return JSON.stringify(patched); },
              configurable: true
            });
          }
        } catch (e) {
          // Not JSON or handler error — pass through
        }
      });
    }

    return _send.apply(this, arguments);
  };

  console.log('[TYT] Fetch interceptor active');
})();