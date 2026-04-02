(function () {
  // Custom settings UI overlay for YouTube TV page.
  // This does not patch native YT settings menu; it provides a side overlay
  // opened with BLUE key as a safe first step.

  function log(level, msg, data) {
    if (window.__TYT_LOG__) window.__TYT_LOG__(level, 'custom-ui', msg, data);
  }

  if (!window.__TYT_UI_SETTINGS__) {
    log('WARN', 'Settings registry not available, custom UI skipped');
    return;
  }

  var settingId = 'ui.showToastOnInject';
  window.__TYT_UI_SETTINGS__.register({
    id: settingId,
    label: 'Show inject toast',
    type: 'toggle',
    defaultValue: true
  });

  var overlay, rowValue;

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'tyt-custom-settings-overlay';
    overlay.style.cssText = [
      'position:fixed','top:80px','right:40px','width:520px','max-height:780px','overflow:auto',
      'background:rgba(18,18,24,.96)','border:1px solid #445','border-radius:12px',
      'z-index:2147483647','padding:16px','font-family:Arial,sans-serif',
      'color:#d6def2','display:none'
    ].join(';');

    var title = document.createElement('div');
    title.textContent = 'TizenYouTube: Injection Settings';
    title.style.cssText = 'font-size:22px;font-weight:bold;margin-bottom:12px';
    overlay.appendChild(title);

    var hint = document.createElement('div');
    hint.textContent = 'Blue: open/close · Enter: toggle option';
    hint.style.cssText = 'font-size:14px;color:#aab;margin-bottom:16px';
    overlay.appendChild(hint);

    var row = document.createElement('button');
    row.style.cssText = 'width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#232a3f;border:1px solid #3d4668;border-radius:10px;color:#eef;font-size:18px;cursor:pointer';

    var rowLabel = document.createElement('span');
    rowLabel.textContent = 'Show inject toast';
    row.appendChild(rowLabel);

    rowValue = document.createElement('span');
    row.appendChild(rowValue);

    row.onclick = function () {
      var next = !window.__TYT_UI_SETTINGS__.getValue(settingId);
      window.__TYT_UI_SETTINGS__.setValue(settingId, next);
      updateRow();
      log('INFO', 'Toggled custom setting', { id: settingId, value: next });
    };

    overlay.appendChild(row);
    document.body.appendChild(overlay);
    updateRow();
  }

  function updateRow() {
    if (!rowValue) return;
    var on = !!window.__TYT_UI_SETTINGS__.getValue(settingId);
    rowValue.textContent = on ? 'ON' : 'OFF';
    rowValue.style.color = on ? '#67f8b0' : '#ff8d8d';
  }

  function toggleOverlay() {
    ensureOverlay();
    var show = overlay.style.display === 'none';
    overlay.style.display = show ? 'block' : 'none';
    log('INFO', show ? 'Opened custom settings overlay' : 'Closed custom settings overlay');
  }

  document.addEventListener('keydown', function (e) {
    // Blue key (typical Samsung mapping)
    if (e.keyCode === 406 || e.key === 'ColorF3Blue') {
      e.preventDefault();
      toggleOverlay();
    }
    if (overlay && overlay.style.display === 'block' && (e.keyCode === 13 || e.key === 'Enter')) {
      e.preventDefault();
      var next = !window.__TYT_UI_SETTINGS__.getValue(settingId);
      window.__TYT_UI_SETTINGS__.setValue(settingId, next);
      updateRow();
    }
  }, true);

  if (window.__TYT_UI_SETTINGS__.getValue(settingId)) {
    try {
      var toast = document.createElement('div');
      toast.textContent = 'TizenYouTube injections active';
      toast.style.cssText = 'position:fixed;top:18px;right:18px;background:#21324a;color:#dff;padding:10px 14px;border-radius:8px;z-index:2147483647;font:16px Arial';
      document.body.appendChild(toast);
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2500);
    } catch (_) {}
  }

  log('INFO', 'customYTSettings initialized');
})();
