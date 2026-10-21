/* ===================== ADS NATIVE: ad manager + providers =====================
   Game code only calls:
     Ads.rewardReady(label)            → bool (show the ▶ button?)
     Ads.reward(label, onGranted)      → plays a rewarded ad; onGranted() only if watched to the end
     Ads.tryInter(trigger, then)       → maybe plays an interstitial at a natural break, then calls then()
   Timing rules live in js/ads_policy.js + ADS in js/config.js.

   Providers (ADS.provider = 'auto' picks the first that works):
     hs   HyperScale SDK (native/src/hs_native.js, needs hs/hs-game.js in the package)
     tt   TikTok ads directly: TTMinis.game.createRewardedVideoAd / createInterstitialAd (needs ADS.adUnitIds)
     none no ads: rewarded buttons hide, interstitials are skipped
   While an ad plays the game is frozen (Ads.showing), audio is suspended, and a safety
   timer resumes everything after ADS.safetyTimeout seconds if the SDK never calls back. */
var Ads = (function () {
  var policy = new AdsPolicy(ADS, ADS.profile);
  var provider = null, showing = null, notice = null, safety = null, sessionStart = Platform.now() / 1000;
  var stats = { inter: 0, reward: 0, noFill: 0, skipped: 0, errors: 0 };
  function now() { return Platform.now() / 1000; }
  function t() { return now() - sessionStart; }
  policy.reset(t());

  /* ---------- provider: TikTok direct ---------- */
  function TTProvider() {
    var ids = ADS.adUnitIds || {}, rv = null, it = null, cbs = {};
    if (Platform.query.fakeads === '1' && !ids.rewarded) ids = { rewarded: 'emu-rewarded', interstitial: 'emu-interstitial' };   // emulator only
    if (!Platform.canIUse('createRewardedVideoAd') || !ids.rewarded) return null;
    function mk(kind) {
      try {
        var ad = Platform.fn(kind === 'rv' ? 'createRewardedVideoAd' : 'createInterstitialAd')({ adUnitId: kind === 'rv' ? ids.rewarded : ids.interstitial });
        if (!ad) return null;
        ad.onClose(function (res) { var cb = cbs[kind]; cbs[kind] = null; if (cb) cb(kind === 'rv' ? !!(res && res.isEnded) : true, null); });
        ad.onError(function (e) { var cb = cbs[kind]; cbs[kind] = null; if (cb) cb(false, (e && (e.errMsg || e.errorCode)) || 'error'); });
        if (ad.load) try { ad.load(); } catch (e) {}
        return ad;
      } catch (e) { Platform.warn('ads: create ' + kind, e); return null; }
    }
    rv = mk('rv'); if (ids.interstitial && Platform.canIUse('createInterstitialAd')) it = mk('it');
    if (!rv) return null;
    function play(kind, ad, done) {
      if (!ad) { done(false, 'no_unit'); return; }
      cbs[kind] = done;
      try {
        var pr = ad.show();
        if (pr && pr.catch) pr.catch(function (e) {
          if (ad.load) { try { var pl = ad.load(); if (pl && pl.then) { pl.then(function () { return ad.show(); }).catch(function (e2) { var cb = cbs[kind]; cbs[kind] = null; if (cb) cb(false, (e2 && (e2.errMsg || e2.errorCode)) || 'no_fill'); }); return; } } catch (x) {} }
          var cb = cbs[kind]; cbs[kind] = null; if (cb) cb(false, (e && (e.errMsg || e.errorCode)) || 'no_fill');
        });
      } catch (e) { cbs[kind] = null; done(false, String(e)); }
    }
    return {
      name: 'tt',
      rewardReady: function () { return true; },          // TikTok has no "isReady"; failures fall back gracefully
      showReward: function (label, done) { play('rv', rv, done); },
      showInter: function (trigger, done) { play('it', it, done); }
    };
  }

  function pick() {
    if (!ADS.enabled) return null;
    var want = Platform.query.ads || ADS.provider;
    if (want === 'none') return null;
    if ((want === 'auto' || want === 'hs') && typeof HSAds !== 'undefined') { var h = HSAds.create(); if (h) return h; }
    if (want === 'auto' || want === 'tt') { var tp = TTProvider(); if (tp) return tp; }
    return null;
  }

  /* ---------- show wrapper: freeze game, mute, safety timer ---------- */
  function begin(kind, label) {
    showing = { kind: kind, label: label, t: t() };
    try { Sound.suspend(); } catch (e) {}
    clearTimeout(safety);
    safety = setTimeout(function () { Platform.warn('ads: safety timeout', label); finish(false, 'timeout'); }, ADS.safetyTimeout * 1000);
  }
  var pending = null;
  function finish(ok, err) {
    if (!showing) return;
    var s = showing; showing = null; clearTimeout(safety);
    last = Platform.now();                    // don't let the frame loop jump
    try { Sound.init(); } catch (e) {}
    var cb = pending; pending = null;
    if (cb) cb(ok, err, s);
  }

  var api = {
    policy: policy, stats: stats, sessionTime: t,
    get provider() { return provider ? provider.name : 'none'; },
    get showing() { return !!showing || !!notice; },
    get notice() { return notice; },
    init: function () {
      provider = pick();
      Platform.log('ads: provider=' + (provider ? provider.name : 'none') + ' profile=' + ADS.profile);
    },
    impressions: function () { return policy.impressions(); },
    rewardReady: function (label) {
      if (!provider || showing) return false;
      if (policy.canReward(label, t()) !== null) return false;
      return provider.rewardReady(label);
    },
    rewardCooldown: function (label) { return policy.rewardCooldownLeft(label, t()); },
    reward: function (label, onGranted, onFail) {
      if (!provider) { fx.toast('No video available right now'); if (onFail) onFail('no_provider'); return false; }
      if (showing) return false;
      var why = policy.canReward(label, t());
      if (why) { fx.toast('Come back in ' + Math.ceil(policy.rewardCooldownLeft(label, t())) + 's'); if (onFail) onFail(why); return false; }
      begin('reward', label);
      var t0 = t();
      pending = function (ok, err) {
        if (ok) { policy.record('reward', label, t0, t()); stats.reward++; Platform.log('ads: reward ' + label + ' granted (#' + policy.impressions() + ' @' + t0.toFixed(0) + 's)'); safeCall(onGranted); }
        else {
          if (err === 'closed_early') { fx.toast('Watch the whole video to get the reward'); policy.record('reward', label, t0, t()); stats.reward++; }
          else { stats.noFill++; fx.toast('No video available right now'); }
          Platform.log('ads: reward ' + label + ' not granted (' + err + ')');
          if (onFail) safeCall(onFail, err);
        }
      };
      provider.showReward(label, function (ok, err) { finish(ok, ok ? null : (err || 'closed_early')); });
      return true;
    },
    tryInter: function (trigger, then) {
      var lvl = game ? game.levelIndex : 0;
      var why = !provider ? 'no_provider' : (showing ? 'busy' : policy.canInter(trigger, { level: lvl, now: t() }));
      if (why) { stats.skipped++; if (Platform.debug) Platform.log('ads: inter ' + trigger + ' skipped (' + why + ')'); safeCall(then); return false; }
      // short "Ad break" notice so the interstitial never feels like a mis-tap
      notice = { t: 0, dur: ADS.breakNotice, trigger: trigger };
      setTimeout(function () {
        notice = null;
        begin('inter', trigger);
        var t0 = t();
        pending = function (ok, err) {
          if (ok) { policy.record('inter', trigger, t0, t()); stats.inter++; Platform.log('ads: inter ' + trigger + ' shown (#' + policy.impressions() + ' @' + t0.toFixed(0) + 's)'); }
          else { stats.noFill++; Platform.log('ads: inter ' + trigger + ' failed (' + err + ')'); }
          safeCall(then);
        };
        provider.showInter(trigger, function (ok, err) { finish(ok, err); });
      }, ADS.breakNotice * 1000);
      return true;
    },
    // HS SDK may grant rewards outside a show() call (queued/late grants)
    _externalGrant: function (label) { Platform.log('ads: late grant ' + label); },
    _finishForTest: finish
  };
  function safeCall(f, a) { if (typeof f === 'function') try { f(a); } catch (e) { Platform.warn('ads callback', e); } }
  return api;
})();
