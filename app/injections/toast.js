(function () {
  'use strict';

  var TOAST_DURATION_MS = 5000;
  var FADE_MS          = 700;

  function show() {
    var version = window.__TYT_VERSION__ || '?';

    var el = document.createElement('div');
    el.id  = '__tyt_hello_toast__';
    el.style.cssText = [
      'position:fixed',
      'bottom:60px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(10,20,50,0.90)',
      'color:#d0e8ff',
      'border:2px solid #3a6aaa',
      'border-radius:12px',
      'padding:16px 36px',
      'font:bold 22px Arial,sans-serif',
      'z-index:2147483647',
      'pointer-events:none',
      'text-align:center',
      'white-space:nowrap',
      'opacity:1',
      'transition:opacity ' + (FADE_MS / 1000) + 's ease'
    ].join(';');

    el.textContent = 'Hello from TizenYouTube v' + version + ' \u2665';

    (document.body || document.documentElement).appendChild(el);

    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () {
        try { el.parentNode && el.parentNode.removeChild(el); } catch (_) {}
      }, FADE_MS);
    }, TOAST_DURATION_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
