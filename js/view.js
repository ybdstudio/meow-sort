/* ===================== CANVAS / VIEW =====================
   Logical space stays 540x960 (portrait) as in the prototype; it is scaled to
   fit inside the device safe area reported by the adapter. */
var canvas = Platform.getMainCanvas();
var ctx = Platform.patchContext(canvas.getContext('2d'));
var view = { scale: 1, offX: 0, offY: 0, dpr: 1, W: 0, H: 0 };
function resize() {
  var info = Platform.refreshInfo();
  var dpr = info.dpr, W = info.W, H = info.H, s = info.safe;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  var aw = W - s.l - s.r, ah = H - s.t - s.b;
  var sc = Math.min(aw / LW, ah / LH);
  view.dpr = dpr; view.W = W; view.H = H; view.scale = sc;
  view.offX = s.l + (aw - LW * sc) / 2; view.offY = s.t + (ah - LH * sc) / 2;
}
function toLogical(cx, cy) { return { x: (cx - view.offX) / view.scale, y: (cy - view.offY) / view.scale }; }
function setLogical() { var k = view.dpr * view.scale; ctx.setTransform(k, 0, 0, k, view.dpr * view.offX, view.dpr * view.offY); }
