/* ===================== CAT ARTWORK (runtime) =====================
   Costume cats: red=strawberry, blue=shark, green=dino, yellow=bee, pink=unicorn.
   All 8 expressions are pre-baked into res/cats.png by tools/bake_atlas.js
   (the prototype painted them at start-up with DOM canvases).
   SPRITES[color][mood] = { img, sx, sy, w, h }. */
var MOODS = CAT_ATLAS.moods;
var SPRITES = {};
var CAT_FACES = CAT_ATLAS.faces;      // eye/nose metadata (used for the pod icon crop)

function loadSprites(done) {
  Platform.loadImage(CAT_ATLAS.image, function (err, img) {
    if (err) { done(err); return; }
    Object.keys(CAT_ATLAS.frames).forEach(function (color) {
      SPRITES[color] = {};
      MOODS.forEach(function (mood) {
        var f = CAT_ATLAS.frames[color][mood];
        SPRITES[color][mood] = { img: img, sx: f[0], sy: f[1], w: f[2], h: f[3] };
      });
    });
    done(null);
  });
}
function blitSprite(spr, dx, dy) { ctx.drawImage(spr.img, spr.sx, spr.sy, spr.w, spr.h, dx, dy, spr.w, spr.h); }
