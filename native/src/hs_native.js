/* ===================== HS: HyperScale TikTok SDK kit (hs-game.js 3.x) =====================
   Integrated per docs/hs-kit/INTEGRATE-WITH-AI.md.
   - hs-game.js + hs-tiktok-sdk.min.js sit next to game.js (copied by the build, never edited).
   - The game only reports moments: HSGame.showAd('<placement label>') for ads,
     HSGame.share() / HSGame.tiktokMission for TikTok share + missions.
   - What a moment gives is DATA: HS dashboard first, else HS_DEFAULTS below.
   - Everything given arrives in ONE place: hsOnGive(items, from).
   - The game never calls TikTok ads / share / shortcut / entrance mission / login itself.
   HS_CONFIG (gameId + sdkKey) is injected by tools/build_native.js from native/hs-config.json. */
var HSGame = null;
try { HSGame = require('./hs-game.js'); } catch (e) { HSGame = null; }

/* The reward table. Keys = EXACT HS dashboard placement labels / built-in keys.
   Paste the same thing into the dashboard (it is in meow-sort.hs-dashboard.json). */
var HS_DEFAULTS = {
  rewards: {
    'Double Coin':   { coins: 50 },                    // ad on the Level Complete panel
    'Shuffle':       { shuffle: 1 },                   // ad on the Shuffle booster
    'Extra Bed':     { extra_bed: 1 },                 // ad on the Extra Bed booster + level-start offer
    'Rescue':        { shuffle: 1, extra_bed: 1 },     // ad in the "Out of moves" popup
    'Gift Pod':      { coins: 100 },                   // ad on the video pod / Free Coins
    share:           { coins: 100, $limit: 'daily' },  // share with a friend          = 2 levels, daily
    tiktok_shortcut: { coins: 250 },                   // TikTok mission: add to home screen (once)  = 5 levels
    tiktok_profile:  { coins: 200 }                    // TikTok mission: come back from the profile (once) = 4 levels
    // 'Inter1' has no reward: showAd('Inter1') resolves {} when the interstitial completes
  },
  items: {
    coins:     { category: 'currency', name: 'Coins' },
    shuffle:   { category: 'booster',  name: 'Shuffle' },
    extra_bed: { category: 'booster',  name: 'Extra Bed' }
  }
};

var HS = {
  started: false, loggedIn: false, startReason: '',
  sdk: function () { return HSGame; },
  // Amount a key gives, for labels like "+100" (never a typed number).
  amount: function (key, item) {
    var r = HSGame ? HSGame.rewards(key) : HS_DEFAULTS.rewards[key];
    return r && r[item] ? r[item] : 0;
  },
  start: function () {
    if (!HSGame) { HS.startReason = 'hs-game.js not in package'; Platform.log('hs: ' + HS.startReason); return Promise.resolve(null); }
    HSGame.debug = !!Platform.debug;
    return HSGame.start({
      gameId: HS_CONFIG.gameId, sdkKey: HS_CONFIG.sdkKey,
      defaults: HS_DEFAULTS,
      debug: !!Platform.debug,
      onGive: hsOnGive,
      onLoad: hsOnLoad
    }).then(function (r) {
      HS.started = true; HS.loggedIn = !!(r && r.loggedIn); HS.startReason = (r && r.reason) || '';
      Platform.log('hs: started v' + HSGame.version + ' loggedIn=' + HS.loggedIn + (HS.startReason ? ' (' + HS.startReason + ')' : ''));
      saveProgress();                         // first cloud save (the kit never uploads a fresh install over the cloud)
      // which dashboard placements have an ad right now (also lists every place for hs-check)
      var places = Object.keys(ADS.rewarded).concat([ADS.inter.label]);
      Platform.log('hs: placements ' + places.map(function (l) { return l + (HSGame.canShowAd(l) ? ' ✓' : ' ✗'); }).join(' · '));
      return r;
    });
  }
};

/* THE only place anything is added. Unknown item/category → throw, so HS does not record it. */
function hsOnGive(items, from) {
  if (!game) throw new Error('game not ready');
  var add = {};
  Object.keys(items).forEach(function (id) {
    var it = (HSGame && HSGame.item(id)) || HS_DEFAULTS.items[id];
    var cat = it && it.category;
    if (cat !== 'currency' && cat !== 'booster') throw new Error('unknown item ' + id + ' (' + cat + ')');
    if (cat === 'currency' && id !== 'coins') throw new Error('unknown currency ' + id);
    if (cat === 'booster' && id !== 'shuffle' && id !== 'extra_bed') throw new Error('unknown booster ' + id);
    add[id] = Math.max(0, Math.floor(Number(items[id]) || 0));
  });
  if (add.coins) { game.coins += add.coins; Anim.coinPillBounce = 1; Sound.coin(); }
  if (add.shuffle) game.boosters.shuffle += add.shuffle;
  if (add.extra_bed) game.boosters.bed += add.extra_bed;
  Platform.log('hs: onGive ' + JSON.stringify(add) + ' from ' + from);
  saveProgress();
  // TikTok missions pay later (when TikTok confirms): close their popup and celebrate here
  if (from === 'tiktok_shortcut' || from === 'tiktok_profile') {
    if (uiPanel.indexOf('pop_') === 0 && game.state === S.PAUSED) { game.resume(); uiPanel = 'settings'; }
    if (add.coins) fx.rewardPopup(from === 'tiktok_shortcut' ? 'Launch Reward' : 'Entry Reward', add.coins);
  }
}

/* Cloud save from another phone: keep the FURTHER progress, apply it, save the merge. */
function hsOnLoad(cloud) {
  if (!cloud || typeof cloud !== 'object' || !game) return;
  var localLevel = game.levelIndex, cl = Number(cloud.level) || 0;
  if (cl > localLevel) {                              // further level wins, with its coins
    if (typeof cloud.coins === 'number') { game.coins = cloud.coins; Anim.displayCoins = game.coins; }
    if (game.state !== S.LEVEL_COMPLETE) game.loadLevel(Math.min(cl, GAME_CONFIG.maxLevel - 1));
    Platform.log('hs: cloud progress restored (level ' + (cl + 1) + ')');
  } else if (cl === localLevel && typeof cloud.coins === 'number' && cloud.coins > game.coins) {
    game.coins = cloud.coins; Anim.displayCoins = game.coins;     // same level: keep the richer copy
    Platform.log('hs: cloud coins restored');
  }
  saveProgress();
}

/* Small helper for the TikTok missions + share rows */
var HSMinis = {
  supported: function (kind) { return !!HSGame && HSGame.tiktokMission.supported(kind); },
  done: function (kind) { return !!HSGame && HSGame.tiktokMission.done(kind); },
  start: function (kind) {
    if (!HSGame) return Promise.resolve('unsupported');
    return HSGame.tiktokMission.start(kind);
  },
  canShare: function () { return !!HSGame && HSGame.canShare(); },
  shareAvailable: function () { return !!HSGame && HSGame.available('share'); },
  share: function (opts) { return HSGame ? HSGame.share(opts) : Promise.resolve(null); }
};
