---
name: integrate-hs-sdk-ads
description: Integrate the HS (HyperScale) TikTok SDK kit (hs-game.js) into a native TikTok mini game: ads by dashboard placement label, rewards via onGive, missions, share, cloud save, ad scenario, hs-check.
---

# Integrate the HS TikTok SDK kit into a native TikTok mini game

Use after the gameplay build works (**html-to-native-tiktok-v2**). The package is native: `game.js` + `game.json`
drawn on a canvas. Proven on Meow Sort (kit hs-tiktok-sdk 1.0.7 / hs-game.js 3.0.0, hs-check 0 fail).

## 0. Get the kit FIRST. Never guess the API
- The kit is: `hs-game.js`, `hs-tiktok-sdk.min.js`, `hs-check.mjs`, `INTEGRATE-WITH-AI.md`, `DASHBOARD-CONFIG.md`.
  Look in this skill's `kit/` folder; else the user's attachment (e.g. `hs-tiktok-sdk-<ver>.zip`).
- If you can't find it: **stop and ask the user for the kit zip.** Do not write a bridge against an imagined API,
  and do not call TikTok ads directly as a "fallback". Both were tried and rejected.
- Read `kit/INTEGRATE-WITH-AI.md` in full; it is the contract. Prefer a newer kit from the user over `kit/`.
  `reference/` has the working Meow Sort files to adapt (hs_native.js, ads_native.js, ads_policy.js, minis.js,
  sim_ads.js, test_ads.js, emulator_hs_fakes.js).

## 1. Ask the user for (once, together)
- TikTok **App ID** = HS **Game ID** (numbers) and the HS **SDK key** `sk_live_…`. Never ask for or write the Client Secret.
- The HS dashboard **placements export**: `{ placements: [{ label, ads: [{ id: "ad…" }] }] }`.
- **The game calls the exact dashboard labels** (e.g. `"Double Coin"`, `"Inter1"`). The kit recommends
  lowercase_snake_case; if the dashboard uses other names, keep the user's labels, and accept hs-check's
  "has capitals" WARNs (or have both sides renamed together).

## 2. Wire the kit (rules from INTEGRATE-WITH-AI.md)
- [ ] Copy `hs-game.js` + `hs-tiktok-sdk.min.js` **next to game.js at the package root** (not a subfolder; never edit them).
- [ ] game.js contains the literal `require('./hs-game.js')` (wrap in try/catch so the game still runs without it).
- [ ] `HSGame.start({ gameId, sdkKey, defaults: HS_DEFAULTS, onGive, onLoad })` once at boot (after assets load).
      gameId + sdkKey may be in game.js (they identify the game, not secrets). Keep them in a gitignored
      `native/hs-config.json` and inject at build.
- [ ] `HS_DEFAULTS = { rewards: { '<placement label>': { item: n }, share: {…, $limit:'daily'}, tiktok_shortcut: {…},
      tiktok_profile: {…} }, items: { coins: { category:'currency' }, … } }`. Interstitial labels get **no** reward key.
- [ ] **onGive(items, from) is the ONLY place items are added.** Switch on category; **throw** for an unknown
      item/category (then HS doesn't record it). Ad callbacks only do follow-ups (place the bed, resume, show
      "+N" from the returned items); they never add items.
- [ ] Ads: `HSGame.canShowAd(label)` (ask every draw) and `HSGame.showAd(label)`, which resolves to:
      `null` = no ad or closed early (`HSGame.lastAdError` = `'skipped'` | `'not configured'` | `'claimed'` | …),
      `{}` = interstitial done, `{coins:50}` = rewarded done and already given via onGive.
- [ ] Missions + share only via `HSGame.tiktokMission.start('shortcut'|'profile')`, `.supported()`, `.done()`, and
      `HSGame.share({title})` (`HSGame.available('share')`). Mission rewards arrive later in onGive (`from` = key).
- [ ] **Never call** `tt.login`, `createRewardedVideoAd`, `createInterstitialAd`, `shareAppMessage`,
      `addShortcut` or `startEntranceMission` from game code. Remove any older platform wrapper.
- [ ] Cloud save: `HSGame.save({ level, coins })` after every change and once after start. In `onLoad(cloud)` keep the
      **further** progress: higher level wins; same level → more coins. Apply it, then save the merge.
