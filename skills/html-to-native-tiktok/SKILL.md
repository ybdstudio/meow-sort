---
name: html-to-native-tiktok-v2
description: Port an HTML/H5 game prototype to a TikTok Minis native package (game.js + canvas) with correct upload layout; use instead of html-to-native-tiktok.
---

# Port HTML Game → TikTok Minis Native (Gameplay Test)

## Goal
Convert an HTML/H5 prototype into a TikTok Minis **native** package (`game.js` + canvas, no DOM) and test
gameplay on emulator/device **before** adding ads. HTML/H5 mini games are no longer accepted (sunset Aug–Sep 2026),
so the uploaded package must have a native entry, never an `index.html` entry.

## The one rule that breaks uploads
The packer only looks at the **root** of what you upload. The upload root must contain:
```
game.json            ← "Cannot find game.json in the project source" = this file is not at the root
game.js              ← entry
project.config.json  ← real appid
res/game.js          ← every subpackage root needs its own game.js (a 1-line stub is fine)
res/...              ← subpackage assets
```
- Run `ttmg dev` **inside the build output folder** (`dist/<game>/`), never in the repo root or `native/project/`
  (those have no built `game.js`).
- If uploading a zip, zip the folder **contents** (`game.json` at the zip root), not the folder itself and never
  the source repo. Build the zip with the build script and check it with `tools/check_package.js`.

## SDK facts (verify in docs before coding; they change)
- Namespace is `TTMinis.game.*`; some docs show `TTMinis.*` and older code uses `tt.*`. The adapter must resolve
  each API by name across `TTMinis.game → TTMinis → tt`, and gate with `canIUse`.
- `createCanvas()`: the **first** call is the on-screen canvas, later calls are offscreen. No `document`, no DOM.
- `createImage()` (src: path/URL/base64), `onTouchStart/Move/End/Cancel(res)` with
  `res.touches / res.changedTouches`. Read each touch's `clientX ?? x ?? pageX`, because the touch fields are
  not documented.
- `getWindowInfo()` / `getSystemInfoSync()` → `safeArea` (may be missing), `statusBarHeight`, `pixelRatio`;
  `getMenuButtonBoundingClientRect()` = TikTok capsule (··· ✕), so keep the HUD below it.
- Storage `getStorageSync/setStorageSync`; audio `createWebAudioContext()` (synth SFX OK) or `createInnerAudioContext()`;
  `loadSubpackage({name})` + `task.onProgressUpdate`; `onShow/onHide`; `vibrateShort/Long`; `setPreferredFramesPerSecond`.
- Missions need TikTok ≥ 41.0: `addShortcut`, `getShortcutMissionReward` → `{canReceiveReward}`,
  `startEntranceMission`, `getEntranceMissionReward` → `{canReceiveReward}`, (0.32+) `reportMissionRewardGranted`.
  Share: `shareAppMessage({title, query})`. Silent login: `login()`.
- **Canvas quirk (TikTok Krypton canvas, seen on device: no error, just faded UI):** a gradient fill paints with the
  **alpha of the last solid colour that was DRAWN**. The common pattern `fillStyle='rgba(0,0,0,0.3)'; fill()` (shadow)
  → `fillStyle=gradient; fill()` paints the gradient at 30%, so shelves, buttons, panels and pills look see-through.
  Strokes, text, solid fills and `drawImage` are unaffected, and nothing is logged.
  State syncs to native **lazily, on draw**: re-assigning `fillStyle='#000'` before the gradient does NOT help
  (tried, failed on device). The fix is to never send a translucent colour to native at all (see Phase 2 SafeContext).
- Limits (non-Unity): main package ≤ 4 MB (total minus subpackage roots), total ≤ 30 MB. `game.json` uses lowercase `subpackages`.

## Checklist

