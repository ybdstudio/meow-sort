/* ===================== INPUT MANAGER ===================== */
function hitTest(x, y) {
  var i, b;
  if (rewardPopup) {                                   // modal popup: only "Collect"
    for (i = uiButtons.length - 1; i >= 0; i--) {
      b = uiButtons[i];
      if (b.id === 'collect' && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { type: 'button', id: b.id };
    }
    return { type: 'none' };
  }
  for (i = uiButtons.length - 1; i >= 0; i--) {
    b = uiButtons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { type: 'button', id: b.id };
  }
  if (game.state === S.PAUSED || game.state === S.LEVEL_COMPLETE) return { type: 'none' };
  var s = BTN.settings; if (Math.hypot(x - s.x, y - s.y) <= s.r + 8) return { type: 'button', id: 'settings' };
  if (Math.hypot(x - (COIN_PILL.x + 52), y - (COIN_PILL.y + 12)) <= 24 || (x >= COIN_PILL.x - 74 && x <= COIN_PILL.x + 64 && Math.abs(y - COIN_PILL.y) <= 26))
    return { type: 'button', id: 'rewards' };       // coin pill / "+" opens Free Coins
  var keys = ['undo', 'shuffle', 'bed'];
  for (i = 0; i < keys.length; i++) {
    b = BTN[keys[i]];
    if (Math.abs(x - b.x) <= b.w / 2 + 4 && y >= b.y - b.h / 2 - 4 && y <= b.y + b.h / 2 + 12) return { type: 'button', id: keys[i] };
  }
  var board = game.board, best = null, bestD = 1e9;
  board.containers.forEach(function (c) {
    c.cats.forEach(function (cat, k) {
      var p = updateShelfLayout(board, c, k);
      if (x >= p.x - CAT_W / 2 && x <= p.x + CAT_W / 2 && y >= p.y - 74 && y <= p.y + 6) {
        var d = Math.abs(x - p.x); if (d < bestD) { bestD = d; best = { type: 'cat', contId: c.id, idx: k }; }
      }
    });
  });
  if (best) return best;
  for (i = 0; i < board.containers.length; i++) {
    var c = board.containers[i];
    if (c.kind === 'shelf') {
      var sp = shelfSpan(c.side), yy = ROW_Y[c.row];
      if (x >= Math.max(0, sp.x0) && x <= Math.min(LW, sp.x1) && y >= yy - 80 && y <= yy + 22) return { type: 'container', contId: c.id };
    } else {
      var p = contPos(board, c);
      if (Math.abs(x - p.x) <= 60 && y >= p.y - 72 && y <= p.y + 40) return { type: 'container', contId: c.id };
    }
  }
  return { type: 'none' };
}

// Immediate tap (used by the dev/test API). Real touches go through buttonStart/End.
function handleTap(x, y) {
  var h = hitTest(x, y);
  if (h.type === 'button') { pressed.id = h.id; pressed.t = Anim.time; onButton(h.id); return; }
  if (rewardPopup) return;
  tapBoard(h);
}
function tapBoard(h) {
  if (!game.inputOpen()) return;
  if (game.state === S.READY) {
    if (h.type === 'cat') game.selectCat(h.contId, h.idx);
    return;
  }
  var target = h.type === 'cat' || h.type === 'container' ? h.contId : null;
  if (!target) { game.deselect(); return; }
  if (target === game.sel.contId) {
    if (h.type === 'cat') game.selectCat(h.contId, h.idx); else game.deselect();
    return;
  }
  var res = game.canMove(game.sel.contId, game.selectedIndex(), target);
  if (!res.ok && h.type === 'cat' && res.reason === 'full') {
    var tc = CORE.getC(game.board, h.contId);
    if (game.isPickable(tc, h.idx)) {                    // switch selection to that shelf's outer cat(s)
      game.sel = null; game.state = S.READY; game.selectCat(h.contId, h.idx);
      return;
    }
  }
  game.selectShelf(target);
}

function onButton(id) {
  Sound.click();
  if (id === 'collect') { rewardPopup = null; return; }
  if (id === 'settings') { openPanel('settings'); return; }
  if (id === 'rewards') { openPanel('rewards'); return; }
  if (id.indexOf('mission_') === 0) { Minis.start(id.slice(8)); return; }
  if (id.indexOf('na_') === 0) { fx.toast('Not available on this TikTok version'); return; }
  if (id === 'undo') { if (!game.undoMove()) { Sound.invalid(); fx.toast(game.history.length ? '' : 'Nothing to undo'); } return; }
  if (id === 'shuffle') { if (!game.shuffle() && game.boosters.shuffle <= 0) fx.toast('Shuffle already used'); return; }
  if (id === 'bed') { if (!game.addBed()) fx.toast('Extra bed already used'); return; }
  if (id === 'close' || id === 'resume') { game.resume(); uiPanel = 'settings'; return; }
  if (id === 'restart') { game.restartLevel(); return; }
  if (id === 'sound') { Sound.on = !Sound.on; saveProgress(); return; }
  if (id === 'gfx') { gfxFlat = !gfxFlat; Platform.setFlatGraphics(gfxFlat); saveProgress(); return; }
  if (id.indexOf('level') === 0) { game.loadLevel(parseInt(id.slice(5), 10)); return; }
  if (id === 'verify') {
    var r = CORE.verifyAllLevels();
    devResult = r.map(function (o) { return 'L' + o.level + ' [' + o.rule + '] ' + (o.valid ? 'valid' : 'INVALID') + ', ' + (o.solved ? 'solved in ' + o.solutionMoves + ' moves' : 'NOT solved') + ' (' + o.nodes + ' nodes)'; });
    Platform.log(JSON.stringify(r));
    return;
  }
  if (id === 'next') { if (game.levelIndex + 1 >= GAME_CONFIG.maxLevel) { fx.toast('You finished every level!'); return; } game.nextLevel(); return; }
  if (id === 'replay') { game.restartLevel(); return; }
}

