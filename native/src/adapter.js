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
  // Hosts can return odd things (proxies, functions, strings): only trust plain objects / finite numbers.
  function obj(x) { return x && typeof x === 'object' ? x : null; }
  function num() { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (typeof v === 'number' && isFinite(v) && v > 0) return v; } return 0; }
  function sysInfo() {
    var s = null, w = null;
    try { var f = fn('getWindowInfo'); if (f) w = obj(f()); } catch (e) {}
    try { var g = fn('getSystemInfoSync'); if (g) s = obj(g()); } catch (e) {}
    s = s || {}; w = w || {};
    var W = num(w.windowWidth, s.windowWidth, w.screenWidth, s.screenWidth, G.innerWidth) || 375;
    var H = num(w.windowHeight, s.windowHeight, w.screenHeight, s.screenHeight, G.innerHeight) || 667;
    var dpr = num(w.pixelRatio, s.pixelRatio, s.devicePixelRatio, G.devicePixelRatio) || 2;
    // Normalise safeArea: some devices omit it, some report it in screen (not window) space,
    // some only give statusBarHeight. Insets are clamped to sane ranges.
    var sa = obj(w.safeArea) || obj(s.safeArea), top = 0, bottom = 0, left = 0, right = 0;
    if (sa && typeof sa.top === 'number') {
      top = sa.top;
      var saBottom = typeof sa.bottom === 'number' ? sa.bottom : (typeof sa.height === 'number' ? sa.top + sa.height : H);
      bottom = Math.max(0, H - saBottom);
      left = num(sa.left); right = typeof sa.right === 'number' && sa.right > 0 ? Math.max(0, W - sa.right) : 0;
    } else {
      top = num(w.statusBarHeight, s.statusBarHeight);
    }
    // TikTok overlays its capsule menu (… / ✕) at the top-right; keep the HUD below it.
    try {
      var mb = fn('getMenuButtonBoundingClientRect'); var r = mb && obj(mb());
      if (r && typeof r.bottom === 'number' && r.bottom > 0 && r.bottom < H * 0.25) top = Math.max(top, r.bottom + 4);
    } catch (e) {}
    top = clampN(top, 0, H * 0.2); bottom = clampN(bottom, 0, H * 0.15);
    left = clampN(left, 0, W * 0.1); right = clampN(right, 0, W * 0.1);
    return { W: W, H: H, dpr: Math.min(dpr, 3), safe: { t: top, b: bottom, l: left, r: right },
             platform: typeof s.platform === 'string' ? s.platform : '', sdk: typeof s.SDKVersion === 'string' ? s.SDKVersion : '', system: typeof s.system === 'string' ? s.system : '' };
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
  /* ---------- SafeContext: wrapper around the native 2D context ----------
     TikTok's native canvas (Krypton) bug: a gradient fill paints with the alpha of the
     last SOLID colour that was drawn — state is synced lazily on draw, so re-assigning
     fillStyle without drawing does not help (that was the v0.1.1 attempt).
     The wrapper guarantees the native context NEVER receives a translucent colour:
       - 'rgba(r,g,b,a)' / '#rrggbbaa' → opaque 'rgb(r,g,b)' + alpha folded into globalAlpha
       - fillStyle / strokeStyle / globalAlpha are re-applied right before EVERY draw call
       - optional FLAT mode (Settings → Graphics) draws gradients as their average colour
     The game keeps using `ctx` exactly like a normal CanvasRenderingContext2D. */
  var COLOR_CACHE = {}, COLOR_N = 0;
  function parseColor(s) {
    var c = COLOR_CACHE[s]; if (c) return c;
    if (++COLOR_N > 4000) { COLOR_CACHE = {}; COLOR_N = 0; }        // dynamic rgba() strings: keep memory bounded
    var r = 0, g = 0, b = 0, a = 1, m, str = String(s).trim();
    if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(str))) {
      r = +m[1]; g = +m[2]; b = +m[3]; a = m[4] === undefined ? 1 : +m[4];
    } else if ((m = /^#([0-9a-f]{3,8})$/i.exec(str))) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (x) { return x + x; }).join('');
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
      a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    } else if (str === 'transparent') { a = 0; }
    else { c = COLOR_CACHE[s] = { css: str, rgb: [0, 0, 0], a: 1, named: true }; return c; }
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    c = COLOR_CACHE[s] = { css: 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')', rgb: [r, g, b], a: a };
    return c;
  }
  function SafeGradient(real) { this.real = real; this.stops = []; this._flat = null; }
  SafeGradient.prototype.addColorStop = function (o, col) {
    this.stops.push(parseColor(col)); this._flat = null;
    try { this.real.addColorStop(o, col); } catch (e) {}
  };
  SafeGradient.prototype.flat = function () {
    if (this._flat) return this._flat;
    var n = this.stops.length || 1, r = 0, g = 0, b = 0, a = 0;
    this.stops.forEach(function (c) { r += c.rgb[0]; g += c.rgb[1]; b += c.rgb[2]; a += c.a; });
    return (this._flat = parseColor('rgba(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ',' + (this.stops.length ? a / n : 1) + ')'));
  };

  function SafeContext(native) {
    this.n = native; this.canvas = native.canvas;
    this._ga = 1; this._fill = parseColor('#000000'); this._stroke = parseColor('#000000');
    this._fillRaw = '#000000'; this._strokeRaw = '#000000'; this._stack = [];
  }
  var SC = SafeContext.prototype;
  SafeContext.flat = false;
  SafeContext.mode = 'safe';
  function styleOf(v) {
    if (v && typeof v === 'object') return v instanceof SafeGradient ? v : { real: v, flat: function () { return parseColor('#808080'); }, pattern: true };
    return parseColor(v);
  }
  Object.defineProperty(SC, 'fillStyle', { get: function () { return this._fillRaw; }, set: function (v) { this._fillRaw = v; this._fill = styleOf(v); } });
  Object.defineProperty(SC, 'strokeStyle', { get: function () { return this._strokeRaw; }, set: function (v) { this._strokeRaw = v; this._stroke = styleOf(v); } });
  Object.defineProperty(SC, 'globalAlpha', { get: function () { return this._ga; }, set: function (v) { v = +v; if (v >= 0 && v <= 1) this._ga = v; } });
  ['lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'font', 'textAlign', 'textBaseline', 'shadowColor', 'shadowBlur',
   'shadowOffsetX', 'shadowOffsetY', 'globalCompositeOperation', 'imageSmoothingEnabled'].forEach(function (k) {
    Object.defineProperty(SC, k, { get: function () { return this.n[k]; }, set: function (v) { this.n[k] = v; } });
  });
  // Push the effective style + alpha to native right before drawing.
  SC._apply = function (st) {
    var n = this.n, alpha = this._ga, css;
    if (st.css !== undefined) { css = st.css; alpha *= st.a; }                       // solid (always opaque css)
    else if (SafeContext.flat) { var f = st.flat(); css = f.css; alpha *= f.a; }      // flat mode
    else { n.fillStyle = '#000000'; n.strokeStyle = '#000000'; css = st.real; }      // real gradient/pattern
    return { css: css, alpha: alpha };
  };
  SC._fillPrep = function () { var r = this._apply(this._fill); this.n.globalAlpha = r.alpha; this.n.fillStyle = r.css; return r.alpha > 0; };
  SC._strokePrep = function () { var r = this._apply(this._stroke); this.n.globalAlpha = r.alpha; this.n.strokeStyle = r.css; return r.alpha > 0; };
  SC.fill = function (a, b) { if (this._fillPrep()) { if (a === undefined) this.n.fill(); else this.n.fill(a, b); } };
  SC.fillRect = function (x, y, w, h) { if (this._fillPrep()) this.n.fillRect(x, y, w, h); };
  SC.fillText = function (t, x, y, mw) { if (this._fillPrep()) { if (mw === undefined) this.n.fillText(t, x, y); else this.n.fillText(t, x, y, mw); } };
  SC.stroke = function (p) { if (this._strokePrep()) { if (p === undefined) this.n.stroke(); else this.n.stroke(p); } };
  SC.strokeRect = function (x, y, w, h) { if (this._strokePrep()) this.n.strokeRect(x, y, w, h); };
  SC.strokeText = function (t, x, y, mw) { if (this._strokePrep()) { if (mw === undefined) this.n.strokeText(t, x, y); else this.n.strokeText(t, x, y, mw); } };
  SC.drawImage = function () { if (this._ga <= 0) return; this.n.globalAlpha = this._ga; this.n.drawImage.apply(this.n, arguments); };
  SC.clearRect = function (x, y, w, h) { this.n.clearRect(x, y, w, h); };
  SC.save = function () { this._stack.push([this._ga, this._fill, this._fillRaw, this._stroke, this._strokeRaw]); this.n.save(); };
  SC.restore = function () {
    var s = this._stack.pop();
    if (s) { this._ga = s[0]; this._fill = s[1]; this._fillRaw = s[2]; this._stroke = s[3]; this._strokeRaw = s[4]; }
    this.n.restore();
  };
  SC.createLinearGradient = function (a, b, c, d) { return new SafeGradient(this.n.createLinearGradient(a, b, c, d)); };
  SC.createRadialGradient = function (a, b, c, d, e, f) { return new SafeGradient(this.n.createRadialGradient(a, b, c, d, e, f)); };
  ['beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'rect', 'clip',
   'translate', 'rotate', 'scale', 'setTransform', 'transform', 'resetTransform', 'measureText', 'getImageData',
   'putImageData', 'createPattern', 'isPointInPath', 'setLineDash'].forEach(function (k) {
    SC[k] = function () { var f = this.n[k]; return f ? f.apply(this.n, arguments) : undefined; };
  });
  SC.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    var n = this.n;
    if (typeof n.ellipse === 'function') return n.ellipse(x, y, rx, ry, rot, a0, a1, !!ccw);
    // polyfill: a scaled arc whose transform is undone before the path is drawn
    n.save(); n.translate(x, y); n.rotate(rot || 0); n.scale(rx || 0.0001, ry || 0.0001);
    n.arc(0, 0, 1, a0, a1, ccw); n.restore();
  };

  function patchContext(ctx) {
    if (!ctx) return ctx;
    if (launchQuery().gradfix === '0') { SafeContext.mode = 'raw'; log('render: raw native context (gradfix=0)'); return ctx; }
    log('render: SafeContext (opaque colours + per-draw alpha)');
    return new SafeContext(ctx);
  }
  function setFlatGraphics(on) { SafeContext.flat = !!on; SafeContext.mode = SafeContext.mode === 'raw' ? 'raw' : (on ? 'flat' : 'safe'); }

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
    setFlatGraphics: setFlatGraphics, renderMode: function () { return SafeContext.mode; },
    loadImage: loadImage, storage: storage,
    createAudioContext: createAudioContext, ramp: ramp, setParam: setParam,
    raf: raf, now: now, onTouch: onTouch, onShow: onShow, onHide: onHide, vibrate: vibrate,
    query: query, debug: query.dev === '1' || query.debug === '1',
    loadSubpackage: loadSubpackage, setFps: setFps,
    // Rendering capability flags (shadowBlur is costly / patchy on some native back-ends)
    caps: { shadowBlur: query.shadow === '1' }
  };
})();
