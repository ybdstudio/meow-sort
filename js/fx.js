/* ===================== PRESENTATION HOOKS (fx) ===================== */
var game;
var fx = {
  onLoad: function () {
    Anim.reset(); Anim.displayStars = game.stars; Anim.hintMove = null;
    PODS[1].icon = 'red'; PODS[1].mood = 'determined';
    saveProgress(); computeHint();
  },
  onSelect: function (catId) {
    Sound.select();
    var v = Anim.visuals[catId];
    if (v) { v.sq = 0.18; v.sqv = 0; spawnBang(v.x, v.y - 74); }
  },
  onDeselect: function () {},
  onInvalid: function (catId, dstId, reason) {
    Sound.invalid();
    var v = Anim.visuals[catId]; if (v) { v.shake = 0.4; v.wiggle = 0.5; setMood(v, 'squint', 0.55); }
    Anim.contShake[dstId] = 0.35;
    var c = CORE.getC(game.board, dstId);
    if (c) c.cats.forEach(function (k) { var vv = Anim.visuals[k.id]; if (vv) { vv.shake = 0.35; setMood(vv, 'determined', 0.5); } });
    var msg = { full: 'This spot is full!', locked: 'That shelf is complete', blocked: 'Pick the outermost cat first!', same: '' }[reason];
    if (msg) fx.toast(msg);
  },
  onBlocked: function (catId, contId) {
    Sound.invalid();
    var v = Anim.visuals[catId]; if (v) { v.shake = 0.4; v.wiggle = 0.5; setMood(v, 'squint', 0.55); }
    var c = CORE.getC(game.board, contId);
    if (c && c.cats.length) {                       // the outer cat bobs to show which one can move
      var ov = Anim.visuals[c.cats[c.cats.length - 1].id]; if (ov) { ov.hop = 0.001; spawnBang(ov.x, ov.y - 74); }
    }
    fx.toast('Pick the outermost cat first!');
  },
  onMove: function (ids) {
    Anim.hintMove = null;
    (ids || []).forEach(function (id, k) { Anim.jumpDelay[id] = k * 0.11; });   // group: cats hop one after another
  },
  onMatch: function (ids) {
    Anim.seqs.push({ conts: ids, t: 0, cleared: false }); Sound.match(); Platform.vibrate(false);
    ids.forEach(function (id) {
      var c = CORE.getC(game.board, id), p = contPos(game.board, c);
      spawnSparkles(p.x, p.y - 40, 22, ['#ffe14a', '#ffffff', '#ffb2e6', '#8fe36f']);
    });
  },
  onReady: function () { computeHint(); saveProgress(); },
  onUndo: function () { Anim.displayStars = game.stars; Anim.hintMove = null; },
  onShuffle: function () { Anim.hintMove = null; },
  onBedAdded: function () { Sound.pop(); },
  onNoMoves: function () {
    fx.toast('No moves left — try Undo or Restart', 3); Sound.sad();
    Object.keys(Anim.visuals).forEach(function (id) { setMood(Anim.visuals[id], 'sad', 2.6); });
  },
  onWin: function () { Anim.winT = 0; Sound.win(); Platform.vibrate(false); spawnConfetti(); saveProgress(true); },
  toast: function (msg, dur) { Anim.toastMsg = { text: msg, t: 0, dur: dur || 1.6 }; },
  rewardPopup: function (title, coins) { rewardPopup = { title: title, coins: coins, t: 0 }; spawnSparkles(270, 440, 26, ['#ffe14a', '#ffffff', '#ffb2e6']); },
  vibrate: function (long) { Platform.vibrate(long); }
};
function computeHint() {
  Anim.hintMove = null;
  if (game.levelIndex === 0 && game.moves < 6 && game.inputOpen()) Anim.hintMove = game.hint();
}

