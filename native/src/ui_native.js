/* ===================== UI NATIVE: overlays, popups, touch press handling =====================
   Canvas UI that the native build adds on top of the prototype:
   - overlay panels while PAUSED: 'settings' (prototype) and 'rewards' (TikTok missions)
   - reward popup (coins granted by shortcut / revisit / share)
   - loading + fatal-error screens (no DOM on native)
   - press handling: buttons fire on release inside the same button
     (buttonStart / buttonMove / buttonEnd); board taps fire on touch start. */
var uiPanel = 'settings';
var winDoubled = false;        // 'Double Coin' taken on the current Level Complete panel
var winBonus = 0;              // coins that ad gave (from HS, never typed)
var boostTaken = false;        // R5 taken for the current level
var levelStartT = 0;           // Anim.time when the level was loaded (R5 chip shows for a few seconds)
function bedCount() { return game.board.containers.filter(function (c) { return c.kind === 'bed'; }).length; }
var gfxFlat = true;           // Settings → Graphics: Flat draws gradients as solid colours (saved)
var rewardPopup = null;          // { title, coins, t }

function openPanel(name) { if (game.pause()) { uiPanel = name; devResult = null; } else if (game.state === S.PAUSED) uiPanel = name; }

function drawOverlayPanel(g) {
  if (uiPanel.indexOf('pop_') === 0) drawMiniPopup(uiPanel);
  else if (uiPanel === 'rewards') drawRewardsPanel(g);
  else if (uiPanel === 'rescue') drawRescuePanel(g);
  else drawSettings(g);
}

/* ---------- ads UI ---------- */
// small "play" triangle used on ad buttons
function drawPlayIcon(x, y, r, col) {
  ctx.fillStyle = col || '#ffffff';
  ctx.beginPath(); ctx.moveTo(x - r * 0.55, y - r * 0.75); ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x - r * 0.55, y + r * 0.75); ctx.closePath(); ctx.fill();
}
function adButton(id, label, x, y, w, h, colors, size) {
  var fs = size || 20;
  uiButton(id, '', x, y, w, h, colors, fs);                       // body + hit area, no text
  var isP = pressed.id === id && Anim.time - pressed.t < 0.15, s = isP ? 0.95 : 1;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
  ctx.font = '900 ' + fs + 'px ' + FONT;
  var r = fs * 0.62, gap = fs * 0.35, tw = ctx.measureText(label).width, total = r * 2 + gap + tw;
  var ix = -total / 2 + r;
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(ix, 1, r, 0, Math.PI * 2); ctx.fill();
  drawPlayIcon(ix + r * 0.12, 1, r * 0.62);
  text(label, ix + r + gap + tw / 2, 1, fs, '#ffffff', 'rgba(0,0,0,0.35)', 4);
  ctx.restore();
}
function drawRescuePanel(g) {
  ctx.fillStyle = 'rgba(10,20,50,0.55)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  var x = 70, y = 300, w = 400, h = 360;
  drawPanel(x, y, w, h, 'Out of moves!');
  drawCatSprite('blue', 'sad', 270, y + 150, 1, 1, 0, 1, null, 96);
  text('Get +1 bed and +1 shuffle to keep going', x + w / 2, y + 178, 16, '#7a4410');
  var by = y + 204;
  if (Ads.rewardReady('Rescue')) { adButton('rescue_ad', 'Rescue me', x + 60, by, w - 120, 60, ORANGE, 22); by += 74; }
  if (g.history.length) { uiButton('rescue_undo', 'Undo last move', x + 90, by, w - 180, 46, BLUE, 18); by += 56; }
  uiButton('restart', 'Restart level', x + 90, by, w - 180, 46, GREY, 18);
}
function drawBoostChip() {
  if (!ADS.levelBoost || boostTaken || game.state !== S.READY || game.moves > 0) return;
  if (game.levelIndex < ADS.levelBoost.minLevel || Anim.time - levelStartT > 12 || bedCount() >= 3) return;
  if (!Ads.rewardReady(ADS.levelBoost.label)) return;
  var bob = Math.sin(Anim.time * 4) * 3;
  adButton('boost_ad', 'Start with +1 Bed', 150, 700 + bob, 240, 46, ORANGE, 17);
}
function drawPodBadge() {
  if (!Ads.rewardReady('Gift Pod') && Ads.provider === 'none') return;
  var p = PODS[2], cd = Ads.rewardCooldown('Gift Pod');
  if (cd > 0) {
    ctx.fillStyle = 'rgba(30,20,70,0.75)'; rr(ctx, p.x - 26, p.y + 30, 52, 22, 11); ctx.fill();
    var s = Math.ceil(cd); text(Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2), p.x, p.y + 41, 13, '#ffffff');
  } else if (Ads.rewardReady('Gift Pod')) {
    if (Math.sin(Anim.time * 5) > 0.6 && p.bounce < 0.2) p.bv += 2.5;          // gentle "tap me" hop
    ctx.fillStyle = 'rgb(255,214,64)'; rr(ctx, p.x - 30, p.y + 30, 60, 22, 11); ctx.fill();
    ctx.strokeStyle = '#b06a00'; ctx.lineWidth = 2; ctx.stroke();
    var gc = HS.amount('Gift Pod', 'coins'); if (gc) text('+' + gc, p.x, p.y + 41, 14, '#7a3d00');
  }
}
// "Ad break" notice before an interstitial + dim screen while an ad is up (device ads cover the screen anyway)
function drawAdOverlay() {
  var n = Ads.notice;
  if (n) {
    ctx.fillStyle = 'rgba(10,20,50,0.45)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
    ctx.fillStyle = 'rgb(255,255,255)'; rr(ctx, 150, 430, 240, 70, 35); ctx.fill();
    ctx.strokeStyle = '#7442d8'; ctx.lineWidth = 4; ctx.stroke();
    text('Ad break', 270, 466, 26, '#5b2db0');
  } else if (Ads.showing) {
    ctx.fillStyle = 'rgba(10,15,40,0.8)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
    text('Ad playing…', 270, 470, 22, '#ffffff');
  }
  if (Platform.debug) {
    var st = Ads.sessionTime(), m = Math.floor(st / 60), sec = Math.floor(st % 60);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, 6, 104, 176, 24, 8); ctx.fill();
    text('ads ' + Ads.impressions() + ' · ' + m + ':' + ('0' + sec).slice(-2) + ' · ' + Ads.provider, 94, 116, 13, '#9f9', null, 0);
  }
}

