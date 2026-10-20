/* ===================== DEV / TEST API =====================
   Exposed as GameGlobal.MeowSort (window.MeowSort in the emulator) for automated tests. */
var MeowSort = Platform.global.MeowSort = {
  ready: false, version: VERSION, platform: Platform,
  core: CORE, get game() { return game; }, S: S, anim: Anim, pods: PODS, sprites: SPRITES,
  verifyLevels: function () { var r = CORE.verifyAllLevels(); Platform.log(JSON.stringify(r)); return r; },
  minis: function () { return Minis; },
  view: function () { return view; },
  // Performs the solver's next move through the same selectCat/selectShelf path a player uses.
  step: function () {
    if (!game.inputOpen()) return false;
    var m = game.hint(); if (!m) return false;
    game.deselect();
    return game.selectCat(m.src, m.idx) && game.selectShelf(m.dst);
  },
  tapLogical: function (x, y) { handleTap(x, y); },
  logicalToScreen: function (x, y) { return { x: view.offX + x * view.scale, y: view.offY + y * view.scale }; },
  slotScreen: function (contId, idx) {
    var c = CORE.getC(game.board, contId), p = idx < 0 ? contPos(game.board, c) : updateShelfLayout(game.board, c, idx);
    return { x: view.offX + p.x * view.scale, y: view.offY + (p.y - (idx < 0 ? 10 : 22)) * view.scale };
  }
};
