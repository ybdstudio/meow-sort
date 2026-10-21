/* ===================== PERSISTENCE =====================
   Saved through Platform.storage (TikTok getStorageSync/setStorageSync).
   Saved after each move settles, on level complete, on rewards and on hide. */
function saveProgress(advance) {
  if (!game) return;
  var lvl = game.levelIndex + (advance ? 1 : 0);
  Platform.storage.set(STORE_KEY, { v: 1, level: lvl, coins: game.coins, sound: Sound.on,
    savedAt: Date.now() });
  if (typeof HSGame !== 'undefined' && HSGame) HSGame.save({ level: lvl, coins: game.coins });   // cloud save (whole small progress object)
}
function loadProgress() { var s = Platform.storage.get(STORE_KEY); return s && typeof s === 'object' ? s : null; }
