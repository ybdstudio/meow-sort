/* ===================== CONFIG =====================
   Build-level settings for Meow Sort. Everything here can be tuned without
   touching game logic. Rules/economy are merged into CORE.CONFIG at start-up. */
var VERSION = '0.1.0';
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

// Ads: dummy until Skill 2 (integrate-hs-sdk-ads). Keep enabled=false for gameplay tests.
var ADS = {
  enabled: false,
  rewardedId: 'DUMMY_REWARDED_ID',
  interstitialId: 'DUMMY_INTERSTITIAL_ID',
  interstitialEveryNLevels: 3
};
