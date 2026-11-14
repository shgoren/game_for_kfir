// צלילים — מסונתזים ב-WebAudio, בלי קבצים
(function () {
  'use strict';
  let ac = null, master = null, muted = false;
  let engine = null;
  try { muted = localStorage.getItem('ey_mute') === '1'; } catch (e) {}

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ac) return;
    const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, when) {
    if (!ac) return;
    const t = ac.currentTime + (when || 0);
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = ac.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  const SFX = {
    init,
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('ey_mute', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    coin() { tone(988, 0.08, 'square', 0.12); tone(1319, 0.18, 'square', 0.12, 0.07); },
    click() { tone(660, 0.05, 'triangle', 0.15); },
    beep() { tone(880, 0.15, 'sine', 0.3); },
    go() { tone(1320, 0.4, 'sine', 0.35); },
    checkpoint() { tone(784, 0.1, 'triangle', 0.25); tone(1175, 0.18, 'triangle', 0.25, 0.08); },
    error() { tone(200, 0.2, 'sawtooth', 0.15, 0, 140); },
    punch() { noise(0.25, 0.7, 900); tone(120, 0.25, 'sine', 0.5, 0, 50); },
    build() { for (let i = 0; i < 4; i++) { noise(0.06, 0.4, 2500, i * 0.18); tone(300, 0.06, 'square', 0.08, i * 0.18); } },
    whoosh() { noise(0.5, 0.25, 600); },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.25, i * 0.12));
      tone(1047, 0.6, 'triangle', 0.25, 0.5); tone(1319, 0.6, 'triangle', 0.18, 0.5);
    },
    medal() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'square', 0.1, i * 0.09)); },
    land() { noise(0.15, 0.35, 400); },
    // מנוע: עוצמה וגובה לפי מהירות
    engine(type, speed) {
      if (!ac) return;
      if (!engine) {
        const o1 = ac.createOscillator(), o2 = ac.createOscillator();
        const f = ac.createBiquadFilter(), g = ac.createGain();
        o1.type = 'sawtooth'; o2.type = 'square';
        f.type = 'lowpass'; f.frequency.value = 700;
        g.gain.value = 0;
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
        o1.start(); o2.start();
        engine = { o1, o2, f, g };
      }
      const t = ac.currentTime;
      if (!type || type === 'bike') { engine.g.gain.setTargetAtTime(0, t, 0.1); return; }
      const base = { moto: 55, atv: 45, jeep: 35, tractor: 28 }[type] || 40;
      const s = Math.abs(speed);
      const f = base + s * (type === 'moto' ? 0.32 : 0.22);
      engine.o1.frequency.setTargetAtTime(f, t, 0.05);
      engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      engine.f.frequency.setTargetAtTime(400 + s * 2, t, 0.1);
      engine.g.gain.setTargetAtTime(0.05 + Math.min(0.09, s / 4000), t, 0.08);
    },
  };
  window.SFX = SFX;
})();
