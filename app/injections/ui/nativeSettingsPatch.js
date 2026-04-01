(function () {
  if (!window.__TYT_HANDLERS__) {
    window.__TYT_HANDLERS__ = [];
  }

  function log(message, data) {
    if (window.__TYT_LOG__) window.__TYT_LOG__('INFO', 'native-settings', message, data || null);
  }

  function makeTizenToggleItem() {
    return {
      settingBooleanRenderer: {
        title: { runs: [{ text: 'TizenYouTube JSON dump logging' }] },
        summary: { runs: [{ text: 'Enabled by runtime patch mode' }] },
        enabled: true,
        trackingParams: 'TYT_SETTINGS_INJECT',
        accessibilityData: {
          accessibilityData: {
            label: 'TizenYouTube JSON dump logging enabled'
          }
        }
      }
    };
  }

  function injectIntoSettingsCollections(node) {
    if (!node || typeof node !== 'object') return 0;
    var injected = 0;

    if (node.settingCategoryCollectionRenderer && Array.isArray(node.settingCategoryCollectionRenderer.categories)) {
      var categories = node.settingCategoryCollectionRenderer.categories;
      var targetCategory = categories[0];
      if (targetCategory && targetCategory.settingCategoryRenderer && Array.isArray(targetCategory.settingCategoryRenderer.items)) {
        var items = targetCategory.settingCategoryRenderer.items;
        var exists = items.some(function (x) {
          return JSON.stringify(x).indexOf('TizenYouTube JSON dump logging') !== -1;
        });
        if (!exists) {
          items.push(makeTizenToggleItem());
          injected += 1;
        }
      }
    }

    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (v && typeof v === 'object') {
        if (Array.isArray(v)) {
          v.forEach(function (child) { injected += injectIntoSettingsCollections(child); });
        } else {
          injected += injectIntoSettingsCollections(v);
        }
      }
    });

    return injected;
  }

  window.__TYT_HANDLERS__.push({
    match: function (url) {
      return url.indexOf('/youtubei/') !== -1 &&
        (url.indexOf('browse') !== -1 || url.indexOf('next') !== -1 || url.indexOf('guide') !== -1);
    },
    patch: function (url, json) {
      var count = injectIntoSettingsCollections(json);
      if (count > 0) {
        log('Injected native settings entries', { count: count, endpoint: url });
      }
      return json;
    }
  });

  log('Native settings patch handler registered');
})();
