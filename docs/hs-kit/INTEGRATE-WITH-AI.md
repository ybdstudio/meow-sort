# Add the HS SDK to your TikTok mini game — with your AI assistant

For **native** TikTok mini games (a `game.js` + `game.json` package drawn on a
canvas). TikTok no longer accepts H5 games.

**How it works, in one picture**

```
your game                         HS kit                          HS dashboard (no new build)
─────────                         ──────                          ─────────────────────────────
mission done → claim('mission_a') ─┐                               rewards:  mission_a → { hint: 2 }
ad moment    → showAd('revive')   ─┼─► looks up the key ─► onGive  placements: revive → TikTok ad ids
share button → share({...})       ─┤   (dashboard, else            items:    hint → { name, icon }
purchase     → (automatic)        ─┘    your defaults)             products: Gold pack → { coins: 200 }
```

Your game only says **"this moment happened"** (a key). What it is worth —
and whether an ad shows there at all — is data you can change any time.

You need:

1. **The kit** next to your `game.js`: `hs-game.js` and `hs-tiktok-sdk.min.js`.
2. **Your game registered in the HS dashboard** — step 0 below. It gives you the **SDK key**.
3. **Node.js**, to run the check in step 2.

---

## Step 0 — register your game in the HS dashboard

You need your game's app in the **TikTok developer console** first: its
**Client Key**, **Client Secret** and **App ID**.

1. HS dashboard → **Games** → **Add Game**.
2. Fill in:

   | Field | What to put |
   |---|---|
   | Game Name | anything you like, e.g. `Rotate Rings` |
   | Game ID | your TikTok **App ID** — numbers only, e.g. `7618488811156293643` |
   | Client Key | the TikTok **Client Key** of the app |
   | Client Secret | the TikTok **Client Secret** of the app |

3. Save. The dashboard shows your **SDK key** (`sk_live_…`) — copy it. It is
   also in the Games list later (click it to copy).

> 🔒 The **Client Secret** goes into the dashboard **only** — never into
> `game.js`, the prompt below, a chat, or a screenshot. Everything in `game.js`
> is public. The SDK key and Game ID are fine in `game.js`: they identify the
> game, they are not secrets.

Also put the **App ID** (or Client Key, as your TikTok CLI asks) into your
game's `project.config.json` → `"appid"`.

---

## Step 1 — copy everything in the box below and paste it to your AI

Open your game folder in Claude Code / Cursor / your AI tool. Fill in the Game
ID and SDK key from step 0 first (NOT the Client Secret).

````text
Integrate the HS TikTok SDK kit into my native TikTok mini game.
hs-game.js and hs-tiktok-sdk.min.js are already next to game.js — do NOT edit them.

gameId: <PASTE GAME ID>
sdkKey: <PASTE SDK KEY>

THE MODEL
My game never decides what a reward is worth. It only reports that a moment
happened, by KEY. The HS dashboard (or my defaults when offline) decides what
that key gives. Everything given arrives in ONE function, onGive.