### PHASE 1: Project setup
- [ ] Folder structure (`<game>` = short kebab name of THIS game, not a template's name):
  ```
  js/              shared game code, framework-agnostic (config, core/rules, game state, render, input, …)
  native/src/      adapter.js, ui_native.js, minis_native.js, main_native.js
  native/project/  project.config.json, game.json, res/ (subpackage, with res/game.js stub), ui/ (optional)
  native/emulator/ index.html (TTMinis.game shim)
  tools/           build_native.js, check_package.js, zip.js, (asset bake / level gen tools)
                   → copy check_package.js + zip.js from this skill's scripts/ folder (if missing, write equivalents)
  dist/            build output: <game>/ (UPLOAD THIS), <game>-upload.zip, emulator/
  ```
- [ ] `native/project/project.config.json`: `appid` (required), `compileType: "game"`
- [ ] `native/project/game.json`: `deviceOrientation`, `subpackages: [{ "name": "res", "root": "res/" }]`
- [ ] `js/config.js`: VERSION, economy, rewards, `ADS` dummy (`enabled:false`)
- [ ] Ask the user for the **app ID** up front; without it DevTool can't upload.

### PHASE 2: HTML → native conversion
- [ ] Read the prototype: game loop, asset loading, logic, every DOM/window API it touches
- [ ] Split into `js/` modules. Simplest safe method: keep the prototype's single closure scope by concatenating
      modules into one IIFE in a fixed order (no template needed: order = adapter → config → logic → render → input → loop → boot)
- [ ] Assets: inline base64 → files. Anything the prototype painted into DOM canvases at start-up
      (sprite variants, expressions) → **bake into an atlas at build time** (Playwright) and put it in the `res` subpackage
- [ ] Heavy start-up work (procedural level generation, solvers) → pre-generate offline into a JS data file
- [ ] `native/src/adapter.js` (`Platform`): canvas, offscreen canvas, images, storage (JSON strings), audio
      (`setValueAtTime` before ramps; fall back when ramps are missing), safe area + capsule normalisation,
      touch, lifecycle, launch query, subpackage, `ctx.ellipse` polyfill, try/catch around every SDK call
- [ ] **SafeContext** (`adapter.patchContext(ctx)` returns it; the game uses it as `ctx`, unchanged code): a plain JS
      wrapper we own around the native 2D context, so interception is guaranteed (do not rely on
      `defineProperty` on host objects):
  - [ ] `fillStyle`/`strokeStyle` setters parse colours: `rgba(r,g,b,a)` / `#rrggbbaa` → opaque `rgb(r,g,b)` + alpha `a`
        (cache parsed colours, bounded size); gradients come from wrapper `createLinear/RadialGradient` (record stops)
  - [ ] track `globalAlpha`, `fillStyle`, `strokeStyle` in our own `save/restore` stack
  - [ ] before **every** `fill/fillRect/fillText/stroke/strokeRect/strokeText/drawImage`: set native `globalAlpha =
        userAlpha × colourAlpha` and native style, so native only ever sees opaque solid colours
  - [ ] forward everything else (paths, transforms, text props, `measureText`, `clip`); `ellipse` polyfill
  - [ ] `gradfix=0` launch query returns the raw context (A/B); expose `renderMode()` (`safe`/`flat`/`raw`)
- [ ] **Graphics fallback toggle** in Settings (`Graphics: Gradient / Flat`, saved): flat mode draws each gradient as the
      average of its stops, so a device-specific canvas bug can be bypassed without a new build
- [ ] **Version + build stamp visible** in Settings and on the loading screen (`Version X.Y.Z · build <UTC time>`,
      build script injects the stamp) and logged on boot with the render mode, so device reports name the exact build
- [ ] Avoid `shadowBlur` for glows on device (fallback: radial gradient halo)
- [ ] `native/src/ui_native.js`: loading screen with progress, fatal-error screen (no DOM), panels the game
      needs, and press handling: buttons fire on release inside the button (`buttonStart/Move/End`), board taps on start
- [ ] Bottom nav (Shop/Upgrade/Task/Map/Settings) only if the game actually has those screens
- [ ] `native/src/main_native.js`: loading → `loadSubpackage('res')` → decode atlas → restore save → start loop

### PHASE 3: TikTok platform APIs
- [ ] `js/minis.js` (when/how much to reward, claim flags saved so nothing is granted twice) +
      `native/src/minis_native.js` (SDK calls, `canIUse`-gated)
  - [ ] Home screen shortcut → `addShortcut` then `getShortcutMissionReward`
  - [ ] Revisit → `startEntranceMission`; claim with `getEntranceMissionReward` on boot **and** every `onShow`
  - [ ] Share → `shareAppMessage` → coins on success (daily cap)
- [ ] Silent `login()` on boot; `onHide` → save + suspend audio; `onShow` → reset frame timer, re-check missions
- [ ] Save after every settled move, level end, reward, and on hide

### PHASE 4: Build & packaging
- [ ] `node tools/build_native.js --appid <APP_ID>` must:
  - [ ] concatenate modules → `dist/<game>/game.js` (syntax-check the bundle; minify if terser is available)
  - [ ] copy `game.json`, `project.config.json` (inject appid), `res/` (and `ui/`) to `dist/<game>/` **root**
  - [ ] write `dist/<game>-upload.zip` with `game.json` at the zip root (zip the folder contents;
        `require('./zip').zipDir(dist/<game>, zipPath)` from scripts/zip.js works on any OS, no zip CLI needed)
  - [ ] run `tools/check_package.js dist/<game>` → game.json/game.js/project.config.json at root, valid JSON,
        lowercase `subpackages`, each root exists with a `game.js`, appid set, main < 4 MB, total < 30 MB, no `index.html`
  - [ ] copy the emulator to `dist/emulator/`
- [ ] Deliver to the user **the upload folder or upload zip**, separately from any source zip, and say which one to upload

### PHASE 5: Testing
- [ ] **Emulator** (`cd dist && python3 -m http.server 8000` → `/emulator/index.html`)
  - [ ] boots with no JS errors · touch selects/moves · HUD inside safe area and below the capsule
  - [ ] a level can be finished by real taps · save/load across reload · onHide saves
  - [ ] mission sheets + reward popup, no double reward · `?ttquirks=1` audio quirks · small (iPhone SE) and notched devices
  - [ ] the emulator must **simulate device canvas quirks** (`?ttquirks=1` / `?gradquirk=1`): remember the alpha of the
        last solid colour actually used in `fill/fillRect/fillText` (lazy sync: assignments alone don't count) and
        multiply `globalAlpha` by it while a gradient is active; a plain browser hides this bug
  - [ ] when a device bug comes back after a "fix", first make the emulator simulation reproduce the device result
        **including the failed fix** (the failed build must fail the test), then fix, then re-run
  - [ ] pixel-compare test: read the same points (shelf, bed, button, HUD pill) from a clean render, a quirk render
        with the fix off (must differ, which proves the simulation works) and a quirk render with the fix on (must match)
  - [ ] automate it: `tools/test_emulator.js` (Playwright) taps the canvas via real pointer events
- [ ] **Device**
  ```bash
  npm install @ttmg/cli -g
  ttmg login
  cd dist/<game>          # the folder with game.json at its root
  ttmg dev                # DevTool → checks pass → Upload → scan QR with a test account
  ```
  - [ ] smooth gameplay · safe areas · touch · audio/vibration · save/resume · missions

### Troubleshooting
- **`Pack Error … Cannot find game.json in the project source`**: you uploaded or ran `ttmg dev` on a folder or zip whose root
  is not the build output (e.g. the source repo zip `<repo>/dist/<game>/game.json`). Upload `dist/<game>/` or
  `dist/<game>-upload.zip`; confirm with `node tools/check_package.js <folder|zip>`.
- **Subpackage error**: `subpackages` must be lowercase, every `root` must exist and contain `game.js`.
- **DevTool won't run / upload**: `appid` missing or still the placeholder in `project.config.json`.
- **UI see-through on device (shelves, beds, buttons, panels, popups faded; cats/images fine; vConsole shows no error)**:
  the Krypton gradient-alpha quirk. Use SafeContext (not a fillStyle reset, which fails because of lazy sync),
  reproduce it in the emulator with `?gradquirk=1` first, verify by pixel-comparing against a clean render. If it still
  shows on a device, check the build stamp in Settings (stale upload?), then try `Graphics: Flat`.
- **"Still the same" after an update**: compare the version/build shown in Settings with the build you produced;
  DevTool/TikTok may still be running a previous upload or a cached package.
- **Audio freezes**: AudioParam ramps; make sure the adapter sets values first and falls back.
- **HUD off-screen / under capsule**: normalise safeArea + `getMenuButtonBoundingClientRect` in the adapter.
- **Touch not working**: touch field names; log `res.changedTouches[0]` on device.
- **Popup text wrong**: game name in `js/config.js` (`GAME_NAME`).
- **Stale save**: emulator "Clear save" / F12 → Storage, or clear TikTok app cache.

## Outputs
- `dist/<game>/` and `dist/<game>-upload.zip`: what goes to TikTok DevTool (game.json at root)
- `dist/emulator/index.html`: local test
- Source committed to git (source zip is for the developer, **not** for upload)

## Next step
Once gameplay is verified on device → **Skill 2: integrate-hs-sdk-ads**