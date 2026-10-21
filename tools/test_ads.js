#!/usr/bin/env node
/* Ads + HS kit test suite, in the emulator with a fake HS backend (tt.request) and fake TikTok ads.
   Everything goes through HSGame: showAd('<label>') → TikTok ad → onGive. Also runs the kit's own
   hs-check.mjs on the package and the 5-minute IPU simulation.
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
  // 0. the HS kit's own checker on the built package
  const chk = JSON.parse(cp.spawnSync(process.execPath, [path.join(__dirname, 'hs/hs-check.mjs'), path.join(DIST, 'meow-sort'), '--json']).stdout.toString());
  ok(chk.fails === 0, 'hs-check.mjs: ' + chk.fails + ' fail, ' + chk.warns + ' warn' + (chk.fails ? ' → ' + chk.lines.filter(l => l.level === 'FAIL').map(l => l.msg).join(' | ') : ''));
  const warns = chk.lines.filter(l => l.level === 'WARN').map(l => l.msg);
  ok(warns.every(w => /has capitals/.test(w)), 'hs-check warnings are only the capitalised dashboard labels (' + warns.length + ')');

  // 1. IPU simulation gate
  const sim = JSON.parse(cp.execFileSync(process.execPath, [path.join(__dirname, 'sim_ads.js'), '--json', '--runs', '3000']).toString());
  ok(sim.profile === 'paced' && sim.inter_per_user <= 2 && sim.ipu_mean >= 3.5, `sim ${sim.profile} (TikTok 30 s cap): IPU ${sim.ipu_mean} in 5 min, ${sim.inter_per_user} interstitials`);

  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/emulator/index.html?device=iphone14';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { if (SHOTS) await page.locator('#phone').screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const ready = () => page.waitForFunction(() => window.MeowSort && MeowSort.ready && MeowSort.hs().started, null, { timeout: 20000 });
  const tapL = async (x, y) => {
    const p = await page.evaluate(([x, y]) => { const s = MeowSort.logicalToScreen(x, y), c = document.querySelector('#phone canvas').getBoundingClientRect(), k = document.getElementById('phone')._k || 1; return { x: c.left + s.x * k, y: c.top + s.y * k }; }, [x, y]);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(80);
  };
  const open = async (q, keepCloud) => {
    await page.goto(base + '&' + q);
    await page.evaluate((k) => { const p = localStorage.getItem('__hsemu_profile'); localStorage.clear(); if (k && p) localStorage.setItem('__hsemu_profile', p); }, !!keepCloud);
    await page.reload(); await ready(); await page.waitForTimeout(300);
  };
  const idle = () => page.waitForFunction(() => !MeowSort.ads().showing, null, { timeout: 15000 });
  const solveLevel = async () => {
    for (let n = 0; n < 80; n++) {
      if (await page.evaluate(() => MeowSort.game.state) === 'LEVEL_COMPLETE') break;
      if (await page.evaluate(() => MeowSort.ads().showing)) { await idle(); continue; }
      await page.evaluate(() => MeowSort.step());
      await page.waitForFunction(() => { const g = MeowSort.game; return g.state === 'READY' || g.state === 'LEVEL_COMPLETE' || MeowSort.ads().showing; }, null, { timeout: 15000 });
    }
    await idle(); await page.waitForTimeout(1500);
  };
  const st = () => page.evaluate(() => ({ coins: MeowSort.game.coins, lvl: MeowSort.game.levelIndex, state: MeowSort.game.state, imp: MeowSort.ads().impressions(), stats: MeowSort.ads().stats, prov: MeowSort.ads().provider, showing: MeowSort.ads().showing, hs: MeowSort.hs().loggedIn }));
  const dash = JSON.parse(fs.readFileSync(path.join(DIST, 'meow-sort.hs-dashboard.json'), 'utf8')).iaa_config;
  const unit = l => dash.placements.find(p => p.label === l).ads[0].id;

  // 1b. Minis UI: loading art, 3 buttons, popups → HS missions / share → onGive
  const tapId = async (id) => { const b = await page.evaluate((id) => MeowSort.buttons().filter(b => b.id === id).pop(), id); if (!b) return false; await tapL(b.x, b.y); return true; };
  const btnIds = () => page.evaluate(() => MeowSort.buttons().map(b => b.id));
  await open('adauto=1&addur=1');
  ok(await page.evaluate(() => MeowSort.ui().loadingArt && MeowSort.ui().uiArt), 'loading art + UI atlas loaded');
  let ids = await btnIds();
  ok(['mini_shortcut', 'mini_profile', 'mini_share'].every(i => ids.includes(i)), 'play screen shows Add to screen / Revisit gift / Share gift');
  // Add to screen → Launch Reward → Go → TikTok sheet → +250 (tiktok_shortcut) via onGive
  await tapId('mini_shortcut'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => MeowSort.ui().panel === 'pop_launch' && MeowSort.game.state === 'PAUSED'), 'Add to screen → Launch Reward popup');
  let cBefore = (await st()).coins;
  await tapId('pop_cta'); await page.waitForTimeout(300);
  ok(await page.isVisible('#sheet'), 'Go → TikTok "add to home screen" sheet (HSGame.tiktokMission)');
  await page.click('#sh-ok'); await page.waitForTimeout(900);
  let s = await st();
  let ui = await page.evaluate(() => MeowSort.ui());
  ok(s.coins === cBefore + 250 && ui.rewardPopup && ui.rewardPopup.title === 'Launch Reward', 'onGive tiktok_shortcut → +250, "Launch Reward" popup');
  await tapL(270, 557); await page.waitForTimeout(300);
  ok(!(await btnIds()).includes('mini_shortcut'), 'Add to screen button gone once rewarded');
  // Revisit gift → Entry Reward → Claim → profile mission; TikTok confirms on return → +200
  await tapId('mini_profile'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => MeowSort.ui().panel === 'pop_entry'), 'Revisit gift → Entry Reward popup');
  await shot('u_entry');
  cBefore = (await st()).coins;
  await tapId('pop_cta'); await page.waitForTimeout(300);
  await page.click('#sh-ok'); await page.waitForTimeout(500);
  await page.click('#reward'); await page.waitForTimeout(1200);       // emulator: player came back from the profile
  s = await st(); ui = await page.evaluate(() => MeowSort.ui());
  ok(s.coins === cBefore + 200 && ui.rewardPopup && ui.rewardPopup.title === 'Entry Reward', 'return from profile → onGive tiktok_profile +200, "Entry Reward" popup');
  await tapL(270, 557); await page.waitForTimeout(300);
  // Share gift → Share Rewards → Share → +100 (daily)
  await tapId('mini_share'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => MeowSort.ui().panel === 'pop_share'), 'Share gift → Share Rewards popup');
  cBefore = (await st()).coins;
  await tapId('pop_cta'); await page.waitForTimeout(300);
  await page.click('#sh-ok'); await page.waitForTimeout(700);
  s = await st();
  ok(s.coins === cBefore + 100, 'HSGame.share → onGive share +100');
  await tapL(270, 557); await page.waitForTimeout(300);
  ids = await btnIds();
  ok(!ids.includes('mini_profile') && !ids.includes('mini_share'), 'Revisit gift + Share gift gone after their rewards (share is back tomorrow)');
  // close button
  await page.evaluate(() => MeowSort.openPanel('pop_share')); await page.waitForTimeout(300);
  await tapId('pop_close'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => MeowSort.game.state === 'READY'), 'popup ✕ closes it');

  // 2. HS online: rewards come only through onGive
  await open('adauto=1&addur=1');
  s = await st();
  ok(s.prov === 'hs' && s.hs, 'HS kit started and logged in (fake backend) → ads provider hs');
  ok(logs.some(l => /hs: placements .*Double Coin ✓/.test(l)), 'all 6 dashboard placements ready after login');
  await solveLevel();
  ok(await page.evaluate(() => MeowSort.ads().rewardReady('Double Coin')), '"Double Coin" offered on the win panel (HSGame.canShowAd)');
  const c0 = (await st()).coins;
  await tapL(270, 550); await page.waitForTimeout(300);
  ok((await st()).showing, 'game frozen while the ad plays');
  await shot('h1_ad');
  await idle(); await page.waitForTimeout(300);
  s = await st();
  ok(s.coins === c0 + 50, 'showAd("Double Coin") → onGive {coins:50} (' + c0 + ' → ' + s.coins + ')');
  ok(logs.some(l => l.includes('create RewardedVideoAd ' + unit('Double Coin'))), 'HS played the dashboard unit for "Double Coin" (' + unit('Double Coin') + ')');
  await shot('h2_popup');
  await tapL(270, 557); await page.waitForTimeout(200);
  await tapL(270, 619); await page.waitForTimeout(600);
  s = await st();
  ok(s.lvl === 1 && s.stats.inter === 0, 'Next right after a rewarded ad → no interstitial');

  // 3. Interstitial "Inter1"
  await page.evaluate(() => { const p = MeowSort.ads().policy; p.start -= 120; p.lastReward -= 120; p.lastAny -= 120; });
  await solveLevel();
  const ib = (await st()).stats.inter;
  await page.evaluate(() => { const p = MeowSort.ads().policy; p.lastInter -= 120; p.lastReward -= 120; });
  const coinsBeforeInter = (await st()).coins;
  await tapL(270, 619); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !MeowSort.ads().notice && !MeowSort.ads().overlay), 'no "Ad break" notice / dim screen before the ad answers');
  await idle(); await page.waitForTimeout(400);
  s = await st();
  ok(s.stats.inter === ib + 1 && s.lvl === 2, 'showAd("Inter1") at Next → interstitial, then level 3');
  ok(s.coins === coinsBeforeInter, 'Inter1 gives nothing (no reward key)');
  ok(logs.some(l => l.includes('create InterstitialAd ' + unit('Inter1'))), 'HS played the dashboard interstitial unit (' + unit('Inter1') + ')');

  // 3b. TikTok refuses (frequency cap): no interstitial, no dimmed screen, and no retry for >= 30 s
  await page.evaluate(() => { const p = MeowSort.ads().policy; p.lastInter -= 120; p.lastReward -= 120; p.lastAny -= 120; });
  await page.evaluate(() => { window.__fillBefore = document.location.search; });
  const refused = await page.evaluate(async () => {
    const A = MeowSort.ads(), H = MeowSort.hs().kit, real = H.showAd;
    H.showAd = function () { H.lastAdError = 'interstitialAdShow:fail frequency controlled'; return Promise.resolve(null); };
    let after = null; A.tryInter('I_restart', () => { after = true; });
    await new Promise(r => setTimeout(r, 200));
    const again = A.policy.canInter('I_break', { level: 5, now: A.sessionTime() });
    H.showAd = real;
    return { after, overlay: A.overlay, again };
  });
  ok(refused.after && !refused.overlay && refused.again === 'cooldown', 'refused interstitial → game continues at once, next try waits (' + refused.again + ')');

  // 4. Booster placements: reward via onGive, follow-up in the game
  await page.evaluate(() => { MeowSort.game.boosters.bed = 0; MeowSort.game.boosters.shuffle = 0; });
  await page.waitForFunction(() => MeowSort.game.state === 'READY');
  const beds0 = await page.evaluate(() => MeowSort.game.board.containers.filter(c => c.kind === 'bed').length);
  await tapL(390, 902); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  const beds1 = await page.evaluate(() => MeowSort.game.board.containers.filter(c => c.kind === 'bed').length);
  ok(beds1 === beds0 + 1, '"Extra Bed": onGive {extra_bed:1} → bed placed (' + beds0 + ' → ' + beds1 + ')');
  await page.waitForFunction(() => MeowSort.game.state === 'READY');
  const mv0 = await page.evaluate(() => MeowSort.ads().stats.reward);
  await tapL(270, 902); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(800);
  ok(await page.evaluate(() => MeowSort.ads().stats.reward) === mv0 + 1 && await page.evaluate(() => MeowSort.game.boosters.shuffle) === 0,
     '"Shuffle": onGive {shuffle:1} → used for a shuffle right away');

  // 5. Rescue
  await page.evaluate(() => MeowSort.openPanel('rescue')); await page.waitForTimeout(300);
  await shot('h4_rescue');
  const sh0 = await page.evaluate(() => MeowSort.game.boosters.shuffle);
  await tapL(270, 534); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  s = await st();
  ok(s.state === 'READY' && await page.evaluate(() => MeowSort.game.boosters.shuffle) === sh0 + 1, '"Rescue": onGive {shuffle:1, extra_bed:1} → game resumes with an extra bed');

  // 6. Gift Pod + local cooldown
  const c1 = (await st()).coins;
  await tapL(354, 62); await page.waitForTimeout(200); await idle(); await page.waitForTimeout(300);
  ok((await st()).coins === c1 + 100, '"Gift Pod": onGive {coins:100}');
  await tapL(270, 557); await page.waitForTimeout(200);
  ok(await page.evaluate(() => MeowSort.ads().rewardCooldown('Gift Pod') > 40), '"Gift Pod" on its 45 s cooldown');
  await shot('h5_pod');

  // 7. Cloud save: a new phone gets the progress back through onLoad
  const cloudCoins = (await st()).coins, cloudLvl = (await st()).lvl;
  let synced = false;                    // the SDK syncs on its own schedule (rate-limited); nudge it like hs-check does
  for (let i = 0; i < 20 && !synced; i++) {
    await page.evaluate(() => MeowSort.hs().kit.sdk.sync.syncNow().catch(() => {}));
    await page.waitForTimeout(500);
    synced = await page.evaluate((c) => { try { return JSON.parse(localStorage.getItem('__hsemu_profile')).coins === c; } catch (e) { return false; } }, cloudCoins);
  }
  ok(synced, 'progress reached the HS cloud (HSGame.save → /api/sync)');
  await open('adauto=1&addur=1', true);
  s = await st();
  ok(s.coins === cloudCoins && s.lvl === cloudLvl, 'new phone: HSGame onLoad restores level ' + (cloudLvl + 1) + ' and ' + cloudCoins + ' coins');

  // 8. Closed early / no fill / offline
  await open('addur=4');
  const c2 = (await st()).coins;
  await tapL(354, 62); await page.waitForTimeout(600);
  await page.click('#adclose'); await page.waitForTimeout(800);
  s = await st();
  ok(s.coins === c2 && !s.showing, 'closed early → HS gives nothing, game unfrozen');
  await open('adfill=0');
  const c3 = (await st()).coins;
  await tapL(354, 62); await page.waitForTimeout(1200);
  s = await st();
  ok(s.coins === c3 && !s.showing && s.state === 'READY', 'no fill → nothing given, game keeps running');
  const errBefore = errors.length;
  await open('hsoffline=1');
  for (let i = errors.length - 1; i >= errBefore; i--) if (/^\[HS\.TikTokSDK\]/.test(errors[i])) errors.splice(i, 1);   // the SDK logs its failed login: expected offline
  s = await st();
  ok(!s.hs && !await page.evaluate(() => MeowSort.ads().rewardReady('Gift Pod')) && s.state === 'READY', 'HS offline → game plays, ad buttons hidden');

  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(failures ? failures + ' check(s) failed' : 'All ads checks passed');
  await browser.close(); server.close(); process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
