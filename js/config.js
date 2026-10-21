/* ===================== CONFIG =====================
   Build-level settings for Meow Sort. Everything here can be tuned without
   touching game logic. Rules/economy are merged into CORE.CONFIG at start-up. */
var VERSION = '0.5.1';
var BUILD = 'dev';          // replaced by tools/build_native.js with the build time
var GAME_NAME = 'Meow Sort';
var STORE_KEY = 'meowsort_native_v1';

var GAME_CONFIG = {
  // Gameplay rules (see CORE.CONFIG for meaning)
  rules: {
    shelfCapacity: 5,
    matchSize: 5,
    bedCapacity: 1,
    accessRule: 'edge',
    groupMove: true,
    undoAcrossMatch: false
  },
  // Economy
  economy: {
    starsPerMatch: 1,
    coinsPerLevel: 50,
    startCoins: 1100,
    shuffleUses: 1,
    extraBedUses: 1
  },
  maxLevel: 999,
  // Solver budgets kept small so nothing stalls the frame on low-end phones
  hintNodes: 20000,
  shuffleNodes: 25000
};

/* ===================== ADS =====================
   Placement labels are the EXACT labels on the HS dashboard (case + spaces). The game calls
   Ads.reward('<label>') / Ads.tryInter(trigger) → HSGame.showAd('<label>'); HS serves the ad.
   Rewarded (opt-in, player gets something):
     'Double Coin' – "x2 Coins" on the Level Complete panel
     'Shuffle'     – Shuffle booster after the free use is spent
     'Extra Bed'   – Extra Bed booster after the free use is spent, and the level-start "+1 Bed" offer
     'Rescue'      – "Out of moves" popup: +1 bed and +1 shuffle
     'Gift Pod'    – video pod in the HUD / "Watch a video" in Free Coins (+100 coins)
   Interstitial 'Inter1', only at natural breaks (triggers):
     I_next    Level Complete → Next Level
     I_restart Restart / Replay
     I_select  Level picked in Settings
     I_panel   closing Settings / Free Coins (aggressive profile)
     I_break   right after a shelf match completes, when no ad for a while (aggressive profile)
   Profile 'paced' (default) respects TikTok's >= 30 s interstitial cap; see docs/ADS_PLAN.md and
   `node tools/sim_ads.js`. 'balanced' is lighter, 'ipu8' the old dense v0.3 profile. */
var ADS = {
  enabled: true,
  profile: 'paced',
  // TikTok refuses interstitials that come too soon ("interstitialAdShow:fail frequency controlled",
  // seen on device at < 30 s). Every interstitial gap here is >= 30 s from the END of the last ad.
  platformInterGap: 30,
  profiles: {
    paced: {                   // v0.4 default: fewer, well-spaced breaks (~1 interstitial / 1.5-2 min)
      interFirstDelay: 30,     // s after session start before the first interstitial
      interMinLevel: 1,        // never right after the tutorial
      breakMinLevel: 2,        // I_break (after a match) only from level 3 on
      interCooldown: 40,       // s between interstitials (>= TikTok's 30 s cap, measured from the end of the last ad)
      interAfterReward: 25,    // s after a rewarded ad
      breakAfterIdle: 60,      // I_break only if no ad at all for 60 s
      triggers: { I_next: 1, I_restart: 1, I_select: 1, I_panel: 0, I_break: 1 },
      maxInterPerSession: 30
    },
    ipu8: {                    // v0.3 (too dense for TikTok's cap — kept for reference / A/B)
      interFirstDelay: 15, interMinLevel: 0, breakMinLevel: 1, interCooldown: 15, interAfterReward: 10,
      breakAfterIdle: 15, triggers: { I_next: 1, I_restart: 1, I_select: 1, I_panel: 1, I_break: 1 }, maxInterPerSession: 40
    },
    balanced: {
      interFirstDelay: 45, interMinLevel: 1, interCooldown: 45, interAfterReward: 30,
      breakAfterIdle: 9999, breakMinLevel: 99,
      triggers: { I_next: 1, I_restart: 1, I_select: 1, I_panel: 0, I_break: 0 },
      maxInterPerSession: 15
    }
  },
  // Rewarded placements (exact HS labels) → local cooldown (s). What each gives is in HS_DEFAULTS /
  // the HS dashboard; which ad unit plays is on the HS dashboard. The game never sees ad unit IDs.
  rewarded: {
    'Double Coin': { cooldown: 0 },
    'Shuffle':     { cooldown: 0 },
    'Extra Bed':   { cooldown: 0 },
    'Rescue':      { cooldown: 0 },
    'Gift Pod':    { cooldown: 45 }
  },
  inter: { label: 'Inter1' },
  levelBoost: { label: 'Extra Bed', minLevel: 2 },   // level-start "+1 Bed" offer from level 3
  overlayDelay: 0.6,           // s before the dim "Ad playing" overlay shows (a refused ad never flashes the screen)
  safetyTimeout: 100,          // s: resume the game if the SDK never calls back
};
