#!/usr/bin/env node
// hs-check — does this native TikTok mini game integrate the HS SDK kit correctly?
//
//   node hs-check.mjs <game folder> [--dashboard file] [--json]
//
// Runs the game's own game.js — with its hs-game.js and hs-tiktok-sdk.min.js —
// inside a fake TikTok native runtime and a fake HS backend. Nothing reaches
// TikTok or our servers, and no file in the game folder is changed.
//
// The dashboard JSON the AI wrote is read from <game folder>.hs-dashboard.json
// (next to the folder), or --dashboard. Its iaa_config is served as the live
// dashboard config, so the check answers: will these rewards actually reach the
// player with THIS build?
//
// Two runs, each in its own process:
//   fresh     first launch: boots, logs in, claims every reward key, plays a test ad, saves
//   returning a new phone: the cloud save from run 1 comes back and must be restored
//
// Exit code 0 = no FAIL.

import { fork } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SELF = fileURLToPath(import.meta.url);
const MIN_SDK = [1, 0, 7];
const MIN_KIT = [3, 0, 0];

// ════════════════════════════════════════════════════════════ child: one run
if (process.env.HS_CHECK_CHILD) {
  const cfg = JSON.parse(process.env.HS_CHECK_CHILD);
  runGame(cfg).then(
    (out) => { process.send(out); process.exit(0); },
    (e) => { process.send({ crash: String(e && e.stack || e) }); process.exit(0); }
  );
} else {
  main();
}

