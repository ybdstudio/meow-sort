/* ===================== ADS: timing + UI flow on top of HSGame =====================
   Game code only calls:
     Ads.rewardReady(label)        → show the ▶ button? (HSGame.canShowAd + local cooldown)
     Ads.reward(label, then)       → HSGame.showAd(label); then(items) only if watched to the end.
                                     The REWARD itself is added by hsOnGive — never here.
     Ads.tryInter(trigger, then)   → maybe HSGame.showAd('Inter1') at a natural break, then then()
   Labels are the exact HS dashboard placement labels (see ADS in js/config.js).
   When/how often is decided by js/ads_policy.js (profile ipu8 / balanced); which ad unit
   plays, cooldowns per unit and on/off per placement are decided on the HS dashboard.
   While an ad is up the game is frozen and muted; a safety timer resumes after
   ADS.safetyTimeout s if nothing ever answers (HSGame itself unlatches after 90 s). */
var Ads = (function () {
  var policy = new AdsPolicy(ADS, ADS.profile);
  var showing = null, notice = null, safety = null, sessionStart = Platform.now() / 1000;
  var stats = { inter: 0, reward: 0, noFill: 0, skipped: 0, closedEarly: 0 };
  function t() { return Platform.now() / 1000 - sessionStart; }
  policy.reset(t());
  function on() { return ADS.enabled && Platform.query.ads !== 'none' && !!HSGame; }

  function begin(kind, label) {
    showing = { kind: kind, label: label };
    try { Sound.suspend(); } catch (e) {}
    clearTimeout(safety);
    safety = setTimeout(function () { Platform.warn('ads: safety timeout', label); end(); }, ADS.safetyTimeout * 1000);
  }
  function end() {
    if (!showing) return;
    showing = null; clearTimeout(safety);
    last = Platform.now();                     // no frame-time jump after the ad
    try { Sound.init(); } catch (e) {}
  }
  function err() { return (HSGame && HSGame.lastAdError) || 'unavailable'; }
  function safeCall(f, a) { if (typeof f === 'function') try { f(a); } catch (e) { Platform.warn('ads callback', e); } }

  return {
    policy: policy, stats: stats, sessionTime: t,
    get provider() { return on() ? 'hs' : 'none'; },
    get showing() { return !!showing || !!notice; },
    get notice() { return notice; },
    init: function () { Platform.log('ads: provider=' + this.provider + ' profile=' + ADS.profile); },
    impressions: function () { return policy.impressions(); },

    rewardReady: function (label) {
      if (!on() || showing || notice) return false;
      if (policy.canReward(label, t()) !== null) return false;
      return HSGame.canShowAd(label);
    },
    rewardCooldown: function (label) { return policy.rewardCooldownLeft(label, t()); },

    reward: function (label, then) {
      if (!on()) { fx.toast('No video available right now'); return false; }
      if (showing || notice) return false;
      if (policy.canReward(label, t())) { fx.toast('Come back in ' + Math.ceil(policy.rewardCooldownLeft(label, t())) + 's'); return false; }
      var t0 = t();
      begin('reward', label);
      HSGame.showAd(label).then(function (r) {
        end();
        if (r) {                                  // watched to the end; items already went through hsOnGive
          policy.record('reward', label, t0, t()); stats.reward++;
          Platform.log('ads: "' + label + '" completed ' + JSON.stringify(r) + ' (#' + policy.impressions() + ' @' + t0.toFixed(0) + 's)');
          safeCall(then, r);
        } else if (err() === 'skipped') {         // played but closed early: an impression, no reward
          policy.record('reward', label, t0, t()); stats.reward++; stats.closedEarly++;
          fx.toast('Watch the whole video to get the reward');
        } else {
          stats.noFill++;
          fx.toast(err() === 'claimed' ? 'Already collected' : 'No video available right now');
          Platform.log('ads: "' + label + '" no ad (' + err() + ')');
        }
      });
      return true;
    },

    tryInter: function (trigger, then) {
      var lvl = game ? game.levelIndex : 0, label = ADS.inter.label;
      var why = !on() ? 'off' : (showing || notice) ? 'busy' : policy.canInter(trigger, { level: lvl, now: t() });
      if (!why && !HSGame.canShowAd(label)) why = 'hs:' + (HSGame.lastAdError || 'not ready');
      if (why) { stats.skipped++; if (Platform.debug) Platform.log('ads: ' + trigger + ' skipped (' + why + ')'); safeCall(then); return false; }
      notice = { trigger: trigger };               // short "Ad break" notice so it never feels like a mis-tap
      setTimeout(function () {
        notice = null;
        var t0 = t();
        begin('inter', trigger);
        HSGame.showAd(label).then(function (r) {
          end();
          if (r || err() === 'skipped') { policy.record('inter', trigger, t0, t()); stats.inter++; Platform.log('ads: ' + label + ' @' + trigger + ' shown (#' + policy.impressions() + ' @' + t0.toFixed(0) + 's)'); }
          else { stats.noFill++; Platform.log('ads: ' + label + ' @' + trigger + ' no ad (' + err() + ')'); }
          safeCall(then);
        });
      }, ADS.breakNotice * 1000);
      return true;
    }
  };
})();
