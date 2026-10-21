/* ===================== RENDERING ===================== */
var WALL_PAWS = [[95, 150, 18, -0.3], [400, 170, 20, 0.2], [270, 720, 16, 0.1], [40, 470, 14, -0.2], [505, 500, 14, 0.3], [150, 700, 13, 0.2]];
var WALL_HEADS = [[200, 135, 22], [440, 300, 16], [90, 690, 16], [470, 720, 18]];
var BG_DOTS = [];
(function () { var r = CORE.rng(42); for (var i = 0; i < 26; i++) BG_DOTS.push({ x: r() * LW, y: 110 + r() * 620, s: 0.6 + r() * 1.5, p: r() * 6.28 }); })();

function drawLeaf(x, y, len, w, ang, c1, c2) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = lin(-w, w, [c1, c2]);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -w, len, 0); ctx.quadraticCurveTo(len * 0.5, w, 0, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
  ctx.restore();
}
function drawYarn(x, y, r, c1, c2) {
  ctx.fillStyle = 'rgba(60,20,10,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 1.05, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 2, x, y, r); g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.3;
  for (var i = -4; i <= 4; i++) { ctx.beginPath(); ctx.ellipse(x + i * r * 0.18, y, r * 0.35, r * 1.1, 0.6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function drawBackground() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  var g = ctx.createLinearGradient(0, 0, 0, view.H);
  g.addColorStop(0, '#2c5fd3'); g.addColorStop(0.55, '#3a72de'); g.addColorStop(1, '#2a56c0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, view.W, view.H);
  var fy = view.offY + FLOOR_Y * view.scale;
  var fg = ctx.createLinearGradient(0, fy, 0, view.H);
  fg.addColorStop(0, '#d89654'); fg.addColorStop(1, '#a5622b');
  ctx.fillStyle = fg; ctx.fillRect(0, fy, view.W, view.H - fy);
  setLogical();
  var lx0 = -view.offX / view.scale, lx1 = (view.W - view.offX) / view.scale;
  var ly0 = -view.offY / view.scale, ly1 = (view.H - view.offY) / view.scale;
  // central soft light + vignette
  var rg = ctx.createRadialGradient(270, 420, 30, 270, 420, 470);
  rg.addColorStop(0, 'rgba(120,175,255,0.32)'); rg.addColorStop(1, 'rgba(120,175,255,0)');
  ctx.fillStyle = rg; ctx.fillRect(lx0, ly0, lx1 - lx0, FLOOR_Y - ly0);
  // wallpaper motifs: faint paws & cat heads
  ctx.fillStyle = 'rgba(160,200,255,0.2)';
  WALL_PAWS.forEach(function (p) { ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(p[3]); pawPath(0, 0, p[2]); ctx.fill(); ctx.restore(); });
  WALL_HEADS.forEach(function (h) {
    var x = h[0], y = h[1], r = h[2];
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r, 0, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.05, y - r * 0.3); ctx.lineTo(x - r * 0.8, y - r * 1.35); ctx.lineTo(x - r * 0.2, y - r * 0.9);
    ctx.moveTo(x + r * 1.05, y - r * 0.3); ctx.lineTo(x + r * 0.8, y - r * 1.35); ctx.lineTo(x + r * 0.2, y - r * 0.9); ctx.fill();
  });
  BG_DOTS.forEach(function (d) {
    var a = 0.2 + 0.25 * Math.sin(Anim.time * 1.5 + d.p);
    ctx.fillStyle = 'rgba(220,235,255,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, Math.PI * 2); ctx.fill();
  });
  // pink window frame (top-left) and wooden posts at both sides
  ctx.fillStyle = lin(10, 220, ['#f39ad6', '#c2569e']); rr(ctx, lx0 - 30, 12, 64 - lx0 + 0, 200, 10); ctx.fill();
  ctx.fillStyle = lin(30, 200, ['#9ec8ff', '#5d8fe0']); rr(ctx, lx0 - 30, 30, 50 - lx0, 160, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(Math.max(lx0, -20), 108, 60, 5);
  ctx.fillStyle = lin(0, 0, ['#a0602c', '#7a4318']);
  var postG = ctx.createLinearGradient(LW - 22, 0, LW + 30, 0); postG.addColorStop(0, '#b56f33'); postG.addColorStop(1, '#6e3a14');
  ctx.fillStyle = postG; ctx.fillRect(LW - 20, ly0, Math.max(40, lx1 - LW + 20), FLOOR_Y - ly0);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(LW - 24, ly0, 4, FLOOR_Y - ly0);
  var postL = ctx.createLinearGradient(lx0, 0, 18, 0); postL.addColorStop(0, '#6e3a14'); postL.addColorStop(1, '#b56f33');
  ctx.fillStyle = postL; ctx.fillRect(lx0, 220, 18 - lx0, FLOOR_Y - 220);
  // top-right hanging plant
  [[-2.2, 46], [-2.6, 40], [-1.9, 38], [-2.9, 34], [-1.5, 30]].forEach(function (l, i) {
    drawLeaf(LW + 6, 120 + i * 8, l[1], 11, l[0], '#6fd36a', '#2f8a3a');
  });
  // back ledge / floor
  ctx.fillStyle = lin(FLOOR_Y - 14, FLOOR_Y + 4, ['#e8aa66', '#c47a3a']); ctx.fillRect(lx0, FLOOR_Y - 12, lx1 - lx0, 14);
  ctx.fillStyle = 'rgba(255,230,190,0.6)'; ctx.fillRect(lx0, FLOOR_Y - 12, lx1 - lx0, 2);
  ctx.fillStyle = 'rgba(60,25,5,0.3)'; ctx.fillRect(lx0, FLOOR_Y + 2, lx1 - lx0, 3);
  ctx.strokeStyle = 'rgba(110,55,15,0.32)'; ctx.lineWidth = 1.5;
  for (var x = Math.floor(lx0 / 64) * 64 - 32; x < lx1 + 64; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, FLOOR_Y + 4); ctx.lineTo(x + (x - 270) * 0.55, ly1); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,215,160,0.18)';
  [FLOOR_Y + 34, FLOOR_Y + 80].forEach(function (y) { ctx.beginPath(); ctx.moveTo(lx0, y); ctx.lineTo(lx1, y); ctx.stroke(); });
  // rug under the beds
  ctx.fillStyle = 'rgba(70,20,90,0.25)'; ctx.beginPath(); ctx.ellipse(270, 826, 158, 28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lin(796, 852, ['#a873ea', '#7c49cf']); ctx.beginPath(); ctx.ellipse(270, 822, 152, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(230,200,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(270, 822, 140, 21, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(220,190,255,0.55)'; ctx.save(); ctx.translate(270, 832); ctx.scale(1, 0.4); pawPath(0, 0, 16); ctx.fill(); ctx.restore();
}

function drawRoomProps() {
  // left potted plant
  [[-1.2, 70], [-1.6, 62], [-0.9, 58], [-2.0, 52], [-0.6, 46], [-1.4, 40]].forEach(function (l, i) {
    drawLeaf(26, 752, l[1], 13, l[0] + (i % 2 ? 0.05 : -0.05), '#79dd6a', '#2e8a39');
  });
  ctx.fillStyle = lin(748, 800, ['#e0874a', '#a34d1f']);
  ctx.beginPath(); ctx.moveTo(2, 748); ctx.lineTo(52, 748); ctx.lineTo(46, 800); ctx.lineTo(8, 800); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c86a32'; rr(ctx, -2, 742, 58, 10, 4); ctx.fill();
  drawYarn(70, 788, 22, '#ff9ccc', '#d8487e');
  ctx.strokeStyle = '#e45b93'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(88, 800); ctx.quadraticCurveTo(110, 812, 128, 806); ctx.stroke();
  // cat tree (right)
  ctx.fillStyle = 'rgba(60,25,5,0.3)'; ctx.beginPath(); ctx.ellipse(498, 810, 44, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lin(700, 806, ['#d9a77a', '#a8754c']); rr(ctx, 474, 752, 56, 52, 16); ctx.fill();
  ctx.fillStyle = '#6e3f1f'; ctx.beginPath(); ctx.ellipse(500, 778, 14, 16, 0, Math.PI, 0); ctx.lineTo(514, 800); ctx.lineTo(486, 800); ctx.closePath(); ctx.fill();
  ctx.fillStyle = lin(700, 752, ['#e3c49a', '#c49a6c']); ctx.fillRect(492, 700, 16, 54);
  ctx.strokeStyle = 'rgba(130,90,50,0.55)'; ctx.lineWidth = 1.5;
  for (var y = 704; y < 750; y += 6) { ctx.beginPath(); ctx.moveTo(492, y); ctx.lineTo(508, y + 3); ctx.stroke(); }
  ctx.fillStyle = lin(688, 708, ['#e6c59a', '#b98d60']); ctx.beginPath(); ctx.ellipse(500, 698, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c99a6a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(476, 702); ctx.lineTo(476, 730); ctx.stroke();
  ctx.fillStyle = '#f2c98e'; ctx.beginPath(); ctx.arc(476, 736, 6, 0, Math.PI * 2); ctx.fill();
  drawYarn(452, 796, 15, '#c69cff', '#7a48d0');
}

function drawForeground(lx0) {
  // big foreground leaf, bottom-left (kept clear of the toolbar buttons)
  [[-0.7, 96, 22], [-1.1, 84, 18], [-0.35, 70, 16]].forEach(function (l) {
    drawLeaf(lx0 - 10, 960, l[1], l[2], l[0], '#5dc65a', '#21702e');
  });
}

function drawShelf(cont) {
  var sp = shelfSpan(cont.side), y = ROW_Y[cont.row];
  var shake = Anim.contShake[cont.id] || 0, dx = shake > 0 ? Math.sin(shake * 60) * 4 * (shake / 0.35) : 0;
  ctx.save(); ctx.translate(dx, 0);
  var x0 = sp.x0, w = sp.x1 - sp.x0;
  ctx.fillStyle = 'rgba(10,30,90,0.28)'; rr(ctx, x0 + 4, y + 12, w - 8, 12, 6); ctx.fill();
  // brackets
  [0.3, 0.8].forEach(function (f) {
    var bx = Math.max(12, Math.min(LW - 24, x0 + w * f));
    ctx.fillStyle = lin(y + 10, y + 26, ['#a9612a', '#7e4219']); rr(ctx, bx - 7, y + 10, 14, 15, 3); ctx.fill();
  });
  ctx.fillStyle = lin(y + 2, y + PLANK_H + 2, ['#e7a05d', '#c27434', '#a85f27']); rr(ctx, x0, y + 1, w, PLANK_H, 6); ctx.fill();
  ctx.fillStyle = lin(y - 4, y + 4, ['#ffdca9', '#f4b876']); rr(ctx, x0, y - 3, w, 7, 3.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,215,0.5)'; ctx.fillRect(x0 + 8, y + 5.5, w - 16, 1.4);
  ctx.strokeStyle = 'rgba(120,55,10,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0 + 24, y + 10); ctx.quadraticCurveTo(x0 + w * 0.5, y + 8.5, x0 + w - 40, y + 10.5); ctx.stroke();
  ctx.restore();
}

function drawBed(x, y, part, sc) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y);
  if (part === 'back') {
    ctx.fillStyle = 'rgba(50,15,70,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 32, 60, 9, 0, 0, Math.PI * 2); ctx.fill();
    [-1, 1].forEach(function (sd) {
      ctx.fillStyle = lin(y - 62, y - 14, ['#e6a0ff', '#a64fe0']);
      ctx.beginPath(); ctx.moveTo(x + sd * 22, y - 24); ctx.quadraticCurveTo(x + sd * 40, y - 64, x + sd * 46, y - 60);
      ctx.quadraticCurveTo(x + sd * 56, y - 40, x + sd * 56, y - 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,205,245,0.7)';
      ctx.beginPath(); ctx.moveTo(x + sd * 31, y - 26); ctx.quadraticCurveTo(x + sd * 41, y - 52, x + sd * 45, y - 50);
      ctx.quadraticCurveTo(x + sd * 50, y - 36, x + sd * 49, y - 20); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = lin(y - 34, y + 6, ['#d58af6', '#9a45d8']);
    ctx.beginPath(); ctx.ellipse(x, y - 6, 60, 28, 0, Math.PI, Math.PI * 2); ctx.lineTo(x + 60, y); ctx.lineTo(x - 60, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lin(y - 22, y + 10, ['#fff0fd', '#ecc6f4']);
    ctx.beginPath(); ctx.ellipse(x, y - 4, 46, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,150,215,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 26, y - 6); ctx.quadraticCurveTo(x - 13, y - 1, x, y - 6); ctx.quadraticCurveTo(x + 13, y - 1, x + 26, y - 6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(x - 14, y - 12, 12, 4, -0.2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#5c2385';
    [-1, 1].forEach(function (sd) { rr(ctx, x + sd * 36 - 7, y + 20, 14, 12, 4); ctx.fill(); });
    ctx.fillStyle = lin(y - 6, y + 28, ['#c975f4', '#9a43d8', '#7a2fb8']);
    ctx.beginPath(); ctx.moveTo(x - 60, y - 6);
    ctx.bezierCurveTo(x - 62, y + 30, x + 62, y + 30, x + 60, y - 6);
    ctx.bezierCurveTo(x + 50, y + 16, x - 50, y + 16, x - 60, y - 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,255,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - 50, y + 4); ctx.bezierCurveTo(x - 34, y + 15, x + 34, y + 15, x + 50, y + 4); ctx.stroke();
  }
  ctx.restore();
}

function activeSeqFor(game, cat) {
  for (var i = 0; i < Anim.seqs.length; i++) {
    var s = Anim.seqs[i];
    for (var j = 0; j < s.conts.length; j++) {
      var c = CORE.getC(game.board, s.conts[j]);
      if (c && c.cats.some(function (k) { return k.id === cat.id; })) return s;
    }
  }
  return null;
}
function catMood(game, cat, v) {
  var seq = activeSeqFor(game, cat);
  if (seq) return seq.t < 0.78 ? 'happy' : 'sleep';
  if (v.moodO && Anim.time < v.moodUntil) return v.moodO;
  if (v.jump && v.jump.t >= 0) return 'determined';
  return Anim.time < v.blinkUntil ? 'blink' : 'open';
}

function drawCatSprite(color, mood, x, footY, sx, sy, rot, alpha, glow, size) {
  var set = SPRITES[color]; if (!set) return;
  var spr = set[mood] || set.open, k = (size || CAT_DRAW) / SPR_W;
  var h = spr.h, w = spr.w;
  ctx.save(); ctx.translate(x, footY); ctx.scale(sx * k, sy * k);
  if (rot) { ctx.translate(0, -h / 2); ctx.rotate(rot); ctx.translate(0, h / 2); }
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (glow) {
    if (Platform.caps.shadowBlur) {
      ctx.shadowColor = glow; ctx.shadowBlur = 14 * view.scale * view.dpr;
      blitSprite(spr, -w / 2, -h + 4); blitSprite(spr, -w / 2, -h + 4);
      ctx.shadowBlur = 0;
    } else {
      // native glow: pre-baked blurred silhouette (drawImage only; no gradient, no shadowBlur)
      var ga = ctx.globalAlpha;
      blitGlow(color, spr);
      ctx.globalAlpha = ga;
    }
  }
  blitSprite(spr, -w / 2, -h + 4);
  ctx.restore();
}

function drawCat(game, cont, cat, i) {
  var v = Anim.visuals[cat.id]; if (!v) return;
  var selected = game.state === S.CAT_SELECTED && game.selectedIds().indexOf(cat.id) >= 0;
  var t = Anim.time;
  var breath = Math.sin(t * 2.3 + v.phase) * 0.02;
  var st = v.stretch || 0;
  var sy = 1 + v.sq + breath + st, sx = 1 - v.sq * 0.6 - breath * 0.5 - st * 0.5;
  var x = v.x, y = v.y;
  if (v.shake > 0) x += Math.sin(v.shake * 55) * 4.5 * (v.shake / 0.4);
  var seq = activeSeqFor(game, cat), hop = 0;
  if (seq) { var local = seq.t - i * 0.07; if (local > 0 && local < 0.42) hop = Math.sin(Math.PI * local / 0.42) * 18; }
  if (v.hop > 0) hop += Math.sin(Math.PI * v.hop) * 7;
  if (selected) hop += Math.abs(Math.sin(t * 5)) * 4;
  var scaleIn = v.appear > 0 && v.appear < 1 ? easeOutBack(v.appear) : 1;
  var foot = updateShelfLayout(game.board, cont, i).y;
  var air = clamp((foot - y) / 70, 0, 1);
  if (!v.jump || air < 1) {
    ctx.fillStyle = 'rgba(15,25,70,' + (0.24 * (1 - air * 0.6)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(x, foot - 1, 24 * (1 - air * 0.35), 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  // "lift" motion lines under a picked-up cat
  if (v.liftT > 0.3 && !v.jump) {
    ctx.save(); ctx.globalAlpha = (v.liftT - 0.3) * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineWidth = 2.5;
    for (var l = -1; l <= 1; l++) {
      var off = (t * 60 + l * 9) % 14;
      ctx.beginPath(); ctx.moveTo(x + l * 13, y + 4 + off); ctx.lineTo(x + l * 13, y + 12 + off); ctx.stroke();
    }
    ctx.restore();
  }
  drawCatSprite(cat.color, catMood(game, cat, v), x, y - hop, sx * scaleIn, sy * scaleIn, v.rot || 0, 1,
    selected ? 'rgba(255,224,70,1)' : null);
  if (v.wiggle > 0) {                       // invalid: wiggle marks on both sides
    ctx.save(); ctx.globalAlpha = Math.min(1, v.wiggle / 0.25); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    [-1, 1].forEach(function (sd) {
      for (var q = 0; q < 2; q++) {
        var bx = x + sd * (34 + q * 7), by = y - hop - 44 + q * 8;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + sd * 5, by + 4, bx, by + 8); ctx.quadraticCurveTo(bx - sd * 5, by + 12, bx, by + 16); ctx.stroke();
      }
    });
    ctx.restore();
  }
}

function drawChecks(game) {
  Anim.seqs.forEach(function (s) {
    if (s.cleared) return;
    s.conts.forEach(function (cid) {
      var c = CORE.getC(game.board, cid); if (!c) return;
      c.cats.forEach(function (cat, i) {
        var local = s.t - 0.32 - i * 0.08; if (local <= 0) return;
        var sc = easeOutBack(Math.min(1, local / 0.25));
        var p = updateShelfLayout(game.board, c, i);
        ctx.save(); ctx.translate(p.x + 2, p.y + 4); ctx.scale(sc, sc);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(-2, 6); ctx.lineTo(10, -8);
        ctx.strokeStyle = '#145a16'; ctx.lineWidth = 8; ctx.stroke();
        ctx.strokeStyle = '#55e24e'; ctx.lineWidth = 4.5; ctx.stroke();
        ctx.restore();
      });
    });
  });
}

function drawFxs() {
  Anim.fxs.forEach(function (f) {
    var u = f.t / f.max;
    ctx.save(); ctx.lineCap = 'round';
    if (f.type === 'rays') {                   // "place" yellow rays
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = f.color; ctx.lineWidth = 4;
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4 + Math.PI / 8, r0 = 34 + u * 16, r1 = r0 + 10 * (1 - u) + 4;
        ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0 * 0.85);
        ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1 * 0.85); ctx.stroke();
      }
    } else if (f.type === 'bang') {            // tap / react burst above head
      ctx.globalAlpha = 1 - u * u; ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 4.5;
      [-0.5, 0, 0.5].forEach(function (a) {
        var r0 = 6 + u * 8, r1 = r0 + 10;
        ctx.beginPath(); ctx.moveTo(f.x + Math.sin(a) * r0, f.y - Math.cos(a) * r0); ctx.lineTo(f.x + Math.sin(a) * r1, f.y - Math.cos(a) * r1); ctx.stroke();
      });
    }
    ctx.restore();
  });
}

function drawPods() {
  PODS.forEach(function (p, i) {
    var sway = Math.sin(Anim.time * 1.3 + i * 1.7) * 0.035;
    ctx.save(); ctx.translate(p.x, -12); ctx.rotate(sway); ctx.translate(-p.x, 12);
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(p.x, -14); ctx.lineTo(p.x, p.y - 32); ctx.stroke();
    ctx.strokeStyle = '#c99a5e'; ctx.lineWidth = 1.6;
    for (var ry = -10; ry < p.y - 34; ry += 5) { ctx.beginPath(); ctx.moveTo(p.x - 2.5, ry); ctx.lineTo(p.x + 2.5, ry + 3.5); ctx.stroke(); }
    var s = 1 + p.bounce * 0.06;
    ctx.translate(p.x, p.y); ctx.scale(s, s);
    var video = p.icon === 'video';
    var c1 = video ? '#b06ae0' : '#ff8ee6', c2 = video ? '#6a2aa8' : '#c13fbf';
    ctx.fillStyle = 'rgba(20,20,70,0.25)'; ctx.beginPath(); ctx.ellipse(0, 40, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
    [-1, 1].forEach(function (sd) {
      ctx.fillStyle = lin(-46, -10, [c1, c2]);
      ctx.beginPath(); ctx.moveTo(sd * 12, -32); ctx.quadraticCurveTo(sd * 28, -50, sd * 34, -44); ctx.quadraticCurveTo(sd * 38, -26, sd * 32, -14); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = lin(-38, 38, [c1, c2]); ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-14, -22, 14, 6, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = video ? '#4d1d86' : '#8a2a88'; ctx.beginPath(); ctx.arc(0, 2, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = video ? lin(-26, 26, ['#8a4fd8', '#5a2aa0']) : lin(-26, 26, ['#ffd25e', '#f0901e']);
    ctx.beginPath(); ctx.arc(0, 2, 25, 0, Math.PI * 2); ctx.fill();
    if (video) {
      ctx.fillStyle = '#e8413f'; rr(ctx, -14, -9, 28, 21, 5); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-14, -9, 28, 5); ctx.fillStyle = '#e8413f';
      for (var q = -10; q < 14; q += 7) ctx.fillRect(q, -9, 3, 5);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(7, 4); ctx.lineTo(-4, 9); ctx.closePath(); ctx.fill();
    } else {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 2, 25, 0, Math.PI * 2); ctx.clip();
      var M = CAT_FACES[p.icon], set = SPRITES[p.icon];
      if (M && set) {
        var fcx = (M.eyes[0][0] + M.eyes[1][0]) / 2, fcy = (M.eyes[0][1] + M.eyes[1][1]) / 2 + 14;
        var kk = 0.235 * (1 + p.bounce * 0.0);
        ctx.translate(0, 2); ctx.scale(kk, kk);
        blitSprite(set.open, -fcx, -fcy);
      }
      ctx.restore();
    }
    ctx.restore();
  });
}

function drawHUD(game) {
  var cb = 1 + Anim.coinPillBounce * 0.08;
  ctx.save(); ctx.translate(COIN_PILL.x, COIN_PILL.y); ctx.scale(cb, cb);
  ctx.fillStyle = 'rgba(20,30,90,0.28)'; rr(ctx, -48, -13, 104, 34, 17); ctx.fill();
  ctx.fillStyle = lin(-17, 17, ['#fffaee', '#f2dcad']); rr(ctx, -50, -17, 104, 34, 17); ctx.fill();
  ctx.strokeStyle = '#cfa063'; ctx.lineWidth = 1.5; ctx.stroke();
  text(String(Math.round(Anim.displayCoins)), 10, 0, 19, '#5b2d0b');
  ctx.beginPath(); ctx.arc(-50, -1, 24, 0, Math.PI * 2); ctx.fillStyle = lin(-24, 24, ['#ffe96e', '#f2a20f']); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#cf7d06'; ctx.stroke();
  ctx.beginPath(); ctx.arc(-50, -1, 17, 0, Math.PI * 2); ctx.fillStyle = lin(-17, 17, ['#ffd23f', '#f5b21a']); ctx.fill();
  ctx.fillStyle = '#e0850a'; pawPath(-50, 0, 9); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-58, -12, 7, 3.5, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(52, 12, 12, 0, Math.PI * 2); ctx.fillStyle = lin(0, 24, ['#8ef06b', '#2ea32c']); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(46, 12); ctx.lineTo(58, 12); ctx.moveTo(52, 6); ctx.lineTo(52, 18); ctx.stroke();
  ctx.restore();
  var sb = 1 + Anim.starPillBounce * 0.12;
  ctx.save(); ctx.translate(STAR_PILL.x, STAR_PILL.y); ctx.scale(sb, sb);
  ctx.fillStyle = 'rgba(20,30,90,0.28)'; rr(ctx, -44, -13, 96, 34, 17); ctx.fill();
  ctx.fillStyle = lin(-17, 17, ['#fffaee', '#f2dcad']); rr(ctx, -46, -17, 96, 34, 17); ctx.fill();
  ctx.strokeStyle = '#cfa063'; ctx.lineWidth = 1.5; ctx.stroke();
  text(String(Anim.displayStars), 18, 0, 19, '#5b2d0b');
  drawStar(-46, -3, 25);
  ctx.restore();
  text('Level ' + (game.levelIndex + 1), 270, 150, 16, 'rgba(255,255,255,0.9)', 'rgba(20,50,130,0.55)', 4);
}

function drawIconUndo() {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  [['#4b1f99', 11], ['#7fd8ff', 7], ['#ffffff', 3]].forEach(function (s) {
    ctx.strokeStyle = s[0]; ctx.lineWidth = s[1];
    ctx.beginPath(); ctx.arc(2, 2, 13, Math.PI * 1.05, Math.PI * 0.75, false); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-17, -9); ctx.lineTo(-12, 3); ctx.lineTo(-1, -2); ctx.stroke();
  });
}
// Shuffle: two arrows crossing over each other (universal "shuffle" symbol).
function drawIconShuffle() {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  function arrow(y0, y1) {
    function body() { ctx.beginPath(); ctx.moveTo(-19, y0); ctx.lineTo(-10, y0); ctx.bezierCurveTo(-1, y0, 1, y1, 10, y1); ctx.lineTo(12, y1); }
    function head(path) { ctx.beginPath(); ctx.moveTo(10, y1 - 8.5); ctx.lineTo(21, y1); ctx.lineTo(10, y1 + 8.5); ctx.closePath(); }
    ctx.strokeStyle = '#4b1f99'; ctx.lineWidth = 11; body(); ctx.stroke();        // outline
    head(); ctx.lineWidth = 5; ctx.stroke(); ctx.fillStyle = '#4b1f99'; ctx.fill();
    ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 6; body(); ctx.stroke();          // fill
    head(); ctx.fillStyle = '#7fd8ff'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2;                 // highlight
    ctx.beginPath(); ctx.moveTo(-17, y0 - 1.2); ctx.lineTo(-10, y0 - 1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11.5, y1 - 4.5); ctx.lineTo(17, y1 - 0.8); ctx.stroke();
  }
  arrow(9, -9);    // under arrow (bottom-left -> top-right)
  arrow(-9, 9);    // over arrow (top-left -> bottom-right) drawn last so it crosses on top
}
// Extra slot: a mini purple cat bed (same as the real beds) with a green "+" badge.
function drawIconBed() {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(-3, 6); ctx.scale(0.9, 0.9);
  var O = '#4b1f99';
  function ears() {
    ctx.beginPath();
    ctx.moveTo(-15, -2); ctx.lineTo(-14, -16); ctx.lineTo(-5, -7); ctx.closePath();
    ctx.moveTo(15, -2); ctx.lineTo(14, -16); ctx.lineTo(5, -7); ctx.closePath();
  }
  function rim() { ctx.beginPath(); ctx.ellipse(0, 0, 18, 8.5, 0, Math.PI, Math.PI * 2); ctx.closePath(); }
  function bowl() { ctx.beginPath(); ctx.moveTo(-19, 0); ctx.bezierCurveTo(-19, 15, 19, 15, 19, 0); ctx.bezierCurveTo(14, 5, -14, 5, -19, 0); ctx.closePath(); }
  // outlines
  ctx.strokeStyle = O; ctx.lineWidth = 5;
  ears(); ctx.stroke(); rim(); ctx.stroke(); bowl(); ctx.stroke();
  ctx.fillStyle = O; ctx.beginPath(); ctx.ellipse(0, 1, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
  // fills
  ctx.fillStyle = '#e48cf6'; ears(); ctx.fill();
  ctx.fillStyle = '#ffd1f4'; ctx.beginPath(); ctx.moveTo(-12.5, -4); ctx.lineTo(-12, -12); ctx.lineTo(-7.5, -7); ctx.closePath();
  ctx.moveTo(12.5, -4); ctx.lineTo(12, -12); ctx.lineTo(7.5, -7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c56cf0'; rim(); ctx.fill();
  ctx.fillStyle = '#fff1fd'; ctx.beginPath(); ctx.ellipse(0, 1, 14, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(200,140,215,0.9)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-7, 0.5); ctx.quadraticCurveTo(-3.5, 2.5, 0, 0.5); ctx.quadraticCurveTo(3.5, 2.5, 7, 0.5); ctx.stroke();
  ctx.fillStyle = lin(0, 12, ['#b35ee8', '#7a2fb8']); bowl(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,225,255,0.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-14, 4.5); ctx.bezierCurveTo(-8, 8.5, 8, 8.5, 14, 4.5); ctx.stroke();
  ctx.restore();
  // "+" badge
  var bx = 15.5, by = -14.5;
  ctx.fillStyle = 'rgba(40,10,60,0.35)'; ctx.beginPath(); ctx.arc(bx, by + 1.5, 8.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lin(by - 8, by + 8, ['#9ef27a', '#2ea32c']); ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 4, by); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); ctx.stroke();
}
function drawBooster(b, iconFn, label, enabled, pressed) {
  ctx.save(); ctx.translate(b.x, b.y); var s = pressed ? 0.92 : 1; ctx.scale(s, s);
  var hw = b.w / 2, hh = b.h / 2;
  ctx.fillStyle = 'rgba(50,15,40,0.4)'; rr(ctx, -hw, -hh + 6, b.w, b.h, 18); ctx.fill();
  ctx.fillStyle = lin(-hh, hh, ['#e4c9ff', '#9a62ee']); rr(ctx, -hw, -hh, b.w, b.h, 18); ctx.fill();
  ctx.fillStyle = lin(-hh, hh, ['#b688ff', '#7741dc']); rr(ctx, -hw + 5, -hh + 5, b.w - 10, b.h - 12, 14); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; rr(ctx, -hw + 8, -hh + 7, b.w - 16, 20, 10); ctx.fill();
  ctx.save(); ctx.translate(0, -6); ctx.scale(1.1, 1.1); iconFn(); ctx.restore();
  if (!enabled) {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#7a0f14'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-18, 12); ctx.lineTo(18, -24); ctx.stroke();
    ctx.strokeStyle = '#ef3b3b'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.fillStyle = lin(hh - 12, hh + 10, ['#aee8ff', '#3c9cf0']); rr(ctx, -31, hh - 13, 62, 22, 11); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
  text(label, 0, hh - 1.5, 14, '#ffffff', '#1f5aa8', 3.5);
  ctx.restore();
}
function drawSettingsBtn(pressed) {
  var b = BTN.settings; ctx.save(); ctx.translate(b.x, b.y); var s = pressed ? 0.92 : 1; ctx.scale(s, s);
  ctx.fillStyle = 'rgba(40,10,40,0.35)'; ctx.beginPath(); ctx.arc(0, 5, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lin(-b.r, b.r, ['#ffe58e', '#e88a12']); ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lin(-b.r, b.r, ['#b07cff', '#6a34cf']); ctx.beginPath(); ctx.arc(0, 0, b.r - 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  for (var i = 0; i < 16; i++) {
    var a = i * Math.PI / 8, r = i % 2 ? 10 : 14, a0 = a - Math.PI / 16, a1 = a + Math.PI / 16;
    if (i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); else ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  ctx.closePath(); ctx.fillStyle = lin(-14, 14, ['#ffe873', '#f2a91a']); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#a86a08'; ctx.stroke();
  ctx.fillStyle = '#7c45dc'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawParticles() {
  Anim.particles.forEach(function (p) {
    var a = 1 - p.life / p.max;
    if (p.type === 'puff') {
      ctx.fillStyle = 'rgba(255,236,205,' + (a * 0.85).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.life * 2.2), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'streak') {
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.75).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.dx * p.size, p.y - p.dy * p.size); ctx.stroke();
    } else if (p.type === 'spark') {
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      starPath(0, 0, p.size, p.size * 0.45, 4); ctx.fillStyle = p.color; ctx.fill(); ctx.restore();
    } else if (p.type === 'confetti') {
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
    } else if (p.type === 'z') {
      ctx.save(); ctx.globalAlpha = a; text('z', p.x, p.y, p.size, '#eaf3ff', '#2a4f9a', 3); ctx.restore();
    }
  });
}

function drawHint(game) {
  var h = Anim.hintMove; if (!h || !game.inputOpen()) return;
  var pulse = 0.5 + 0.5 * Math.sin(Anim.time * 5);
  var src = CORE.getC(game.board, h.src), dst = CORE.getC(game.board, h.dst);
  if (!src || !dst) return;
  var tgt;
  if (game.state === S.READY) {
    if (!src.cats[h.idx]) return;
    tgt = updateShelfLayout(game.board, src, h.idx); tgt = { x: tgt.x, y: tgt.y - 34 };
  } else {
    if (!game.sel || src.cats[h.idx] === undefined || game.sel.catId !== src.cats[h.idx].id) return;
    var slot = updateShelfLayout(game.board, dst, Math.min(dst.cats.length, dst.capacity - 1));
    tgt = { x: slot.x, y: slot.y - 34 };
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.5).toFixed(3) + ')'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(tgt.x, tgt.y, 36 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(tgt.x + 20, tgt.y + 22 + pulse * 6);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2a4f9a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, -2); ctx.lineTo(10, 14); ctx.quadraticCurveTo(22, 12, 24, 22);
  ctx.lineTo(22, 38); ctx.lineTo(6, 40); ctx.lineTo(-4, 24); ctx.lineTo(2, 20); ctx.lineTo(6, 22); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  var msg = game.state === S.READY ? 'Tap the outermost cat to pick it up' : 'Now tap a shelf to move it there';
  text(msg, 270, 176, 18, '#ffffff', 'rgba(25,55,130,0.8)', 5);
}

var pressed = { id: null, t: 0 };
var uiButtons = [];

function drawPanel(x, y, w, h, title) {
  ctx.fillStyle = 'rgba(25,20,60,0.35)'; rr(ctx, x, y + 8, w, h, 26); ctx.fill();
  ctx.fillStyle = lin(y, y + h, ['#fff0cc', '#f7cf88']); rr(ctx, x, y, w, h, 26); ctx.fill();
  ctx.strokeStyle = '#c9893c'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = lin(y - 26, y + 26, ['#cf8dff', '#7d40e2']); rr(ctx, x + 40, y - 26, w - 80, 52, 24); ctx.fill();
  ctx.strokeStyle = '#f2dcff'; ctx.lineWidth = 2; ctx.stroke();
  text(title, x + w / 2, y, 26, '#ffffff', '#4a1d93', 6);
}
function uiButton(id, label, x, y, w, h, colors, size) {
  var isP = pressed.id === id && Anim.time - pressed.t < 0.15, s = isP ? 0.95 : 1;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(30,20,60,0.3)'; rr(ctx, -w / 2, -h / 2 + 5, w, h, h / 2.4); ctx.fill();
  ctx.fillStyle = lin(-h / 2, h / 2, colors); rr(ctx, -w / 2, -h / 2, w, h, h / 2.4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(ctx, -w / 2 + 6, -h / 2 + 4, w - 12, h * 0.38, h / 3); ctx.fill();
  text(label, 0, 1, size || 20, '#ffffff', 'rgba(0,0,0,0.35)', 4);
  ctx.restore();
  uiButtons.push({ id: id, x: x, y: y, w: w, h: h });
}
var GREEN = ['#8ff06b', '#2fae32'], BLUE = ['#86d4ff', '#2f86e6'], ORANGE = ['#ffc65a', '#ef7d14'], PURPLE = ['#c79bff', '#7442d8'], GREY = ['#cfcfe0', '#8a8aa6'];
var devResult = null;

function drawSettings(game) {
  ctx.fillStyle = 'rgba(10,20,50,0.55)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  var x = 70, y = 200, w = 400, h = 600;
  drawPanel(x, y, w, h, 'Settings');
  uiButton('close', '✕', x + w - 44, y + 18, 36, 36, ['#ff8a8a', '#d83a3a'], 18);
  uiButton('resume', 'Resume', x + 50, y + 60, 300, 56, GREEN);
  uiButton('restart', 'Restart Level', x + 50, y + 130, 300, 56, ORANGE);
  uiButton('sound', 'Sound: ' + (Sound.on ? 'On' : 'Off'), x + 50, y + 200, 300, 56, BLUE);
  uiButton('rewards', 'Free Coins', x + 50, y + 270, 300, 56, PURPLE);
  text('Levels', x + w / 2, y + 352, 17, '#7a4410');
  for (var i = 0; i < CORE.LEVELS.length; i++) {
    uiButton('level' + i, String(i + 1), x + 70 + i * 92, y + 372, 76, 52, game.levelIndex === i ? ORANGE : PURPLE, 22);
  }
  ctx.fillStyle = 'rgba(122,68,16,0.12)'; rr(ctx, x + 50, y + 440, 300, 38, 16); ctx.fill();
  text('Rule: only the outermost cat moves', x + w / 2, y + 459, 15, '#7a4410');
  uiButton('gfx', 'Graphics: ' + (gfxFlat ? 'Flat' : 'Gradient (beta)'), x + 50, y + 490, 300, 44, GREY, 17);
  if (Platform.debug) {
    uiButton('verify', 'Dev', x + 14, y + 18, 64, 34, GREY, 14);
    if (devResult) devResult.forEach(function (line, k) { text(line, x + w / 2, y + 610 + k * 15, 11, '#ffffff'); });
  }
  text('Version ' + VERSION + '  ·  build ' + BUILD, x + w / 2, y + 556, 15, '#5b2d0b');
  text('render: ' + Platform.renderMode(), x + w / 2, y + 578, 12, 'rgba(122,68,16,0.75)');
}

function drawWin(game) {
  var t = Anim.winT; if (t < 0.5) return;
  var a = clamp((t - 0.5) / 0.3, 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,20,50,0.55)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  var sc = easeOutBack(clamp((t - 0.5) / 0.4, 0, 1));
  ctx.translate(270, 480); ctx.scale(sc, sc); ctx.translate(-270, -480);
  var x = 80, y = 300, w = 380, h = 390;
  // sunburst behind the celebrating cat
  ctx.save(); ctx.translate(270, 250); ctx.rotate(Anim.time * 0.4);
  for (var r = 0; r < 12; r++) {
    ctx.fillStyle = r % 2 ? 'rgba(255,230,120,0.28)' : 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 170, r * Math.PI / 6, (r + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  var bob = Math.abs(Math.sin(t * 4)) * 8;
  drawCatSprite('red', 'cheer', 270, 318 - bob, 1, 1, 0, 1, 'rgba(255,230,90,0.9)', 120);
  drawPanel(x, y, w, h, 'Level Complete!');
  for (var i = 0; i < 3; i++) {
    var st = clamp((t - 0.9 - i * 0.18) / 0.3, 0, 1);
    if (st > 0) { ctx.save(); ctx.translate(x + w / 2 + (i - 1) * 78, y + 92 - (i === 1 ? 14 : 0)); var s2 = easeOutBack(st); ctx.scale(s2, s2); drawStar(0, 0, i === 1 ? 36 : 30); ctx.restore(); }
  }
  text('Groups sorted: ' + game.stars, x + w / 2, y + 160, 19, '#5b2d0b');
  text('Moves: ' + game.moves + '   Coins +' + CORE.CONFIG.coinsPerLevel, x + w / 2, y + 190, 17, '#7a4410');
  ctx.restore();
  ctx.save(); ctx.globalAlpha = a; ctx.translate(270, 480); ctx.scale(sc, sc); ctx.translate(-270, -480);
  uiButtonsScaled(sc, function () {
    uiButton('next', 'Next Level', x + 60, y + 230, 260, 60, GREEN, 22);
    uiButton('replay', 'Replay', x + 100, y + 306, 180, 48, BLUE, 18);
  });
  ctx.restore();
}
function uiButtonsScaled(sc, fn) {
  var before = uiButtons.length; fn();
  for (var i = before; i < uiButtons.length; i++) {
    var b = uiButtons[i];
    b.x = 270 + (b.x - 270) * sc; b.y = 480 + (b.y - 480) * sc; b.w *= sc; b.h *= sc;
  }
}

function drawToast() {
  var m = Anim.toastMsg; if (!m) return;
  var a = m.t < 0.15 ? m.t / 0.15 : (m.t > m.dur - 0.3 ? Math.max(0, (m.dur - m.t) / 0.3) : 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = '900 18px ' + FONT; var w = ctx.measureText(m.text).width + 40;
  ctx.fillStyle = 'rgba(25,40,100,0.85)'; rr(ctx, 270 - w / 2, 672, w, 42, 21); ctx.fill();
  text(m.text, 270, 694, 18, '#ffffff');
  ctx.restore();
}

function render() {
  uiButtons = [];
  drawBackground();
  drawRoomProps();
  var board = game.board;
  var canDrop = {};
  if (game.state === S.CAT_SELECTED && game.sel) {
    var si = game.selectedIndex();
    board.containers.forEach(function (c) { if (c.id !== game.sel.contId && game.canMove(game.sel.contId, si, c.id).ok) canDrop[c.id] = 1; });
  }
  board.containers.forEach(function (c) { if (c.kind === 'shelf') drawShelf(c); });
  var beds = board.containers.filter(function (c) { return c.kind === 'bed'; });
  var bsc = beds.length > 2 ? 0.88 : 1;
  beds.forEach(function (b) { var p = contPos(board, b); drawBed(p.x, p.y, 'back', bsc); });
  // drop-target glow spots
  if (game.state === S.CAT_SELECTED) {
    var pulse = 0.35 + 0.25 * Math.sin(Anim.time * 6);
    board.containers.forEach(function (c) {
      if (!canDrop[c.id]) return;
      var cnt = CORE.moveCount(board, game.sel.contId, game.selectedIndex(), c.id, game.rule());
      ctx.fillStyle = 'rgba(255,250,200,' + pulse.toFixed(3) + ')';
      for (var q = 0; q < cnt; q++) {                     // one glow spot per cat that will land here
        var slot = updateShelfLayout(board, c, c.cats.length + q);
        ctx.beginPath(); ctx.ellipse(slot.x, slot.y - 1, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  var top = [];
  function collect(c) {
    c.cats.forEach(function (cat, i) {
      var v = Anim.visuals[cat.id];
      if (v && (v.jump || v.liftT > 0)) top.push([c, cat, i]); else drawCat(game, c, cat, i);
    });
  }
  // draw rows top to bottom so lower cats overlap shelves above correctly
  board.containers.filter(function (c) { return c.kind === 'shelf'; })
    .sort(function (a, b) { return a.row - b.row; }).forEach(collect);
  beds.forEach(function (b) { collect(b); var p = contPos(board, b); drawBed(p.x, p.y, 'front', bsc); });
  drawChecks(game);
  top.forEach(function (t) { drawCat(game, t[0], t[1], t[2]); });
  Anim.flyers.forEach(function (f) {
    if (f.t < 0) return;
    var u = f.t / f.dur;
    drawCatSprite(f.color, 'sleep', f.x, f.y, f.s, f.s, f.rot, u > 0.85 ? (1 - u) / 0.15 : 1, null);
  });
  drawFxs();
  drawParticles();
  drawPods();
  drawHUD(game);
  Anim.starFlyers.forEach(function (s) { drawStar(s.x, s.y, s.r); });
  drawForeground(-view.offX / view.scale);
  var pid = pressed.id && Anim.time - pressed.t < 0.15 ? pressed.id : null;
  drawBooster(BTN.undo, drawIconUndo, 'Free', game.canUndo() || game.state === S.MOVING && game.history.length > 0, pid === 'undo');
  drawBooster(BTN.shuffle, drawIconShuffle, game.boosters.shuffle > 0 ? 'Free' : 'Used', game.boosters.shuffle > 0, pid === 'shuffle');
  drawBooster(BTN.bed, drawIconBed, game.boosters.bed > 0 && beds.length < 3 ? 'Free' : 'Used', game.boosters.bed > 0 && beds.length < 3, pid === 'bed');
  drawSettingsBtn(pid === 'settings');
  drawHint(game);
  if (game.state === S.PAUSED) drawOverlayPanel(game);
  if (game.state === S.LEVEL_COMPLETE) drawWin(game);
  drawRewardPopup();
  drawToast();
}

