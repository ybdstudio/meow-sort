/* ===================== ANIMATION MANAGER ===================== */
var Anim = {
  visuals: {}, jumpDelay: {}, flyers: [], starFlyers: [], particles: [], seqs: [], fxs: [],
  contShake: {}, toastMsg: null, time: 0,
  starPillBounce: 0, coinPillBounce: 0, displayStars: 0, displayCoins: 0,
  winT: -1, hintMove: null,
  reset: function () {
    this.visuals = {}; this.jumpDelay = {}; this.flyers = []; this.starFlyers = []; this.particles = []; this.seqs = []; this.fxs = [];
    this.contShake = {}; this.winT = -1;
  }
};

function newVisual(x, y, contId) {
  return { x: x, y: y, contId: contId, jump: null, sq: 0, sqv: 0, phase: Math.random() * 6.28, rot: 0,
           nextBlink: Anim.time + 1 + Math.random() * 4, blinkUntil: 0, shake: 0, appear: 0,
           moodO: null, moodUntil: 0, hop: 0, wiggle: 0, liftT: 0 };
}
function setMood(v, mood, dur) { v.moodO = mood; v.moodUntil = Anim.time + dur; }

/* Sort move: crouch (anticipation) -> launch with stretch & speed streaks,
   tilted toward travel -> land: squash, dust puffs, "place" rays, happy face,
   neighbour cats hop. */
function reconcile(game, dt) {
  var board = game.board, present = {}, busy = false;
  var selSet = {}; game.selectedIds().forEach(function (id) { selSet[id] = 1; });
  board.containers.forEach(function (cont) {
    cont.cats.forEach(function (cat, i) {
      present[cat.id] = 1;
      var t = updateShelfLayout(board, cont, i);
      var selected = !!selSet[cat.id];
      var v = Anim.visuals[cat.id];
      if (!v) { v = Anim.visuals[cat.id] = newVisual(t.x, t.y, cont.id); v.appear = 0.001; }
      v.liftT = selected ? Math.min(1, v.liftT + dt * 7) : Math.max(0, v.liftT - dt * 6);
      var tx = t.x, ty = t.y - 26 * easeOutBack(v.liftT);
      if (v.contId !== cont.id && !v.jump) {
        v.jump = { fx: v.x, fy: v.y, t: -0.09 - (Anim.jumpDelay[cat.id] || 0), dur: 0.42 + Math.min(0.18, Math.hypot(tx - v.x, ty - v.y) / 2600), launched: false };
        v.contId = cont.id; v.liftT = 0; delete Anim.jumpDelay[cat.id];
      }
      if (v.jump) {
        busy = true;
        var j = v.jump; j.t += dt;
        if (j.t < 0) {                          // anticipation crouch
          v.sq += (-0.2 - v.sq) * Math.min(1, dt * 30); v.sqv = 0;
        } else {
          if (!j.launched) { j.launched = true; v.sq = 0.16; v.sqv = 0; Sound.jump(); }
          var u = clamp(j.t / j.dur, 0, 1), e = easeInOut(u);
          var arc = Math.max(80, Math.abs(tx - j.fx) * 0.3 + 46);
          var top = Math.min(j.fy, ty) - arc, mx = (j.fx + tx) / 2;
          var nx = (1 - e) * (1 - e) * j.fx + 2 * (1 - e) * e * mx + e * e * tx;
          var ny = (1 - e) * (1 - e) * j.fy + 2 * (1 - e) * e * top + e * e * ty;
          var dirx = nx - v.x, diry = ny - v.y;
          v.x = nx; v.y = ny;
          v.stretch = Math.sin(Math.PI * u) * 0.14;
          v.rot = Math.sin(Math.PI * u) * 0.3 * (tx >= j.fx ? 1 : -1);
          if (u > 0.05 && u < 0.92 && (dirx || diry)) {
            var len = Math.hypot(dirx, diry) || 1;
            Anim.particles.push({ type: 'streak', x: v.x - dirx / len * 22, y: v.y - 36 + (Math.random() - 0.5) * 34,
              vx: 0, vy: 0, dx: dirx / len, dy: diry / len, life: 0, max: 0.22, size: 10 + Math.random() * 14 });
          }
          if (u >= 1) {
            v.jump = null; v.x = tx; v.y = ty; v.stretch = 0; v.rot = 0; v.sq = -0.3; v.sqv = 0;
            setMood(v, 'cheer', 0.65);
            Sound.land(); spawnDust(tx, t.y); spawnPlaceRays(tx, t.y - 36);
            // neighbours react with a little hop
            [i - 1, i + 1].forEach(function (k) { var nb = cont.cats[k]; var nv = nb && Anim.visuals[nb.id]; if (nv && !nv.jump) nv.hop = 0.001; });
          }
        }
      } else {
        var k = 1 - Math.exp(-dt * 16);
        var ox = v.x;
        v.x += (tx - v.x) * k; v.y += (ty - v.y) * k;
        if (Math.abs(tx - v.x) > 2 || Math.abs(ty - v.y) > 2 && v.liftT === 0) busy = true;
        if (Math.abs(tx - ox) > 6 && v.hop === 0) v.hop = 0.001;       // sliding cats bob
        v.rot += (0 - v.rot) * k;
      }
      var acc = -260 * v.sq - 15 * v.sqv; v.sqv += acc * dt; v.sq += v.sqv * dt;
      if (v.hop > 0) { v.hop += dt / 0.3; if (v.hop >= 1) v.hop = 0; }
      if (v.appear > 0 && v.appear < 1) v.appear = Math.min(1, v.appear + dt * 4);
      if (v.shake > 0) v.shake = Math.max(0, v.shake - dt);
      if (v.wiggle > 0) v.wiggle = Math.max(0, v.wiggle - dt);
      if (Anim.time > v.nextBlink) { v.blinkUntil = Anim.time + 0.13; v.nextBlink = Anim.time + 2 + Math.random() * 4.5; }
    });
  });
  Object.keys(Anim.visuals).forEach(function (id) { if (!present[id]) delete Anim.visuals[id]; });
  return busy;
}

