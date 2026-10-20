/* ===================== MINIS NATIVE: TikTok platform calls =====================
   Thin wrappers over the TikTok Mini Games SDK (Revisit Incentives, Sharing,
   Login). Every call is gated with canIUse; these APIs need TikTok >= 41.0.0.
   Callbacks are normalised to cb(ok:boolean, detail). */
var MinisNative = {
  supports: function (feature) {
    if (feature === 'shortcut') return Platform.canIUse('addShortcut');
    if (feature === 'revisit') return Platform.canIUse('startEntranceMission');
    if (feature === 'share') return Platform.canIUse('shareAppMessage');
    return false;
  },
  addShortcut: function (cb) {
    Platform.call('addShortcut', {
      success: function () { cb(true); },
      fail: function (e) { Platform.warn('addShortcut fail', e); cb(false, e && e.error_msg === 'cancel' ? 'Cancelled' : null); }
    });
  },
  getShortcutMissionReward: function (cb) {
    Platform.call('getShortcutMissionReward', {
      success: function (r) { cb(!!(r && r.canReceiveReward)); },
      fail: function () { cb(false); }
    });
  },
  startEntranceMission: function (cb) {
    Platform.call('startEntranceMission', { success: function () { cb(true); }, fail: function () { cb(false); } });
  },
  getEntranceMissionReward: function (cb) {
    Platform.call('getEntranceMissionReward', {
      success: function (r) { cb(!!(r && r.canReceiveReward)); },
      fail: function () { cb(false); }
    });
  },
  // SDK 0.32+: tell the platform the reward was delivered (no-op if missing).
  reportGranted: function (mission) {
    if (Platform.fn('reportMissionRewardGranted')) Platform.call('reportMissionRewardGranted', { mission: mission });
  },
  share: function (opts, cb) {
    Platform.call('shareAppMessage', {
      title: opts.title, query: opts.query,
      success: function () { cb(true); },
      fail: function (e) { Platform.log('share fail/cancel', e); cb(false); }
    });
  },
  // Silent login: we only keep the code for a future backend (no server yet).
  login: function () {
    Platform.call('login', {
      success: function (r) { Minis.loginCode = (r && r.code) || ''; Platform.log('login ok'); },
      fail: function (e) { Platform.log('login skipped', e); }
    });
  }
};
