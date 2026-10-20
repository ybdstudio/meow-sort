/* ===================== GAME STATE MACHINE ===================== */
var S = { READY: 'READY', CAT_SELECTED: 'CAT_SELECTED', MOVING: 'MOVING',
  MATCH_COMPLETING: 'MATCH_COMPLETING', LEVEL_COMPLETE: 'LEVEL_COMPLETE', PAUSED: 'PAUSED' };

function Game(fx) {
  this.fx = fx;                // presentation hooks (AnimationManager / UI)
  this.state = S.READY;
  this.levelIndex = 0;
  this.levelDef = null;
  this.board = null;
  this.sel = null;             // { contId, catId }
  this.history = [];
  this.moves = 0;
  this.stars = 0;
  this.coins = CORE.CONFIG.startCoins;
  this.boosters = { shuffle: 0, bed: 0 };
  this.pausedFrom = null;
  this.matchedThisLevel = 0;
}
Game.prototype.rule = function () { return CORE.CONFIG.accessRule; };
Game.prototype.levelCount = function () { return CORE.LEVELS.length; };
Game.prototype.getLevelDef = function (i) {
  if (i < CORE.LEVELS.length) return CORE.LEVELS[i];
  return CORE.generateLevel(i, this.rule());
};
Game.prototype.loadLevel = function (i) {
  this.levelIndex = i;
  this.levelDef = this.getLevelDef(i);
  this.board = CORE.buildBoard(this.levelDef);
  this.sel = null; this.history = []; this.moves = 0; this.stars = 0; this.matchedThisLevel = 0;
  this.boosters = { shuffle: CORE.CONFIG.shuffleUses, bed: CORE.CONFIG.extraBedUses };
  this.state = S.READY;
  this.fx.onLoad();
};
Game.prototype.restartLevel = function () { this.loadLevel(this.levelIndex); };
Game.prototype.nextLevel = function () { this.loadLevel(this.levelIndex + 1); };
Game.prototype.inputOpen = function () { return this.state === S.READY || this.state === S.CAT_SELECTED; };

