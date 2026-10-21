/* ===================== HS NATIVE: HyperScale SDK bridge =====================
   Loads the HS SDK shipped next to game.js and adapts it to the Ads provider interface.

   Package layout (copied by tools/build_native.js when the files exist):
     hs/hs-game.js            HS SDK (from HyperScale)
     hs/hs-tiktok-sdk.min.js  HS TikTok adapter (from HyperScale; required by hs-game.js if it needs it)
     hs-config.js             module.exports = { gameId, sdkKey, places, testMode }  (generated, NOT in game.js)

   !! UNVERIFIED: the HS API below (init / canShowAd / showAd / onGive) follows the
   integrate-hs-sdk-ads skill notes, not the real SDK. Check it against hs-game.js when the
   files arrive and adjust ONLY this file. */
var HSAds = (function () {
  var H = null, CFG = null, waiting = null, ready = false;

  function load() {
    if (typeof require !== 'function') return false;
    try { CFG = require('./hs-config.js'); } catch (e) { Platform.log('hs: no hs-config.js (' + e.message + ')'); return false; }
    try { H = require('./hs/hs-game.js'); } catch (e) { Platform.log('hs: SDK not in package (' + e.message + ')'); return false; }
    if (H && H.default) H = H.default;
    return !!H;
  }
  function place(label) { return (CFG && CFG.places && CFG.places[label]) || label; }   // our label → HS dashboard name

  function create() {
    if (!load()) return null;
    try {
      if (typeof H.init === 'function') H.init({ gameId: CFG.gameId, sdkKey: CFG.sdkKey, testMode: !!CFG.testMode, platform: 'tiktok' });
      ready = true;
    } catch (e) { Platform.warn('hs: init failed', e); return null; }
    // Rewards are delivered through onGive (may arrive after the ad closes, or for queued grants).
    if (typeof H.onGive === 'function') H.onGive(function (give) {
      var lbl = give && (give.place || give.label || give.placement);
      Platform.log('hs: onGive ' + JSON.stringify(give));
      if (waiting && (!lbl || lbl === place(waiting.label) || lbl === waiting.label)) { var w = waiting; waiting = null; w.done(true); }
      else Ads._externalGrant(lbl);
    });
    Platform.log('hs: SDK ready (gameId ' + CFG.gameId + (CFG.testMode ? ', TEST MODE' : '') + ')');
    return {
      name: 'hs',
      rewardReady: function (label) {
        try { return typeof H.canShowAd === 'function' ? !!H.canShowAd(place(label)) : true; } catch (e) { return false; }
      },
      showReward: function (label, done) {
        waiting = { label: label, done: done };
        call(place(label), function (ok, err) {
          if (!waiting || waiting.label !== label) return;              // onGive already granted it
          if (!ok) { waiting = null; done(false, err); return; }
          if (typeof H.onGive !== 'function') { waiting = null; done(true); return; }
          // closed: give onGive a moment to arrive (it can lag the close event), else "closed early"
          setTimeout(function () { if (waiting && waiting.label === label) { waiting = null; done(false, 'closed_early'); } }, 1500);
        });
      },
      showInter: function (trigger, done) { call(place(ADS.interLabel), function (ok, err) { done(!!ok, err); }); }
    };
  }
  // showAd may return a promise, take callbacks, or both — support all three.
  function call(p, cb) {
    var fired = false; function once(ok, err) { if (!fired) { fired = true; cb(ok, err); } }
    try {
      var r = H.showAd(p, { onClose: function (res) { once(res === undefined ? true : !!(res && res.isEnded !== false), null); },
                            onError: function (e) { once(false, (e && (e.errMsg || e.message)) || 'error'); } });
      if (r && typeof r.then === 'function') r.then(function (res) { once(res === undefined ? true : !!(res && res.isEnded !== false), null); },
                                                    function (e) { once(false, (e && (e.errMsg || e.message)) || 'no_fill'); });
    } catch (e) { once(false, String(e)); }
  }
  return { create: create, get ready() { return ready; } };
})();
