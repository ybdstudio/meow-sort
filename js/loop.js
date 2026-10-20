/* ===================== GAME ENGINE LOOP ===================== */
var last = Platform.now();
function frame(now) {
  if (typeof now !== 'number' || now < 1) now = Platform.now();
  if (now - last > 1000) last = now;                 // came back from background
  var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  try { step(dt); render(); } catch (err) { showError(err); return; }
  Platform.raf(frame);
}
function step(dt) {
  Anim.time += dt;
  if (rewardPopup) { rewardPopup.t += dt; updateParticles(game.state === S.PAUSED ? dt : 0); }
  if (Anim.toastMsg && game.state === S.PAUSED) { Anim.toastMsg.t += dt; if (Anim.toastMsg.t > Anim.toastMsg.dur || !Anim.toastMsg.text) Anim.toastMsg = null; }
  if (game.state === S.PAUSED) return;
  var moving = reconcile(game, dt);
  updateSeqs(game, dt);
  updateFlyers(dt);
  updateParticles(dt);
  Object.keys(Anim.contShake).forEach(function (k) { Anim.contShake[k] = Math.max(0, Anim.contShake[k] - dt); });
  Anim.starPillBounce = Math.max(0, Anim.starPillBounce - dt * 3);
  Anim.coinPillBounce = Math.max(0, Anim.coinPillBounce - dt * 3);
  if (Math.abs(Anim.displayCoins - game.coins) > 0.5) { Anim.displayCoins += (game.coins - Anim.displayCoins) * Math.min(1, dt * 4); Anim.coinPillBounce = 0.5; }
  else Anim.displayCoins = game.coins;
  if (Anim.toastMsg) { Anim.toastMsg.t += dt; if (Anim.toastMsg.t > Anim.toastMsg.dur || !Anim.toastMsg.text) Anim.toastMsg = null; }
  if (Anim.winT >= 0) Anim.winT += dt;
  if (game.state === S.MOVING && !moving) game.onSettled();
}
function showError(err) {
  Platform.warn('fatal', err && err.stack ? err.stack : err);
  drawFatal('Something went wrong: ' + (err && err.message ? err.message : err));
}
