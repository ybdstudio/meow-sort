/* ===================== ADAPTER: TikTok Minis native runtime shim =====================
   Everything that touched the DOM / browser in the H5 prototype goes through
   `Platform`. The rest of the game never calls TTMinis/tt/window directly.

   Resolves the SDK namespace defensively: TTMinis.game → TTMinis → tt.
   (TikTok's docs show both TTMinis.game.x and TTMinis.x for some APIs.) */
var Platform = (function () {
  var G = typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof globalThis !== 'undefined' ? globalThis : this);
  var NS = [];
  if (typeof TTMinis !== 'undefined' && TTMinis) { if (TTMinis.game) NS.push(TTMinis.game); NS.push(TTMinis); }
  if (typeof tt !== 'undefined' && tt) NS.push(tt);

  function fn(name) {
    for (var i = 0; i < NS.length; i++) if (NS[i] && typeof NS[i][name] === 'function') return NS[i][name].bind(NS[i]);
    return null;
  }
  function call(name, opts) {
    var f = fn(name);
    if (!f) { if (opts && opts.fail) safe(opts.fail, { error_code: -1, error_msg: name + ' unavailable' }); if (opts && opts.complete) safe(opts.complete); return false; }
    try { f(opts || {}); return true; } catch (e) { log('call ' + name + ' failed', e); if (opts && opts.fail) safe(opts.fail, { error_code: -2, error_msg: String(e) }); return false; }
  }
  function canIUse(name) {
    var ci = fn('canIUse');
    if (ci) { try { if (!ci(name)) return false; } catch (e) {} }
    return !!fn(name);
  }
  function safe(f, a) { try { return f(a); } catch (e) { log('callback error', e); } }
  function log() { try { console.log.apply(console, ['[MeowSort]'].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, ['[MeowSort]'].concat([].slice.call(arguments))); } catch (e) {} }

  /* ---------- system / safe area ---------- */
  function sysInfo() {
    var s = null, w = null;
    try { var f = fn('getWindowInfo'); if (f) w = f(); } catch (e) {}
    try { var g = fn('getSystemInfoSync'); if (g) s = g(); } catch (e) {}
    s = s || {}; w = w || {};
    var W = w.windowWidth || s.windowWidth || w.screenWidth || s.screenWidth || (G.innerWidth) || 375;
    var H = w.windowHeight || s.windowHeight || w.screenHeight || s.screenHeight || (G.innerHeight) || 667;
    var dpr = w.pixelRatio || s.pixelRatio || s.devicePixelRatio || G.devicePixelRatio || 2;
    // Normalise safeArea: some devices omit it, some report it in screen (not window) space,
    // some only give statusBarHeight. Insets are clamped to sane ranges.
    var sa = w.safeArea || s.safeArea, top = 0, bottom = 0, left = 0, right = 0;
    if (sa && typeof sa.top === 'number') {
      top = sa.top;
      var saBottom = typeof sa.bottom === 'number' ? sa.bottom : (sa.height ? sa.top + sa.height : H);
      bottom = Math.max(0, H - saBottom);
      left = sa.left || 0; right = typeof sa.right === 'number' && sa.right > 0 ? Math.max(0, W - sa.right) : 0;
    } else {
      top = w.statusBarHeight || s.statusBarHeight || 0;
    }
    // TikTok overlays its capsule menu (… / ✕) at the top-right; keep the HUD below it.
    try {
      var mb = fn('getMenuButtonBoundingClientRect'); var r = mb && mb();
      if (r && r.bottom > 0 && r.bottom < H * 0.25) top = Math.max(top, r.bottom + 4);
    } catch (e) {}
    top = clampN(top, 0, H * 0.2); bottom = clampN(bottom, 0, H * 0.15);
    left = clampN(left, 0, W * 0.1); right = clampN(right, 0, W * 0.1);
    return { W: W, H: H, dpr: Math.min(dpr, 3), safe: { t: top, b: bottom, l: left, r: right },
             platform: s.platform || '', sdk: s.SDKVersion || '', system: s.system || '' };
  }
  function clampN(v, a, b) { v = +v || 0; return v < a ? a : v > b ? b : v; }

  /* ---------- canvas ---------- */
  var mainCanvas = null;
  function createCanvas() {
    var f = fn('createCanvas');
    if (f) return f();
    if (G.document) { var c = G.document.createElement('canvas'); return c; }
    throw new Error('No canvas available');
  }
  function getMainCanvas() { if (!mainCanvas) mainCanvas = createCanvas(); return mainCanvas; }   // first call = on-screen canvas
  function createOffscreen(w, h) { var c = createCanvas(); c.width = w; c.height = h; return c; }
  function patchContext(ctx) {
    // ellipse() is missing on a few canvas back-ends; emulate with arc + scale.
    if (ctx && typeof ctx.ellipse !== 'function') {
      ctx.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
        this.save(); this.translate(x, y); this.rotate(rot || 0); this.scale(rx || 0.0001, ry || 0.0001);
        this.arc(0, 0, 1, a0, a1, ccw); this.restore();
      };
    }
    return ctx;
  }

  /* ---------- images ---------- */
  function loadImage(src, done) {
    var f = fn('createImage'), img = f ? f() : (G.Image ? new G.Image() : null), fired = false;
    if (!img) { done(new Error('createImage unavailable')); return; }
    function ok() { if (!fired) { fired = true; done(null, img); } }
    function bad(e) { if (!fired) { fired = true; done(new Error('Image failed: ' + src)); } }
    if (img.addEventListener) { img.addEventListener('load', ok); img.addEventListener('error', bad); }
    img.onload = ok; img.onerror = bad;
    img.src = src;
  }

  /* ---------- storage ---------- */
  var storage = {
    get: function (key) {
      try {
        var f = fn('getStorageSync');
        if (f) { var v = f(key); if (v === '' || v === undefined || v === null) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
        if (G.localStorage) { var s = G.localStorage.getItem(key); return s ? JSON.parse(s) : null; }
      } catch (e) { warn('storage.get', e); }
      return null;
    },
    set: function (key, obj) {
      try {
        var str = JSON.stringify(obj), f = fn('setStorageSync');
        if (f) { f(key, str); return true; }
        if (G.localStorage) { G.localStorage.setItem(key, str); return true; }
      } catch (e) { warn('storage.set', e); }
      return false;
    }
  };

  /* ---------- audio ----------
     createWebAudioContext() keeps the prototype's synthesized SFX working.
     Quirk: on some TikTok iOS builds AudioParam ramps throw or freeze the context
     unless a value is set first, so every param gets setValueAtTime before ramps
     and ramps fall back to setValueAtTime when missing. ?ttquirks=1 in the
     emulator simulates the broken ramps. */
  function createAudioContext() {
    var ac = null;
    try {
      var f = fn('createWebAudioContext');
      if (f) ac = f();
      else { var AC = G.AudioContext || G.webkitAudioContext; if (AC) ac = new AC(); }
    } catch (e) { warn('audio ctx', e); ac = null; }
    return ac;
  }
  function ramp(param, kind, value, time) {
    try {
      if (kind === 'exp' && typeof param.exponentialRampToValueAtTime === 'function') { param.exponentialRampToValueAtTime(Math.max(0.0001, value), time); return; }
      if (kind === 'lin' && typeof param.linearRampToValueAtTime === 'function') { param.linearRampToValueAtTime(value, time); return; }
    } catch (e) {}
    try { param.setValueAtTime(value, time); } catch (e2) { try { param.value = value; } catch (e3) {} }
  }
  function setParam(param, value, time) {
    try { if (typeof param.setValueAtTime === 'function') { param.setValueAtTime(value, time); return; } } catch (e) {}
    try { param.value = value; } catch (e2) {}
  }

  /* ---------- frame + time ---------- */
  var raf = typeof G.requestAnimationFrame === 'function' ? G.requestAnimationFrame.bind(G)
          : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame
          : function (cb) { return setTimeout(function () { cb(now()); }, 16); });
  function now() {
    try { if (typeof performance !== 'undefined' && performance.now) return performance.now(); } catch (e) {}
    return Date.now();
  }

  /* ---------- touch ---------- */
  function touchXY(t) {
    if (!t) return null;
    var x = t.clientX !== undefined ? t.clientX : (t.x !== undefined ? t.x : t.pageX);
    var y = t.clientY !== undefined ? t.clientY : (t.y !== undefined ? t.y : t.pageY);
    return { id: t.identifier !== undefined ? t.identifier : 0, x: x, y: y };
  }
  function onTouch(kind, cb) {
    var name = { start: 'onTouchStart', move: 'onTouchMove', end: 'onTouchEnd', cancel: 'onTouchCancel' }[kind];
    var f = fn(name);
    if (!f) return false;
    f(function (res) {
      var list = (res && (res.changedTouches && res.changedTouches.length ? res.changedTouches : res.touches)) || [];
      for (var i = 0; i < list.length; i++) { var p = touchXY(list[i]); if (p) safe(cb, p); }
    });
    return true;
  }

  /* ---------- lifecycle / misc ---------- */
  function onShow(cb) { var f = fn('onShow'); if (f) f(cb); }
  function onHide(cb) { var f = fn('onHide'); if (f) f(cb); }
  function vibrate(long) { var f = fn(long ? 'vibrateLong' : 'vibrateShort'); if (f) try { f({}); } catch (e) {} }
  function launchQuery() {
    var q = {};
    try { var f = fn('getLaunchOptionsSync'); var o = f && f(); if (o && o.query) for (var k in o.query) q[k] = o.query[k]; } catch (e) {}
    try {
      if (G.location && G.location.search) G.location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
        var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    } catch (e) {}
    return q;
  }
  function loadSubpackage(name, onProgress, done) {
    var f = fn('loadSubpackage');
    if (!f) { done(null); return; }                         // emulator: files already on disk
    try {
      var task = f({ name: name, success: function () { done(null); }, fail: function (e) { done(new Error('subpackage ' + name + ' failed: ' + JSON.stringify(e))); } });
      if (task && task.onProgressUpdate) task.onProgressUpdate(function (r) { safe(onProgress, (r && r.progress || 0) / 100); });
    } catch (e) { done(e); }
  }
  function setFps(n) { var f = fn('setPreferredFramesPerSecond'); if (f) try { f(n); } catch (e) {} }

  var info = sysInfo();
  var query = launchQuery();
  return {
    global: G, hasSDK: NS.length > 0, fn: fn, call: call, canIUse: canIUse, log: log, warn: warn,
    info: info, refreshInfo: function () { this.info = info = sysInfo(); return info; },
    getMainCanvas: getMainCanvas, createOffscreen: createOffscreen, patchContext: patchContext,
    loadImage: loadImage, storage: storage,
    createAudioContext: createAudioContext, ramp: ramp, setParam: setParam,
    raf: raf, now: now, onTouch: onTouch, onShow: onShow, onHide: onHide, vibrate: vibrate,
    query: query, debug: query.dev === '1' || query.debug === '1',
    loadSubpackage: loadSubpackage, setFps: setFps,
    // Rendering capability flags (shadowBlur is costly / patchy on some native back-ends)
    caps: { shadowBlur: query.shadow === '1' }
  };
})();
