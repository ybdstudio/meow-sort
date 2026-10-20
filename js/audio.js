/* ===================== AUDIO =====================
   Synthesized SFX on createWebAudioContext() (no audio files needed).
   Param writes go through Platform.setParam/ramp (TikTok iOS quirk fix). */
var Sound = {
  ac: null, on: true,
  init: function () {
    if (!this.ac) this.ac = Platform.createAudioContext();
    if (this.ac && this.ac.state === 'suspended') { try { this.ac.resume(); } catch (e) {} }
  },
  tone: function (f, dur, type, vol, slide, delay) {
    if (!this.on || !this.ac) return;
    try {
      var t = this.ac.currentTime + (delay || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'sine'; Platform.setParam(o.frequency, f, t);
      if (slide) Platform.ramp(o.frequency, 'exp', slide, t + dur);
      Platform.setParam(g.gain, 0.0001, t); Platform.ramp(g.gain, 'exp', vol || 0.12, t + 0.012);
      Platform.ramp(g.gain, 'exp', 0.0001, t + dur);
      o.connect(g); g.connect(this.ac.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  },
  select: function () { this.tone(620, 0.1, 'sine', 0.12, 900); this.tone(980, 0.08, 'sine', 0.06, 1300, 0.05); },
  jump: function () { this.tone(300, 0.22, 'triangle', 0.09, 760); },
  land: function () { this.tone(200, 0.09, 'sine', 0.14, 110); this.tone(1200, 0.06, 'sine', 0.05, 1500, 0.06); },
  invalid: function () { this.tone(170, 0.11, 'square', 0.04, 130); this.tone(150, 0.13, 'square', 0.04, 100, 0.12); },
  match: function () { var s = this; [660, 784, 988, 1319].forEach(function (f, i) { s.tone(f, 0.18, 'triangle', 0.11, null, i * 0.08); }); },
  pop: function () { this.tone(880, 0.07, 'sine', 0.08, 1400); },
  sad: function () { this.tone(440, 0.3, 'triangle', 0.07, 300); },
  win: function () { var s = this; [523, 659, 784, 1047, 1319].forEach(function (f, i) { s.tone(f, 0.25, 'triangle', 0.12, null, i * 0.11); }); },
  click: function () { this.tone(520, 0.05, 'sine', 0.08); },
  coin: function () { var s = this; [988, 1319, 1568].forEach(function (f, i) { s.tone(f, 0.12, 'sine', 0.09, null, i * 0.07); }); },
  suspend: function () { try { if (this.ac && this.ac.suspend) this.ac.suspend(); } catch (e) {} }
};

