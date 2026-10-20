/* ===================== MINIS: platform rewards (game side) =====================
   Game rules for TikTok revisit/share incentives. Platform calls live in
   native/src/minis_native.js (MinisNative); this file only decides WHEN to
   reward and HOW MUCH, and keeps the claim flags in the save file so a reward
   is never granted twice. */
var Minis = {
  state: { shortcutClaimed: false, revisitClaimed: false, shareDay: '', shareCount: 0 },

  load: function (saved) {
    if (!saved) return;
    for (var k in this.state) if (saved[k] !== undefined) this.state[k] = saved[k];
  },
  today: function () { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  sharesLeft: function () {
    if (this.state.shareDay !== this.today()) return GAME_CONFIG.rewards.shareDailyLimit;
    return Math.max(0, GAME_CONFIG.rewards.shareDailyLimit - this.state.shareCount);
  },

  /* Rows shown in the Rewards panel */
  rows: function () {
    var R = GAME_CONFIG.rewards;
    return [
      { id: 'shortcut', title: 'Add to Home Screen', coins: R.shortcut, done: this.state.shortcutClaimed,
        available: MinisNative.supports('shortcut'), cta: 'Add' },
      { id: 'revisit', title: 'Revisit from your Profile', coins: R.revisit, done: this.state.revisitClaimed,
        available: MinisNative.supports('revisit'), cta: 'Go' },
      { id: 'share', title: 'Share with a friend (' + this.sharesLeft() + ' left today)', coins: R.share,
        done: this.sharesLeft() <= 0, available: MinisNative.supports('share'), cta: 'Share' }
    ];
  },

  grant: function (id, coins, title) {
    game.coins += coins;
    Anim.coinPillBounce = 1;
    Sound.coin();
    fx.rewardPopup(title || GAME_NAME, coins);
    saveProgress();
  },

  /* Player tapped a row */
  start: function (id) {
    var self = this, R = GAME_CONFIG.rewards;
    if (id === 'shortcut' && !this.state.shortcutClaimed) {
      MinisNative.addShortcut(function (ok, err) {
        if (!ok) { fx.toast(err || 'Could not add shortcut'); return; }
        self.checkShortcut(true);
      });
    } else if (id === 'revisit' && !this.state.revisitClaimed) {
      MinisNative.startEntranceMission(function (ok) {
        if (!ok) fx.toast('Revisit mission is not available');
        else fx.toast('Open ' + GAME_NAME + ' from your TikTok profile to claim!', 2.6);
      });
    } else if (id === 'share' && this.sharesLeft() > 0) {
      MinisNative.share({ title: GAME_NAME + ' — can you sort all the cats?', query: 'from=share&level=' + (game.levelIndex + 1) },
        function (ok) {
          if (!ok) return;
          if (self.state.shareDay !== self.today()) { self.state.shareDay = self.today(); self.state.shareCount = 0; }
          self.state.shareCount++;
          self.grant('share', R.share, 'Thanks for sharing!');
        });
    }
  },

  /* Ask the platform whether a pending reward can be claimed. */
  checkShortcut: function (fromTap) {
    var self = this;
    if (this.state.shortcutClaimed) return;
    MinisNative.getShortcutMissionReward(function (can) {
      if (can && !self.state.shortcutClaimed) {
        self.state.shortcutClaimed = true;
        self.grant('shortcut', GAME_CONFIG.rewards.shortcut, 'Shortcut added!');
        MinisNative.reportGranted('shortcut');
      } else if (fromTap) fx.toast('Shortcut added — reward will arrive soon');
    });
  },
  checkRevisit: function () {
    var self = this;
    if (this.state.revisitClaimed) return;
    MinisNative.getEntranceMissionReward(function (can) {
      if (can && !self.state.revisitClaimed) {
        self.state.revisitClaimed = true;
        self.grant('revisit', GAME_CONFIG.rewards.revisit, 'Welcome back!');
        MinisNative.reportGranted('revisit');
      }
    });
  },
  /* Called on boot and every time the game returns to the foreground. */
  checkAll: function () { this.checkShortcut(false); this.checkRevisit(); }
};
