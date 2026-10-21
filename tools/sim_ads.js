#!/usr/bin/env node
/* Monte-Carlo simulation of the ads scenario for the first N minutes of a session.
   Uses the SAME policy code as the game (js/ads_policy.js + ADS in js/config.js) and a
   simple player model for a sort puzzle. Ads take real time (they eat into play time).

   node tools/sim_ads.js [--profile ipu8|balanced] [--minutes 5] [--runs 5000] [--json]

   Player model (tune PLAYER below with real analytics once you have them). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const sb = {}; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js/ads_policy.js'), 'utf8') +
  '\nthis.ADS = ADS; this.AdsPolicy = AdsPolicy;', sb);
const ADS = sb.ADS, AdsPolicy = sb.AdsPolicy;
const TTMIN = +opt('ttmin', 30);   // TikTok's interstitial cap (seen on device: refused under ~30 s)   // platform-enforced min seconds between interstitials (TikTok error 11004; unknown → 0)
const PROFILE = opt('profile', ADS.profile), MINUTES = +opt('minutes', 5), RUNS = +opt('runs', 5000), HORIZON = MINUTES * 60;

const PLAYER = {
  levelTime: [[35, 50], [45, 70], [50, 85], [55, 90]],   // s of play per level (L1, L2, L3, L4+)
  matches: [3, 4, 5, 6],                                  // shelf matches per level (natural breaks)
  winDwell: [3, 6],                                       // s looking at the win panel
  p_R1: 0.45,                                             // takes "x2 Coins"
  p_needBooster: [0, 0.15, 0.35, 0.45], p_R2: 0.6,        // wants an extra shuffle/bed after the free one
  p_stuck: [0, 0.05, 0.15, 0.2], p_R3: 0.55,              // runs out of moves; else restarts
  p_R4_per_min: 0.35,                                     // taps the pulsing video pod (per minute available)
  p_R5: 0.25,                                             // takes the level-start boost
  p_panel: 0.12,                                          // opens Settings / Free Coins per level
  interDur: [6, 15], rewardDur: [25, 32]                  // ad length (inter: many skip at 5 s)
};
function rnd(r, a, b) { return a + (b - a) * r(); }
function rngFrom(seed) { let x = seed | 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e9) / 1e9; }; }
const at = (arr, lvl) => arr[Math.min(lvl, arr.length - 1)];

function session(seed) {
  const r = rngFrom(seed), pol = new AdsPolicy(ADS, PROFILE);
  let t = 0, level = 0; const shown = [];
  pol.reset(0);
  function inter(trigger) {
    if (t >= HORIZON) return;
    if (pol.canInter(trigger, { level, now: t }) !== null) return;
    if (TTMIN && t - pol.lastInter < TTMIN) return;            // platform refused (11004): no impression, no harm
    const d = rnd(r, ...PLAYER.interDur); shown.push({ t, k: 'inter', l: trigger }); t += d; pol.record('inter', trigger, t - d, t);
  }
  function reward(label, p) {
    if (t >= HORIZON || pol.canReward(label, t) !== null || r() > p) return false;
    const d = rnd(r, ...PLAYER.rewardDur); shown.push({ t, k: 'reward', l: label }); t += d; pol.record('reward', label, t - d, t); return true;
  }
  let podCheck = 0;
  while (t < HORIZON) {
    const lt = rnd(r, ...at(PLAYER.levelTime, level)), m = at(PLAYER.matches, level);
    let stuckHandled = false;
    if (ADS.levelBoost && level >= ADS.levelBoost.minLevel) reward(ADS.levelBoost.label, PLAYER.p_R5);
    for (let k = 1; k <= m && t < HORIZON; k++) {
      t += lt / m;
      if (r() < at(PLAYER.p_needBooster, level) / m) reward(r() < 0.5 ? 'Shuffle' : 'Extra Bed', PLAYER.p_R2);
      if (!stuckHandled && k === m - 1 && r() < at(PLAYER.p_stuck, level)) {
        stuckHandled = true;
        if (!reward('Rescue', PLAYER.p_R3)) { inter('I_restart'); t += lt * 0.6; }   // replays part of the level
      }
      if (k < m) inter('I_break');
      if (t - podCheck >= 60) { podCheck = t; reward('Gift Pod', PLAYER.p_R4_per_min); }
    }
    if (t >= HORIZON) break;
    if (r() < PLAYER.p_panel) { t += 4; inter('I_panel'); }
    t += rnd(r, ...PLAYER.winDwell);
    reward('Double Coin', PLAYER.p_R1);
    inter('I_next');
    level++;
  }
  return { shown: shown.filter(s => s.t < HORIZON), levels: level };
}

const res = []; for (let i = 0; i < RUNS; i++) res.push(session(1234 + i * 7919));
const counts = res.map(s => s.shown.length).sort((a, b) => a - b);
const mean = counts.reduce((a, b) => a + b, 0) / RUNS, med = counts[RUNS >> 1];
const byLabel = {}; res.forEach(s => s.shown.forEach(x => { byLabel[x.l] = (byLabel[x.l] || 0) + 1; }));
const inters = res.reduce((n, s) => n + s.shown.filter(x => x.k === 'inter').length, 0) / RUNS;
const levels = res.reduce((n, s) => n + s.levels, 0) / RUNS;
const hist = {}; counts.forEach(c => { hist[c] = (hist[c] || 0) + 1; });
const sample = res[0].shown.map(x => Math.floor(x.t / 60) + ':' + String(Math.floor(x.t % 60)).padStart(2, '0') + ' ' + x.l).join(' · ');
const out = { profile: PROFILE, minutes: MINUTES, runs: RUNS, ipu_mean: +mean.toFixed(2), ipu_median: med,
  p10: counts[Math.floor(RUNS * 0.1)], p90: counts[Math.floor(RUNS * 0.9)], inter_per_user: +inters.toFixed(2),
  rewarded_per_user: +(mean - inters).toFixed(2), levels_completed: +levels.toFixed(2),
  per_placement: Object.fromEntries(Object.entries(byLabel).sort().map(([k, v]) => [k, +(v / RUNS).toFixed(2)])), sample_session: sample };
if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`Profile ${PROFILE}, first ${MINUTES} min, ${RUNS} simulated players` + (TTMIN ? `, platform min inter interval ${TTMIN}s` : ''));
  console.log(`  IPU mean ${out.ipu_mean}  median ${med}  p10 ${out.p10}  p90 ${out.p90}`);
  console.log(`  interstitial ${out.inter_per_user}  rewarded ${out.rewarded_per_user}  levels completed ${out.levels_completed}`);
  console.log('  per placement', JSON.stringify(out.per_placement));
  console.log('  histogram', JSON.stringify(hist));
  console.log('  sample session:', sample);
}