async function runGame(cfg) {
  const gameJs = join(cfg.dir, 'game.js');
  const requests = [];
  const errors = [];
  const adShows = [];
  process.on('uncaughtException', (e) => errors.push(String(e && e.message || e)));
  process.on('unhandledRejection', (e) => errors.push('unhandled rejection: ' + String(e && e.message || e)));

  // ─── fake HS backend: the dashboard JSON (if any) is the live config ───
  const dash = cfg.iaa || {};
  const iaaConfig = {
    ...dash,
    // The checker's own test place: a rewarded unit, no reward key.
    placements: [...(dash.placements || []), { label: '__check', ads: [{ id: 'check_rewarded' }] }],
  };
  const aps = [{ id: 'check_rewarded', type: 'rewarded', status: 'active' }];
  const loginBody = () => {
    const b = { success: true, session_token: 'sess_check', open_id: 'open_check', last_updated_timestamp: 1,
      ack_required: true, refund_mode: 'auto', aps, iaa_config: JSON.stringify(iaaConfig) };
    if (cfg.cloud) b.profile_data = JSON.stringify(cfg.cloud);
    return b;
  };
  const route = (ep, data) => {
    if (ep === '/api/login') return loginBody();
    if (ep === '/api/pending_rewards') return { success: true, pending_count: 0, rewards: [] };
    if (ep === '/api/sync') return { success: true, last_updated_timestamp: 2 };
    if (ep === '/api/orders/mark_delivered') { const ids = JSON.parse(data).order_ids || []; return { success: true, delivered: ids, already: [], not_found: [], not_paid: [] }; }
    if (ep === '/api/ads/config') return { success: true, aps, iaa_config: JSON.stringify(iaaConfig) };
    if (ep === '/api/shop/items') return { success: true, items: [] };
    return { success: false, error: 'hs-check: no route ' + ep };
  };

  // ─── fake native runtime ───
  const hole = new Proxy(function () {}, { get: (t, p) => (p === 'then' ? undefined : hole), apply: () => hole, construct: () => hole });
  const grad = { addColorStop() {} };
  const ctx2d = (canvas) => new Proxy({ canvas }, {
    get: (t, p) => (p in t ? t[p] : p === 'measureText' ? () => ({ width: 10 }) : p === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => grad),
    set: (t, p, v) => { t[p] = v; return true; },
  });
  const makeCanvas = () => { const c = { width: 1080, height: 1920, style: {}, addEventListener() {} }; c.getContext = (k) => (k === '2d' ? ctx2d(c) : hole); return c; };
  const store = new Map();
  const known = {
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, screenWidth: 390, screenHeight: 844, pixelRatio: 3, platform: 'ios' }),
    createCanvas: makeCanvas,
    getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
    setStorageSync: (k, v) => { store.set(k, v); },
    removeStorageSync: (k) => { store.delete(k); },
    createImage: () => { const im = { width: 0, height: 0, complete: false }; let s = '';
      Object.defineProperty(im, 'src', { get: () => s, set: (v) => { s = v; setTimeout(() => { im.width = im.height = 10; im.complete = true; im.onload && im.onload(); }, 1); } });
      return im; },
    onShow() {}, onHide() {}, offShow() {}, offHide() {},
    login: (o) => setTimeout(() => o.success({ code: 'CHECK_CODE' }), 5),
    request: (o) => {
      const ep = String(o.url).replace(/^https?:\/\/[^/]+/, '');
      requests.push({ ep, header: o.header || {}, data: o.data });
      setTimeout(() => o.success({ statusCode: 200, data: JSON.stringify(route(ep, o.data)), header: {} }), 5);
      return { abort() {} };
    },
    // 3 s and no hide event — the iOS case SDKs before 1.0.7 turned into a false 11004.
    createRewardedVideoAd: ({ adUnitId }) => { let close; adShows.push(adUnitId);
      return { onClose: (cb) => { close = cb; }, onError() {}, offClose() {}, offError() {}, destroy() {},
        show: () => { setTimeout(() => close && close({ isEnded: true }), 3000); return Promise.resolve(); } }; },
    createInterstitialAd: ({ adUnitId }) => { let close; adShows.push(adUnitId);
      return { onClose: (cb) => { close = cb; }, onError() {}, destroy() {}, show: () => { setTimeout(() => close && close(), 50); return Promise.resolve(); } }; },
  };
  const tt = new Proxy(known, { get: (t, p) => (p in t ? t[p] : typeof p === 'string' && /^(on|off|create|get|set|show|hide|request|navigate|vibrate|report)/.test(p) ? hole : undefined) });

  globalThis.tt = tt;
  globalThis.TTMinis = { game: { login: known.login, canIUse: () => true } };
  globalThis.GameGlobal = globalThis;
  globalThis.require = createRequire(gameJs);
  globalThis.__HS_CHECK__ = { gameId: '7000000000000000000', sdkKey: 'sk_test_hscheck' };

  const quiet = ['log', 'info', 'warn', 'debug'].map((n) => { const o = console[n]; console[n] = () => {}; return () => { console[n] = o; }; });
  try {
    vm.runInThisContext(readFileSync(gameJs, 'utf8'), { filename: gameJs });
  } catch (e) {
    errors.push('game.js threw while loading: ' + String(e && e.message || e));
  }
  for (const r of quiet) r();

  await wait(800);   // boot + login + post-login hooks over fake 5 ms requests
  const HS = globalThis.HSGame;
  const out = { errors, requests: [], trace: [], adShows, hsLoaded: !!HS };
  if (!HS) { out.requests = requests; return out; }

  out.kitVersion = HS.version;
  out.ready = HS.ready;
  out.canGive = HS.canGive;
  out.platform = HS.sdk ? HS.sdk.platform : null;
  out.defaults = HS.defaults;

  // What the GAME touched, before the checker's own calls below add to the trace.
  out.gameTrace = HS.trace;

  if (cfg.scenario === 'fresh' && HS.ready) {
    // Can THIS build give every reward key — the game's defaults and the dashboard's?
    const keys = new Set([...Object.keys(out.defaults.rewards || {}), ...Object.keys(dash.rewards || {})]);
    out.probe = {};
    for (const k of keys) out.probe[k] = HS._probe ? HS._probe(k) : { empty: true };
    out.adResult = await HS.showAd('__check');   // the checker's own ad, not the game's
    if (HS.sdk && HS.sdk.sync) { try { await HS.sdk.sync.syncNow(); } catch (e) { /* reported below */ } }
  } else {
    await wait(200);
    if (HS.sdk && HS.sdk.sync) { try { await HS.sdk.sync.syncNow(); } catch (e) { /* ignore */ } }
  }
  await wait(100);
  out.trace = HS.trace;
  out.requests = requests;
  return out;
}

