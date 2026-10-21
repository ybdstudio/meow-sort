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
  var vp = PODS[2]; if (Math.hypot(x - vp.x, y - vp.y) <= 42) return { type: 'button', id: 'pod_video' };   // video pod → R4
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
  if (Ads.showing) return;
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
  if (id === 'shuffle') {
    if (game.boosters.shuffle > 0) { game.shuffle(); return; }
    if (!game.inputOpen()) return;
    if (!Ads.rewardReady('Shuffle')) { fx.toast('Shuffle already used'); return; }
    Ads.reward('Shuffle', function () { if (!game.shuffle()) fx.toast('Shuffle saved for later'); });   // +1 shuffle came via hsOnGive
    return;
  }
  if (id === 'bed') {
    if (bedCount() >= 3) { fx.toast('All beds are out'); return; }
    if (game.boosters.bed > 0) { game.addBed(); return; }
    if (!game.inputOpen()) return;
    if (!Ads.rewardReady('Extra Bed')) { fx.toast('Extra bed already used'); return; }
    Ads.reward('Extra Bed', function () { game.addBed(); });                                         // +1 bed came via hsOnGive
    return;
  }
  if (id === 'ad_double') {
    if (winDoubled) return;
    Ads.reward('Double Coin', function (r) { winDoubled = true; winBonus = r.coins || 0; if (winBonus) fx.rewardPopup('Double Coins!', winBonus); });
    return;
  }
  if (id === 'pod_video' || id === 'gift_ad') {
    if (!Ads.rewardReady('Gift Pod')) { var cd = Ads.rewardCooldown('Gift Pod'); fx.toast(cd > 0 ? 'Next gift in ' + Math.ceil(cd) + 's' : 'No video available right now'); return; }
    Ads.reward('Gift Pod', function (r) { if (r.coins) fx.rewardPopup('Gift Pod!', r.coins); });
    return;
  }
  if (id === 'boost_ad') {
    Ads.reward(ADS.levelBoost.label, function () { boostTaken = true; game.addBed(); fx.toast('Extra bed ready!'); });
    return;
  }
  if (id === 'rescue_ad') {
    Ads.reward('Rescue', function () {                 // +1 shuffle +1 bed came via hsOnGive
      game.resume(); uiPanel = 'settings';
      if (bedCount() < 3) game.addBed();
      fx.toast('Rescued! +1 bed and +1 shuffle', 2.2);
    });
    return;
  }
  if (id === 'rescue_undo') { game.resume(); uiPanel = 'settings'; game.undoMove(); return; }
  if (id === 'close' || id === 'resume') { var wasPanel = uiPanel; game.resume(); uiPanel = 'settings'; if (wasPanel === 'settings' || wasPanel === 'rewards') Ads.tryInter('I_panel'); return; }
  if (id === 'mini_shortcut' || id === 'mini_profile' || id === 'mini_share') {
    for (var mi = 0; mi < MINI_BTNS.length; mi++) if (MINI_BTNS[mi].id === id) openMiniPopup(MINI_BTNS[mi].pop);
    return;
  }
  if (id === 'pop_close') { game.resume(); uiPanel = 'settings'; return; }
  if (id === 'pop_cta') { var mp = MINI_POPS[uiPanel]; if (mp) Minis.act(mp.act); return; }
  if (id === 'restart') { uiPanel = 'settings'; Ads.tryInter('I_restart', function () { game.restartLevel(); }); return; }
  if (id === 'sound') { Sound.on = !Sound.on; saveProgress(); return; }
  if (id.indexOf('level') === 0) { var li = parseInt(id.slice(5), 10); uiPanel = 'settings'; Ads.tryInter('I_select', function () { game.loadLevel(li); }); return; }
  if (id === 'verify') {
    var r = CORE.verifyAllLevels();
    devResult = r.map(function (o) { return 'L' + o.level + ' [' + o.rule + '] ' + (o.valid ? 'valid' : 'INVALID') + ', ' + (o.solved ? 'solved in ' + o.solutionMoves + ' moves' : 'NOT solved') + ' (' + o.nodes + ' nodes)'; });
    Platform.log(JSON.stringify(r));
    return;
  }
  if (id === 'next') {
    if (game.levelIndex + 1 >= GAME_CONFIG.maxLevel) { fx.toast('You finished every level!'); return; }
    if (winDoubled) { game.nextLevel(); return; }                 // just watched a rewarded ad: no interstitial
    Ads.tryInter('I_next', function () { game.nextLevel(); }); return;
  }
  if (id === 'replay') { Ads.tryInter('I_restart', function () { game.restartLevel(); }); return; }
}

