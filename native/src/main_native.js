/* ===================== MAIN NATIVE: boot sequence =====================
   1. size the screen canvas to the safe area, draw the loading screen
   2. load the 'res' subpackage (cat atlas) with progress
   3. decode the atlas, restore the save, silent login, start the loop
   4. wire touch + lifecycle (save on hide, re-check missions on show) */
var booted = false, bootProgress = 0, bootLabel = 'Loading…';

function bootTick() {
  if (booted) return;
  try { drawLoading(bootProgress, bootLabel); } catch (e) {}
  Platform.raf(bootTick);
}

function startGame() {
  game = new Game(fx);
  var saved = loadProgress();
  if (saved) {
    if (typeof saved.coins === 'number') game.coins = saved.coins;
    if (typeof saved.sound === 'boolean') Sound.on = saved.sound;
    Minis.load(saved.minis);
  }
  Anim.displayCoins = game.coins;
  var startLevel = saved && typeof saved.level === 'number' ? Math.max(0, Math.min(saved.level, GAME_CONFIG.maxLevel - 1)) : 0;
  if (Platform.query.level) startLevel = Math.max(0, (parseInt(Platform.query.level, 10) || 1) - 1);
  game.loadLevel(startLevel);
  booted = true;
  last = Platform.now();
  Platform.raf(frame);
  MinisNative.login();
  Minis.checkAll();
  if (Platform.debug) MeowSort.verifyLevels();
  MeowSort.ready = true;
}

function boot() {
  resize();
  Platform.setFps(60);
  bootTick();
  Platform.loadSubpackage('res', function (p) { bootProgress = 0.1 + p * 0.7; }, function (err) {
    if (err) { booted = true; showError(err); return; }
    bootProgress = 0.85; bootLabel = 'Waking up the cats…';
    loadSprites(function (err2) {
      if (err2) { booted = true; showError(err2); return; }
      bootProgress = 1;
      try { startGame(); } catch (e) { booted = true; showError(e); }
    });
  });

  // Touch input (one active finger drives presses; extra fingers are ignored).
  Platform.onTouch('start', function (p) {
    if (!booted || !game) return;
    Sound.init();
    if (touchState.id !== null && touchState.id !== p.id) return;
    touchState.id = p.id;
    var q = toLogical(p.x, p.y); buttonStart(q.x, q.y);
  });
  Platform.onTouch('move', function (p) {
    if (!game || p.id !== touchState.id) return;
    var q = toLogical(p.x, p.y); buttonMove(q.x, q.y);
  });
  function end(p) {
    if (!game || p.id !== touchState.id) return;
    touchState.id = null;
    var q = toLogical(p.x, p.y); buttonEnd(q.x, q.y);
  }
  Platform.onTouch('end', end);
  Platform.onTouch('cancel', function (p) { if (p.id === touchState.id) { touchState.id = null; touchState.btn = null; } });

  // Lifecycle: save when TikTok backgrounds us; resume timing + missions on return.
  Platform.onHide(function () { try { saveProgress(); Sound.suspend(); } catch (e) {} });
  Platform.onShow(function () {
    last = Platform.now();
    try { Sound.init(); if (game) Minis.checkAll(); } catch (e) {}
  });
}

boot();
