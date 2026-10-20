/* Mood painter: draws the expression variants (blink, happy, sleep, squint,
   determined, sad, cheer) over each base cat sprite. Used ONLY by
   tools/bake_atlas.js at build time; the shipped game loads the baked atlas.
   Ported verbatim from the H5 prototype. Needs CORE.rng (js/core.js). */
var INK = '#3a2316';

function rgbStr(a, alpha) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + (alpha === undefined ? 1 : alpha) + ')'; }
function mixC(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }

function coverEye(g, e, m) {
  var cx = e[0], cy = e[1], rx = e[2] * 1.24, ry = e[3] * 1.34;
  var gr = g.createLinearGradient(0, cy - ry - 8, 0, cy + ry + 8);
  gr.addColorStop(0, rgbStr(m.skinTop)); gr.addColorStop(0.5, rgbStr(mixC(m.skinTop, m.skin, 0.55))); gr.addColorStop(1, rgbStr(m.skin));
  var al = [1, 0.55, 0.3, 0.14];
  for (var k = 3; k >= 0; k--) {
    g.globalAlpha = al[k]; g.fillStyle = gr;
    g.beginPath(); g.ellipse(cx, cy, rx + k * 3, ry + k * 3, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // a few fur strokes so the patch doesn't look flat
  var r = CORE.rng(Math.round(cx * 13 + cy));
  g.lineCap = 'round';
  for (var i = 0; i < 26; i++) {
    var a = r() * Math.PI * 2, d = Math.sqrt(r()), px = cx + Math.cos(a) * rx * d, py = cy + Math.sin(a) * ry * d;
    g.strokeStyle = py < cy ? rgbStr(mixC(m.skinTop, [255, 255, 255], 0.35), 0.35) : rgbStr([255, 255, 255], 0.3);
    g.lineWidth = 1.4; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (r() - 0.5) * 3, py + 3 + r() * 3); g.stroke();
  }
}
function coverMouth(g, m) {
  var x = m.nose[0], y = m.nose[1] + 15, al = [1, 0.55, 0.3];
  for (var k = 2; k >= 0; k--) {
    g.globalAlpha = al[k]; g.fillStyle = rgbStr(m.skin);
    g.beginPath(); g.ellipse(x, y, 15 + k * 3, 8 + k * 2.5, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}
function blush(g, m, a) {
  m.eyes.forEach(function (e) {
    g.fillStyle = 'rgba(255,110,140,' + a + ')';
    g.beginPath(); g.ellipse(e[0] + (e[0] < m.nose[0] ? -6 : 6), e[1] + e[3] * 1.55, e[2] * 0.55, e[3] * 0.3, 0, 0, Math.PI * 2); g.fill();
  });
}
function happyMouth(g, m) {
  var nx = m.nose[0], my = m.nose[1] + 15;
  coverMouth(g, m);
  g.beginPath(); g.moveTo(nx - 11, my - 5); g.quadraticCurveTo(nx, my + 17, nx + 11, my - 5); g.quadraticCurveTo(nx, my - 1, nx - 11, my - 5);
  g.fillStyle = '#7a2430'; g.fill();
  g.save(); g.clip(); g.fillStyle = '#ff8ea4'; g.beginPath(); g.ellipse(nx, my + 8, 6.5, 4.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
  g.lineWidth = 2.4; g.strokeStyle = '#4a1a1a'; g.beginPath(); g.moveTo(nx - 11, my - 5); g.quadraticCurveTo(nx, my + 17, nx + 11, my - 5); g.stroke();
}
// Curled eyelashes growing from the outer third of a closed-eye curve
// (quadratic A-C-B), fanning out on the curve's convex side toward the outer corner.
function lashes(g, A, C, B, s, rx) {
  var midx = (A[0] + B[0]) / 2, midy = (A[1] + B[1]) / 2;
  var outerT = s > 0 ? 1 : 0, ts = s > 0 ? [0.98, 0.83, 0.68] : [0.02, 0.17, 0.32];
  g.save(); g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
  ts.forEach(function (t, i) {
    var u = 1 - t;
    var px = u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], py = u * u * A[1] + 2 * u * t * C[1] + t * t * B[1];
    var dx = 2 * u * (C[0] - A[0]) + 2 * t * (B[0] - C[0]), dy = 2 * u * (C[1] - A[1]) + 2 * t * (B[1] - C[1]);
    var dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    if (outerT === 0) { dx = -dx; dy = -dy; }            // tangent pointing to the outer corner
    var nx = -dy, ny = dx;
    if (nx * (C[0] - midx) + ny * (C[1] - midy) < 0) { nx = -nx; ny = -ny; }   // convex side
    var w = [0.35, 0.7, 0.95][i];                         // outermost lash flicks most along the curve
    var lx = nx * (1 - w * 0.55) + dx * w, ly = ny * (1 - w * 0.55) + dy * w, ll = Math.hypot(lx, ly);
    lx /= ll; ly /= ll;
    var L = rx * [0.46, 0.4, 0.32][i];
    var ex = px + lx * L, ey = py + ly * L;
    g.lineWidth = rx * 0.13;
    g.beginPath(); g.moveTo(px, py);
    g.quadraticCurveTo(px + lx * L * 0.55 + dx * L * 0.25, py + ly * L * 0.55 + dy * L * 0.25, ex, ey);
    g.stroke();
  });
  g.restore();
}
function paintMood(g, m, mood) {
  if (mood === 'open') return;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK;
  var nx = m.nose[0], my = m.nose[1] + 15;
  if (mood === 'cheer') {            // eyes stay OPEN; just a cheerful open-mouth smile + blush
    blush(g, m, 0.4); happyMouth(g, m); return;
  }
  if (mood === 'blink' || mood === 'sleep' || mood === 'happy' || mood === 'squint') {
    m.eyes.forEach(function (e) {
      coverEye(g, e, m);
      var cx = e[0], cy = e[1], rx = e[2], ry = e[3], s = cx < nx ? -1 : 1;
      g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';   // coverEye changes the stroke style
      g.lineWidth = rx * 0.2; g.beginPath();
      if (mood === 'happy') {
        var hA = [cx - rx * 0.85, cy + ry * 0.45], hC = [cx, cy - ry * 0.95], hB = [cx + rx * 0.85, cy + ry * 0.45];
        g.moveTo(hA[0], hA[1]); g.quadraticCurveTo(hC[0], hC[1], hB[0], hB[1]);
        g.stroke();
        lashes(g, hA, hC, hB, s, rx);
      } else if (mood === 'squint') {
        g.moveTo(cx + s * rx * 0.75, cy - ry * 0.75); g.lineTo(cx - s * rx * 0.55, cy); g.lineTo(cx + s * rx * 0.75, cy + ry * 0.75);
        g.stroke();
      } else {
        // closed eye: soft downward arc + curled eyelashes at the outer corner
        var dip = mood === 'sleep' ? 0.62 : 0.5;
        var cA = [cx - rx * 0.92, cy + ry * 0.02], cC = [cx, cy + ry * (dip + 0.6)], cB = [cx + rx * 0.92, cy + ry * 0.02];
        g.moveTo(cA[0], cA[1]); g.quadraticCurveTo(cC[0], cC[1], cB[0], cB[1]);
        g.stroke();
        lashes(g, cA, cC, cB, s, rx);
      }
    });
    if (mood === 'happy' || mood === 'sleep') blush(g, m, mood === 'happy' ? 0.45 : 0.32);
    if (mood === 'happy') happyMouth(g, m);
    if (mood === 'squint') {
      coverMouth(g, m); g.lineWidth = 3; g.strokeStyle = INK; g.beginPath();
      g.moveTo(nx - 9, my); g.quadraticCurveTo(nx - 4.5, my - 4, nx, my); g.quadraticCurveTo(nx + 4.5, my + 4, nx + 9, my); g.stroke();
    }
    return;
  }
  if (mood === 'determined') {
    m.eyes.forEach(function (e) {
      var cx = e[0], cy = e[1], rx = e[2], ry = e[3], s = cx < nx ? -1 : 1;
      var oX = cx + s * rx * 1.15, iX = cx - s * rx * 1.15, oY = cy - ry * 0.85, iY = cy - ry * 0.05;
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx * 1.2, ry * 1.3, 0, 0, Math.PI * 2); g.clip();
      g.fillStyle = rgbStr(m.skinTop); g.beginPath();
      g.moveTo(oX, cy - ry * 1.6); g.lineTo(iX, cy - ry * 1.6); g.lineTo(iX, iY); g.lineTo(oX, oY); g.closePath(); g.fill();
      g.restore();
      g.lineWidth = 4.5; g.strokeStyle = INK; g.beginPath(); g.moveTo(oX, oY); g.lineTo(iX, iY); g.stroke();
      g.lineWidth = 6; g.strokeStyle = 'rgba(150,75,30,0.9)'; g.beginPath(); g.moveTo(oX, oY - 9); g.lineTo(iX + s * 4, iY - 9); g.stroke();
    });
    coverMouth(g, m); g.lineWidth = 3; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(nx - 7, my + 2); g.quadraticCurveTo(nx, my - 2, nx + 7, my + 2); g.stroke();
    return;
  }
  if (mood === 'sad') {
    m.eyes.forEach(function (e) {
      var cx = e[0], cy = e[1], rx = e[2], ry = e[3], s = cx < nx ? -1 : 1;
      g.lineWidth = 5; g.strokeStyle = 'rgba(150,75,30,0.9)';
      g.beginPath(); g.moveTo(cx + s * rx * 1.0, cy - ry * 1.25); g.lineTo(cx - s * rx * 0.6, cy - ry * 1.7); g.stroke();
      if (s > 0) {   // tear
        var tx = cx + rx * 0.65, ty = cy + ry * 1.1;
        g.fillStyle = '#7fd3ff'; g.beginPath(); g.moveTo(tx, ty - 9);
        g.bezierCurveTo(tx + 9, ty + 3, tx + 6, ty + 11, tx, ty + 11); g.bezierCurveTo(tx - 6, ty + 11, tx - 9, ty + 3, tx, ty - 9); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(tx - 2, ty + 3, 2, 3, 0, 0, Math.PI * 2); g.fill();
      }
    });
    coverMouth(g, m); g.lineWidth = 3; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(nx - 8, my + 4); g.quadraticCurveTo(nx, my - 4, nx + 8, my + 4); g.stroke();
  }
}

