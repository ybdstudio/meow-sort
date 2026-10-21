/* ===================== AUDIO =====================
   v0.5.1: SFX are synthesized ONCE into PCM buffers and played with AudioBufferSourceNode.
   Why: v0.4 drove oscillators through gain ramps + a compressor with no make-up gain, so real
   peaks stayed around 0.1-0.35 of full scale (quiet on phones). Now every sound is rendered in JS,
   given extra harmonics (phone speakers can't reproduce < ~400 Hz), soft-clipped for loudness and
   normalized to ~0.95 full scale. No AudioParam ramps at all (TikTok iOS quirk-proof).
   Falls back to the old oscillator path if the context has no createBuffer. */
var Sound = {
  ac: null, on: true, out: null, bufs: {}, legacy: false,
  master: 1.0,
  // name: [loudness 0..1, notes...]; note = [freqHz, dur s, wave, relVol, slideToHz|null, delay s]
  defs: {
    select:  [0.85, [620, 0.1, 'sine', 1, 900, 0], [980, 0.08, 'sine', 0.5, 1300, 0.05]],
    jump:    [0.75, [420, 0.2, 'triangle', 1, 900, 0]],
    land:    [0.85, [420, 0.09, 'triangle', 1, 260, 0], [1200, 0.06, 'sine', 0.4, 1500, 0.06]],
    invalid: [0.65, [340, 0.11, 'square', 1, 260, 0], [300, 0.13, 'square', 1, 220, 0.12]],
    match:   [1.0,  [660, 0.18, 'triangle', 1, null, 0], [784, 0.18, 'triangle', 1, null, 0.08],
                    [988, 0.18, 'triangle', 1, null, 0.16], [1319, 0.22, 'triangle', 1, null, 0.24]],
    pop:     [0.75, [880, 0.07, 'sine', 1, 1400, 0]],
    sad:     [0.8,  [520, 0.3, 'triangle', 1, 360, 0]],
    win:     [1.0,  [523, 0.25, 'triangle', 1, null, 0], [659, 0.25, 'triangle', 1, null, 0.11], [784, 0.25, 'triangle', 1, null, 0.22],
                    [1047, 0.25, 'triangle', 1, null, 0.33], [1319, 0.35, 'triangle', 1, null, 0.44]],
    click:   [0.7,  [620, 0.05, 'sine', 1, null, 0]],
    coin:    [0.85, [988, 0.12, 'sine', 1, null, 0], [1319, 0.12, 'sine', 1, null, 0.07], [1568, 0.16, 'sine', 1, null, 0.14]],
    tick:    [0.6,  [1200, 0.08, 'sine', 1, 1600, 0]]
  },
  init: function () {
    if (!this.ac) {
      this.ac = Platform.createAudioContext();
      if (!this.ac) return;
      try {
        var m = this.ac.createGain(); Platform.setParam(m.gain, this.master, 0);
        m.connect(this.ac.destination); this.out = m;
      } catch (e) { this.out = this.ac.destination; }
      this.build();
    }
    if (this.ac && this.ac.state === 'suspended') { try { this.ac.resume(); } catch (e) {} }
  },
  build: function () {
    var ac = this.ac, self = this;
    if (typeof ac.createBuffer !== 'function' || typeof ac.createBufferSource !== 'function') { this.legacy = true; return; }
    try {
      Object.keys(this.defs).forEach(function (name) {
        var pcm = Sound.render(self.defs[name], ac.sampleRate || 44100);
        var b = ac.createBuffer(1, pcm.length, ac.sampleRate || 44100);
        if (typeof b.copyToChannel === 'function') b.copyToChannel(pcm, 0); else b.getChannelData(0).set(pcm);
        self.bufs[name] = b;
      });
    } catch (e) { Platform.warn('audio build', e); this.legacy = true; this.bufs = {}; }
  },
  // Pure math → Float32Array (also used by tools/test to measure loudness).
  render: function (def, sr) {
    var level = def[0], notes = def.slice(1), len = 0;
    notes.forEach(function (n) { len = Math.max(len, n[5] + n[1] + 0.02); });
    var N = Math.ceil(len * sr), out = new Float32Array(N), TAU = Math.PI * 2;
    notes.forEach(function (n) {
      var f0 = n[0], dur = n[1], wave = n[2], vol = n[3], f1 = n[4] || f0, start = Math.floor(n[5] * sr);
      var M = Math.floor(dur * sr), ph = 0, att = Math.max(1, Math.floor(0.005 * sr));
      for (var i = 0; i < M && start + i < N; i++) {
        var u = i / M, f = f0 * Math.pow(f1 / f0, u);
        ph += f / sr; ph -= Math.floor(ph);
        var s;
        if (wave === 'square') s = (ph < 0.5 ? 1 : -1) * 0.6 + Math.sin(TAU * ph) * 0.4;
        else if (wave === 'triangle') s = (1 - 4 * Math.abs(ph - 0.5)) * 0.75 + Math.sin(TAU * 2 * ph) * 0.25;
        else s = Math.sin(TAU * ph) * 0.75 + Math.sin(TAU * 2 * ph) * 0.2 + Math.sin(TAU * 3 * ph) * 0.05;   // sine + harmonics: audible on phone speakers
        var env = i < att ? i / att : Math.pow(1 - (i - att) / (M - att), 1.6);   // fast attack, smooth decay to 0
        out[start + i] += s * env * vol;
      }
    });
    var peak = 0, i;
    for (i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (!peak) return out;
    var drive = 2.2, norm = Math.tanh(drive);     // soft clip: more loudness (RMS) without harsh clipping
    for (i = 0; i < N; i++) out[i] = Math.tanh(drive * out[i] / peak) / norm * 0.95 * level;
    return out;
  },
  play: function (name) {
    if (!this.on || !this.ac) return;
    if (this.ac.state === 'suspended') { try { this.ac.resume(); } catch (e) {} }
    var b = this.bufs[name];
    if (b) {
      try { var s = this.ac.createBufferSource(); s.buffer = b; s.connect(this.out || this.ac.destination); s.start(0); return; }
      catch (e) {}
    }
    var self = this, d = this.defs[name]; if (!d) return;   // legacy oscillator fallback
    d.slice(1).forEach(function (n) { self.tone(n[0], n[1], n[2], 0.3 * d[0] * n[3], n[4], n[5]); });
  },
  tone: function (f, dur, type, vol, slide, delay) {
    if (!this.on || !this.ac) return;
    try {
      var t = this.ac.currentTime + (delay || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'sine'; Platform.setParam(o.frequency, f, t);
      if (slide) Platform.ramp(o.frequency, 'exp', slide, t + dur);
      Platform.setParam(g.gain, 0.0001, t); Platform.ramp(g.gain, 'exp', Math.min(0.9, vol || 0.3), t + 0.008);
      Platform.ramp(g.gain, 'exp', 0.0001, t + dur);
      o.connect(g); g.connect(this.out || this.ac.destination); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  },
  select: function () { this.play('select'); },
  jump: function () { this.play('jump'); },
  land: function () { this.play('land'); },
  invalid: function () { this.play('invalid'); },
  match: function () { this.play('match'); },
  pop: function () { this.play('pop'); },
  sad: function () { this.play('sad'); },
  win: function () { this.play('win'); },
  click: function () { this.play('click'); },
  coin: function () { this.play('coin'); },
  tick: function () { this.play('tick'); },
  suspend: function () { try { if (this.ac && this.ac.suspend) this.ac.suspend(); } catch (e) {} }
};
