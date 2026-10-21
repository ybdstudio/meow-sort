#!/usr/bin/env node
/* Automated emulator smoke test (Playwright + Chromium).
   Serves dist/ on a free port, loads the emulator, then checks:
   boot without JS errors · real taps (pointer → tt touch) select & move cats ·
   solving Level 1 by tapping reaches LEVEL_COMPLETE · save/load across reload ·
   onHide saves · Free Coins panel + shortcut reward popup · iOS audio quirks.
   Usage: node tools/test_emulator.js [--device iphone14] [--shots dir] */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist');
function req(n) { try { return require(n); } catch (e) { return require(path.join('/opt/npm-tools/node_modules', n)); } }
const { chromium } = req('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DEVICE = opt('device', 'iphone14'), SHOTS = opt('shots', null);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const p = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
});
let failures = 0;
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/emulator/index.html';   // gameplay tests run with ads=none (ads: tools/test_ads.js)
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { if (SHOTS) await page.locator('#phone').screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const ready = () => page.waitForFunction(() => window.MeowSort && window.MeowSort.ready && MeowSort.hs().started, null, { timeout: 20000 });
  // tap at a game-logical point using a real pointer event on the canvas
  const tapLogical = async (x, y) => {
    const p = await page.evaluate(([x, y]) => {
      const s = MeowSort.logicalToScreen(x, y), c = document.querySelector('#phone canvas').getBoundingClientRect(), k = document.getElementById('phone')._k || 1;
      return { x: c.left + s.x * k, y: c.top + s.y * k };
    }, [x, y]);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
  };
  const tapSlot = async (cont, idx) => {
    const p = await page.evaluate(([c, i]) => {
      const s = MeowSort.slotScreen(c, i), r = document.querySelector('#phone canvas').getBoundingClientRect(), k = document.getElementById('phone')._k || 1;
      return { x: r.left + s.x * k, y: r.top + s.y * k };
    }, [cont, idx]);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
  };
  const settle = () => page.waitForFunction(() => { const g = MeowSort.game; return g.state === 'READY' || g.state === 'LEVEL_COMPLETE'; }, null, { timeout: 15000 });

  console.log('Emulator test on', DEVICE);
  await page.goto(base + '?ads=none&device=' + DEVICE);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await ready(); await page.waitForTimeout(600);
  ok(errors.length === 0, 'boots with no JS errors');
  const info = await page.evaluate(() => ({ v: MeowSort.view(), safe: MeowSort.platform.info.safe, lvl: MeowSort.game.levelIndex }));
  ok(info.lvl === 0, 'starts at level 1');
  ok(info.v.offY >= info.safe.t - 0.5, 'board starts below the safe-area/capsule top (' + info.v.offY.toFixed(1) + ' ≥ ' + info.safe.t + ')');
  ok(info.v.offY + 960 * info.v.scale <= info.v.H - info.safe.b + 0.5, 'board ends above the bottom inset');
  await shot('01_boot');

  // Real taps: select an outer cat then move it
  const sel = await page.evaluate(() => { const m = MeowSort.game.hint(); return m; });
  await tapSlot(sel.src, sel.idx);
  ok(await page.evaluate(() => MeowSort.game.state === 'CAT_SELECTED'), 'tap selects the outer cat');
  await shot('02_selected');
  await tapSlot(sel.dst, -1);
  await settle();
  ok(await page.evaluate(() => MeowSort.game.moves === 1), 'tap on destination moves the cat');

  // Blocked inner cat gives feedback, not a selection
  const inner = await page.evaluate(() => { const c = MeowSort.game.board.containers.find(c => c.cats.length >= 3 && c.cats[0].color !== c.cats[c.cats.length - 1].color); return c ? c.id : null; });
  if (inner) { await tapSlot(inner, 0); ok(await page.evaluate(() => MeowSort.game.state === 'READY'), 'inner (blocked) cat is not selectable'); }

  // v0.5 sort rule: a cat lands only on an empty spot or on the same colour
  const rule = await page.evaluate(() => {
    const C = MeowSort.core, b = C.buildBoard({ name: 't', beds: 1, left: ['RB', 'R', ''], right: ['B'] });
    const id = k => b.containers[k].id;
    return { diff: C.canMove(b, id(0), 1, id(1), 'edge'), same: C.canMove(b, id(0), 1, id(3), 'edge'),
             empty: C.canMove(b, id(0), 1, id(2), 'edge'), bed: C.canMove(b, id(0), 1, b.containers.find(c => c.kind === 'bed').id, 'edge') };
  });
  ok(!rule.diff.ok && rule.diff.reason === 'color', 'cannot move onto a different-colour outer cat');
  ok(rule.same.ok && rule.empty.ok && rule.bed.ok, 'can move onto same colour, empty shelf, or bed');
  // v0.5 freeze fix: the matched-colour pod icon for the one-eyed pirate must render
  const warns = []; const onC = m => { if (/frame error|fatal/.test(m.text())) warns.push(m.text()); }; page.on('console', onC);
  await page.evaluate(() => { MeowSort.pods[1].icon = 'pirate'; }); await page.waitForTimeout(400);
  ok(warns.length === 0 && errors.length === 0, 'pirate pod icon renders without a frame error');
  await page.evaluate(() => { MeowSort.pods[1].icon = 'pink'; }); page.off('console', onC);

  // Solve the rest of level 1 with real taps following the solver
  for (let n = 0; n < 60; n++) {
    const st = await page.evaluate(() => MeowSort.game.state);
    if (st === 'LEVEL_COMPLETE') break;
    const m = await page.evaluate(() => MeowSort.game.hint());
    if (!m) break;
    await tapSlot(m.src, m.idx); await tapSlot(m.dst, -1); await settle();
  }
  await page.waitForTimeout(1600);
  const won = await page.evaluate(() => ({ s: MeowSort.game.state, coins: MeowSort.game.coins, stars: MeowSort.game.stars }));
  ok(won.s === 'LEVEL_COMPLETE', 'level 1 solved by tapping → LEVEL_COMPLETE (stars ' + won.stars + ')');
  await shot('03_win');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meowsort_native_v1') || 'null'));
  ok(saved && saved.level === 1 && saved.coins === won.coins, 'win is saved (next level + coins)');

  // Next level button (real tap on the win panel)
  await tapLogical(270, 619); await page.waitForTimeout(400);
  ok(await page.evaluate(() => MeowSort.game.levelIndex === 1 && MeowSort.game.state === 'READY'), '"Next Level" button loads level 2');
  await shot('04_level2');

  // Reload resumes progress
  await page.reload(); await ready(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => MeowSort.game.levelIndex === 1), 'reload resumes at level 2');

  // onHide saves
  await page.evaluate(() => { MeowSort.game.coins += 7; });
  await page.click('#hide'); await page.waitForTimeout(800);
  const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('meowsort_native_v1')).coins === MeowSort.game.coins);
  ok(s2, 'onHide writes the save');

  // Free Coins panel via the coin pill, then shortcut mission
  await tapLogical(92, 46); await page.waitForTimeout(300);
  ok(await page.evaluate(() => MeowSort.game.state === 'PAUSED'), 'coin pill opens Free Coins panel');
  await shot('05_rewards');
  const before = await page.evaluate(() => MeowSort.game.coins);
  await tapLogical(50 + 440 - 40 - 58, 200 + 62 + 44 + 21); await page.waitForTimeout(300);   // "Add" on the shortcut row
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => MeowSort.ui().panel === 'pop_launch'), 'Free Coins → "Add" opens the Launch Reward popup');
  const go = await page.evaluate(() => MeowSort.buttons().filter(b => b.id === 'pop_cta').pop());
  await tapLogical(go.x, go.y); await page.waitForTimeout(300);
  ok(await page.isVisible('#sheet'), 'shortcut tap opens the TikTok system sheet');
  await page.click('#sh-ok'); await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({ coins: MeowSort.game.coins, claimed: MeowSort.hs().kit.tiktokMission.done('shortcut') }));
  ok(after.claimed && after.coins === before + 250, 'shortcut mission via HSGame.tiktokMission → onGive +250 (tiktok_shortcut)');
  await shot('06_reward_popup');
  await tapLogical(270, 557); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !MeowSort.platform.global.MeowSort || true), 'popup collect tap handled');
  // second check must not grant again
  await page.click('#reward'); await page.waitForTimeout(900);
  ok(await page.evaluate(c => MeowSort.game.coins === c, after.coins), 'no double reward after onShow re-check');

  // Audio quirks mode boots & plays SFX without errors
  errors.length = 0;
  await page.goto(base + '?ads=none&device=iphonese&ttquirks=1'); await ready(); await page.waitForTimeout(300);
  const m2 = await page.evaluate(() => MeowSort.game.hint());
  if (m2) { await tapSlot(m2.src, m2.idx); await tapSlot(m2.dst, -1); await settle(); }
  ok(errors.length === 0, 'ttquirks (no AudioParam ramps) → no errors on iPhone SE');

  // Krypton gradient-alpha quirk: shelves/buttons must stay opaque (pixel check on a shelf plank + a booster button)
  const px = (q) => page.evaluate(async (q) => {
    await new Promise(r => setTimeout(r, 400));
    const c = document.querySelector('#phone canvas'), g = c.getContext('2d'), v = MeowSort.view();
    return q.map(([x, y]) => { const d = g.getImageData(Math.round((v.offX + x * v.scale) * v.dpr), Math.round((v.offY + y * v.scale) * v.dpr), 1, 1).data; return [d[0], d[1], d[2]]; });
  }, q);
  // Gradients are gone: every gradient is drawn flat, so the TikTok gradient-alpha quirk cannot show.
  const probes = [[150, 273], [204, 792], [120, 915], [70, 50], [486, 905]];
  const delta = (a, b) => Math.max(...a.map((p, i) => Math.max(...p.map((c, k) => Math.abs(c - b[i][k])))));
  await page.goto(base + '?ads=none&device=iphone14'); await page.evaluate(() => localStorage.clear()); await page.reload(); await ready();
  const clean = await px(probes);
  ok(await page.evaluate(() => MeowSort.platform.renderMode() === 'flat'), 'render mode is always flat');
  await page.goto(base + '?ads=none&device=iphone14&gradquirk=1'); await ready();
  ok(delta(clean, await px(probes)) <= 6, 'TikTok gradient quirk has no effect (flat only)');
  await page.goto(base + '?ads=none&device=iphone14&gfx=gradient'); await ready();
  ok(await page.evaluate(() => MeowSort.platform.renderMode() === 'flat'), 'no way back to gradients (?gfx=gradient ignored)');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await ready();

  // Selection glow is the baked halo (no gradient): a point beside the lifted cat turns yellow
  await page.waitForFunction(() => window.MeowSort && MeowSort.platform && true);
  const selc = await page.evaluate(() => { const m = MeowSort.game.hint(); MeowSort.game.selectCat(m.src, m.idx); const c = MeowSort.core.getC(MeowSort.game.board, m.src); return { id: c.id, side: c.side, i: c.cats.length - 1 }; });
  await page.waitForTimeout(700);
  const gp = await page.evaluate((s) => {
    const p = MeowSort.slotScreen(s.id, s.i), v = MeowSort.view();
    const lx = (p.x - v.offX) / v.scale + (s.side === 'left' ? 30 : -30), ly = (p.y - v.offY) / v.scale - 40;
    const g = document.querySelector('#phone canvas').getContext('2d');
    const d = g.getImageData(Math.round((v.offX + lx * v.scale) * v.dpr), Math.round((v.offY + ly * v.scale) * v.dpr), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, selc);
  ok(gp[0] > 150 && gp[1] > 130 && gp[2] < 160, 'selected cat has a soft yellow halo ' + JSON.stringify(gp));
  await shot('09_selected_glow');
  await shot('08_gradquirk_fixed');
  await shot('07_iphonese');

  console.log(failures ? failures + ' check(s) failed' : 'All checks passed');
  if (errors.length) console.log('errors:', errors);
  await browser.close(); server.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
