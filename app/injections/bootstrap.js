(function () {
  // Bootstrap — runs inside the YouTube TV renderer context
  // Sets up communication channel back to the host app and
  // marks the page as patched so we don't double-inject.

  if (window.__TYT_PATCHED__) return;
  window.__TYT_PATCHED__ = true;
  window.__TYT_VERSION__  = '0.1.0';

  console.log('[TYT] Bootstrap injected — YouTube TV patched');
})();