/* ===================== ADS POLICY (pure, no platform calls) =====================
   Decides WHEN an ad may show. Shared by the game (native/src/ads_native.js) and the
   offline simulator (tools/sim_ads.js). Time is passed in (seconds), never read here. */
function AdsPolicy(cfg, profileName) {
  this.cfg = cfg;
  this.p = cfg.profiles[profileName] || cfg.profiles.ipu8;
  this.reset(0);
}
AdsPolicy.prototype.reset = function (now) {
  this.start = now; this.lastInter = -1e9; this.lastReward = -1e9; this.lastAny = now;
  this.inters = 0; this.rewards = 0; this.lastByLabel = {}; this.log = [];
};
// ctx: { level (0-based), now }
AdsPolicy.prototype.canInter = function (trigger, ctx) {
  var p = this.p, now = ctx.now;
  if (!p.triggers[trigger]) return 'trigger_off';
  if (now - this.start < p.interFirstDelay) return 'warmup';
  if (ctx.level < p.interMinLevel) return 'tutorial';
  if (now - this.lastInter < p.interCooldown) return 'cooldown';
  if (now - this.lastReward < p.interAfterReward) return 'after_reward';
  if (this.inters >= p.maxInterPerSession) return 'cap';
  if (trigger === 'I_break') {
    if (ctx.level < p.breakMinLevel) return 'break_level';
    if (now - this.lastAny < p.breakAfterIdle) return 'break_recent';
  }
  return null;            // null = allowed
};
AdsPolicy.prototype.canReward = function (label, now) {
  var r = this.cfg.rewarded[label]; if (!r) return 'unknown';
  var last = this.lastByLabel[label];
  if (r.cooldown && last !== undefined && now - last < r.cooldown) return 'cooldown';
  return null;
};
AdsPolicy.prototype.rewardCooldownLeft = function (label, now) {
  var r = this.cfg.rewarded[label], last = this.lastByLabel[label];
  if (!r || !r.cooldown || last === undefined) return 0;
  return Math.max(0, r.cooldown - (now - last));
};
// Call when an ad finished showing (impression), kind 'inter' | 'reward'
AdsPolicy.prototype.record = function (kind, label, now, endNow) {
  var end = endNow === undefined ? now : endNow;
  if (kind === 'inter') { this.inters++; this.lastInter = end; }
  else { this.rewards++; this.lastReward = end; this.lastByLabel[label] = end; }
  this.lastAny = end;
  this.log.push({ kind: kind, label: label, t: now - this.start });
};
AdsPolicy.prototype.impressions = function () { return this.inters + this.rewards; };
if (typeof module !== 'undefined' && module.exports && typeof Platform === 'undefined') module.exports = AdsPolicy;