API (hs-game.js) — use only this:

  var HSGame = require('./hs-game.js');           // top of game.js

  HSGame.start({                                  // ONCE at startup, before the game loop needs rewards
    gameId: '...', sdkKey: '...',
    defaults: DEFAULTS,                           // see "DEFAULTS" below
    onGive: function (items, from) { ... },       // THE ONLY place anything is given
    onLoad: function (cloud) { ... }              // cloud save from another phone
  });

  HSGame.claim(key)              // a moment completed -> its reward goes to onGive.
                                  // Returns the items (to show "+2 hints") or null.
                                  // Refused (null) until start() has resolved, and for
                                  // ad places and "share" — those pay themselves.
  HSGame.available(key)          // true if claim(key) would give something now ("!" badge)
  HSGame.rewards(key)            // { hint: 2 } — to show "Reward: 2 hints" before it is earned

  HSGame.showAd(place)           // show the ad set up for this place. Promise:
                                  //   null = no ad / closed early,  {} = ad done, no reward,
                                  //   {...} = ad done and reward given (via onGive)
  HSGame.canShowAd(place)        // show/hide an "watch ad" button — ask every time it is drawn

  HSGame.share({ title, subtitle, imageUrl })   // share sheet; reward of key "share" (once a day) -> onGive
  HSGame.canShare()

  HSGame.tiktokMission.start('shortcut' | 'profile')   // TikTok's own missions: button sends the player off;
  HSGame.tiktokMission.supported(kind)                  // the reward (key tiktok_shortcut / tiktok_profile)
  HSGame.tiktokMission.done(kind)                       // arrives in onGive by itself when TikTok confirms

  HSGame.shop()                  // Promise: [{ product_id, name, description, beans_cost, items, ...icon/badge }]
  HSGame.buy(productId)          // Promise: { ok, error, delivered } — the items arrive in onGive, never
                                  // give them here. ok && !delivered: paid, arrives at next start — say so.

  HSGame.item(id)                // { category, name, icon, ... } — name/icon for any item, from the dashboard
  HSGame.save(progress)          // the WHOLE small progress object, after every change

DEFAULTS — write this object in game.js. It is also what I paste into the
dashboard, so keep it complete:

  var DEFAULTS = {
    rewards: {
      // key: { item: count, ..., "$limit": "once" | "daily" }   (no $limit = every time)
      mission_a:       { hint: 2, revive: 1, $limit: 'once' },
      daily_gift:      { coins: 50, $limit: 'daily' },
      revive:          { revive: 1 },                 // the reward of the ad place "revive"
      share:           { hint: 3, $limit: 'daily' },
      tiktok_shortcut: { hint: 3 },                    // TikTok mission: opened from home-screen icon (once)
      tiktok_profile:  { hint: 3 }                     // TikTok mission: came in from the profile (once)
    },
    items: {
      // id: { category, name, icon? }   — category is what onGive switches on
      hint:   { category: 'consumable', name: 'Hint' },
      coins:  { category: 'currency',   name: 'Coins' },
      revive: { category: 'consumable', name: 'Revive' }
    }
  };

RULES
 1. Native only: no DOM, window, document, <script> or localStorage unless the
    game already shims them.
 2. Keys and places: lowercase_snake_case, one per moment, used EXACTLY the
    same in code and DEFAULTS. Put showAd('...') at EVERY moment an ad could
    fit (level_win, level_fail, revive, hint, double_coins...). A place with no
    ad in the dashboard does nothing, so more places cost nothing — ops switch
    them on later without a build.
 3. Every moment that could give a reward calls claim('key') — missions,
    quests, daily gifts, level bonuses, first win... The game decides WHEN a
    moment is complete; it never decides what it gives. Claims happen after
    HSGame.start(...) has resolved (e.g. start().then(showMainMenu)). An ad
    place's reward comes from showAd(place), the share reward from share() —
    never claim() those keys.
 4. onGive(items, from) is the ONLY place items are added. It handles every
    item by its category (HSGame.item(id).category, or DEFAULTS.items), and
    THROWS for an item or category it does not know — then nothing is recorded
    and the reward is not lost. Never add items anywhere else (not after
    claim, not after showAd, not after buy).
 5. Use the return values only for messages and flow: claim/showAd/share
    return the items given ("+2 hints!"), showAd returns null/{} to decide
    e.g. revive vs game over: showAd('revive').then(function (r) { r ? revive() : gameOver(); }).
 6. Never show an amount you typed: labels come from HSGame.rewards(key) and
    names/icons from HSGame.item(id).
 7. Shop screen: draw HSGame.shop() items with their name, beans_cost, items and
    any display fields (icon, badge). Buy with HSGame.buy(product_id).
 8. Cloud save: ONE small plain progress object. save() after every change. In
    onLoad keep the FURTHER progress (higher level wins), apply it, then save(merged).
 9. Never call tt.login, TTMinis.game.*, createRewardedVideoAd,
    createInterstitialAd, shareAppMessage, addShortcut or startEntranceMission —
    HSGame does. No secret other than the sdkKey in game.js — never ask me for
    or write the TikTok Client Secret.