function spawnDust(x, y) {
  [-1, 1].forEach(function (sd) {
    for (var i = 0; i < 4; i++) {
      Anim.particles.push({ type: 'puff', x: x + sd * (14 + i * 5), y: y - 6 - Math.random() * 6, vx: sd * (50 + Math.random() * 60),
        vy: -12 - Math.random() * 18, life: 0, max: 0.4 + Math.random() * 0.2, size: 6 + Math.random() * 5 });
    }
  });
}
function spawnPlaceRays(x, y) { Anim.fxs.push({ type: 'rays', x: x, y: y, t: 0, max: 0.42, color: '#ffe14a' }); }
function spawnBang(x, y) { Anim.fxs.push({ type: 'bang', x: x, y: y, t: 0, max: 0.4 }); }
function spawnSparkles(x, y, n, colors) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 170;
    Anim.particles.push({ type: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0,
      max: 0.55 + Math.random() * 0.4, size: 4 + Math.random() * 5, color: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
  }
}
function spawnConfetti(n, y0) {
  var cols = ['#ff5a6e', '#ffd23f', '#5ad46a', '#4aa3ff', '#ff8ad0', '#b07cff'];
  for (var i = 0; i < (n || 90); i++) {
    Anim.particles.push({ type: 'confetti', x: Math.random() * LW, y: (y0 || -20) - Math.random() * 200, vx: (Math.random() - 0.5) * 60,
      vy: 120 + Math.random() * 160, life: 0, max: 3 + Math.random(), size: 5 + Math.random() * 5,
      color: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
  }
}

function updateParticles(dt) {
  var ps = Anim.particles;
  for (var i = ps.length - 1; i >= 0; i--) {
    var p = ps[i]; p.life += dt;
    if (p.life >= p.max) { ps.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'spark') { p.vy += 260 * dt; p.vx *= 0.98; p.rot += p.vr * dt; }
    else if (p.type === 'confetti') { p.rot += p.vr * dt; p.vx += Math.sin(Anim.time * 3 + i) * 20 * dt; }
    else if (p.type === 'z') { p.vx = Math.sin(p.life * 4 + p.size) * 12; }
    else if (p.type === 'puff') { p.vx *= 0.9; p.vy *= 0.95; }
  }
  for (var j = Anim.fxs.length - 1; j >= 0; j--) { Anim.fxs[j].t += dt; if (Anim.fxs[j].t >= Anim.fxs[j].max) Anim.fxs.splice(j, 1); }
}

function updateSeqs(game, dt) {
  for (var i = Anim.seqs.length - 1; i >= 0; i--) {
    var s = Anim.seqs[i]; s.t += dt;
    if (s.t > 0.8 && !s.cleared) {
      s.zt = (s.zt || 0) - dt;
      if (s.zt <= 0) {
        s.zt = 0.22;
        var cid = s.conts[Math.floor(Math.random() * s.conts.length)], c = CORE.getC(game.board, cid);
        if (c && c.cats.length) {
          var k = Math.floor(Math.random() * c.cats.length), pos = updateShelfLayout(game.board, c, k);
          Anim.particles.push({ type: 'z', x: pos.x + 14, y: pos.y - 66, vx: 0, vy: -26, life: 0, max: 0.9, size: 11 + Math.random() * 5 });
        }
      }
    }
    if (!s.cleared && s.t >= 1.45) {
      s.cleared = true;
      s.conts.forEach(function (cid) {
        var c = CORE.getC(game.board, cid), center = contPos(game.board, c);
        c.cats.forEach(function (cat, k) {
          var v = Anim.visuals[cat.id] || { x: center.x, y: center.y };
          Anim.flyers.push({ color: cat.color, x0: v.x, y0: v.y, x: v.x, y: v.y, t: -k * 0.07, dur: 0.62, pod: PODS[1] });
        });
        Anim.starFlyers.push({ x0: center.x, y0: center.y - 36, t: 0, dur: 0.8 });
        spawnSparkles(center.x, center.y - 30, 18, ['#fff59a', '#ffffff', '#ffd23f']);
        if (c.cats.length) { PODS[1].icon = c.cats[0].color; }
        game.completeShelf(cid);
      });
      Sound.pop();
    }
    if (s.t >= 2.2) { Anim.seqs.splice(i, 1); game.finishMatchSequence(); }
  }
}

function updateFlyers(dt) {
  for (var i = Anim.flyers.length - 1; i >= 0; i--) {
    var f = Anim.flyers[i]; f.t += dt;
    if (f.t < 0) continue;
    var u = clamp(f.t / f.dur, 0, 1), e = u * u * (3 - 2 * u);
    var cx = (f.x0 + f.pod.x) / 2 + (f.x0 < 270 ? -50 : 50), cy = f.y0 - 140;
    f.x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * f.pod.x;
    f.y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * (f.pod.y + 26);
    f.s = 1 - 0.65 * e; f.rot = Math.sin(u * Math.PI) * 0.5 * (f.x0 < 270 ? -1 : 1);
    if (u >= 1) {
      Anim.flyers.splice(i, 1); f.pod.bv = 9;
      spawnSparkles(f.pod.x, f.pod.y + 4, 6, ['#ffffff', '#fff59a', '#ff9ad5']);
    }
  }
  for (var j = Anim.starFlyers.length - 1; j >= 0; j--) {
    var s = Anim.starFlyers[j]; s.t += dt;
    var u2 = clamp(s.t / s.dur, 0, 1), e2 = easeInOut(u2);
    var tx = STAR_PILL.x - 48, ty = STAR_PILL.y;
    var c2x = (s.x0 + tx) / 2 - 40, c2y = Math.min(s.y0, ty) - 80;
    s.x = (1 - e2) * (1 - e2) * s.x0 + 2 * (1 - e2) * e2 * c2x + e2 * e2 * tx;
    s.y = (1 - e2) * (1 - e2) * s.y0 + 2 * (1 - e2) * e2 * c2y + e2 * e2 * ty;
    s.r = 14 + Math.sin(u2 * Math.PI) * 9;
    if (u2 >= 1) {
      Anim.starFlyers.splice(j, 1); Anim.displayStars++; Anim.starPillBounce = 1;
      Sound.tick();
      spawnSparkles(tx, ty, 8, ['#ffd23f', '#ffffff']);
    }
  }
  PODS.forEach(function (p) { var a = -120 * p.bounce - 9 * p.bv; p.bv += a * dt; p.bounce += p.bv * dt; });
}