- [ ] Labels/amounts shown to players come from `HSGame.rewards(key)`, never typed numbers.

## 3. Ad scenario (timing lives in the game, ad units on the dashboard)
- [ ] Rewarded placements at real player needs: x2 win coins, booster refills, "out of moves" rescue,
      HUD gift with cooldown, level-start boost. Interstitials only at natural breaks (next level, restart, level
      select, panel close, right after a match), with a 1 s "Ad break" notice. Never mid-move or in the tutorial.
- [ ] Pure policy module (`reference/ads_policy.js`) with profiles (`ipu8` aggressive / `balanced`). After a rewarded
      ad, skip the next interstitial. While an ad is up: freeze the game, mute, block input, safety resume after 100 s.
- [ ] **Monte-Carlo simulation** (`reference/sim_ads.js`) with ad durations included, to tune toward the IPU target.
      Meow Sort ipu8: median 8 / mean 7.7 in 5 min. Report the TikTok risk: interstitial error 11004
      ("too soon") has no published minimum interval; with ≥30 s the IPU drops to ~6.7 (`--ttmin 30`).

## 4. Build
- [ ] Inject `var HS_CONFIG = {gameId, sdkKey}` before the HS module; copy the kit files to the package root.
- [ ] Write `<package>.hs-dashboard.json` **next to** the package folder (never inside it):
      `{ iaa_config: { placements: <dashboard export>, rewards: HS_DEFAULTS.rewards, items: HS_DEFAULTS.items } }`.
      The user pastes `iaa_config` into HS → Ads Config → Edit raw JSON.
- [ ] Build-time check: every label the game uses exists on the dashboard, and every dashboard placement is used.

## 5. Verify
- [ ] `node kit/hs-check.mjs dist/<game>` → **0 fail**. It runs game.js in a fake native runtime whose `tt.*` returns
      proxies/functions, so the adapter must only trust plain objects / finite numbers from system-info APIs
      (else: "Cannot convert object to primitive value"). Its static scan misses labels with spaces: log
      `canShowAd(label)` for every placement after start so the trace lists them.
- [ ] Emulator: `window.tt = api` with `tt.request` routed to a fake HS backend (`/api/login` returns `aps` +
      `iaa_config` from the dashboard JSON; also `/api/ads/config`, `/api/sync` stored in localStorage,
      `/api/pending_rewards`), fake TikTok ads (`?adfill=0`, `?addur`, `?adauto`), `?hsoffline=1`, and a CommonJS
      `require()` shim that loads package files (see `reference/emulator_hs_fakes.js`). Keep the emulator log panel
      `pointer-events: none` (it covered the Settings button).
- [ ] Tests (`reference/test_ads.js`): hs-check 0 fail · each placement plays its dashboard unit and onGive gives the
      right items · interstitial gives nothing · closed early → nothing · no fill → game runs · HS offline → game
      runs, ad buttons hidden · missions/share via popups → onGive → button hides · cloud: nudge
      `HSGame.sdk.sync.syncNow()` until the profile lands (sync is rate-limited), then a "new phone" restores via onLoad.
- [ ] Device (`cd dist/<game> && ttmg dev` → Upload → QR): watched → reward; closed early → nothing; placement
      off on dashboard → nothing; amount changed on dashboard → new amount after restart; share once per day;
      home-screen icon → reward once; reinstall → progress back.

## Troubleshooting
- **hs-check "HSGame never loaded" + "Cannot convert object to primitive value"**: adapter used a proxy value as a number.
- **Ad button never shows**: not logged in yet (`canShowAd` false until login), label typo vs dashboard, or the
  reward is `once`/`daily` and already claimed.
- **Reward not given**: onGive threw (unknown item/category), or the game added items outside onGive (double grant).
- **Mission reward never arrives**: it's paid when TikTok confirms (return from profile / open from icon), checked on
  `onShow`. Don't pay on button tap.
- **"Still the same" on device**: compare the Version/build line in Settings with the build you uploaded.

## Outputs
- Upload zip (package root: game.js, game.json, project.config.json, hs-game.js, hs-tiktok-sdk.min.js, res/, ui/)
- `<package>.hs-dashboard.json` for the HS dashboard · ads plan doc with the simulated IPU · tests + hs-check passing