Game.prototype.selectCat = function (contId, idx) {
  if (!this.inputOpen()) return false;
  var c = CORE.getC(this.board, contId);
  if (!c || c.completed || !c.cats[idx]) return false;
  if (this.isPickable(c, idx)) idx = c.cats.length - 1;          // any cat of the outer same-colour run picks the run
  var cat = c.cats[idx];
  if (!CORE.accessible(c, idx, this.rule())) { this.fx.onBlocked(cat.id, contId); return false; }   // inner cat: not selectable
  if (this.state === S.CAT_SELECTED && this.sel && this.sel.catId === cat.id) { this.deselect(); return true; }
  this.sel = { contId: contId, catId: cat.id };
  this.state = S.CAT_SELECTED;
  this.fx.onSelect(cat.id);
  return true;
};
// A cat can be tapped to pick if it is the outermost cat or part of the outer same-colour run.
Game.prototype.isPickable = function (c, idx) {
  if (!c || c.completed || idx < 0 || idx >= c.cats.length) return false;
  if (CORE.accessible(c, idx, this.rule())) return true;
  return this.rule() === 'edge' && CORE.CONFIG.groupMove && idx >= c.cats.length - CORE.runLength(c);
};
// Ids of every cat lifted by the current selection (the whole outer run).
Game.prototype.selectedIds = function () {
  if (!this.sel) return [];
  var c = CORE.getC(this.board, this.sel.contId); if (!c || !c.cats.length) return [];
  var n = (this.rule() === 'edge' && CORE.CONFIG.groupMove) ? CORE.runLength(c) : 1;
  if (this.rule() !== 'edge') return [this.sel.catId];
  return c.cats.slice(c.cats.length - n).map(function (k) { return k.id; });
};
Game.prototype.deselect = function () {
  if (this.state === S.CAT_SELECTED) { this.sel = null; this.state = S.READY; this.fx.onDeselect(); }
};
Game.prototype.selectedIndex = function () {
  if (!this.sel) return -1;
  var c = CORE.getC(this.board, this.sel.contId);
  if (!c) return -1;
  for (var i = 0; i < c.cats.length; i++) if (c.cats[i].id === this.sel.catId) return i;
  return -1;
};
Game.prototype.canMove = function (srcId, idx, dstId) { return CORE.canMove(this.board, srcId, idx, dstId, this.rule()); };
Game.prototype.selectShelf = function (dstId) {
  if (this.state !== S.CAT_SELECTED || !this.sel) return false;
  var idx = this.selectedIndex();
  var r = this.canMove(this.sel.contId, idx, dstId);
  if (!r.ok) { this.fx.onInvalid(this.sel.catId, dstId, r.reason); return false; }
  this.moveCat(this.sel.contId, idx, dstId);
  return true;
};
Game.prototype.pushHistory = function () {
  this.history.push({ snap: CORE.snapshot(this.board), stars: this.stars });
  if (this.history.length > 200) this.history.shift();
};
Game.prototype.moveCat = function (srcId, idx, dstId) {
  this.pushHistory();
  var moved = CORE.applyMove(this.board, srcId, idx, dstId, this.rule());
  this.moves++;
  this.sel = null;
  this.state = S.MOVING;
  this.fx.onMove(moved.map(function (k) { return k.id; }), srcId, dstId);
};
// Called by the animation layer once every cat has landed.
Game.prototype.onSettled = function () {
  if (this.state !== S.MOVING) return;
  var m = this.checkMatch();
  if (m.length) {
    var self = this;
    m.forEach(function (id) { CORE.getC(self.board, id).completed = true; });
    this.state = S.MATCH_COMPLETING;
    this.fx.onMatch(m);
    return;
  }
  this.state = S.READY;
  if (!this.checkWin() && !CORE.hasAnyMove(this.board, this.rule())) this.fx.onNoMoves();
  this.fx.onReady();
};
Game.prototype.checkMatch = function () { return CORE.findMatches(this.board); };
Game.prototype.completeShelf = function (id) {
  var c = CORE.getC(this.board, id);
  if (!c || !c.completed) return;
  c.cats = []; c.completed = false;
  this.stars += CORE.CONFIG.starsPerMatch;
  this.matchedThisLevel++;
  if (!CORE.CONFIG.undoAcrossMatch) this.history = [];
};
Game.prototype.finishMatchSequence = function () {
  if (this.state !== S.MATCH_COMPLETING) return;
  if (this.checkWin()) {
    this.state = S.LEVEL_COMPLETE;
    this.coins += CORE.CONFIG.coinsPerLevel;
    this.fx.onWin();
  } else {
    this.state = S.READY;
    if (!CORE.hasAnyMove(this.board, this.rule())) this.fx.onNoMoves();
    this.fx.onReady();
  }
};
Game.prototype.checkWin = function () { return CORE.isWon(this.board); };
Game.prototype.canUndo = function () { return this.inputOpen() && this.history.length > 0; };
Game.prototype.undoMove = function () {
  if (!this.canUndo()) return false;
  var h = this.history.pop();
  CORE.restore(this.board, h.snap);
  this.stars = h.stars;
  this.moves = Math.max(0, this.moves - 1);
  this.sel = null;
  this.state = S.MOVING;
  this.fx.onUndo();
  return true;
};
Game.prototype.shuffle = function () {
  if (!this.inputOpen() || this.boosters.shuffle <= 0) return false;
  var rule = this.rule(), board = this.board;
  var conts = board.containers.filter(function (c) { return !c.completed; });
  var cats = []; conts.forEach(function (c) { c.cats.forEach(function (k) { cats.push(k); }); });
  if (cats.length < 2) return false;
  var r = CORE.rng((Date.now() & 0xffffff) + 17), best = null;
  for (var attempt = 0; attempt < 12 && !best; attempt++) {
    var pool = cats.slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var test = { containers: board.containers.map(function (c) { return { id: c.id, kind: c.kind, capacity: c.capacity, completed: c.completed, cats: c.cats.slice() }; }) };
    var p = 0;
    test.containers.forEach(function (c) { if (!c.completed) { var n = c.cats.length; c.cats = pool.slice(p, p + n); p += n; } });
    if (CORE.findMatches(test).length) continue;
    if (CORE.solve(test, rule, GAME_CONFIG.shuffleNodes).solved) best = test;
  }
  if (!best) { this.fx.toast('No better arrangement found'); return false; }
  this.pushHistory();
  var self = this;
  best.containers.forEach(function (tc) { CORE.getC(self.board, tc.id).cats = tc.cats; });
  this.boosters.shuffle--;
  this.sel = null;
  this.state = S.MOVING;
  this.fx.onShuffle();
  return true;
};
Game.prototype.addBed = function () {
  if (!this.inputOpen() || this.boosters.bed <= 0) return false;
  var beds = this.board.containers.filter(function (c) { return c.kind === 'bed'; });
  if (beds.length >= 3) return false;
  this.board.containers.push({ id: 'bed_' + (beds.length + 1), kind: 'bed', side: 'bottom', row: beds.length,
    capacity: CORE.CONFIG.bedCapacity, completed: false, cats: [] });
  this.boosters.bed--;
  this.fx.onBedAdded();
  return true;
};
Game.prototype.pause = function () {
  if (this.state === S.PAUSED || this.state === S.LEVEL_COMPLETE) return false;
  if (!this.inputOpen()) return false;
  this.deselect();
  this.pausedFrom = this.state; this.state = S.PAUSED; return true;
};
Game.prototype.resume = function () {
  if (this.state !== S.PAUSED) return;
  this.state = this.pausedFrom || S.READY; this.pausedFrom = null;
};
Game.prototype.hint = function () {
  var res = CORE.solve(this.board, this.rule(), GAME_CONFIG.hintNodes);
  return res.solved && res.moves.length ? res.moves[0] : null;
};

