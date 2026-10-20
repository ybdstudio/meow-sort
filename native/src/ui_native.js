/* ===================== UI NATIVE: overlays, popups, touch press handling =====================
   Canvas UI that the native build adds on top of the prototype:
   - overlay panels while PAUSED: 'settings' (prototype) and 'rewards' (TikTok missions)
   - reward popup (coins granted by shortcut / revisit / share)
   - loading + fatal-error screens (no DOM on native)
   - press handling: buttons fire on release inside the same button
     (buttonStart / buttonMove / buttonEnd); board taps fire on touch start. */
var uiPanel = 'settings';
var rewardPopup = null;          // { title, coins, t }

function openPanel(name) { if (game.pause()) { uiPanel = name; devResult = null; } else if (game.state === S.PAUSED) uiPanel = name; }

function drawOverlayPanel(g) {
  if (uiPanel === 'rewards') drawRewardsPanel(g); else drawSettings(g);
}

function drawCoin(x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = lin(y - r, y + r, ['#ffe96e', '#f2a20f']); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.12); ctx.strokeStyle = '#cf7d06'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fillStyle = lin(y - r, y + r, ['#ffd23f', '#f5b21a']); ctx.fill();
  ctx.fillStyle = '#e0850a'; pawPath(x, y + r * 0.04, r * 0.38); ctx.fill();
}

function drawRewardsPanel(g) {
  ctx.fillStyle = 'rgba(10,20,50,0.55)'; ctx.fillRect(-300, -300, LW + 600, LH + 600);
  var x = 50, y = 230, w = 440, h = 470;
  drawPanel(x, y, w, h, 'Free Coins');
  uiButton('close', '✕', x + w - 44, y + 18, 36, 36, ['#ff8a8a', '#d83a3a'], 18);
  var rows = Minis.rows();
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
function drawLoading(progress, label) {
  resizeIfNeeded();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  var gr = ctx.createLinearGradient(0, 0, 0, view.H);
  gr.addColorStop(0, '#2c5fd3'); gr.addColorStop(1, '#2a56c0');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, view.W, view.H);
  setLogical();
  ctx.fillStyle = 'rgba(160,200,255,0.25)'; pawPath(270, 380, 60); ctx.fill();
  text(GAME_NAME, 270, 500, 46, '#ffffff', '#1d3f8f', 8);
  ctx.fillStyle = 'rgba(10,30,90,0.45)'; rr(ctx, 120, 560, 300, 22, 11); ctx.fill();
  ctx.fillStyle = lin(560, 582, ['#ffe96e', '#f2a20f']); rr(ctx, 122, 562, Math.max(18, 296 * clamp(progress, 0, 1)), 18, 9); ctx.fill();
  text(label || 'Loading…', 270, 610, 17, 'rgba(255,255,255,0.9)');
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
