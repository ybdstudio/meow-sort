/* ===================== MINIS: TikTok missions + share (Free Coins panel) =====================
   All through the HS kit (native/src/hs_native.js → HSMinis):
     shortcut → HSGame.tiktokMission.start('shortcut')  reward key tiktok_shortcut (once)
     revisit  → HSGame.tiktokMission.start('profile')   reward key tiktok_profile  (once)
     share    → HSGame.share({...})                      reward key share           (daily)
   Rewards arrive in hsOnGive when TikTok confirms; amounts come from HS (dashboard / defaults).
   The game never calls addShortcut / startEntranceMission / shareAppMessage itself. */
var Minis = {
  load: function () {},                     // old saves carried claim flags; HS keeps them now

  rows: function () {
    return [
      { id: 'shortcut', title: 'Add to Home Screen', coins: HS.amount('tiktok_shortcut', 'coins'),
        done: HSMinis.done('shortcut'), available: HSMinis.supported('shortcut'), cta: 'Add' },
      { id: 'revisit', title: 'Revisit from your Profile', coins: HS.amount('tiktok_profile', 'coins'),
        done: HSMinis.done('profile'), available: HSMinis.supported('profile'), cta: 'Go' },
      { id: 'share', title: 'Share with a friend (daily)', coins: HS.amount('share', 'coins'),
        done: HSMinis.canShare() && !HSMinis.shareAvailable(), available: HSMinis.canShare(), cta: 'Share' }
    ];
  },

  /* Free Coins row → the matching popup */
  start: function (id) {
    openMiniPopup(id === 'shortcut' ? 'pop_launch' : id === 'revisit' ? 'pop_entry' : 'pop_share');
  },

  /* Popup button: send the player off / share. Rewards arrive in hsOnGive. */
  act: function (kind) {
    var close = function () { if (uiPanel.indexOf('pop_') === 0) { game.resume(); uiPanel = 'settings'; } };
    if (kind === 'shortcut' || kind === 'profile') {
      HSMinis.start(kind).then(function (r) {
        if (r === 'unsupported') { fx.toast('Not available on this TikTok version'); return; }
        if (r === 'failed') { fx.toast(kind === 'shortcut' ? 'Could not add the shortcut' : 'Could not start the mission'); return; }
        close();
        if (kind === 'profile') fx.toast('Open ' + GAME_NAME + ' from your TikTok profile to claim!', 2.8);
        else if (!HSMinis.done('shortcut')) fx.toast('Open ' + GAME_NAME + ' from the home-screen icon to claim!', 2.8);
      });
    } else if (kind === 'share') {
      HSMinis.share({ title: GAME_NAME + ' — can you sort all the cats?' }).then(function (items) {
        close();
        if (items && items.coins) fx.rewardPopup('Share Rewards', items.coins);
        else if (HSGame && HSGame.lastShareError === 'claimed') fx.toast('Shared! Today\'s reward is already collected');
      });
    }
  }
};
