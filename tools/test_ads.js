#!/usr/bin/env node
/* Ads test suite (emulator + fake TikTok ads / fake HS SDK) and IPU simulation gate.
   node tools/test_ads.js [--shots dir] */
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist');
function req(n) { try { return require(n); } catch (e) { return require(path.join('/opt/npm-tools/node_modules', n)); } }
const { chromium } = req('playwright');
const args = process.argv.slice(2), SHOTS = (() => { const i = args.indexOf('--shots'); return i >= 0 ? args[i + 1] : null; })();
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
let failures = 0; const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };

(async () => {
  // 1. IPU simulation gate (same policy code as the game)
  const sim = JSON.parse(cp.execFileSync(process.execPath, [path.join(__dirname, 'sim_ads.js'), '--json', '--runs', '3000']).toString());
  ok(sim.ipu_median >= 8 && sim.ipu_mean >= 7.5, `sim ${sim.profile}: IPU in 5 min median ${sim.ipu_median}, mean ${sim.ipu_mean} (target 8)`);
  const simB = JSON.parse(cp.execFileSync(process.execPath, [path.join(__dirname, 'sim_ads.js'), '--json', '--runs', '3000', '--profile', 'balanced']).toString());
  ok(simB.ipu_mean < sim.ipu_mean, `sim balanced profile is lighter (mean ${simB.ipu_mean})`);

  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/emulator/index.html?device=iphone14';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { if (SHOTS) await page.locator('#phone').screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const ready = () => page.waitForFunction(() => window.MeowSort && MeowSort.ready, null, { timeout: 20000 });
  const tapL = async (x, y) => {
    const p = await page.evaluate(([x, y]) => { const s = MeowSort.logicalToScreen(x, y), c = document.querySelector('#phone canvas').getBoundingClientRect(), k = document.getElementById('phone')._k || 1; return { x: c.left + s.x * k, y: c.top + s.y * k }; }, [x, y]);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(80);
  };
  const open = async (q) => { await page.goto(base + '&' + q); await page.evaluate(() => localStorage.clear()); await page.reload(); await ready(); await page.waitForTimeout(200); };
  const idle = () => page.waitForFunction(() => !MeowSort.ads().showing, null, { timeout: 15000 });
  const solveLevel = async () => {
    for (let n = 0; n < 80; n++) {
      const st = await page.evaluate(() => MeowSort.game.state);
      if (st === 'LEVEL_COMPLETE') break;
      if (await page.evaluate(() => MeowSort.ads().showing)) { await idle(); continue; }
      await page.evaluate(() => MeowSort.step());
      await page.waitForFunction(() => { const g = MeowSort.game; return g.state === 'READY' || g.state === 'LEVEL_COMPLETE' || MeowSort.ads().showing; }, null, { timeout: 15000 });
    }
    await idle(); await page.waitForTimeout(1500);
  };
  const st = () => page.evaluate(() => ({ coins: MeowSort.game.coins, lvl: MeowSort.game.levelIndex, state: MeowSort.game.state, imp: MeowSort.ads().impressions(), stats: MeowSort.ads().stats, prov: MeowSort.ads().provider, showing: MeowSort.ads().showing }));

  // 2. TikTok provider (fake ads, auto-complete after 1 s)
  await open('fakeads=1&adauto=1&addur=1');
  let s = await st();
  ok(s.prov === 'tt', 'provider = tt (TikTok createRewardedVideoAd / createInterstitialAd)');
  await solveLevel();
  ok((await st()).state === 'LEVEL_COMPLETE', 'level 1 complete');
  ok(await page.evaluate(() => MeowSort.ads().rewardReady('R1')), 'R1 x2 Coins offered on the win panel');
  await shot('a1_win_x2');
  const c0 = (await st()).coins;
  await tapL(270, 550);                                  // "x2 Coins"
  await page.waitForTimeout(300);
  ok((await st()).showing, 'game frozen while the rewarded ad plays');
  await shot('a2_fake_ad');
  await idle(); await page.waitForTimeout(300);
  s = await st();
  ok(s.coins === c0 + 50 && s.stats.reward === 1, 'R1 granted after watching: +50 coins (' + c0 + ' → ' + s.coins + ')');
  await tapL(270, 557); await page.waitForTimeout(200);   // collect popup
  await tapL(270, 619); await page.waitForTimeout(600);  // Next (no inter right after a rewarded ad)
  s = await st();
  ok(s.lvl === 1 && s.stats.inter === 0, 'Next after x2 Coins → level 2 without an interstitial');

  // 3. Interstitial on Next (warm-up passed)
  await page.evaluate(() => { const p = MeowSort.ads().policy; p.start -= 120; p.lastReward -= 120; p.lastAny -= 120; });
  await solveLevel();
  s = await st();
  const interBefore = s.stats.inter;
  ok(s.state === 'LEVEL_COMPLETE', 'level 2 complete' + (s.stats.inter ? ' (I_break shown during play: ' + s.stats.inter + ')' : ''));
  await page.evaluate(() => { const p = MeowSort.ads().policy; p.lastInter -= 120; p.lastReward -= 120; });
  await tapL(270, 619); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!MeowSort.ads().notice), '"Ad break" notice before the interstitial');
  await shot('a3_ad_break');
  await page.waitForTimeout(1300); await idle(); await page.waitForTimeout(400);
  s = await st();
  ok(s.stats.inter === interBefore + 1 && s.lvl === 2, 'I_next interstitial shown, then level 3 loads');

  // 4. Cooldown: an immediate second interstitial is refused
  const why = await page.evaluate(() => MeowSort.ads().policy.canInter('I_restart', { level: 2, now: MeowSort.ads().sessionTime() }));
  ok(why === 'cooldown', 'interstitial cooldown respected (' + why + ')');

  // 5. R2 booster refill
  await page.evaluate(() => { MeowSort.game.boosters.bed = 0; });
  await page.evaluate(() => { const p = MeowSort.ads().policy; p.lastInter -= 120; });
  const beds0 = await page.evaluate(() => MeowSort.game.board.containers.filter(c => c.kind === 'bed').length);
  await tapL(390, 902); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  const beds1 = await page.evaluate(() => MeowSort.game.board.containers.filter(c => c.kind === 'bed').length);
  ok(beds1 === beds0 + 1, 'R2: "▶ Ad" on Extra Bed → watched → bed added (' + beds0 + ' → ' + beds1 + ')');

  // 6. R3 rescue panel
  await page.evaluate(() => MeowSort.openPanel('rescue')); await page.waitForTimeout(300);
  await shot('a4_rescue');
  const sh0 = await page.evaluate(() => MeowSort.game.boosters.shuffle);
  await tapL(270, 534); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  s = await st();
  ok(s.state === 'READY' && await page.evaluate(() => MeowSort.game.boosters.shuffle) === sh0 + 1, 'R3 rescue: watched → game resumes with +1 shuffle (+1 bed)');

  // 7. R4 gift pod + cooldown
  const c1 = (await st()).coins;
  await tapL(354, 62); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  ok((await st()).coins === c1 + 100, 'R4 gift pod: +100 coins');
  await tapL(270, 557); await page.waitForTimeout(200);
  ok(await page.evaluate(() => MeowSort.ads().rewardCooldown('R4') > 40), 'R4 on cooldown afterwards (badge shows the countdown)');
  await shot('a5_pod_cooldown');

  // 8. Closed early → no reward; no fill → no freeze
  await open('fakeads=1&addur=4');
  const c2 = (await st()).coins;
  await tapL(354, 62); await page.waitForTimeout(500);
  await page.click('#adclose'); await page.waitForTimeout(400);
  s = await st();
  ok(s.coins === c2 && !s.showing, 'rewarded closed early → no reward, game unfrozen');
  await open('fakeads=1&adfill=0');
  await tapL(354, 62); await page.waitForTimeout(500);
  s = await st();
  ok(!s.showing && s.state === 'READY', 'no fill → toast, game keeps running');

  // 9. HS provider path (fake HS SDK, API as assumed in hs_native.js)
  await open('hsfake=1&adauto=1&addur=1');
  s = await st();
  ok(s.prov === 'hs', 'provider = hs when the HS SDK is present (fake)');
  const c3 = s.coins;
  await tapL(354, 62); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  ok((await st()).coins === c3 + 100, 'HS onGive → R4 reward granted');

  // 10. No provider → ad buttons hidden, nothing breaks
  await open('ads=none');
  ok(await page.evaluate(() => MeowSort.ads().provider === 'none' && !MeowSort.ads().rewardReady('R4')), 'ads=none: rewarded buttons hidden');

  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(failures ? failures + ' check(s) failed' : 'All ads checks passed');
  await browser.close(); server.close(); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
