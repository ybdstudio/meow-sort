/* ===================== CAT ARTWORK (runtime) =====================
   Costume cats: red=strawberry, blue=shark, green=dino, yellow=bee, pink=unicorn.
   All 8 expressions are pre-baked into res/cats.png by tools/bake_atlas.js
   (the prototype painted them at start-up with DOM canvases).
   SPRITES[color][mood] = { img, sx, sy, w, h }. */
var MOODS = CAT_ATLAS.moods;
var SPRITES = {};
var CAT_FACES = CAT_ATLAS.faces;      // eye/nose metadata (used for the pod icon crop)
var GLOW = {};                        // GLOW[color] = { img, sx, sy, w, h } baked yellow halo (res/glow.png)

function loadSprites(done) {
  Platform.loadImage(CAT_ATLAS.image, function (err, img) {
    if (err) { done(err); return; }
    Platform.loadImage(UI_ATLAS.image, function (e3, uimg) { if (e3) Platform.warn('ui atlas missing', e3); else UI_IMG = uimg; });
    if (CAT_ATLAS.glowImage) Platform.loadImage(CAT_ATLAS.glowImage, function (e2, gimg) {
      if (e2) { Platform.warn('glow atlas missing', e2); return; }      // optional: selection just shows no halo
      Object.keys(CAT_ATLAS.glow).forEach(function (c) {
        var f = CAT_ATLAS.glow[c]; GLOW[c] = { img: gimg, sx: f[0], sy: f[1], w: f[2], h: f[3] };
      });
    });
    Object.keys(CAT_ATLAS.frames).forEach(function (color) {
      SPRITES[color] = {};
      MOODS.forEach(function (mood) {
        var f = CAT_ATLAS.frames[color][mood];
        SPRITES[color][mood] = { img: img, sx: f[0], sy: f[1], sw: f[2], sh: f[3], w: f[4] || f[2], h: f[5] || f[3] };
      });
    });
    done(null);
  });
}
// Baked halo around a sprite drawn at (-w/2, -h+4) in sprite space (same transform as blitSprite).
function blitGlow(color, spr) {
  var g = GLOW[color]; if (!g) return false;
  var pad = CAT_ATLAS.glowPad;
  ctx.drawImage(g.img, g.sx, g.sy, g.w, g.h, -spr.w / 2 - pad, -spr.h + 4 - pad, spr.w + pad * 2, spr.h + pad * 2);
  return true;
}
function blitSprite(spr, dx, dy) { ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw || spr.w, spr.sh || spr.h, dx, dy, spr.w, spr.h); }
