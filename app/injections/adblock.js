(function () {
  // Ad blocker — patches YouTube TV's playback responses to remove ads
  // Registers a handler with the fetch interceptor.

  if (!window.__TYT_HANDLERS__) {
    window.__TYT_HANDLERS__ = [];
  }

  function removeAds(json) {
    if (!json || typeof json !== 'object') return json;

    // Remove ad placements from player responses
    if (json.playerAds)         delete json.playerAds;
    if (json.adPlacements)      delete json.adPlacements;
    if (json.adSlots)           delete json.adSlots;
    if (json.adBreakHeartbeatParams) delete json.adBreakHeartbeatParams;

    // Remove ads from browse/continuation responses
    if (json.onResponseReceivedEndpoints) {
      json.onResponseReceivedEndpoints.forEach(function (ep) {
        ['appendContinuationItemsAction','reloadContinuationItemsCommand'].forEach(function (k) {
          if (!ep[k] || !ep[k].continuationItems) return;
          ep[k].continuationItems = ep[k].continuationItems.filter(function (item) {
            return !item.adSlotRenderer && !item.adBreakServiceRenderer;
          });
        });
      });
    }

    return json;
  }

  window.__TYT_HANDLERS__.push({
    match: function (url) {
      return url.indexOf('/youtubei/') !== -1 &&
             (url.indexOf('player') !== -1 ||
              url.indexOf('browse') !== -1 ||
              url.indexOf('next')   !== -1);
    },
    patch: function (url, json) {
      var result = removeAds(json);
      if (result !== json) {
        console.log('[TYT][adblock] Ads removed from', url.split('?')[0].split('/').pop());
      }
      return result;
    }
  });

  console.log('[TYT] Adblock handler registered');
})();