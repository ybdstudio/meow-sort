---
name: "html-to-native-tiktok"
description: "Port game from HTML prototype to TikTok Minis native build for gameplay testing"
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
  - [ ] write `dist/<game>-upload.zip` with `game.json` at the zip root (zip the folder contents)
  - [ ] run `tools/check_package.js dist/<game>` → game.json/game.js/project.config.json at root, valid JSON,
        lowercase `subpackages`, each root exists with a `game.js`, appid set, main < 4 MB, total < 30 MB, no `index.html`
  - [ ] copy the emulator to `dist/emulator/`
- [ ] Deliver to the user **the upload folder or upload zip**, separately from any source zip, and say which one to upload

### PHASE 5: Testing
- [ ] **Emulator** (`cd dist && python3 -m http.server 8000` → `/emulator/index.html`)
  - [ ] boots with no JS errors · touch selects/moves · HUD inside safe area and below the capsule
  - [ ] a level can be finished by real taps · save/load across reload · onHide saves
  - [ ] mission sheets + reward popup, no double reward · `?ttquirks=1` audio quirks · small (iPhone SE) and notched devices
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
