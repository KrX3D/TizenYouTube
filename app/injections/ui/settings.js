(function () {
  // Base settings registry for TizenYouTube YouTube-TV injections.
  // Other modules can register items and renderers can consume them.
  if (window.__TYT_UI_SETTINGS__) return;

  var state = {
    items: [],
    values: {}
  };

  function register(item) {
    if (!item || !item.id) return;
    if (state.items.some(function (x) { return x.id === item.id; })) return;
    state.items.push(item);
    if (item.defaultValue !== undefined && state.values[item.id] === undefined) {
      state.values[item.id] = item.defaultValue;
    }
    if (window.__TYT_LOG__) {
      window.__TYT_LOG__('INFO', 'injection-settings', 'Registered setting item', {
        id: item.id,
        type: item.type || 'toggle'
      });
    }
  }

  function setValue(id, value) {
    state.values[id] = value;
    if (window.__TYT_LOG__) {
      window.__TYT_LOG__('INFO', 'injection-settings', 'Updated setting value', { id: id, value: value });
    }
  }

  function getValue(id) {
    return state.values[id];
  }

  window.__TYT_UI_SETTINGS__ = {
    register: register,
    setValue: setValue,
    getValue: getValue,
    list: function () { return state.items.slice(); },
    values: state.values
  };

  if (window.__TYT_LOG__) {
    window.__TYT_LOG__('INFO', 'injection-settings', 'Settings registry ready');
  }
})();