// ════════════════════════════════════════════════════════════ parent: report
async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dashboard');
  const asJson = args.includes('--json');
  if (!dir) {
    console.log('usage: node hs-check.mjs <game folder> [--dashboard file] [--json]');
    process.exit(2);
  }
  const root = resolve(dir);
  const lines = [];
  const add = (level, msg, fix) => lines.push({ level, msg, fix });

  // ─── package ───
  const has = (f) => existsSync(join(root, f));
  if (!has('game.js')) { add('FAIL', 'no game.js — not a native mini game package'); return finish(lines, asJson); }
  if (has('index.html')) add('FAIL', 'index.html found — TikTok no longer accepts H5 games', 'build a native package: game.js + game.json, canvas from tt.createCanvas()');
  else add('PASS', 'native package (game.js, no index.html)');
  if (!has('game.json')) add('FAIL', 'no game.json', 'add { "deviceOrientation": "portrait" }');

  const conf = readJson(join(root, 'project.config.json'));
  if (!conf || !conf.appid || /YOUR|xxx|TODO/i.test(String(conf.appid))) add('WARN', 'project.config.json appid is not set', 'put the TikTok App ID (Client Key) there before uploading');

  if (!has('hs-game.js')) add('FAIL', 'hs-game.js missing next to game.js', 'copy it from the kit into the game folder');
  if (!has('hs-tiktok-sdk.min.js')) add('FAIL', 'hs-tiktok-sdk.min.js missing next to game.js', 'copy it from the kit into the game folder');
  else {
    const v = versionOf(readFileSync(join(root, 'hs-tiktok-sdk.min.js'), 'utf8').slice(0, 200));
    if (v && cmp(v, MIN_SDK) >= 0) add('PASS', `SDK v${v.join('.')}`);
    else add('FAIL', `SDK v${v ? v.join('.') : '?'} is older than ${MIN_SDK.join('.')}`, 'replace hs-tiktok-sdk.min.js from the kit (older ones lose iOS ad rewards)');
  }

  // ─── source scan ───
  const src = readFileSync(join(root, 'game.js'), 'utf8');
  if (/client_secret|clientSecret/.test(src)) add('FAIL', 'game.js mentions a client secret', 'secrets never go in game.js — everything in it is public');
  if (/\b(createRewardedVideoAd|createInterstitialAd|shareAppMessage|addShortcut|startEntranceMission)\s*\(/.test(src)) {
    add('WARN', 'game.js calls TikTok ads / share / missions directly', 'use HSGame.showAd / share / tiktokMission so the dashboard controls them');
  }
  if (!/require\(\s*['"]\.\/hs-game(\.js)?['"]\s*\)/.test(src)) add('FAIL', "game.js never does require('./hs-game.js')", 'see INTEGRATE-WITH-AI.md');

  // ─── the dashboard JSON the AI wrote ───
  const dashArg = valueAfter(args, '--dashboard');
  const dashFile = [dashArg && resolve(dashArg), root + '.hs-dashboard.json', join(root, 'hs-dashboard.json')].find((f) => f && existsSync(f));
  const dash = dashFile ? readJson(dashFile) : null;
  if (dashFile && dashFile.startsWith(root + '/')) add('WARN', 'the dashboard JSON is INSIDE the game folder', `move it to ${root}.hs-dashboard.json — it must not be uploaded to TikTok`);
  if (dashFile && !dash) add('FAIL', `${dashFile} is not valid JSON`);

  // ─── run 1: fresh install ───
  const fresh = await child({ dir: root, scenario: 'fresh', iaa: dash && dash.iaa_config });
  if (fresh.crash) { add('FAIL', 'the checker crashed: ' + fresh.crash.split('\n')[0]); return finish(lines, asJson); }
  if (fresh.errors.length) add('FAIL', 'game errors in the native runtime: ' + fresh.errors.slice(0, 3).join(' | '), 'browser-only code (window, document, DOM, localStorage) does not exist in a native mini game');
  else add('PASS', 'boots in the native runtime without errors');

  if (!fresh.hsLoaded) { add('FAIL', 'HSGame never loaded', "require('./hs-game.js') at the top of game.js"); return finish(lines, asJson); }
  const kv = versionOf('v' + (fresh.kitVersion || ''));
  if (!kv || cmp(kv, MIN_KIT) < 0) add('FAIL', `hs-game.js ${fresh.kitVersion || '?'} is older than ${MIN_KIT.join('.')}`, 'replace hs-game.js from the kit');
  const t = fresh.trace;
  if (t.indexOf('start') < 0) add('FAIL', 'HSGame.start() is never called', 'call it once at startup');
  else if (!fresh.canGive) add('FAIL', 'HSGame.start() has no onGive', 'nothing can be given without it — every reward, ad and purchase goes there');
  else if (!fresh.ready) add('FAIL', 'HSGame.start() did not start the SDK', 'check gameId / sdkKey and that hs-tiktok-sdk.min.js loads');
  else add('PASS', `SDK started (host: ${fresh.platform}), onGive set`);

  const login = fresh.requests.find((r) => r.ep === '/api/login');
  if (login) {
    const body = safeJson(login.data) || {};
    if (body.client_ack === true && login.header['X-SDK-Platform'] === 'js') add('PASS', 'login over tt.request, with delivery confirmation');
    else add('FAIL', 'login request is not the 1.0.7 shape', 'update hs-tiktok-sdk.min.js');
  } else if (fresh.ready) add('FAIL', 'no login request was made');

  if (fresh.ready) {
    if (fresh.adResult && fresh.adShows.includes('check_rewarded')) add('PASS', 'a 3 s rewarded ad with no hide event completes (iOS case)');
    else add('FAIL', 'the test rewarded ad did not complete', 'update hs-game.js and hs-tiktok-sdk.min.js from the kit');
  }

  // ─── rewards: can this build give every key? ───
  const defaults = fresh.defaults || { rewards: {}, items: {} };
  const probe = fresh.probe || {};
  const takes = [], refuses = [];
  for (const [k, p] of Object.entries(probe)) {
    if (p.empty) continue;
    (p.given ? takes : refuses).push(`${k} ${JSON.stringify(p.items)}`);
  }
  if (takes.length) add('PASS', 'onGive gives: ' + takes.join(' · '));
  if (refuses.length) add(dash ? 'FAIL' : 'WARN', 'onGive refuses: ' + refuses.join(' · '), 'add those item names to give(), or change the rewards — until then players get nothing for them');

  // ─── what the code uses vs what is configured ───
  const used = collectUsage(src, fresh.gameTrace || []);
  add('INFO', `uses: ${used.features.join(', ') || 'nothing beyond login'}`);
  if (used.places.size) add('INFO', 'ad places in the code: ' + [...used.places].join(', '));
  if (used.keys.size) add('INFO', 'reward keys in the code: ' + [...used.keys].join(', '));
  const noDefault = [...used.keys].filter((k) => !(k in (defaults.rewards || {})));
  if (noDefault.length) add('WARN', 'reward keys with no default: ' + noDefault.join(', '), 'add them to defaults.rewards — without a dashboard entry they give nothing');
  const catalog = defaults.items || {};
  const itemsUsed = new Set();
  for (const v of Object.values(defaults.rewards || {})) for (const id of Object.keys(itemsOf(v))) itemsUsed.add(id);
  const uncatalogued = [...itemsUsed].filter((id) => !(id in catalog));
  if (Object.keys(catalog).length && uncatalogued.length) add('WARN', 'items given but not in defaults.items: ' + uncatalogued.join(', '), 'add them, so the game and the shop can show their name and icon');
  if (Object.keys(catalog).length) add('INFO', 'item categories the game handles: ' + [...new Set(Object.values(catalog).map((i) => i && i.category).filter(Boolean))].join(', '));

  if (dash) checkDashboard(dash, used, add);
  else add('INFO', `no ${root}.hs-dashboard.json — the defaults in the code are all that is checked`);

  // ─── cloud save ───
  const saves = /HSGame\.save\s*\(/.test(src);
  const syncs = fresh.requests.filter((r) => r.ep === '/api/sync');
  const pushed = syncs.length ? (safeJson(syncs[syncs.length - 1].data) || {}).profile_data : undefined;
  const gamePart = pushed && typeof pushed === 'object' ? Object.fromEntries(Object.entries(pushed).filter(([k]) => k !== '_hs')) : null;
  if (!saves) add('INFO', 'no cloud save (HSGame.save not used)');
  else if (t.indexOf('save') < 0) add('WARN', 'HSGame.save is in the code but was not called during startup', 'call save(progress) whenever progress changes (and once at startup)');
  else if (!gamePart || !Object.keys(gamePart).length) add('FAIL', 'save() was called but nothing reached the cloud');
  else add('PASS', 'progress uploads to the cloud: ' + JSON.stringify(gamePart).slice(0, 80));

  // ─── run 2: a new phone ───
  if (saves && gamePart && Object.keys(gamePart).length) {
    const back = await child({ dir: root, scenario: 'returning', cloud: pushed, iaa: dash && dash.iaa_config });
    const bt = back.trace || [];
    const re = (back.requests || []).filter((r) => r.ep === '/api/sync').map((r) => (safeJson(r.data) || {}).profile_data);
    const strip = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== '_hs')) : o);
    if (bt.indexOf('onLoad') < 0) add('FAIL', 'on a new phone the cloud save never reached onLoad', 'pass onLoad to HSGame.start({ ... })');
    else if (!re.length) add('WARN', 'after onLoad the game did not call save() again', 'merge the cloud copy, then save(merged)');
    else if (JSON.stringify(strip(re[re.length - 1])) === JSON.stringify(gamePart)) add('PASS', 'new phone: cloud progress restored and saved back unchanged');
    else add('WARN', 'new phone: progress after restore differs from the cloud copy', 'check the merge keeps the further progress: ' + JSON.stringify(strip(re[re.length - 1])).slice(0, 80));
  }

  finish(lines, asJson);
}

/** Ad places and reward keys: string literals in the source, plus what the run touched. */
function collectUsage(src, trace) {
  const places = new Set();
  const keys = new Set();
  const lit = (re) => [...src.matchAll(re)].map((m) => m[1]);
  for (const p of lit(/HSGame\.(?:showAd|canShowAd)\(\s*['"]([\w.-]+)['"]/g)) places.add(p);
  for (const k of lit(/HSGame\.(?:claim|rewards|available)\(\s*['"]([\w.-]+)['"]/g)) keys.add(k);
  for (const k of lit(/HSGame\.share\([^)]*,\s*['"]([\w.-]+)['"]\s*\)/g)) keys.add(k);
  for (const e of trace || []) {
    const m = /^(showAd|canShowAd|claim|rewards|available|share):(.+)$/.exec(e);
    if (!m || m[2].startsWith('__check')) continue;
    if (m[1] === 'showAd' || m[1] === 'canShowAd') places.add(m[2]); else keys.add(m[2]);
  }
  const features = [];
  if (/HSGame\.save\s*\(/.test(src)) features.push('cloud save');
  if (/HSGame\.(showAd|canShowAd)\s*\(/.test(src)) features.push('ads');
  if (/HSGame\.(buy|shop)\s*\(/.test(src)) features.push('shop');
  if (/HSGame\.share\s*\(/.test(src)) { features.push('share'); if (!/HSGame\.share\([^)]*,/.test(src)) keys.add('share'); }
  if (/HSGame\.tiktokMission\./.test(src)) { features.push('TikTok missions'); keys.add('tiktok_shortcut'); keys.add('tiktok_profile'); }
  if (/HSGame\.claim\s*\(/.test(src)) features.push('claims');
  return { places, keys, features };
}

/** Validate the AI-written dashboard JSON before anyone pastes it into the dashboard. */
function checkDashboard(dash, used, add) {
  const bad = [];
  const iaa = dash.iaa_config || {};
  const labels = new Set();
  for (const p of iaa.placements || []) {
    if (!p.label) bad.push('a placement without a label');
    else if (p.label !== p.label.toLowerCase()) add('WARN', `place "${p.label}" has capitals`, 'use lowercase labels — they must match the code exactly');
    labels.add(p.label);
    for (const a of p.ads || []) {
      if (!/^ad[a-zA-Z0-9]+$/.test(String(a.id || ''))) add('WARN', `place "${p.label}": ad id "${a.id}" is not a TikTok ad unit id yet`, 'replace it with the ad… id from the TikTok console');
    }
  }
  const rewards = iaa.rewards || {};
  for (const [k, v] of Object.entries(rewards)) {
    if (v === null) continue;
    if (typeof v !== 'object') { bad.push(`rewards["${k}"] must be { item: count }`); continue; }
    if (!Array.isArray(v) && v.$limit && !['once', 'daily', 'always'].includes(v.$limit)) bad.push(`rewards["${k}"].$limit must be once, daily or always`);
    if (!Object.keys(itemsOf(v)).length) bad.push(`rewards["${k}"] gives no item`);
  }
  const items = iaa.items || {};
  for (const [id, it] of Object.entries(items)) {
    if (it && typeof it === 'object' && !it.category) bad.push(`items["${id}"] has no category`);
  }
  const ids = new Set();
  for (const pr of dash.products || []) {
    const id = pr.id ?? pr.product_id;
    if (!Number.isInteger(Number(id))) bad.push(`product "${pr.name}": id must be a number`);
    else if (ids.has(Number(id))) bad.push(`product id ${id} is used twice`);
    ids.add(Number(id));
    if (!(Number(pr.beans_cost) > 0)) bad.push(`product "${pr.name}": beans_cost must be above 0`);
    if (!Object.keys(itemsOf(pr.rewards)).length) bad.push(`product "${pr.name}" gives no item`);
  }

  if (bad.length) add('FAIL', 'dashboard JSON: ' + bad.slice(0, 4).join(' · '), 'fix it before pasting into the dashboard');
  else add('PASS', `dashboard JSON is well-formed (${labels.size} places, ${Object.keys(rewards).length} reward keys, ${Object.keys(items).length} items, ${ids.size} products)`);

  const missing = [...used.places].filter((p) => !labels.has(p));
  if (missing.length) add('INFO', 'ad places in the code with no ad in the dashboard JSON (they show nothing): ' + missing.join(', '));
  const unusedPlaces = [...labels].filter((l) => !used.places.has(l));
  if (unusedPlaces.length && used.places.size) add('WARN', 'dashboard places the code never calls: ' + unusedPlaces.join(', '), 'check the spelling — a label must match showAd("…") exactly');
}

function itemsOf(v) {
  const out = {};
  if (Array.isArray(v)) { for (const x of v) if (x && x.type) out[x.type] = 1; return out; }
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (!k.startsWith('$') && (n === true || Number(n) > 0)) out[k] = n;
  return out;
}

function child(cfg) {
  return new Promise((done) => {
    const p = fork(SELF, [], { env: { ...process.env, HS_CHECK_CHILD: JSON.stringify(cfg) }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let got = null;
    const timer = setTimeout(() => { p.kill(); done(got || { crash: 'timed out after 30 s' }); }, 30000);
    p.on('message', (m) => { got = m; });
    p.on('exit', () => { clearTimeout(timer); done(got || { crash: 'the run exited without a result' }); });
  });
}

function finish(lines, asJson) {
  const fails = lines.filter((l) => l.level === 'FAIL').length;
  const warns = lines.filter((l) => l.level === 'WARN').length;
  if (asJson) {
    console.log(JSON.stringify({ ok: fails === 0, fails, warns, lines }, null, 2));
  } else {
    const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ', INFO: 'ℹ️ ' };
    console.log('\nHS SDK integration check\n');
    for (const l of lines) {
      console.log(`${icon[l.level]} ${l.level.padEnd(4)}  ${l.msg}`);
      if (l.fix && l.level !== 'PASS') console.log(`          → ${l.fix}`);
    }
    console.log(`\n${fails ? '❌' : '✅'} ${fails} fail, ${warns} warn\n`);
  }
  process.exit(fails ? 1 : 0);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function readJson(f) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }
function safeJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } }
function cmp(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function versionOf(s) { const m = /v(\d+)\.(\d+)\.(\d+)/.exec(s || ''); return m ? m.slice(1).map(Number) : null; }
function valueAfter(args, flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] || '' : ''; }
