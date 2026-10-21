/* ===================== CONFIG =====================
   Build-level settings for Meow Sort. Everything here can be tuned without
   touching game logic. Rules/economy are merged into CORE.CONFIG at start-up. */
var VERSION = '0.2.0';
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
  // TikTok platform rewards (coins)
  rewards: {
    shortcut: 200,      // add to home screen
    revisit: 150,       // entrance (revisit) mission
    share: 50,          // share to a friend, once per day
    shareDailyLimit: 3
  },
  maxLevel: 999,
  // Solver budgets kept small so nothing stalls the frame on low-end phones
  hintNodes: 20000,
  shuffleNodes: 25000
};

/* ===================== ADS =====================
   Placement labels must match the HS dashboard EXACTLY (case + spaces).
   Rewarded (opt-in, player gets something):
     R1  Double Coins   – "x2 Coins" on the Level Complete panel
     R2  Booster Refill – Shuffle / Extra Bed after the free use is spent
     R3  Rescue         – "Out of moves" popup: +1 bed and +1 shuffle
     R4  Gift Pod       – video pod in the HUD / "Watch a video" in Free Coins (+100 coins)
     R5  Level Boost    – level start (from level 3): "Start with +1 Extra Bed"
   Interstitial (Inter1), only at natural breaks:
     I_next    Level Complete → Next Level
     I_restart Restart / Replay
     I_select  Level picked in Settings
     I_panel   closing Settings / Free Coins (aggressive profile)
     I_break   right after a shelf match completes, when no ad for a while (aggressive profile)
   Profile 'ipu8' targets ~8 impressions per user in the first 5 minutes (see docs/ADS_PLAN.md and
   `node tools/sim_ads.js`). 'balanced' is the fallback if retention drops. */
var ADS = {
  enabled: true,
  provider: 'auto',            // auto → 'hs' if the HS SDK loads, else 'tt' (TikTok ads, needs adUnitIds), else 'none'
  profile: 'ipu8',
  profiles: {
    ipu8: {
      interFirstDelay: 15,     // s after session start before the first interstitial
      interMinLevel: 0,        // inter allowed from the end of level 1 (I_next) …
      breakMinLevel: 1,        // … but never inside the tutorial: I_break only from level 2 on
      interCooldown: 15,       // s between interstitials (TikTok may also refuse: error 11004 → skipped, no harm)
      interAfterReward: 10,    // s after a rewarded ad before the next interstitial
      breakAfterIdle: 15,      // I_break: s since the last ad of any kind (fires right after a shelf match)
      triggers: { I_next: 1, I_restart: 1, I_select: 1, I_panel: 1, I_break: 1 },
      maxInterPerSession: 40
    },
    balanced: {
      interFirstDelay: 45, interMinLevel: 1, interCooldown: 45, interAfterReward: 30,
      breakAfterIdle: 9999, breakMinLevel: 99,
      triggers: { I_next: 1, I_restart: 1, I_select: 1, I_panel: 0, I_break: 0 },
      maxInterPerSession: 15
    }
  },
  rewarded: {
    R1: { name: 'Double Coins', cooldown: 0 },
    R2: { name: 'Booster Refill', cooldown: 0 },
    R3: { name: 'Rescue', cooldown: 0 },
    R4: { name: 'Gift Pod', cooldown: 45, coins: 100 },
    R5: { name: 'Level Boost', cooldown: 0, minLevel: 2 }   // level start: "+1 Extra Bed" before playing
  },
  interLabel: 'Inter1',
  breakNotice: 1.2,            // s "Ad break" notice before an interstitial
  safetyTimeout: 100,          // s: resume the game if the SDK never calls back
  // Direct TikTok ads (provider 'tt'): ad unit IDs from TikTok Developer Portal / HS dashboard
  adUnitIds: { rewarded: '', interstitial: '' }
};