function drawCoin(x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = lin(y - r, y + r, ['#ffe96e', '#f2a20f']); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = '#cf7d06'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fillStyle = lin(y - r, y + r, ['#ffd23f', '#f5b21a']); ctx.fill();
  ctx.fillStyle = '#e0850a'; pawPath(x, y + r * 0.04, r * 0.38); ctx.fill();
}

function drawRewardsPanel(g) {
  ctx.fillStyle = 'rgba(10,20,50,0.55)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  var x = 50, y = 200, w = 440, h = 560;
  drawPanel(x, y, w, h, 'Free Coins');
  uiButton('close', '✕', x + w - 44, y + 18, 36, 36, ['#ff8a8a', '#d83a3a'], 18);
  var rows = Minis.rows();
  if (Ads.provider !== 'none') rows.unshift({ id: 'gift', title: 'Watch a video', coins: HS.amount('Gift Pod', 'coins'), ad: true,
    done: false, available: true, cta: Ads.rewardCooldown('Gift Pod') > 0 ? Math.ceil(Ads.rewardCooldown('Gift Pod')) + 's' : 'Watch' });
  rows.forEach(function (row, i) {
    var ry = y + 62 + i * 112;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; rr(ctx, x + 22, ry, w - 44, 96, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(201,137,60,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    text(row.title, x + 40, ry + 30, 16, '#5b2d0b', null, 0, 'left');
    drawCoin(x + 56, ry + 66, 15);
    text('+' + row.coins, x + 80, ry + 67, 20, '#c26a08', null, 0, 'left');
    var bw = 116, bx = x + w - 40 - bw, by = ry + 44;
    if (row.done) {
      text(row.id === 'share' ? 'Come back tomorrow' : 'Claimed ✓', bx + bw / 2 - 6, by + 22, 14, '#2f8a3a');
    } else if (row.ad) {
      if (Ads.rewardReady('Gift Pod')) adButton('gift_ad', row.cta, bx, by, bw, 42, ORANGE, 17); else uiButton('gift_ad', row.cta, bx, by, bw, 42, GREY, 17);
    } else if (!row.available) {
      uiButton('na_' + row.id, 'Not here', bx, by, bw, 42, GREY, 15);
    } else {
      uiButton('mission_' + row.id, row.cta, bx, by, bw, 42, row.id === 'share' ? BLUE : GREEN, 18);
    }
  });
  text('Missions need TikTok 41.0 or newer', x + w / 2, y + h - 28, 13, 'rgba(122,68,16,0.75)');
}

function drawRewardPopup() {
  var p = rewardPopup; if (!p) return;
  var a = clamp(p.t / 0.2, 0, 1), sc = easeOutBack(clamp(p.t / 0.35, 0, 1));
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,20,50,0.6)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  ctx.translate(270, 470); ctx.scale(sc, sc); ctx.translate(-270, -470);
  ctx.save(); ctx.translate(270, 430); ctx.rotate(Anim.time * 0.5);
  for (var r = 0; r < 12; r++) {
    ctx.fillStyle = r % 2 ? 'rgba(255,230,120,0.3)' : 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 150, r * Math.PI / 6, (r + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  drawPanel(110, 350, 320, 250, p.title);
  drawCoin(270, 440, 40 + Math.sin(Anim.time * 5) * 2);
  text('+' + p.coins + ' coins', 270, 506, 26, '#c26a08', '#fff6dc', 5);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = a; ctx.translate(270, 470); ctx.scale(sc, sc); ctx.translate(-270, -470);
  uiButtonsScaledAt(sc, 270, 470, function () { uiButton('collect', 'Collect', 175, 530, 190, 54, GREEN, 22); });
  ctx.restore();
}
function uiButtonsScaledAt(sc, cx, cy, fn) {
  var before = uiButtons.length; fn();
  for (var i = before; i < uiButtons.length; i++) {
    var b = uiButtons[i];
    b.x = cx + (b.x - cx) * sc; b.y = cy + (b.y - cy) * sc; b.w *= sc; b.h *= sc;
  }
}

/* ---------- loading / error screens (before the game exists) ---------- */
/* ---------- loading screen: designer art (ui/loading.jpg, main package) + live progress bar ---------- */
var LOAD_IMG = null;
function loadLoadingArt() {
  Platform.loadImage(UI_ATLAS.loading.image, function (err, img) { if (!err) LOAD_IMG = img; else Platform.warn('loading art', err); });
}
function drawLoading(progress, label) {
  resizeIfNeeded();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  var W = view.W, H = view.H, L = UI_ATLAS.loading;
  if (!LOAD_IMG) {                                         // first frames, before the art decodes
    ctx.fillStyle = '#4d8be8'; ctx.fillRect(0, 0, W, H);
    return;
  }
  var s = Math.max(W / L.w, H / L.h), dx = (W - L.w * s) / 2, dy = (H - L.h * s) / 2;   // cover
  ctx.drawImage(LOAD_IMG, 0, 0, L.w, L.h, dx, dy, L.w * s, L.h * s);
  // progress bar in the art's own spot and style: white rim, navy track, blue fill, paw knob
  var bx = dx + L.bar[0] * s, by = dy + L.bar[1] * s, bw = (L.bar[2] - L.bar[0]) * s, bh = (L.bar[3] - L.bar[1]) * s;
  var p = clamp(progress, 0, 1), r = bh / 2;
  ctx.fillStyle = 'rgba(60,40,20,0.25)'; rr(ctx, bx, by + bh * 0.16, bw, bh, r); ctx.fill();
  ctx.fillStyle = '#ffffff'; rr(ctx, bx, by, bw, bh, r); ctx.fill();
  var ins = bh * 0.14;
  ctx.fillStyle = '#26418f'; rr(ctx, bx + ins, by + ins, bw - ins * 2, bh - ins * 2, r - ins); ctx.fill();
  var fw = Math.max(bh - ins * 2, (bw - ins * 2) * p);
  ctx.fillStyle = '#3aa7f5'; rr(ctx, bx + ins, by + ins, fw, bh - ins * 2, r - ins); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; rr(ctx, bx + ins + 6, by + ins + 3, Math.max(0, fw - 12), (bh - ins * 2) * 0.32, (bh - ins * 2) * 0.16); ctx.fill();
  var kx = bx + ins + fw, ky = by + bh / 2, kr = bh * 0.72;
  ctx.fillStyle = 'rgba(40,40,90,0.25)'; ctx.beginPath(); ctx.arc(kx, ky + 3, kr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#d6e2ff'; ctx.stroke();
  ctx.fillStyle = '#ff86b8'; pawPath(kx, ky + kr * 0.05, kr * 0.62); ctx.fill();
  // "Loading..." is part of the art; the build line sits small at the very bottom
  ctx.font = '700 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(90,50,20,0.55)'; ctx.fillText('v' + VERSION + ' · ' + BUILD, W / 2, H - 14);
}
function drawFatal(msg) {
  try {
    ctx.setTransform(view.dpr || 1, 0, 0, view.dpr || 1, 0, 0);
    ctx.fillStyle = '#2f5fae'; ctx.fillRect(0, 0, view.W || 400, view.H || 800);
    setLogical();
    text('Oops! Something went wrong', 270, 440, 24, '#ffffff', '#1d3f8f', 5);
    var words = String(msg).slice(0, 160).split(' '), line = '', ly = 490;
    ctx.font = '700 15px ' + FONT;
    words.forEach(function (wd) {
      if (ctx.measureText(line + wd).width > 440) { text(line, 270, ly, 15, 'rgba(255,255,255,0.85)'); line = ''; ly += 22; }
      line += wd + ' ';
    });
    text(line, 270, ly, 15, 'rgba(255,255,255,0.85)');
    text('Close and reopen the game', 270, ly + 50, 17, '#ffe96e');
  } catch (e) {}
}
var _lastSize = '';
function resizeIfNeeded() {
  var key = Platform.info.W + 'x' + Platform.info.H;
  if (key !== _lastSize || !view.W) { _lastSize = key; resize(); }
}

/* ---------- touch → press handling ---------- */
var touchState = { id: null, btn: null, sx: 0, sy: 0 };
function buttonStart(x, y) {
  var h = hitTest(x, y);
  if (h.type === 'button') {
    touchState.btn = h.id; pressed.id = h.id; pressed.t = Anim.time + 10;   // stays pressed while held
    return;
  }
  touchState.btn = null;
  if (rewardPopup) return;                       // modal: only its button works
  tapBoard(h);
}
function buttonMove(x, y) {
  if (!touchState.btn) return;
  var h = hitTest(x, y);
  if (h.type !== 'button' || h.id !== touchState.btn) { pressed.t = Anim.time - 1; touchState.btn = null; }
}
function buttonEnd(x, y) {
  var id = touchState.btn; touchState.btn = null;
  if (!id) return;
  pressed.id = id; pressed.t = Anim.time;        // short release animation
  var h = hitTest(x, y);
  if (h.type === 'button' && h.id === id) onButton(id);
}

/* ---------- TikTok minis: 3 buttons on the play screen + their 3 popups ----------
   Art from assets_src/ui (cut by tools/prepare_ui.py into res/ui.png). Amounts are NOT baked:
   they come from the HS reward table (HS.amount) so the dashboard can change them. */
var UI_IMG = null, popT = 0;
var MINI_BTNS = [
  { id: 'mini_shortcut', frame: 'btn_shortcut', pop: 'pop_launch', x: 40,  y: 130, w: 68 },
  { id: 'mini_profile',  frame: 'btn_profile',  pop: 'pop_entry',  x: 110, y: 130, w: 60 },
  { id: 'mini_share',    frame: 'btn_share',    pop: 'pop_share',  x: 500, y: 130, w: 60 }
];
var MINI_POPS = {
  pop_entry:  { title: 'Entry Reward',  key: 'tiktok_profile',  cta: 'Claim', colors: ['#ffe066', '#f7a600'], act: 'profile' },
  pop_launch: { title: 'Launch Reward', key: 'tiktok_shortcut', cta: 'Go',    colors: ['#ffe066', '#f7a600'], act: 'shortcut' },
  pop_share:  { title: 'Share Rewards', key: 'share',           cta: 'Share', colors: ['#8ff06b', '#2fae32'], act: 'share' }
};
function miniVisible(b) {
  if (b.id === 'mini_shortcut') return HSMinis.supported('shortcut') && !HSMinis.done('shortcut');
  if (b.id === 'mini_profile') return HSMinis.supported('profile') && !HSMinis.done('profile');
  return HSMinis.canShare() && HSMinis.shareAvailable();        // back every day while the daily reward is open
}
function uiFrame(name) { return UI_ATLAS.frames[name]; }
function drawMiniButtons(g) {
  if (!UI_IMG || g.state === S.PAUSED || g.state === S.LEVEL_COMPLETE) return;
  MINI_BTNS.forEach(function (b, i) {
    if (!miniVisible(b)) return;
    var f = uiFrame(b.frame), w = b.w, h = f.h * w / f.w;
    var isP = pressed.id === b.id && Anim.time - pressed.t < 0.15;
    var wob = Math.max(0, Math.sin(Anim.time * 2.2 - i * 0.9)); wob = wob > 0.96 ? Math.sin((wob - 0.96) * 80) * 0.06 : 0;   // a little "tap me" wiggle now and then
    var sc = isP ? 0.92 : 1;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(wob); ctx.scale(sc, sc);
    ctx.drawImage(UI_IMG, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h);
    ctx.restore();
    uiButtons.push({ id: b.id, x: b.x - w / 2, y: b.y - h / 2, w: w, h: h });
  });
}
function openMiniPopup(name) {
  if (game.state === S.PAUSED) uiPanel = name; else if (game.pause()) uiPanel = name; else return;
  popT = Anim.time;
}
function drawMiniPopup(name) {
  var P = MINI_POPS[name], f = uiFrame(name); if (!P || !f || !UI_IMG) return;
  ctx.fillStyle = 'rgba(10,20,50,0.6)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  var CW = 380, k = CW / f.w, ch = f.h * k, PW = CW + 44, HH = 76, CTA = 64;
  var PH = HH + 12 + ch + 18 + CTA + 26, x0 = (LW - PW) / 2, y0 = Math.max(70, (LH - PH) / 2 + 10);
  var t = clamp((Anim.time - popT) / 0.28, 0, 1), sc = easeOutBack(t);
  ctx.save(); ctx.translate(LW / 2, y0 + PH / 2); ctx.scale(sc, sc); ctx.translate(-LW / 2, -(y0 + PH / 2));
  // frame
  ctx.fillStyle = 'rgba(20,10,30,0.35)'; rr(ctx, x0, y0 + 10, PW, PH, 30); ctx.fill();
  ctx.fillStyle = '#5b2a14'; rr(ctx, x0, y0, PW, PH, 30); ctx.fill();
  ctx.fillStyle = 'rgb(254,243,219)'; rr(ctx, x0 + 6, y0 + 6, PW - 12, PH - 12, 25); ctx.fill();
  // pink header (the art's style)
  ctx.fillStyle = '#f590a8'; rr(ctx, x0 + 6, y0 + 6, PW - 12, HH, 25); ctx.fill();
  ctx.fillRect(x0 + 6, y0 + 6 + HH - 26, PW - 12, 26);
  ctx.fillStyle = '#fbb6c6'; rr(ctx, x0 + 16, y0 + 12, PW - 32, 22, 11); ctx.fill();
  text(P.title, LW / 2, y0 + 6 + HH / 2 + 2, 34, '#ffffff', '#a3264b', 7);
  // illustration + live amount over the coin pile
  var cx = x0 + 22, cy = y0 + 6 + HH + 12;
  ctx.drawImage(UI_IMG, f.x, f.y, f.w, f.h, cx, cy, CW, ch);
  var amt = HS.amount(P.key, 'coins');
  if (amt) text('x' + amt, cx + f.amount[0] * k, cy + f.amount[1] * k, f.amountSize * k, '#ffffff', '#4a2208', Math.max(4, f.amountSize * k * 0.2));
  ctx.restore();
  // buttons (hit areas follow the same scale)
  var scaled = function (fn) { uiButtonsScaledAt(sc, LW / 2, y0 + PH / 2, fn); };
  ctx.save(); ctx.translate(LW / 2, y0 + PH / 2); ctx.scale(sc, sc); ctx.translate(-LW / 2, -(y0 + PH / 2));
  scaled(function () {
    uiButton('pop_cta', P.cta, LW / 2 - 140, cy + ch + 18, 280, CTA, P.colors, 30);
    if (f.go) uiButtons.push({ id: 'pop_cta', x: cx + f.go[0] * k, y: cy + f.go[1] * k, w: (f.go[2] - f.go[0]) * k, h: (f.go[3] - f.go[1]) * k });   // the "Go" drawn in step 1
    // round red close button on the corner, like the art
    var bx = x0 + PW - 12, byy = y0 + 10, br = 27, isP = pressed.id === 'pop_close' && Anim.time - pressed.t < 0.15;
    ctx.save(); ctx.translate(bx, byy); if (isP) ctx.scale(0.92, 0.92);
    ctx.fillStyle = '#7a1020'; ctx.beginPath(); ctx.arc(0, 3, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ef3b4b'; ctx.beginPath(); ctx.arc(0, 0, br - 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
    ctx.restore();
    uiButtons.push({ id: 'pop_close', x: bx - br - 4, y: byy - br - 4, w: (br + 4) * 2, h: (br + 4) * 2 });
  });
  ctx.restore();
}
