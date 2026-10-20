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
tools/         build_native.js, bake_atlas.js, gen_levels.js, test_emulator.js
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

## Device test
```bash
npm install @ttmg/cli -g && ttmg login
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