10. If start() fails or there are no credentials, the game must still play:
    rewards come from DEFAULTS, ads/shop/cloud are simply off.
11. Change as little as possible. Do not restyle or refactor unrelated code.

WHEN DONE
A. Write, NEXT TO the game folder (not inside it — it must not be uploaded to
   TikTok), a file named <game folder name>.hs-dashboard.json:
   {
     "iaa_config": {
       "placements": [ { "label": "<every place in the code>", "ads": [ { "id": "<AD UNIT ID>" } ] } ],
       "rewards": <DEFAULTS.rewards, as JSON>,
       "items":   <DEFAULTS.items, as JSON>
     },
     "products": [ { "id": 1, "name": "...", "description": "...", "beans_cost": 10,
                     "rewards": { "<item>": <count> }, "icon": "...", "badge": "..." } ]
   }
   (products only if the game has a shop; one example product per kind you sell)
B. List: every key and where it is claimed, every ad place, every item and its
   category, and every change you made.
````

## Step 2 — run the check

```bash
node hs-check.mjs path/to/your-game-folder
```

Fix every ❌ (paste the line to your AI). The check runs your game in a fake
TikTok with your `<game>.hs-dashboard.json` as the dashboard, and tells you
whether **this build** can actually give every reward in it:

```
✅ PASS  native package (game.js, no index.html)
✅ PASS  SDK v1.0.7
✅ PASS  boots in the native runtime without errors
✅ PASS  SDK started (host: minigame), onGive set
✅ PASS  login over tt.request, with delivery confirmation
✅ PASS  a 3 s rewarded ad with no hide event completes (iOS case)
✅ PASS  onGive gives: mission_a {"hint":2,"revive":1} · daily_gift {"coins":50} · revive {"revive":1}
✅ PASS  dashboard JSON is well-formed (3 places, 6 reward keys, 3 items, 2 products)
ℹ️  INFO  ad places in the code: level_win, level_fail, revive
✅ PASS  progress uploads to the cloud: {"level":5,"coins":120}
✅ PASS  new phone: cloud progress restored and saved back unchanged
```

Nothing is sent to TikTok or to us, and no file is changed.

## Step 3 — in the HS dashboard

See [DASHBOARD-CONFIG.md](DASHBOARD-CONFIG.md). In short:

1. **Edit Game → Ad placements**: add your TikTok ad unit ids (`ad…`).
2. Put those ids into `<game>.hs-dashboard.json` in place of `<AD UNIT ID>`,
   run the check again, then paste its `iaa_config` into **Ads Config → Edit raw JSON** → Save.
3. **Products → Import JSON**: paste `products`.

From then on you change amounts, switch ad places on/off, add reward keys for
moments the game already reports, add items of categories the game already
handles, and add products — all in the dashboard, no new build.

**Needs a new build:** a new moment in the code, a new item category, new UI.

## Step 4 — on a phone (iOS and Android)

- [ ] Ad at a place → watched to the end → reward; closed early → nothing.
- [ ] A place with no ad in the dashboard → nothing happens, game goes on.
- [ ] Change an amount in the dashboard, restart → the new amount.
- [ ] Share → reward; share again the same day → nothing.
- [ ] Add to home screen, open from the icon → reward, once.
- [ ] Delete the app, reinstall → progress and claimed rewards come back.
- [ ] Buy something, kill the app during payment, reopen → the items arrive once.

---

**Version:** kit 3.0.0 · needs `hs-tiktok-sdk.min.js` 1.0.7+.
