# Meow Sort — TikTok Minis native port

Port of `prototype.html` (H5) to a TikTok Minis native package (`game.js` + canvas, no DOM).

## Layout
```
js/            shared game code (no platform calls): config, core (rules+solver), game (state machine),
               layout, art, view, draw_helpers, audio, anim, fx, minis, persist, render, input, loop, devapi
               levels_gen.js / cat_atlas.js are generated
native/src/    adapter.js (Platform shim over TTMinis.game / tt), ui_native.js (panels, popups, loading,
               touch press handling), minis_native.js (shortcut / revisit / share / login), main_native.js (boot)
native/project game.json, project.config.json (set appid), res/ subpackage (cats.png atlas)
native/emulator/index.html   browser shim of the TikTok runtime
tools/         build_native.js, check_package.js, zip.js, bake_atlas.js, gen_levels.js, test_emulator.js
skills/        updated html-to-native-tiktok SKILL.md
assets_src/    original cat sprites (WebP) + face metadata
dist/          build output: meow-sort/ (upload), emulator/
```

## Commands
```bash
node tools/build_native.js --appid YOUR_APP_ID   # → dist/meow-sort (add --debug --no-minify for dev tools)
cd dist && python3 -m http.server 8000           # → http://localhost:8000/emulator/index.html
node tools/test_emulator.js --shots shots        # automated emulator smoke test (needs Playwright)
node tools/bake_atlas.js                         # only if cat art / expressions change
node tools/gen_levels.js 60                      # only if rules change
```
Emulator query: `?device=iphone14|iphonese|pixel7|android|tablet` `?ttquirks=1` (no AudioParam ramps)
`?shadow=1` (use shadowBlur glow) `?oldclient=1` (no mission APIs) `?dev=1` `?level=N`.

## Upload (important)
Upload ONLY `dist/meow-sort/` (run `ttmg dev` inside it) or `dist/meow-sort-upload.zip`. Both have
`game.json` at the root. Uploading the source zip / repo root fails with
`Cannot find game.json in the project source`. Check any folder or zip first:
```bash
node tools/check_package.js dist/meow-sort-upload.zip
```

## Device test
```bash
npm install @ttmg/cli -g && ttmg login
node tools/build_native.js --appid YOUR_APP_ID
cd dist/meow-sort && ttmg dev      # DevTool → Upload → scan QR with a test account
```

## What changed vs the prototype
- DOM/browser APIs → `Platform` (createCanvas, createImage, get/setStorageSync, createWebAudioContext,
  onTouchStart/Move/End, onShow/onHide, getWindowInfo + safeArea + capsule rect, loadSubpackage).
- 40 runtime-painted expression canvases → one baked 2048×1552 PNG atlas (211 KB) in the `res` subpackage.
- Procedural levels 4–63 pre-generated and solver-verified offline (no generator on device).
- `shadowBlur` selection glow → radial halo by default (cheaper, works everywhere).
- Buttons fire on release inside the button; board taps fire on touch start.
- New: Free Coins panel (tap coin pill or Settings → Free Coins): home-screen shortcut +200,
  revisit mission +150, share +50 (3/day). Claim flags are saved, rewards never granted twice.
- Save on every settled move, win, reward and onHide. Dev "verify levels" only with `?dev=1` / `--debug`.
- Ads: `ADS` in js/config.js is a dummy (enabled:false) — next step is the integrate-hs-sdk-ads skill.

## v0.3 — HS kit + TikTok minis UI
- HS kit (hs-tiktok-sdk 1.0.7 / hs-game.js 3.0.0) in `native/hs/`, shipped next to game.js. Integration per
  `docs/hs-kit/INTEGRATE-WITH-AI.md`: `HSGame.showAd('<dashboard label>')`, rewards only in `hsOnGive`
  (`native/src/hs_native.js`), missions/share via `HSGame`, cloud save via `HSGame.save`/`onLoad`.
- Credentials: `native/hs-config.json` (gitignored) → `{ gameId: <TikTok App ID>, sdkKey }`.
- Dashboard: build writes `dist/meow-sort.hs-dashboard.json` (paste `iaa_config` into HS → Ads Config → Edit raw JSON).
- Check: `node tools/hs/hs-check.mjs dist/meow-sort` · tests: `node tools/test_emulator.js && node tools/test_ads.js`.
- UI art: `assets_src/ui/` → `python3 -I tools/prepare_ui.py` → `native/project/ui/loading.jpg`, `native/project/res/ui.png`, `js/ui_atlas.js`.
- Economy: level 50 · Double Coin +50 · Gift Pod +100 (45 s cooldown) · Share +100/day · Add to screen +250 once · Revisit +200 once.

## v0.4
- Gradients removed for good (always flat; the Graphics setting is gone).
- Ads: profile `paced` (TikTok refuses interstitials < ~30 s apart): >= 40 s gaps, no "Ad break" notice, no dimming until
  an ad actually plays, back-off after a refusal. Sim: ~4.5 IPU / 5 min.
- Sound: every SFX x2.4 into a master bus with a limiter.
- 30-level curve (docs/difficulty_curve_v1.png) + 60 more repeating levels 11-30, all solver-verified, levels loop after 90:
  `node tools/gen_levels.js --total 90` → js/levels_gen.js, report in docs/levels_report.json.
- 7 new costumes cut from assets_src/costumes_sheet.png (`python3 -I tools/cut_costumes.py`, GrabCut + auto eye detection),
  unlocked at levels 4/8/11/14/17/20/23. Superhero look-alikes and the police cat are not used.
