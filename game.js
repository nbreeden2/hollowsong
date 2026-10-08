/* Hollowsong — a game of singing upward.
 *
 * You are a glass seed in a vertical cave. Each of five keys sings a note;
 * singing a note pulls you toward the nearest crystal of that note. Holding
 * several notes (a chord) pulls you several ways at once, which is how you
 * steer. The Hush rises from below and silences everything it touches.
 *
 * World coordinates: x in [0, W], y grows downward, so climbing means y goes
 * negative. 20 px = 1 metre.
 */
(() => {
'use strict';

// ---------------------------------------------------------------- constants
const W = 960, H = 720;
const PX_PER_M = 20;
const FLOOR_Y = 160;
const RANGE = 340;          // how far a note can reach a crystal
const GRAV = 540;
const MAX_SPEED = 780;
const HUSH_LEAD = 520;      // the Hush never lags further than this below you
const EASE_M = 250;         // the climb starts gentle and reaches full difficulty here
const COACH_M = 60;         // live hints for new players stop at this height
const BREATH_COST = 11;     // per note, per second
const BREATH_REGEN = 28;
const CRYSTAL_WEAR = 0.19;  // charge lost per second while tethered
const TETHER_AIM = 60;      // early on, a note pulls toward this far above its crystal, so you rise past it instead of hanging below
const TETHER_AIM_FULL = 0;  // ...shrinking to this by EASE_M
const ECHO_PUSH = 90;       // how far an echo pushes the Hush back
const ECHO_FADE = 12;       // px per second: an echo's extra room fades over ~7.5 s
const DISPLAY = '"Italiana", "Cormorant Garamond", Georgia, serif';
const FIGURES = '"Spectral", Georgia, serif';
const MONO = '"Spline Sans Mono", ui-monospace, Consolas, monospace';
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Five notes of a pentatonic scale. Each has a colour and a crystal silhouette,
// so the game reads without relying on colour alone.
const NOTES = [
  { key: 'A', name: 'Ash',   deg: 0, color: '#ff8a6e', shape: 'spire' },
  { key: 'S', name: 'Amber', deg: 2, color: '#ffc75e', shape: 'lozenge' },
  { key: 'D', name: 'Moss',  deg: 4, color: '#86e8a0', shape: 'bloom' },
  { key: 'F', name: 'Tide',  deg: 7, color: '#62d2ff', shape: 'prism' },
  { key: 'G', name: 'Iris',  deg: 9, color: '#c9a2ff', shape: 'star' },
];
NOTES.forEach(n => { n.rgb = hexRgb(n.color); });

// Keyboard layouts. Each lists the key for notes 1→5. The two one-hand layouts
// follow piano fingering: the left thumb plays the top note, the right thumb the
// bottom one, so the space bar means a different note in each.
const LAYOUTS = {
  left:    { name: 'Left hand',  keys: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'Space'],     extra: { KeyG: 4 },  note: 'Fingers rest on A S D F, thumb on the space bar. G also plays the fifth note.' },
  right:   { name: 'Right hand', keys: ['Space', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'], extra: { Quote: 4 }, note: "Thumb on the space bar, fingers rest on J K L ;. The ' key also plays the fifth note." },
  classic: { name: 'Classic',    keys: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'],      extra: {},           note: 'The original five keys, one finger each.' },
  custom:  { name: 'Custom',     keys: null,                                           extra: {},           note: 'Your own five keys, for one hand or two.' },
};
// Number keys always work, whatever the layout.
const ALWAYS_KEYS = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4,
};
// Keys that run the game itself and can't be bound to notes.
const RESERVED = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'KeyP', 'KeyM', 'KeyR', ...Object.keys(ALWAYS_KEYS)]);
const CODE_LABELS = {
  Space: ['SPACE', 'Space'], Semicolon: [';', ';'], Quote: ["'", "'"], Comma: [',', ','], Period: ['.', '.'],
  Slash: ['/', '/'], Backslash: ['\\', '\\'], BracketLeft: ['[', '['], BracketRight: [']', ']'],
  Minus: ['-', '-'], Equal: ['=', '='], Backquote: ['`', '`'],
  ArrowLeft: ['←', 'Left'], ArrowRight: ['→', 'Right'], ArrowUp: ['↑', 'Up'], ArrowDown: ['↓', 'Down'],
  ShiftLeft: ['⇧L', 'Left Shift'], ShiftRight: ['⇧R', 'Right Shift'], CapsLock: ['Cap', 'Caps Lock'],
  Backspace: ['⌫', 'Backspace'],
};
let KEYMAP = {};
let layoutId = 'left';
let layoutMap = null; // the keyboard's real legends (e.g. AZERTY), where the browser shares them

function keyShort(code) {
  if (CODE_LABELS[code]) return CODE_LABELS[code][0];
  if (layoutMap && layoutMap.has(code)) return layoutMap.get(code).toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'N' + code.slice(6, 8);
  return code.slice(0, 3);
}
function keyLong(code) { return CODE_LABELS[code] ? CODE_LABELS[code][1] : keyShort(code); }
const noteKey = i => LAYOUTS[layoutId].keys[i];
const PAD_NOTES = [0, 1, 2, 3, 5]; // A B X Y RB

const SHAPES = (() => {
  const pent = [];
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; pent.push([Math.cos(a) * 1.05, Math.sin(a) * 1.05]); }
  const star = [];
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 4;
    const r = k % 2 ? 0.38 : (k % 4 === 0 ? 1.5 : 1.0);
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return {
    spire:   [[[0, -1.6], [0.55, 0.75], [-0.5, 0.75]], [[-0.66, -0.5], [-0.3, 0.75], [-1.02, 0.75]]],
    lozenge: [[[0, -1.5], [0.72, -0.1], [0, 1.0], [-0.72, -0.1]]],
    bloom:   [pent],
    prism:   [[[-0.5, -1.15], [0, -1.55], [0.5, -1.15], [0.5, 0.85], [0, 1.15], [-0.5, 0.85]]],
    star:    [star],
  };
})();

function shapePath(g, shape) {
  g.beginPath();
  for (const poly of SHAPES[shape]) {
    g.moveTo(poly[0][0], poly[0][1]);
    for (let k = 1; k < poly.length; k++) g.lineTo(poly[k][0], poly[k][1]);
    g.closePath();
  }
}

// Strata: each band of the cave has its own key, palette and dangers.
const STRATA = [
  { at: 0,    name: 'The Root Choir',         root: 110.00, sky: ['#170f2e', '#07060f'], rock: '#1c1531', edge: '#8a6ad6', hush: 40,  band: 150, pair: 0.62, shard: 0.00, moth: 0.00 },
  { at: 220,  name: 'Gallery of Lanterns',    root: 146.83, sky: ['#26170a', '#0b0604'], rock: '#2a1b10', edge: '#d8913d', hush: 55,  band: 158, pair: 0.55, shard: 0.30, moth: 0.00, warn: 'Red shards appear here. Touching one cracks your glass.' },
  { at: 520,  name: 'The Moth Vaults',        root: 98.00,  sky: ['#0e1f1d', '#040a0a'], rock: '#13231f', edge: '#5fbca0', hush: 70,  band: 166, pair: 0.50, shard: 0.34, moth: 0.17, warn: 'Moths live here. They drink your breath while you sing.' },
  { at: 900,  name: 'Throat of the Mountain', root: 130.81, sky: ['#2b0c17', '#0b0306'], rock: '#2d111a', edge: '#e05a70', hush: 85,  band: 172, pair: 0.48, shard: 0.48, moth: 0.13, warn: 'The cave narrows, and the Hush rises faster.' },
  { at: 1400, name: 'The Last Aperture',      root: 164.81, sky: ['#1d3050', '#0a1122'], rock: '#1d283b', edge: '#b0ceff', hush: 100, band: 182, pair: 0.45, shard: 0.52, moth: 0.20 },
];
STRATA.forEach(s => { s.sky0 = hexRgb(s.sky[0]); s.sky1 = hexRgb(s.sky[1]); s.rockRgb = hexRgb(s.rock); s.edgeRgb = hexRgb(s.edge); });

function stratumAt(m) {
  let i = 0;
  while (i + 1 < STRATA.length && m >= STRATA[i + 1].at) i++;
  return i;
}
function palette(m) {
  const i = stratumAt(m);
  const a = STRATA[i], b = STRATA[Math.min(i + 1, STRATA.length - 1)];
  const t = b === a ? 0 : clamp((m - (b.at - 70)) / 70, 0, 1);
  return { sky0: mixRgb(a.sky0, b.sky0, t), sky1: mixRgb(a.sky1, b.sky1, t), rock: mixRgb(a.rockRgb, b.rockRgb, t), edge: mixRgb(a.edgeRgb, b.edgeRgb, t) };
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

// ------------------------------------------------------------------ random
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeNoise(rand) {
  const v = new Float32Array(256);
  for (let i = 0; i < 256; i++) v[i] = rand();
  return x => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    return v[i & 255] + (v[(i + 1) & 255] - v[i & 255]) * s;
  };
}
function hash(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ------------------------------------------------------------------- audio
const AudioE = (() => {
  let ctx = null, bus, hushF, master, droneG, noiseBuf, muted = false;
  const droneOscs = [];
  const api = {};
  api.now = () => ctx ? ctx.currentTime : 0;

  api.init = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    hushF = ctx.createBiquadFilter(); hushF.type = 'lowpass'; hushF.frequency.value = 18000; hushF.Q.value = 0.8;
    bus = ctx.createGain();
    const verb = ctx.createConvolver(); verb.buffer = impulse(3.4, 2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    bus.connect(hushF); bus.connect(verb); verb.connect(wet); wet.connect(hushF);
    hushF.connect(comp); comp.connect(master); master.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // The cave's own drone: root an octave down, a fifth, and a slow beat.
    droneG = ctx.createGain(); droneG.gain.value = 0;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 420;
    droneG.connect(dlp); dlp.connect(bus);
    [[0.5, 'sine', 0.55], [0.502, 'sine', 0.3], [0.75, 'triangle', 0.16], [1.0, 'sine', 0.1]].forEach(([m, type, g]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 110 * m;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg); gg.connect(droneG); o.start();
      droneOscs.push({ o, m });
    });
  };

  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  function osc(type, f, at) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(at); return o; }

  // A sustained sung note. Returns a handle with stop(t) and setFreq(f).
  api.voice = (freq, at, vol = 0.12) => {
    if (!ctx) return { stop() {}, setFreq() {} };
    at = Math.max(at ?? ctx.currentTime, ctx.currentTime);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(vol, at + 0.07);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(4200, freq * 9); lp.Q.value = 1.4;
    const o1 = osc('triangle', freq, at), o2 = osc('sine', freq * 2, at), o3 = osc('sine', freq * 0.5, at);
    const lfo = osc('sine', 4.8 + Math.random() * 0.8, at);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const g3 = ctx.createGain(); g3.gain.value = 0.35;
    const l1 = ctx.createGain(); l1.gain.value = freq * 0.006;
    const l2 = ctx.createGain(); l2.gain.value = freq * 0.012;
    lfo.connect(l1); l1.connect(o1.frequency);
    lfo.connect(l2); l2.connect(o2.frequency);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp);
    lp.connect(out); out.connect(bus);
    const oscs = [o1, o2, o3, lfo];
    let stopAt = Infinity;
    return {
      setFreq(f) {
        const t = ctx.currentTime;
        o1.frequency.setTargetAtTime(f, t, 0.08);
        o2.frequency.setTargetAtTime(f * 2, t, 0.08);
        o3.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      },
      stop(t) {
        t = Math.max(t ?? ctx.currentTime, ctx.currentTime);
        if (t >= stopAt) return;
        stopAt = t;
        const gp = out.gain;
        if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(t);
        else { gp.cancelScheduledValues(t); gp.setValueAtTime(t > at + 0.07 ? vol : gp.value, t); }
        gp.setTargetAtTime(0, t, 0.11);
        oscs.forEach(o => { try { o.stop(t + 1.2); } catch (e) { /* already stopping */ } });
      },
    };
  };

  // A struck crystal: inharmonic partials with fast decay.
  api.chime = (freq, vol = 0.15, at) => {
    if (!ctx) return;
    at = at ?? ctx.currentTime;
    [[1, 1, 1.8], [2.76, 0.42, 1.0], [5.4, 0.2, 0.55], [8.93, 0.08, 0.3]].forEach(([m, g, d]) => {
      const o = osc('sine', freq * m, at);
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.0001, at);
      gg.gain.exponentialRampToValueAtTime(vol * g, at + 0.006);
      gg.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(gg); gg.connect(bus); o.stop(at + d + 0.05);
    });
  };
  api.noise = (dur, type, f, vol, at, q = 1) => {
    if (!ctx) return;
    at = at ?? ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(fl); fl.connect(g); g.connect(bus);
    src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.05);
  };
  api.thump = (f0, f1, dur, vol) => {
    if (!ctx) return;
    const at = ctx.currentTime;
    const o = osc('sine', f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bus); o.stop(at + dur + 0.05);
  };
  api.crack = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    api.noise(0.3, 'highpass', 2600, 0.4);
    api.noise(0.18, 'bandpass', 700, 0.35);
    api.thump(140, 45, 0.3, 0.4);
    for (let k = 0; k < 3; k++) api.chime(2000 + Math.random() * 3000, 0.04, t + k * 0.02);
  };
  api.shatter = f => {
    if (!ctx) return;
    const t = ctx.currentTime;
    api.noise(0.45, 'highpass', 3800, 0.16);
    for (let k = 0; k < 6; k++) api.chime(f * (2 + Math.floor(Math.random() * 5)) * (1 + (Math.random() - 0.5) * 0.03), 0.05, t + k * 0.035);
  };
  api.sparkle = freqs => {
    if (!ctx) return;
    const t = ctx.currentTime;
    freqs.forEach((f, k) => api.chime(f, 0.08, t + k * 0.075));
  };
  api.tink = () => api.chime(2400 + Math.random() * 900, 0.022);
  api.gasp = () => api.noise(0.5, 'bandpass', 800, 0.14, undefined, 2);
  api.hushDeath = () => { api.noise(2.2, 'lowpass', 300, 0.5); api.thump(90, 30, 1.5, 0.4); };
  api.setHush = p => {
    if (!ctx) return;
    const f = 18000 * Math.pow(240 / 18000, clamp(p, 0, 1));
    hushF.frequency.setTargetAtTime(f, ctx.currentTime, 0.15);
  };
  api.setDrone = (root, level) => {
    if (!ctx) return;
    droneOscs.forEach(({ o, m }) => o.frequency.setTargetAtTime(root * m, ctx.currentTime, 1.2));
    droneG.gain.setTargetAtTime(level, ctx.currentTime, 1.0);
  };
  api.toggleMute = () => {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    return muted;
  };
  api.isMuted = () => muted;
  return api;
})();

// ----------------------------------------------------------------- sprites
function makeGlow(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(rgb, 1)); gr.addColorStop(0.22, rgba(rgb, 0.45)); gr.addColorStop(1, rgba(rgb, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
const GLOW = NOTES.map(n => makeGlow(n.rgb));
const GLOW_RED = makeGlow([255, 60, 90]);
const GLOW_GOLD = makeGlow([255, 220, 140]);
const GLOW_PALE = makeGlow([200, 196, 220]);
const PLAYER_CRACKS = [
  [[-0.2, -0.95], [-0.05, -0.4], [-0.3, 0.05], [-0.1, 0.4]],
  [[0.9, -0.3], [0.4, -0.1], [0.3, 0.35], [0.55, 0.8]],
  [[-0.85, 0.4], [-0.35, 0.3], [0.05, 0.6], [0.1, 0.98]],
];

// -------------------------------------------------------------- dom & view
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const titleEl = $('title'), pauseEl = $('pause'), overEl = $('over');
const rollCv = $('roll');

let dpr = 1, scale = 1, ox = 0, oy = 0, vx0 = 0, vx1 = W, vy0 = 0, vy1 = H;
// The note tiles: one compact row along the bottom edge of the window.
const TW = 64, TH = 40, TG = 10, TX0 = (W - (5 * TW + 4 * TG)) / 2;
let TY = H - TH - 14;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = window.innerWidth, ch = window.innerHeight;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  scale = Math.min(cw / W, ch / H);
  ox = (cw - W * scale) / 2; oy = (ch - H * scale) / 2;
  vx0 = -ox / scale; vx1 = (cw - ox) / scale;
  vy0 = -oy / scale; vy1 = (ch - oy) / scale;
  TY = vy1 - TH - 14;
}
window.addEventListener('resize', resize);
resize();

// Key chips on the title screen, drawn from the same shapes as the crystals.
(function buildChips() {
  const ul = $('keyChips');
  for (const n of NOTES) {
    const pts = SHAPES[n.shape].map(poly => `<polygon points="${poly.map(p => p.join(',')).join(' ')}" fill="${n.color}" fill-opacity="0.85" stroke="#fff" stroke-opacity="0.6" stroke-width="0.08"/>`).join('');
    const li = document.createElement('li');
    li.style.setProperty('--c', n.color);
    li.innerHTML = `<svg viewBox="-1.7 -1.7 3.4 3.4" aria-hidden="true">${pts}</svg><kbd></kbd><span>${n.name}</span>`;
    ul.appendChild(li);
  }
})();

let bestM = 0;
try { bestM = Number(localStorage.getItem('hollowsong.best')) || 0; } catch (e) { bestM = 0; }
function showBest() { $('bestTitle').textContent = bestM > 0 ? `${Math.floor(bestM)} m` : 'none yet'; }
showBest();

// ------------------------------------------------------------------- state
let state = 'title';         // title | play | paused | dying | over
// Practice: no Hush, start at any stratum, and the run doesn't count toward your best.
let practice = false, practiceStratum = 0;
try { practiceStratum = clamp(Number(localStorage.getItem('hollowsong.practiceStratum')) || 0, 0, 4); } catch (e) { /* storage unavailable */ }
let rand, nL1, nL2, nR1, nR2;
let P, crystals, shards, echoes, moths, particles, texts;
let camY, silenceY, hushTimer, nextBandY, lastNote, maxM, echoCount, notesSung, chordsSung;
let playTime, song, deathCause, shake, stratumIdx, bannerT, dieT, overT, cleanupT, prevSingCount;
let hushStarted, exposure, coachTarget, coach, camAnchor, spine, echoLead, callouts, explained, slowT;
let time = 0;
const keyHeld = [false, false, false, false, false];
const padHeld = [false, false, false, false, false];
const held = [false, false, false, false, false];
const voices = [null, null, null, null, null];
const tethers = [null, null, null, null, null];
const inRange = [null, null, null, null, null];
const ptrNotes = new Map();

const heightM = y => (FLOOR_Y - 12 - y) / PX_PER_M;
let floorY = FLOOR_Y; // the rock you stand on: the cave floor, or in practice a ledge at the chosen stratum
const noteFreq = i => STRATA[stratumIdx].root * 2 * Math.pow(2, NOTES[i].deg / 12);

function walls(y) {
  const m = Math.max(0, -y / PX_PER_M);
  const narrow = Math.min(110, m * 0.07);
  let L = 50 + nL1(y * 0.0021) * 170 + nL2(y * 0.011) * 30 + narrow;
  let R = W - 50 - nR1(y * 0.0019 + 50) * 170 - nR2(y * 0.012 + 9) * 30 - narrow;
  if (R - L < 380) { const c = (L + R) / 2; L = c - 190; R = c + 190; }
  return [L, R];
}

function reset() {
  rand = mulberry32((Math.random() * 4294967296) >>> 0);
  nL1 = makeNoise(rand); nL2 = makeNoise(rand); nR1 = makeNoise(rand); nR2 = makeNoise(rand);
  const startM = practice ? STRATA[practiceStratum].at : 0;
  floorY = FLOOR_Y - startM * PX_PER_M;
  P = { x: W / 2, y: floorY - 12, vx: 0, vy: 0, r: 12, breath: 100, winded: false, cracks: 0, inv: 0, muffled: 0, glow: [210, 222, 255] };
  crystals = []; shards = []; echoes = []; moths = []; particles = []; texts = [];
  camAnchor = CAM_CLIMB;
  camY = P.y - camScreenY();
  silenceY = practice ? floorY + 5000 : FLOOR_Y + 600;
  hushTimer = 0; nextBandY = floorY - 120; lastNote = Math.floor(rand() * 5);
  spine = { x: W / 2, y: floorY - 12, note: -1, nextY: floorY - 12 - 120 };
  maxM = startM; echoCount = 0; notesSung = 0; chordsSung = 0; prevSingCount = 0;
  hushStarted = false; exposure = 0; coachTarget = null; coach = null;
  echoLead = 0; callouts = []; explained = new Set(); slowT = 0;
  playTime = 0; song = []; shake = 0; stratumIdx = stratumAt(startM); bannerT = 0; dieT = 0; overT = 0; cleanupT = 0;
  for (let i = 0; i < 5; i++) { tethers[i] = null; inRange[i] = null; }
  genUpTo(camY - 600);
}

// --------------------------------------------------------------- generation
function makeCrystal(x, y, note) {
  const cracks = [];
  for (let k = 0; k < 5; k++) {
    const a = rand() * Math.PI * 2, l = 0.4 + rand() * 0.7;
    const sx = (rand() - 0.5) * 0.5, sy = (rand() - 0.5) * 0.8;
    cracks.push([sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l]);
  }
  return { x, y, note, size: 15 + rand() * 7, rot: (rand() - 0.5) * 0.5, charge: 1, alive: true, ring: 0, phase: rand() * 6.28, cracks };
}
function tooClose(x, y, d) {
  for (let k = crystals.length - 1, n = 0; k >= 0 && n < 14; k--, n++) {
    const c = crystals[k]; if (Math.hypot(c.x - x, c.y - y) < d) return true;
  }
  for (let k = shards.length - 1, n = 0; k >= 0 && n < 6; k--, n++) {
    const s = shards[k]; if (Math.hypot(s.x - x, s.y - y) < d) return true;
  }
  return false;
}
function spotIn(yb, bandH, margin) {
  const y = yb - rand() * bandH;
  const [L, R] = walls(y);
  return [L + margin + rand() * (R - L - margin * 2), y];
}
function genBand(yb) {
  const m = Math.max(0, heightM(yb));
  const S = STRATA[stratumAt(m)];
  const bandH = S.band;
  const early = yb > -320;
  const n = m < 150 || rand() < S.pair ? 2 : 1;
  // The spine: a chain of crystals, each within reach of the one below it (even
  // hanging beneath it) and never sharing its note, so there is always a way up.
  let placed = 0;
  while (spine.nextY > yb - bandH) {
    const y = spine.nextY;
    const [L, R] = walls(y);
    const x = clamp(spine.x + (rand() - 0.5) * 340, L + 55, R - 55);
    let note;
    do { note = Math.floor(rand() * 5); } while (note === spine.note || note === lastNote);
    lastNote = note;
    crystals.push(Object.assign(makeCrystal(x, y, note), { spine: true }));
    spine = { x, y, note, nextY: y - (110 + rand() * 80) };
    placed++;
  }
  for (let k = placed; k < n; k++) {
    for (let tries = 0; tries < 10; tries++) {
      let [x, y] = spotIn(yb, bandH, 55);
      if (early) x = W / 2 + (rand() - 0.5) * 340;
      if (tooClose(x, y, 95)) continue;
      const note = (lastNote + 1 + Math.floor(rand() * 4)) % 5;
      lastNote = note;
      crystals.push(makeCrystal(x, y, note));
      break;
    }
  }
  if (m > 40 && rand() < S.shard) {
    for (let tries = 0; tries < 8; tries++) {
      const [x, y] = spotIn(yb, bandH, 30);
      if (tooClose(x, y, 85)) continue;
      const r = 13 + rand() * 9, pts = [];
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const rr = r * (k % 2 ? 0.45 + rand() * 0.2 : 0.95 + rand() * 0.35); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      shards.push({ x, y, r, rot: rand() * 6.28, spin: (rand() - 0.5) * 1.2, pts });
      break;
    }
  }
  if (rand() < 0.38) {
    const [x, y] = spotIn(yb, bandH, 45);
    echoes.push({ x, y, phase: rand() * 6.28, alive: true });
  }
  if (rand() < S.moth) {
    const [x, y] = spotIn(yb, bandH, 60);
    moths.push({ x, y, vx: 0, vy: 0, phase: rand() * 6.28, wander: rand() * 6.28 });
  }
  return bandH;
}
function genUpTo(yTop) {
  while (nextBandY > yTop) nextBandY -= genBand(nextBandY);
}

// ---------------------------------------------------------------- effects
function emit(x, y, n, o) {
  for (let k = 0; k < n; k++) {
    if (particles.length > 700) particles.shift();
    const a = Math.random() * Math.PI * 2, sp = (o.speed || 120) * (0.3 + Math.random() * 0.7);
    particles.push({
      x, y, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0),
      life: 0, max: (o.life || 0.8) * (0.6 + Math.random() * 0.6),
      c: o.c || [255, 255, 255], s: (o.size || 2) * (0.6 + Math.random() * 0.8),
      g: o.g || 0, type: o.type || 'spark', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
    });
  }
}
function say(x, y, text, c) { texts.push({ x, y, text, c: c || [240, 236, 255], life: 0, max: 1.6 }); }

// The first time a shard, moth or echo comes into view, point at it and say what
// it does. Dangers also slow time for a moment. Each is explained in the player's
// first few runs that meet it, then the game trusts them to remember.
const CALLOUTS = {
  shard: { title: 'Red shard', lines: ['Touching it cracks your glass.', 'Three cracks and you break.'], c: [255, 112, 136], slow: true },
  moth:  { title: 'Moth', lines: ['It follows your song and drinks your breath.', 'Go quiet and it loses interest.'], c: [214, 208, 228], slow: true },
  echo:  { title: 'Echo', lines: ['Fly through it to refill your breath', 'and push the Hush back.'], c: [255, 220, 140], slow: false },
};
const CALLOUT_RUNS = 3;
const CALLOUT_T = 4.5;
let seenRuns = {};
try { seenRuns = JSON.parse(localStorage.getItem('hollowsong.seen') || '{}') || {}; } catch (e) { seenRuns = {}; }

function updateCallouts(dt) {
  for (const co of callouts) co.t += dt;
  callouts = callouts.filter(co => co.t < CALLOUT_T && co.obj.alive !== false);
  if (callouts.length || bannerT > 0) return; // one at a time, and never over a stratum banner
  const top = camY + vy0 + 130, bottom = camY + hudBase() - 90;
  const inView = o => o.y > top && o.y < bottom && o.x > vx0 + 20 && o.x < vx1 - 20;
  for (const [kind, list] of [['shard', shards], ['moth', moths], ['echo', echoes]]) {
    if (explained.has(kind) || (seenRuns[kind] || 0) >= CALLOUT_RUNS) continue;
    const obj = list.find(o => o.alive !== false && inView(o));
    if (!obj) continue;
    explained.add(kind);
    callouts.push({ kind, obj, t: 0 });
    if (CALLOUTS[kind].slow) slowT = 1.6;
    seenRuns[kind] = (seenRuns[kind] || 0) + 1;
    try { localStorage.setItem('hollowsong.seen', JSON.stringify(seenRuns)); } catch (e) { /* storage unavailable */ }
    return;
  }
}

// ------------------------------------------------------------------- voices
function syncVoices(sing) {
  for (let i = 0; i < 5; i++) {
    if (sing[i] && !voices[i]) {
      const f = noteFreq(i);
      voices[i] = AudioE.voice(f);
      song.push({ t: playTime, i, on: true, f });
      notesSung++;
    } else if (!sing[i] && voices[i]) {
      voices[i].stop();
      voices[i] = null;
      song.push({ t: playTime, i, on: false });
    }
  }
}
const NONE = [false, false, false, false, false];
function silenceVoices() { syncVoices(NONE); }

// ------------------------------------------------------------------- update
// Each note reaches for one crystal of its colour: the nearest one above you, or
// the nearest one below if none above is in reach. Preferring crystals above stops
// a nearby crystal underneath from hiding a higher one of the same note.
function findInRange() {
  const best = [Infinity, Infinity, Infinity, Infinity, Infinity];
  for (let i = 0; i < 5; i++) inRange[i] = null;
  for (const c of crystals) {
    if (!c.alive) continue;
    const dy = c.y - P.y;
    if (dy > RANGE || dy < -RANGE) continue;
    const d = Math.hypot(c.x - P.x, dy);
    if (d >= RANGE) continue;
    const score = d + (dy > 20 ? RANGE : 0);
    if (score < best[c.note]) { best[c.note] = score; inRange[c.note] = c; }
  }
}

// The crystal a new player should aim for: the highest one in reach above them.
function pickCoach() {
  let best = null;
  for (let i = 0; i < 5; i++) {
    const c = inRange[i];
    if (c && c.y < P.y - 40 && c.charge > 0.2 && (!best || c.y < best.y)) best = c;
  }
  return best;
}

function shatterCrystal(c, quiet) {
  c.alive = false; c.charge = 0;
  for (let i = 0; i < 5; i++) if (tethers[i] === c) tethers[i] = null;
  if (quiet) return;
  AudioE.shatter(noteFreq(c.note));
  emit(c.x, c.y, 22, { c: NOTES[c.note].rgb, speed: 220, life: 1.1, size: 4, g: 420, type: 'glass' });
  emit(c.x, c.y, 14, { c: NOTES[c.note].rgb, speed: 120, life: 0.6, size: 2 });
}

function update(dt) {
  playTime += dt;
  const S = STRATA[stratumIdx];
  // 1 at the cave floor, 0 once you've climbed EASE_M metres
  const ease = clamp(1 - maxM / EASE_M, 0, 1);

  // breath
  const sing = [false, false, false, false, false];
  let nSing = 0;
  for (let i = 0; i < 5; i++) { held[i] = keyHeld[i] || padHeld[i] || [...ptrNotes.values()].includes(i); sing[i] = held[i] && !P.winded; if (sing[i]) nSing++; }
  if (nSing > 0) {
    P.breath -= BREATH_COST * lerp(1, 0.6, ease) * nSing * dt;
    if (P.breath <= 0) {
      P.breath = 0; P.winded = true; nSing = 0;
      for (let i = 0; i < 5; i++) sing[i] = false;
      AudioE.gasp();
      say(P.x, P.y - 30, 'out of breath', [255, 140, 150]);
    }
  } else {
    P.breath = Math.min(100, P.breath + BREATH_REGEN * dt);
  }
  if (P.winded && P.breath >= 35) P.winded = false;
  if (nSing >= 2 && prevSingCount < 2) chordsSung++;
  prevSingCount = nSing;
  syncVoices(sing);

  // tethers
  findInRange();
  for (let i = 0; i < 5; i++) {
    const c = sing[i] ? inRange[i] : null;
    if (c !== tethers[i]) {
      if (c) {
        AudioE.chime(noteFreq(i) * 2, 0.1);
        c.ring = 1;
        emit(c.x, c.y, 8, { c: NOTES[i].rgb, speed: 90, life: 0.5 });
      }
      tethers[i] = c;
    }
  }
  coachTarget = maxM < COACH_M ? pickCoach() : null;
  coach = coachAdvice();

  // forces
  let ax = 0, ay = GRAV * lerp(1, 0.82, ease), nT = 0;
  const pull = P.muffled > 0 ? 0.5 : 1;
  const aim = lerp(TETHER_AIM_FULL, TETHER_AIM, ease);
  for (let i = 0; i < 5; i++) {
    const c = tethers[i];
    if (!c) continue;
    const dx = c.x - P.x, dy = c.y - aim - P.y, d = Math.hypot(dx, dy) || 1;
    const F = Math.min(1900, 11 * Math.max(0, d - 30)) * pull;
    ax += dx / d * F; ay += dy / d * F; nT++;
    c.charge -= CRYSTAL_WEAR * lerp(1, 0.45, ease) * dt;
    if (c.charge <= 0) shatterCrystal(c);
  }
  if (nT >= 2 && Math.random() < dt * 20) emit(P.x, P.y, 1, { c: P.glow, speed: 40, life: 0.8, size: 2 });
  P.vx += ax * dt; P.vy += ay * dt;
  // early on, swings settle faster and falls are slower, so there's time to react
  const damp = Math.exp(-(nT ? lerp(1.3, 2.4, ease) : lerp(0.22, 0.9, ease)) * dt);
  P.vx *= damp; P.vy *= damp;
  const sp = Math.hypot(P.vx, P.vy);
  if (sp > MAX_SPEED) { P.vx *= MAX_SPEED / sp; P.vy *= MAX_SPEED / sp; }
  P.x += P.vx * dt; P.y += P.vy * dt;

  const [L, R] = walls(P.y);
  if (P.x - P.r < L) { P.x = L + P.r; if (P.vx < -60) AudioE.tink(); P.vx = Math.abs(P.vx) * 0.45; }
  if (P.x + P.r > R) { P.x = R - P.r; if (P.vx > 60) AudioE.tink(); P.vx = -Math.abs(P.vx) * 0.45; }
  if (P.y + P.r > floorY) { P.y = floorY - P.r; if (P.vy > 90) AudioE.tink(); P.vy = -Math.abs(P.vy) * 0.3; P.vx *= 0.9; }
  P.inv = Math.max(0, P.inv - dt);
  P.muffled = Math.max(0, P.muffled - dt);

  // height and strata
  const hm = heightM(P.y);
  if (hm > maxM) maxM = hm;
  const st = stratumAt(maxM);
  if (st !== stratumIdx) {
    stratumIdx = st;
    bannerT = 4.5;
    AudioE.setDrone(STRATA[st].root, 0.12);
    for (let i = 0; i < 5; i++) if (voices[i]) voices[i].setFreq(noteFreq(i));
    AudioE.sparkle([0, 2, 4].map(k => noteFreq(k) * 2));
  }

  // shards
  for (const s of shards) {
    s.rot += s.spin * dt;
    if (P.inv > 0) continue;
    const dx = P.x - s.x, dy = P.y - s.y, d = Math.hypot(dx, dy);
    if (d < s.r * 0.8 + P.r) {
      P.cracks++; P.inv = 1.5;
      const n = d || 1;
      P.vx = dx / n * 430; P.vy = dy / n * 430;
      AudioE.crack();
      shake = 12;
      emit(P.x, P.y, 16, { c: [220, 235, 255], speed: 200, life: 0.9, size: 3, g: 400, type: 'glass' });
      if (P.cracks >= 3) { die('shatter'); return; }
      say(P.x, P.y - 28, P.cracks === 1 ? 'cracked' : 'one crack left', [255, 120, 140]);
    }
  }

  // echoes
  for (const e of echoes) {
    if (!e.alive) continue;
    e.phase += dt;
    const ey = e.y + Math.sin(e.phase * 1.7) * 6;
    if (Math.hypot(P.x - e.x, P.y - ey) < 26) {
      e.alive = false; echoCount++;
      P.breath = Math.min(100, P.breath + 30);
      // push the Hush down and give it room to stay there, or the lead clamp below would undo it
      silenceY += ECHO_PUSH;
      echoLead = Math.min(echoLead + ECHO_PUSH, ECHO_PUSH * 3);
      AudioE.sparkle([0, 2, 4, 7].map(k => noteFreq(0) * 2 * Math.pow(2, k / 12)));
      emit(e.x, ey, 20, { c: [255, 220, 140], speed: 160, life: 0.9, size: 2.5 });
      say(e.x, ey - 24, 'echo · the Hush falls back', [255, 220, 140]);
    }
  }

  // moths: drawn to song, they drink breath while touching you
  for (const m of moths) {
    m.phase += dt * 14;
    const dx = P.x - m.x, dy = P.y - m.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * 2.2);
    if (nSing > 0 && d < 440) {
      const v = 120 + stratumIdx * 12;
      m.vx += (dx / d * v - m.vx) * k; m.vy += (dy / d * v - m.vy) * k;
    } else {
      m.wander += (Math.random() - 0.5) * dt * 4;
      m.vx += (Math.cos(m.wander) * 40 - m.vx) * dt; m.vy += (Math.sin(m.wander) * 30 - m.vy) * dt;
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
    const [mL, mR] = walls(m.y);
    if (m.x < mL + 20) { m.x = mL + 20; m.vx = Math.abs(m.vx); m.wander = 0; }
    if (m.x > mR - 20) { m.x = mR - 20; m.vx = -Math.abs(m.vx); m.wander = Math.PI; }
    if (d < 36) {
      P.breath = Math.max(0, P.breath - 40 * dt);
      P.muffled = 0.3;
      if (Math.random() < dt * 12) emit(m.x, m.y, 1, { c: [200, 196, 220], speed: 30, life: 1, size: 1.5, type: 'dust' });
    }
  }

  // the Hush (there is none in practice)
  if (practice) AudioE.setHush(0);
  else if (updateHush(dt, S, ease)) return;

  // world upkeep
  genUpTo(camY + vy0 - 500);
  cleanupT += dt;
  if (cleanupT > 0.5) {
    cleanupT = 0;
    const cut = silenceY + 400;
    crystals = crystals.filter(c => c.alive && c.y < cut);
    shards = shards.filter(s => s.y < cut);
    echoes = echoes.filter(e => e.alive && e.y < cut);
    moths = moths.filter(m => m.y < silenceY + 40);
  }
  for (const c of crystals) c.ring = Math.max(0, c.ring - dt * 2);
  updateCallouts(dt);
  updateCamera(dt);
}

// The Hush rises from below and silences what it reaches. Returns true if it
// ended the run.
function updateHush(dt, S, ease) {
  // It waits until you've started climbing (or 20 s pass), rises slowly at first,
  // and you can survive a brief dip into it if you sing your way back out.
  hushTimer += dt;
  if (!hushStarted && (maxM > 8 || hushTimer > 20)) {
    hushStarted = true;
    say(P.x, P.y - 40, 'the Hush stirs below you', [255, 140, 160]);
  }
  if (hushStarted) silenceY -= S.hush * lerp(1, 0.45, ease) * (1 + Math.min(0.5, playTime / 600)) * dt;
  echoLead = Math.max(0, echoLead - ECHO_FADE * dt);
  silenceY = Math.min(silenceY, P.y + lerp(HUSH_LEAD, 1000, ease) + echoLead);
  for (const c of crystals) if (c.alive && c.y > silenceY - 6) shatterCrystal(c, true);
  const gap = silenceY - P.y;
  AudioE.setHush(clamp(1 - (gap - 30) / 420, 0, 1));
  if (P.y + P.r * 0.3 > silenceY) {
    exposure += dt;
    if (exposure > 0.8 + ease) { die('hush'); return true; }
  } else {
    exposure = Math.max(0, exposure - dt);
  }
  return false;
}

// Where the player sits on screen, as a fraction of the window's height: low
// while climbing so you see what's ahead, nearer the middle while falling.
const CAM_CLIMB = 0.7, CAM_FALL = 0.5;
const camScreenY = () => vy0 + camAnchor * (vy1 - vy0);
function updateCamera(dt) {
  camAnchor += (lerp(CAM_CLIMB, CAM_FALL, clamp(P.vy / 450, 0, 1)) - camAnchor) * Math.min(1, dt * 1.5);
  // lead by the distance the smoothing below would otherwise lag behind
  const target = P.y - camScreenY() + clamp(P.vy / 3.5, -160, 160);
  camY += (target - camY) * Math.min(1, dt * 3.5);
  shake = Math.max(0, shake - dt * 30);
}

function updateEffects(dt) {
  for (const p of particles) {
    p.life += dt; p.vy += p.g * dt;
    const f = Math.exp(-(p.type === 'glass' ? 0.6 : 2.2) * dt);
    p.vx *= f; p.vy *= p.type === 'glass' ? 1 : f;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  particles = particles.filter(p => p.life < p.max);
  for (const t of texts) { t.life += dt; t.y -= 22 * dt; }
  texts = texts.filter(t => t.life < t.max);
  bannerT = Math.max(0, bannerT - dt);
}

function die(cause) {
  if (state !== 'play') return;
  state = 'dying'; dieT = 0; deathCause = cause;
  silenceVoices();
  for (let i = 0; i < 5; i++) tethers[i] = null;
  if (cause === 'hush') {
    AudioE.hushDeath();
    emit(P.x, P.y, 30, { c: [200, 196, 220], speed: 90, life: 1.6, size: 2, type: 'dust' });
  } else {
    AudioE.crack(); AudioE.shatter(220);
    emit(P.x, P.y, 40, { c: [220, 235, 255], speed: 280, life: 1.4, size: 4, g: 420, type: 'glass' });
    shake = 16;
  }
  AudioE.setDrone(STRATA[stratumIdx].root, 0.04);
  saveBest();
}
function saveBest() {
  if (practice || maxM <= bestM) return;
  bestM = maxM;
  try { localStorage.setItem('hollowsong.best', String(Math.floor(bestM))); } catch (e) { /* storage unavailable */ }
  showBest();
}

// --------------------------------------------------------------------- draw
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const pal = palette(Math.max(0, maxM));
  ctx.fillStyle = rgba(pal.sky1, 1);
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);

  const sky = ctx.createLinearGradient(0, vy0, 0, vy1);
  sky.addColorStop(0, rgba(pal.sky0, 1)); sky.addColorStop(1, rgba(pal.sky1, 1));
  ctx.fillStyle = sky; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  drawStars();
  drawParallax(pal);
  drawDust();

  const s = reduceMotion ? 0 : shake;
  const sx = (Math.random() - 0.5) * s, sy = (Math.random() - 0.5) * s;
  ctx.save();
  ctx.translate(sx, -camY + sy);
  const wy0 = camY + vy0 - 20, wy1 = camY + vy1 + 20;
  drawWalls(pal, wy0, wy1);
  drawFloor(pal, wy1);
  for (const e of echoes) if (e.alive && e.y > wy0 - 40 && e.y < wy1 + 40) drawEcho(e);
  for (const c of crystals) if (c.alive && c.y > wy0 - 60 && c.y < wy1 + 60) drawCrystal(c);
  for (const sh of shards) if (sh.y > wy0 - 40 && sh.y < wy1 + 40) drawShard(sh);
  drawTethers();
  drawCoach();
  if (state !== 'dying' && state !== 'over') drawPlayer();
  for (const m of moths) if (m.y > wy0 - 40 && m.y < wy1 + 40) drawMoth(m);
  drawParticles();
  drawTexts();
  if (state === 'play' || state === 'paused') drawCallouts();
  drawHush(wy1);
  ctx.restore();

  drawVignette();
  if (state === 'play' || state === 'paused' || state === 'dying') drawHUD(pal);
}

function drawStars() {
  const a = clamp((maxM - 1300) / 250, 0, 1);
  if (a <= 0) return;
  for (let k = 0; k < 90; k++) {
    const x = vx0 + hash(k * 3 + 1) * (vx1 - vx0);
    const y = vy0 + (((hash(k * 7 + 2) * 2000 - camY * 0.05) % (vy1 - vy0)) + (vy1 - vy0)) % (vy1 - vy0);
    const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(k) * 2) + k);
    ctx.fillStyle = `rgba(235,240,255,${a * (0.25 + 0.5 * tw)})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

function drawParallax(pal) {
  const layers = [[0.22, 0.05, 240, 1.0, 11], [0.48, 0.09, 200, 0.65, 37]];
  for (const [f, a, cell, sz, salt] of layers) {
    const py = camY * f;
    const j0 = Math.floor((py + vy0) / cell) - 1, j1 = Math.ceil((py + vy1) / cell) + 1;
    ctx.fillStyle = rgba(pal.edge, a);
    for (let j = j0; j <= j1; j++) {
      for (let k = 0; k < 3; k++) {
        const h3 = hash(j * 7 + k * 29 + salt);
        if (h3 < 0.35) continue;
        const x = -380 + hash(j * 13 + k * 7 + salt) * (W + 760);
        const y = j * cell + hash(j * 31 + k * 17 + salt) * cell - py;
        const hh = (60 + h3 * 170) * sz, ww = hh * 0.17;
        ctx.beginPath();
        ctx.moveTo(x, y - hh); ctx.lineTo(x + ww, y); ctx.lineTo(x, y + hh * 0.25); ctx.lineTo(x - ww, y);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

const DUST = Array.from({ length: 70 }, () => [Math.random(), Math.random(), Math.random()]);
function drawDust() {
  const span = vy1 - vy0 + 40;
  for (const d of DUST) {
    const x = vx0 + d[0] * (vx1 - vx0) + Math.sin(time * 0.3 + d[2] * 10) * 12;
    const y = vy0 - 20 + ((((d[1] * span - camY * (0.6 + d[2] * 0.4) - time * 8 * d[2]) % span) + span) % span);
    ctx.fillStyle = `rgba(225,220,250,${0.1 + 0.3 * d[2]})`;
    const s = 0.6 + d[2] * 1.4;
    ctx.fillRect(x, y, s, s);
  }
}

function drawWalls(pal, y0, y1) {
  const step = 10, pts = [];
  for (let y = Math.floor(y0 / step) * step; y <= y1 + step; y += step) { const [L, R] = walls(y); pts.push([y, L, R]); }
  const first = pts[0][0], last = pts[pts.length - 1][0];
  const left = new Path2D(), right = new Path2D(), lEdge = new Path2D(), rEdge = new Path2D();
  left.moveTo(vx0 - 20, first); right.moveTo(vx1 + 20, first);
  pts.forEach(([y, L, R], k) => {
    left.lineTo(L, y); right.lineTo(R, y);
    if (k === 0) { lEdge.moveTo(L, y); rEdge.moveTo(R, y); } else { lEdge.lineTo(L, y); rEdge.lineTo(R, y); }
  });
  left.lineTo(vx0 - 20, last); right.lineTo(vx1 + 20, last);
  ctx.fillStyle = rgba(pal.rock, 1);
  ctx.fill(left); ctx.fill(right);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(pal.edge, 0.12); ctx.lineWidth = 10;
  ctx.stroke(lEdge); ctx.stroke(rEdge);
  ctx.strokeStyle = rgba(pal.edge, 0.7); ctx.lineWidth = 1.6;
  ctx.stroke(lEdge); ctx.stroke(rEdge);

  // small crystals growing out of the rock
  for (let y = Math.floor(y0 / 60) * 60; y <= y1; y += 60) {
    const row = Math.round(y / 60);
    for (let side = 0; side < 2; side++) {
      const h = hash(row * 2 + side + 999);
      if (h < 0.55) continue;
      const [L, R] = walls(y);
      const ni = Math.floor(hash(row * 3 + side + 77) * 5);
      const x = side ? R : L, dir = side ? -1 : 1, len = 10 + h * 22;
      ctx.fillStyle = rgba(NOTES[ni].rgb, 0.16 + 0.2 * h);
      ctx.beginPath(); ctx.moveTo(x - dir * 2, y - 5); ctx.lineTo(x - dir * 2, y + 5); ctx.lineTo(x + dir * len, y - len * 0.4); ctx.closePath(); ctx.fill();
    }
  }
}

function drawFloor(pal, y1) {
  if (floorY > y1) return;
  ctx.beginPath();
  ctx.moveTo(vx0 - 20, floorY);
  for (let x = Math.floor((vx0 - 20) / 20) * 20; x <= vx1 + 20; x += 20) ctx.lineTo(x, floorY + hash(Math.round(x / 20) + 4242) * 6);
  ctx.lineTo(vx1 + 20, y1 + 60); ctx.lineTo(vx0 - 20, y1 + 60); ctx.closePath();
  ctx.fillStyle = rgba(pal.rock, 1); ctx.fill();
  ctx.strokeStyle = rgba(pal.edge, 0.55); ctx.lineWidth = 1.4; ctx.stroke();
}

function drawCrystal(c) {
  const n = NOTES[c.note];
  const b = 0.35 + 0.65 * c.charge;
  const d = Math.hypot(c.x - P.x, c.y - P.y);
  const near = state === 'play' && d < RANGE;
  const tethered = tethers[c.note] === c;
  const pulse = tethered ? 0.25 + 0.25 * Math.sin(time * 18) : 0;

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(0.22 + 0.4 * b + c.ring * 0.6 + pulse, 0, 1);
  const gs = c.size * (tethered ? 7 : 5.5);
  ctx.drawImage(GLOW[c.note], c.x - gs / 2, c.y - gs / 2, gs, gs);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rot + Math.sin(time * 0.8 + c.phase) * 0.04);
  ctx.scale(c.size, c.size);
  shapePath(ctx, n.shape);
  ctx.fillStyle = rgba(mixRgb(n.rgb, [255, 255, 255], tethered ? 0.25 : 0), 0.3 + 0.6 * b);
  ctx.fill();
  ctx.lineWidth = 1.5 / c.size;
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.45 * b})`;
  ctx.stroke();
  const shown = Math.ceil((1 - c.charge) * 5.5);
  if (shown > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * (1 - c.charge)})`;
    ctx.lineWidth = 1.2 / c.size;
    ctx.beginPath();
    for (let k = 0; k < Math.min(shown, c.cracks.length); k++) { const q = c.cracks[k]; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); }
    ctx.stroke();
  }
  ctx.restore();

  if (near && !tethered) {
    ctx.strokeStyle = rgba(n.rgb, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(c.x, c.y, c.size * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const key = keyShort(noteKey(c.note)), ky = c.y + c.size * 2 + 14;
    ctx.font = `bold ${key.length > 2 ? 11 : 15}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const kw = Math.max(22, ctx.measureText(key).width + 12);
    ctx.fillStyle = 'rgba(10,8,20,0.7)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(c.x - kw / 2, ky - 11, kw, 22, 11); else ctx.rect(c.x - kw / 2, ky - 11, kw, 22);
    ctx.fill();
    ctx.fillStyle = rgba(n.rgb, 0.95);
    ctx.fillText(key, c.x, ky + 1);
  }
  if (tethered) {
    ctx.strokeStyle = rgba(n.rgb, 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.size * 2.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.charge); ctx.stroke();
  }
}

function drawShard(s) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 5 + s.x);
  ctx.drawImage(GLOW_RED, s.x - s.r * 2.6, s.y - s.r * 2.6, s.r * 5.2, s.r * 5.2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(s.x, s.y); ctx.rotate(s.rot);
  ctx.beginPath();
  s.pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = '#12040a'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,72,100,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
}

function drawEcho(e) {
  const y = e.y + Math.sin(e.phase * 1.7) * 6;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.6 + 0.2 * Math.sin(time * 3 + e.phase);
  ctx.drawImage(GLOW_GOLD, e.x - 26, y - 26, 52, 52);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,236,190,0.95)';
  for (let k = 0; k < 3; k++) {
    const a = time * 2.4 + k * Math.PI * 2 / 3 + e.phase;
    ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 7, y + Math.sin(a) * 7, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(e.x, y, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function drawMoth(m) {
  ctx.globalAlpha = 0.5;
  ctx.drawImage(GLOW_PALE, m.x - 30, m.y - 30, 60, 60);
  ctx.globalAlpha = 1;
  const flap = 0.25 + 0.75 * Math.abs(Math.sin(m.phase));
  const face = m.vx >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.fillStyle = 'rgba(214,208,228,0.85)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side * flap, 1);
    ctx.beginPath(); ctx.ellipse(9, -3, 10, 7, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, 6, 6, 5, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#1a1622';
  ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(40,34,52,0.7)';
  ctx.beginPath(); ctx.arc(flap * 9, -3, 2.4, 0, Math.PI * 2); ctx.arc(-flap * 9, -3, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(214,208,228,0.6)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(face * 4 - 3, -13); ctx.moveTo(0, -7); ctx.lineTo(face * 4 + 3, -13); ctx.stroke();
  ctx.restore();
}

function drawTethers() {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const c = tethers[i];
    if (!c) continue;
    const dx = c.x - P.x, dy = c.y - P.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const amp = 4 + 6 * c.charge;
    const N = 28;
    ctx.beginPath();
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const off = Math.sin(Math.PI * t * (i + 2)) * Math.sin(time * (22 + i * 5)) * amp * Math.sin(Math.PI * t);
      const x = P.x + dx * t + nx * off, y = P.y + dy * t + ny * off;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = rgba(NOTES[i].rgb, 0.18); ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = rgba(NOTES[i].rgb, 0.9); ctx.lineWidth = 1.8; ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawCoach() {
  const c = coach && coach.target;
  if (state !== 'play' || !c || !c.alive || tethers[c.note] === c) return;
  const n = NOTES[c.note];
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  ctx.strokeStyle = rgba(n.rgb, 0.35 + 0.3 * pulse);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 7]);
  ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  ctx.setLineDash([]);
  // a round badge for one-letter keys, stretching to a pill for longer labels
  const label = keyShort(noteKey(c.note));
  ctx.font = `bold ${label.length > 1 ? 11 : 14}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const r = 13 + pulse * 2, half = Math.max(0, ctx.measureText(label).width / 2 + 7 - r);
  const bx = c.x + c.size * 2.6 + half, by = c.y - c.size * 1.6;
  ctx.fillStyle = 'rgba(10,8,20,0.8)';
  ctx.beginPath();
  ctx.arc(bx - half, by, r, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(bx + half, by, r, -Math.PI / 2, Math.PI / 2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(n.rgb, 0.95); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(label, bx, by + 1);
}

// What a new player should do right now: the words to show, the notes to hold,
// and the crystal to point at. It teaches the handoff: catch the next crystal
// before letting go of the one you're on.
function coachAdvice() {
  if (maxM >= COACH_M || P.winded) return null;
  const k = i => keyLong(noteKey(i));
  const on = [];
  for (let i = 0; i < 5; i++) if (tethers[i]) on.push(i);
  const next = coachTarget;
  if (on.length) {
    const low = on.reduce((a, i) => tethers[i].y > tethers[a].y ? i : a);
    if (on.length >= 2) return { text: `Now let go of ${k(low)}.`, hold: on.filter(i => i !== low), target: null };
    if (next && !tethers[next.note] && next.y < tethers[low].y - 40) {
      return { text: `Hold ${k(next.note)} too, then let go of ${k(low)}.`, hold: [low, next.note], target: next };
    }
    if (P.vy < -60 && P.y < tethers[low].y + 10) return { text: 'Let go now. Your momentum will carry you up.', hold: [], target: null };
    return { text: 'Ride it up, and let go as you pass it.', hold: on, target: null };
  }
  if (P.vy < -250 && P.breath < 80) return { text: "You're flying. Stay quiet to catch your breath.", hold: [], target: null };
  if (next) return { text: `Hold ${k(next.note)} to rise toward the ${NOTES[next.note].name.toLowerCase()} crystal.`, hold: [next.note], target: next };
  return { text: 'Nothing above is in reach. Let yourself drift until a crystal lights up.', hold: [], target: null };
}

function drawPlayer() {
  // inner light takes the colour of whatever you are singing
  let col = [210, 222, 255], n = 0, acc = [0, 0, 0];
  for (let i = 0; i < 5; i++) if (voices[i]) { acc[0] += NOTES[i].rgb[0]; acc[1] += NOTES[i].rgb[1]; acc[2] += NOTES[i].rgb[2]; n++; }
  if (n) col = [acc[0] / n, acc[1] / n, acc[2] / n];
  P.glow = mixRgb(P.glow, col, 0.2);
  if (P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0) return;
  const bob = state === 'title' ? Math.sin(time * 2) * 1.5 : 0;
  const x = P.x, y = P.y + bob, r = P.r;

  ctx.globalCompositeOperation = 'lighter';
  const gl = ctx.createRadialGradient(x, y, 0, x, y, r * (n ? 6 : 4));
  gl.addColorStop(0, rgba(P.glow, n ? 0.55 : 0.3)); gl.addColorStop(1, rgba(P.glow, 0));
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * (n ? 6 : 4), 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const body = ctx.createRadialGradient(x - 4, y - 4, 1, x, y, r);
  body.addColorStop(0, 'rgba(255,255,255,0.95)');
  body.addColorStop(0.45, rgba(P.glow, 0.6));
  body.addColorStop(1, rgba(P.glow, 0.18));
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();

  if (P.cracks) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < P.cracks; k++) {
      PLAYER_CRACKS[k].forEach(([px, py], j) => j ? ctx.lineTo(x + px * r, y + py * r) : ctx.moveTo(x + px * r, y + py * r));
    }
    ctx.stroke();
  }

  if (state === 'play' && (P.breath < 99.5 || n)) {
    const frac = P.breath / 100;
    let c = 'rgba(240,236,255,0.6)';
    if (P.winded) c = `rgba(255,96,120,${0.5 + 0.4 * Math.sin(time * 14)})`;
    else if (frac < 0.3) c = 'rgba(255,170,110,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = c;
    ctx.beginPath(); ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = 1 - p.life / p.max;
    if (p.type === 'glass') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = rgba(p.c, a * 0.9);
      ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.lineTo(p.s * 0.6, p.s * 0.7); ctx.lineTo(-p.s * 0.5, p.s * 0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.type === 'dust') {
      ctx.fillStyle = rgba(p.c, a * 0.6);
      ctx.fillRect(p.x, p.y, p.s, p.s);
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(p.c, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

function drawTexts() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `italic 15px ${DISPLAY}`;
  for (const t of texts) {
    const a = Math.min(1, (t.max - t.life) / 0.5) * Math.min(1, t.life / 0.15);
    ctx.fillStyle = rgba(t.c, a);
    ctx.fillText(t.text, t.x, t.y);
  }
}

function drawCallouts() {
  for (const co of callouts) {
    const d = CALLOUTS[co.kind], o = co.obj;
    const a = Math.min(1, co.t / 0.25) * Math.min(1, (CALLOUT_T - co.t) / 0.6);
    const oy = co.kind === 'echo' ? o.y + Math.sin(o.phase * 1.7) * 6 : o.y;
    const r = 32 + 3 * Math.sin(time * 6);
    ctx.strokeStyle = rgba(d.c, 0.85 * a); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(o.x, oy, r, 0, Math.PI * 2); ctx.stroke();

    // label box beside the ring, on the side with more room, kept clear of the HUD
    ctx.font = `italic 17px ${DISPLAY}`;
    const w = Math.max(...d.lines.map(t => ctx.measureText(t).width)) + 28, h = 30 + d.lines.length * 22;
    const side = o.x < (vx0 + vx1) / 2 ? 1 : -1;
    const bx = clamp(side > 0 ? o.x + r + 18 : o.x - r - 18 - w, vx0 + 12, vx1 - 12 - w);
    const by = clamp(oy - h / 2, camY + vy0 + 130, camY + hudBase() - 70 - h);
    ctx.strokeStyle = rgba(d.c, 0.5 * a); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.x + side * r, oy); ctx.lineTo(side > 0 ? bx : bx + w, by + h / 2); ctx.stroke();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 6); else ctx.rect(bx, by, w, h);
    ctx.fillStyle = `rgba(10,8,20,${0.82 * a})`; ctx.fill();
    ctx.strokeStyle = rgba(d.c, 0.7 * a); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `11px ${MONO}`; setSpacing(2.2);
    ctx.fillStyle = rgba(d.c, a);
    ctx.fillText(d.title.toUpperCase(), bx + 14, by + 22);
    setSpacing(0);
    ctx.font = `italic 17px ${DISPLAY}`;
    ctx.fillStyle = `rgba(242,238,255,${a})`;
    d.lines.forEach((t, k) => ctx.fillText(t, bx + 14, by + 46 + k * 22));
  }
}

function drawHush(y1) {
  const s = silenceY;
  if (s - 240 > y1) return;
  const g = ctx.createLinearGradient(0, s - 240, 0, s);
  g.addColorStop(0, 'rgba(2,1,6,0)'); g.addColorStop(1, 'rgba(2,1,6,0.85)');
  ctx.fillStyle = g; ctx.fillRect(vx0 - 20, s - 240, vx1 - vx0 + 40, 240);
  const top = new Path2D();
  const fr = Math.floor(time * 12);
  top.moveTo(vx0 - 20, s);
  for (let x = Math.floor((vx0 - 20) / 14) * 14; x <= vx1 + 20; x += 14) {
    const yy = s + Math.sin(x * 0.018 + time * 1.4) * 7 + Math.sin(x * 0.051 - time * 2.3) * 4 + (hash(Math.round(x / 14) + fr * 131) - 0.5) * 3;
    top.lineTo(x, yy);
  }
  const body = new Path2D(top);
  body.lineTo(vx1 + 20, y1 + 80); body.lineTo(vx0 - 20, y1 + 80); body.closePath();
  ctx.fillStyle = '#030208'; ctx.fill(body);
  ctx.strokeStyle = 'rgba(190,180,225,0.25)'; ctx.lineWidth = 1.2; ctx.stroke(top);
  ctx.fillStyle = 'rgba(205,198,235,0.45)';
  const depth = Math.max(0, y1 - s);
  for (let k = 0; k < 60; k++) {
    const x = vx0 + hash(k * 3 + fr * 101) * (vx1 - vx0);
    const y = s + 10 + hash(k * 5 + fr * 57 + 3) * depth;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawVignette() {
  const cx = W / 2, cy = H / 2, r = Math.max(vx1 - vx0, vy1 - vy0) * 0.75;
  const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  if (state === 'play') {
    const prox = clamp(1 - (silenceY - P.y - 30) / 420, 0, 1);
    if (prox > 0) { ctx.fillStyle = `rgba(0,0,0,${prox * 0.35})`; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0); }
    if (exposure > 0) { ctx.fillStyle = `rgba(60,0,16,${Math.min(0.45, exposure * 0.4)})`; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0); }
  }
}

function setSpacing(px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

// Players who know their keys can hide the tiles. They always show for mouse
// and touch, which play by pressing them.
let tilesOn = true;
try { tilesOn = localStorage.getItem('hollowsong.tiles') !== 'off'; } catch (e) { /* storage unavailable */ }
const tilesShown = () => tilesOn || inputsUsed.has('touch') || inputsUsed.has('mouse');
const hudBase = () => tilesShown() ? TY : vy1 - 12; // top of the bottom HUD stack

function drawHUD(pal) {
  const hm = Math.max(0, heightM(P.y));
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242,238,255,0.96)';
  ctx.font = `46px ${FIGURES}`;
  const label = String(Math.floor(hm));
  const hx = vx0 + 28, hy = vy0;
  ctx.fillText(label, hx, hy + 70);
  const wv = ctx.measureText(label).width;
  ctx.font = `22px ${DISPLAY}`;
  ctx.fillText('m', hx + 6 + wv, hy + 70);
  ctx.font = `11px ${MONO}`; setSpacing(2.2);
  ctx.fillStyle = rgba(pal.edge, 0.95);
  ctx.fillText(STRATA[stratumIdx].name.toUpperCase(), hx + 2, hy + 92);
  ctx.fillStyle = 'rgba(200,195,225,0.6)';
  ctx.fillText(`PEAK ${Math.floor(maxM)} M · BEST ${Math.floor(practice ? bestM : Math.max(bestM, maxM))} M`, hx + 2, hy + 110);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(200,195,225,0.6)';
  const rx = vx1 - 28;
  ctx.fillText('GLASS', rx, hy + 44);
  for (let k = 0; k < 3; k++) {
    const x = rx - 10 - k * 22, y = hy + 60, broken = k < P.cracks;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = broken ? 'rgba(255,90,115,0.25)' : 'rgba(220,232,255,0.55)';
    ctx.fill();
    ctx.strokeStyle = broken ? 'rgba(255,90,115,0.9)' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (broken) { ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x + 1, y); ctx.lineTo(x - 2, y + 6); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(200,195,225,0.6)';
  ctx.fillText('ECHOES', rx, hy + 96);
  ctx.font = `28px ${FIGURES}`; setSpacing(0);
  ctx.fillStyle = 'rgba(255,226,160,0.95)';
  ctx.fillText(String(echoCount), rx, hy + 128);
  if (AudioE.isMuted()) { ctx.font = `11px ${MONO}`; setSpacing(2.2); ctx.fillStyle = 'rgba(255,140,150,0.8)'; ctx.fillText('MUTED · M', rx, hy + 150); }

  // the five notes
  setSpacing(0);
  const base = hudBase();
  if (tilesShown()) for (let i = 0; i < 5; i++) {
    const n = NOTES[i], x = TX0 + i * (TW + TG), y = TY;
    const pressed = held[i] && !P.winded, tethered = !!tethers[i], avail = !!inRange[i];
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, TW, TH, 5); else ctx.rect(x, y, TW, TH);
    ctx.fillStyle = 'rgba(10,8,20,0.62)'; ctx.fill();
    if (pressed) { ctx.fillStyle = rgba(n.rgb, tethered ? 0.32 : 0.12); ctx.fill(); }
    const coached = coach && coach.target && coach.target.note === i && !tethered;
    ctx.strokeStyle = rgba(n.rgb, tethered || coached ? 1 : avail ? 0.75 : 0.22);
    ctx.lineWidth = tethered ? 2 : coached ? 2 + 1.5 * (0.5 + 0.5 * Math.sin(time * 6)) : 1.2; ctx.stroke();
    ctx.save(); ctx.translate(x + 18, y + TH / 2 + 2); ctx.scale(8, 8);
    shapePath(ctx, n.shape);
    ctx.fillStyle = rgba(n.rgb, avail || pressed ? 0.95 : 0.3); ctx.fill();
    ctx.restore();
    const key = keyShort(noteKey(i));
    ctx.font = `${key.length > 2 ? 10 : 16}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,255,255,${avail ? 0.92 : 0.4})`;
    ctx.fillText(key, x + 44, y + TH / 2 + 1);
  }
  ctx.textBaseline = 'alphabetic';
  if (P.winded) {
    ctx.font = `italic 16px ${DISPLAY}`; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,120,140,${0.6 + 0.3 * Math.sin(time * 8)})`;
    ctx.fillText('catching your breath', W / 2, base - 14);
  }

  // where is the Hush
  const gapM = (silenceY - P.y) / PX_PER_M;
  const prox = clamp(1 - gapM / 26, 0, 1);
  ctx.font = `11px ${MONO}`; setSpacing(2.6); ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(255,112,136,${0.35 + 0.6 * prox * (0.6 + 0.4 * Math.sin(time * 6))})`;
  if (practice) { ctx.fillStyle = 'rgba(200,195,225,0.55)'; if (!P.winded) ctx.fillText('PRACTICE · NO HUSH · ESC TO PAUSE OR END', W / 2, base - 14); }
  else if (!P.winded) ctx.fillText(`THE HUSH · ${Math.max(0, gapM).toFixed(0)} M BELOW`, W / 2, base - 14);
  setSpacing(0);

  const tip = state === 'play' && coach && exposure <= 0 ? coach.text : null;
  if (tip) {
    ctx.font = `italic 22px ${DISPLAY}`;
    ctx.fillStyle = `rgba(240,236,255,${0.75 + 0.2 * Math.sin(time * 3)})`;
    ctx.fillText(tip, W / 2, base - 44);
  }
  if (exposure > 0 && state === 'play') {
    ctx.font = `italic 30px ${DISPLAY}`;
    ctx.fillStyle = `rgba(255,120,140,${0.7 + 0.3 * Math.sin(time * 16)})`;
    ctx.fillText('Sing your way out of the Hush!', W / 2, vy0 + (vy1 - vy0) * 0.42);
  }

  if (bannerT > 0) {
    const a = Math.min(1, (4.5 - bannerT) / 0.8) * Math.min(1, bannerT / 1.2);
    const bannerY = vy0 + 150 + Math.max(0, (vy1 - vy0) * 0.25 - 150);
    ctx.textAlign = 'center';
    ctx.font = `12px ${MONO}`; setSpacing(4);
    ctx.fillStyle = rgba(pal.edge, a * 0.95);
    ctx.fillText(`STRATUM ${ROMAN[stratumIdx]}  ·  ${STRATA[stratumIdx].at} M`, W / 2, bannerY - 54);
    setSpacing(1);
    ctx.font = `60px ${DISPLAY}`;
    ctx.fillStyle = `rgba(246,242,255,${a})`;
    ctx.fillText(STRATA[stratumIdx].name, W / 2, bannerY);
    setSpacing(0);
    if (STRATA[stratumIdx].warn) {
      ctx.font = `italic 20px ${DISPLAY}`;
      ctx.fillStyle = `rgba(255,140,160,${a * 0.95})`;
      ctx.fillText(STRATA[stratumIdx].warn, W / 2, bannerY + 38);
    }
  }
}

// ----------------------------------------------------------- song playback
let rollData = null, playback = null;
function buildSong() {
  let acc = 0, prev = null;
  const open = [null, null, null, null, null];
  let notes = [];
  for (const e of song) {
    if (prev !== null) { const gap = e.t - prev; acc += gap > 1.0 ? 0.45 : gap; }
    prev = e.t;
    if (e.on) {
      if (open[e.i]) open[e.i].e = acc;
      open[e.i] = { i: e.i, s: acc, e: null, f: e.f };
      notes.push(open[e.i]);
    } else if (open[e.i]) { open[e.i].e = acc; open[e.i] = null; }
  }
  for (const o of open) if (o) o.e = acc + 0.3;
  let total = acc + 0.5;
  if (total > 150) {
    const cut = total - 150;
    notes = notes.filter(n => n.e > cut).map(n => ({ ...n, s: Math.max(0, n.s - cut), e: n.e - cut }));
    total = 150;
  }
  for (const n of notes) if (n.e - n.s < 0.08) n.e = n.s + 0.08;
  return { notes, total };
}

function drawRoll(playT) {
  const w = rollCv.clientWidth, h = rollCv.clientHeight;
  if (!w || !h) return;
  const d = Math.min(2, window.devicePixelRatio || 1);
  if (rollCv.width !== Math.round(w * d)) { rollCv.width = Math.round(w * d); rollCv.height = Math.round(h * d); }
  const g = rollCv.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, w, h);
  const rowH = h / 5;
  for (let i = 0; i < 5; i++) { g.fillStyle = rgba(NOTES[i].rgb, 0.05); g.fillRect(0, (4 - i) * rowH + 1, w, rowH - 2); }
  if (!rollData || !rollData.notes.length) {
    g.fillStyle = 'rgba(200,195,225,0.7)'; g.font = `italic 15px ${DISPLAY}`; g.textBaseline = 'middle';
    g.fillText('You never sang a note.', 12, h / 2);
    return;
  }
  const k = (w - 8) / rollData.total;
  for (const n of rollData.notes) {
    const lit = playT == null || n.s <= playT;
    g.fillStyle = rgba(NOTES[n.i].rgb, lit ? 0.92 : 0.3);
    g.fillRect(4 + n.s * k, (4 - n.i) * rowH + rowH * 0.24, Math.max(2, (n.e - n.s) * k), rowH * 0.52);
  }
  if (playT != null) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(4 + playT * k, 0, 1.5, h); }
}

function stopSong() {
  if (!playback) return;
  clearInterval(playback.timer);
  playback.handles.forEach(v => v.stop());
  playback = null;
  $('btnListen').firstChild.textContent = 'Hear your song ';
  drawRoll(null);
}
function toggleSong() {
  if (playback) { stopSong(); return; }
  if (!rollData || !rollData.notes.length) return;
  AudioE.init(); AudioE.setHush(0);
  const t0 = AudioE.now() + 0.15;
  let idx = 0;
  const pb = { t0, handles: [], timer: 0 };
  pb.timer = setInterval(() => {
    const now = AudioE.now();
    while (idx < rollData.notes.length && t0 + rollData.notes[idx].s < now + 0.6) {
      const n = rollData.notes[idx++];
      const v = AudioE.voice(n.f, t0 + n.s, 0.1);
      v.stop(t0 + n.e);
      pb.handles.push(v);
    }
    if (pb.handles.length > 40) pb.handles.splice(0, pb.handles.length - 40);
    if (now > t0 + rollData.total + 1.2) stopSong();
  }, 100);
  playback = pb;
  track('listen');
  $('btnListen').firstChild.textContent = 'Stop the song ';
}

// ---------------------------------------------------------------- play stats
// Anonymous run reports to GoatCounter (no cookies, nothing personal). Each event
// is a path that packs the facts about one run, e.g.
//   run/hush/s2/100-149m/left/keyboard/1-2min
// Nothing is sent from local files, localhost, or #debug sessions.
const STATS_ON = /^https?:$/.test(location.protocol) && location.hash !== '#debug' &&
  !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
let runNo = 0, runReported = true;
const inputsUsed = new Set();

function track(path) {
  if (!STATS_ON) return;
  const send = () => { try { window.goatcounter.count({ path, title: path, event: true }); } catch (e) { /* stats are best-effort */ } };
  if (window.goatcounter && window.goatcounter.count) { send(); return; }
  let tries = 0; // count.js loads async; wait for it briefly
  const t = setInterval(() => {
    if (window.goatcounter && window.goatcounter.count) { clearInterval(t); send(); }
    else if (++tries > 20) clearInterval(t);
  }, 500);
}
function bucket(v, edges, unit) {
  for (let k = edges.length - 1; k >= 0; k--) {
    if (v >= edges[k]) return k === edges.length - 1 ? `${edges[k]}+${unit}` : `${edges[k]}-${edges[k + 1] - 1}${unit}`;
  }
  return `0${unit}`;
}
function noteInput(kind) { if (state === 'play') inputsUsed.add(kind); }
function reportRun(cause) {
  if (runReported) return;
  runReported = true;
  const height = bucket(Math.floor(maxM), [0, 10, 30, 60, 100, 150, 220, 300, 400, 520, 700, 900, 1400], 'm');
  const secs = playTime;
  const dur = secs < 15 ? 'under-15s' : secs < 30 ? '15-30s' : secs < 60 ? '30-60s' : secs < 120 ? '1-2min' : secs < 300 ? '2-5min' : '5min+';
  const input = inputsUsed.size === 0 ? 'none' : inputsUsed.size > 1 ? 'mixed' : [...inputsUsed][0];
  if (practice) track(`practice/s${practiceStratum + 1}/${cause}/${bucket(Math.floor(maxM - STRATA[practiceStratum].at), [0, 10, 30, 60, 100, 150, 220, 300, 400, 520], 'm')}/${dur}`);
  else track(`run/${cause}/s${stratumIdx + 1}/${height}/${layoutId}/${input}/${dur}`);
}
window.addEventListener('pagehide', () => { if (state === 'play' || state === 'paused' || state === 'dying') reportRun(state === 'dying' ? deathCause : 'quit'); });

// ------------------------------------------------------------- flow control
function begin() {
  if (state !== 'title') return;
  if (binding >= 0) { // e.g. a gamepad Start press mid-binding: drop the unfinished binding
    binding = -1;
    applyLayout(LAYOUTS.custom.keys ? 'custom' : 'left');
  }
  AudioE.init();
  titleEl.hidden = true;
  state = 'play';
  runNo++;
  runReported = false;
  inputsUsed.clear();
  track(practice ? `start/practice/s${practiceStratum + 1}` : runNo === 1 ? 'start/first' : 'start/again');
  hushTimer = 0;
  bannerT = 4.5;
  AudioE.setDrone(STRATA[stratumIdx].root, 0.12);
  AudioE.setHush(0);
}
function restart() {
  stopSong();
  overEl.hidden = true;
  reset();
  state = 'title';
  begin();
}
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  silenceVoices();
  pauseEl.hidden = false;
  $('btnEndPractice').hidden = !practice;
  $('btnResume').focus({ preventScroll: true });
}
function resume() {
  if (state !== 'paused') return;
  pauseEl.hidden = true;
  state = 'play';
  AudioE.init();
}
function endPractice() {
  if (state !== 'paused' || !practice) return;
  pauseEl.hidden = true;
  deathCause = 'ended';
  showOver();
}
// Back to the title from the end screen, or straight from the pause menu (which
// ends the run; a climb still keeps its height as your best).
function toTitle() {
  if (state === 'paused') {
    pauseEl.hidden = true;
    reportRun('quit');
    saveBest();
    AudioE.setDrone(STRATA[stratumIdx].root, 0.04);
    AudioE.setHush(0);
  } else if (state === 'over') {
    stopSong();
    overEl.hidden = true;
  } else return;
  reset();
  state = 'title';
  titleEl.hidden = false;
  $('btnBegin').focus({ preventScroll: true });
}
function showOver() {
  reportRun(deathCause === 'ended' ? 'quit' : deathCause);
  state = 'over'; overT = 0;
  AudioE.setHush(0);
  $('overHeight').textContent = Math.floor(maxM);
  $('overStratum').textContent = `${practice ? 'Practice · ' : ''}Stratum ${ROMAN[stratumIdx]} · ${STRATA[stratumIdx].name}`;
  $('overCause').textContent = deathCause === 'hush' ? 'The Hush reached you, and your song went quiet.'
    : deathCause === 'ended' ? `You climbed ${Math.floor(maxM - STRATA[practiceStratum].at)} m in practice.`
    : 'Your glass gave way.';
  const tips = [
    'Hold the next note before you let go of the one you are on. That handoff is how you climb without falling.',
    'Let go as you rise past a crystal. Your momentum keeps you climbing while your breath refills.',
    'Find the next crystal before the one you are on cracks. Its key shows up beside it.',
    'Falling is fine. You have time to catch another crystal before the Hush reaches you.',
    'Watch the ring around your glass. When it runs low, go quiet for a moment to refill it.',
  ];
  $('overTip').textContent = maxM < 150 ? `Tip: ${tips[Math.floor(Math.random() * tips.length)]}` : '';
  $('overTip').hidden = maxM >= 150;
  $('statEchoes').textContent = echoCount;
  $('statNotes').textContent = notesSung;
  $('statChords').textContent = chordsSung;
  $('statBest').textContent = Math.floor(bestM);
  showBest();
  rollData = buildSong();
  overEl.hidden = false;
  drawRoll(null);
  $('btnAgain').focus({ preventScroll: true });
}

// ------------------------------------------------------------------- input
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (binding >= 0) { e.preventDefault(); bindKey(e.code); return; }
  // Enter on a layout button selects it rather than starting the game.
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && e.target.closest && e.target.closest('#layoutPicker, #modePicker')) return;
  if (e.code in KEYMAP) {
    e.preventDefault();
    keyHeld[KEYMAP[e.code]] = true;
    noteInput('keyboard');
    if (state === 'title') begin();
    return;
  }
  switch (e.code) {
    case 'Enter': case 'NumpadEnter':
      e.preventDefault();
      if (state === 'title') begin();
      else if (state === 'over' && overT > 0.6) restart();
      else if (state === 'paused') resume();
      break;
    case 'Space': // only reaches here when Space isn't a note in this layout
      e.preventDefault();
      if (state === 'title') begin();
      else if (state === 'paused') resume();
      break;
    case 'KeyP': case 'Escape':
      if (state === 'play') pause(); else if (state === 'paused') resume();
      else if (state === 'over' && e.code === 'Escape') toTitle();
      break;
    case 'KeyM':
      AudioE.toggleMute();
      break;
    case 'KeyR':
      if (state === 'over') toggleSong();
      break;
  }
});
window.addEventListener('keyup', e => { if (e.code in KEYMAP) keyHeld[KEYMAP[e.code]] = false; });
window.addEventListener('blur', () => { keyHeld.fill(false); ptrNotes.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function pointerNote(e) {
  const x = (e.clientX - ox) / scale, y = (e.clientY - oy) / scale;
  if (e.pointerType === 'touch') {
    if (y < vy0 + (vy1 - vy0) * 0.6) return -1;
    return clamp(Math.floor((x - vx0) / (vx1 - vx0) * 5), 0, 4);
  }
  if (y < TY - 30 || y > TY + TH + 20 || x < TX0 - 20 || x > TX0 + 5 * TW + 4 * TG + 20) return -1;
  return clamp(Math.floor((x - TX0 + TG / 2) / (TW + TG)), 0, 4);
}
cv.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  const i = pointerNote(e);
  if (i < 0) return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
  ptrNotes.set(e.pointerId, i);
  noteInput(e.pointerType === 'touch' ? 'touch' : 'mouse');
});
cv.addEventListener('pointermove', e => {
  if (!ptrNotes.has(e.pointerId)) return;
  const i = pointerNote(e);
  if (i >= 0) ptrNotes.set(e.pointerId, i);
});
const ptrEnd = e => ptrNotes.delete(e.pointerId);
cv.addEventListener('pointerup', ptrEnd);
cv.addEventListener('pointercancel', ptrEnd);

titleEl.addEventListener('click', e => {
  if (binding >= 0 || e.target.closest('#layoutPicker, #modePicker')) return;
  begin();
});

// ------------------------------------------------------------ layout picker
let binding = -1, bindDraft = [], bindError = '';
const chipKeys = [...document.querySelectorAll('#keyChips kbd')];
const chipItems = [...document.querySelectorAll('#keyChips li')];

function applyLayout(id) {
  if (!LAYOUTS[id] || !LAYOUTS[id].keys) id = 'left';
  layoutId = id;
  const L = LAYOUTS[id];
  KEYMAP = { ...ALWAYS_KEYS };
  L.keys.forEach((code, i) => { KEYMAP[code] = i; });
  for (const [code, i] of Object.entries(L.extra)) if (!(code in KEYMAP)) KEYMAP[code] = i;
  keyHeld.fill(false);
  try { localStorage.setItem('hollowsong.layout', id); } catch (e) { /* storage unavailable */ }
  renderPicker();
}
function startBinding() {
  binding = 0; bindDraft = []; bindError = '';
  renderPicker();
}
function bindKey(code) {
  if (code === 'Escape') {
    binding = -1;
    if (!LAYOUTS.custom.keys) { applyLayout('left'); return; }
    renderPicker();
    return;
  }
  if (RESERVED.has(code)) { bindError = `${keyLong(code)} runs the game, so it can't be a note. Try another key.`; renderPicker(); return; }
  if (bindDraft.includes(code)) { bindError = `${keyLong(code)} is already one of your notes. Try another key.`; renderPicker(); return; }
  bindError = '';
  bindDraft.push(code);
  binding++;
  if (binding < 5) { renderPicker(); return; }
  binding = -1;
  LAYOUTS.custom.keys = bindDraft.slice();
  try { localStorage.setItem('hollowsong.custom', JSON.stringify(bindDraft)); } catch (e) { /* storage unavailable */ }
  applyLayout('custom');
}
function renderPicker() {
  const L = LAYOUTS[layoutId];
  for (const b of document.querySelectorAll('#layoutPicker [data-layout]')) {
    b.setAttribute('aria-pressed', String(b.dataset.layout === layoutId));
  }
  chipKeys.forEach((k, i) => {
    const code = binding >= 0 ? bindDraft[i] : L.keys && L.keys[i];
    k.textContent = code ? keyShort(code) : '?';
    chipItems[i].classList.toggle('binding', i === binding);
  });
  const note = $('layoutNote');
  if (binding >= 0) {
    note.textContent = bindError || `Press the key you want for ${NOTES[binding].name}, note ${binding + 1} of 5. Esc cancels.`;
    note.classList.toggle('warn', !!bindError);
  } else {
    note.textContent = L.note;
    note.classList.remove('warn');
  }
  $('btnBind').hidden = layoutId !== 'custom' || binding >= 0;
}
for (const b of document.querySelectorAll('#layoutPicker [data-layout]')) {
  b.addEventListener('click', () => {
    binding = -1;
    const id = b.dataset.layout;
    track(`layout/${id}`);
    if (id === 'custom' && !LAYOUTS.custom.keys) { layoutId = 'custom'; startBinding(); return; }
    applyLayout(id);
  });
}
$('btnBind').addEventListener('click', () => startBinding());
function renderTiles() {
  $('btnTiles').setAttribute('aria-pressed', String(tilesOn));
  $('btnTiles').textContent = `Note tiles: ${tilesOn ? 'on' : 'off'}`;
}
$('btnTiles').addEventListener('click', () => {
  tilesOn = !tilesOn;
  try { localStorage.setItem('hollowsong.tiles', tilesOn ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
  track(`tiles/${tilesOn ? 'on' : 'off'}`);
  renderTiles();
});
renderTiles();

try {
  const saved = JSON.parse(localStorage.getItem('hollowsong.custom') || 'null');
  if (Array.isArray(saved) && saved.length === 5 && saved.every(c => typeof c === 'string' && !RESERVED.has(c)) && new Set(saved).size === 5) LAYOUTS.custom.keys = saved;
} catch (e) { /* storage unavailable */ }
let savedLayout = 'left';
try { savedLayout = localStorage.getItem('hollowsong.layout') || 'left'; } catch (e) { /* storage unavailable */ }
applyLayout(savedLayout);
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then(m => { layoutMap = m; renderPicker(); }).catch(() => {});
}
$('btnResume').addEventListener('click', e => { e.stopPropagation(); resume(); });
$('btnEndPractice').addEventListener('click', e => { e.stopPropagation(); endPractice(); });
$('btnPauseTitle').addEventListener('click', e => { e.stopPropagation(); toTitle(); });
$('btnTitle').addEventListener('click', () => toTitle());

// Mode picker: Climb or Practice, and where practice starts.
(function buildStrata() {
  const g = $('stratumPicker');
  STRATA.forEach((st, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.stratum = i;
    b.textContent = `${ROMAN[i]} · ${st.at} m`;
    b.title = st.name;
    g.appendChild(b);
  });
})();
function renderMode() {
  for (const b of document.querySelectorAll('#modePicker [data-mode]')) b.setAttribute('aria-pressed', String((b.dataset.mode === 'practice') === practice));
  for (const b of document.querySelectorAll('#stratumPicker [data-stratum]')) b.setAttribute('aria-pressed', String(Number(b.dataset.stratum) === practiceStratum));
  $('stratumPicker').hidden = !practice;
  const st = STRATA[practiceStratum];
  $('modeNote').textContent = practice
    ? `No Hush. You start on a ledge in ${st.name} and can take your time.${st.warn ? ' ' + st.warn : ''} Practice runs don't count toward your best.`
    : 'The real climb. The Hush rises behind you, and your best height counts.';
}
function setMode(isPractice, stratum) {
  practice = isPractice;
  if (stratum != null) {
    practiceStratum = stratum;
    try { localStorage.setItem('hollowsong.practiceStratum', String(stratum)); } catch (e) { /* storage unavailable */ }
  }
  reset(); // rebuild the cave behind the title at the new starting point
  renderMode();
}
for (const b of document.querySelectorAll('#modePicker [data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode === 'practice'));
for (const b of document.querySelectorAll('#stratumPicker [data-stratum]')) {
  b.addEventListener('click', () => setMode(true, Number(b.dataset.stratum)));
}
renderMode();
$('btnAgain').addEventListener('click', () => restart());
$('btnListen').addEventListener('click', () => toggleSong());

let padPrev = { start: false, a: false, y: false, any: false };
function pollPad() {
  padHeld.fill(false);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) return;
  const down = b => !!(gp.buttons[b] && gp.buttons[b].pressed);
  PAD_NOTES.forEach((b, i) => { padHeld[i] = down(b); });
  if (PAD_NOTES.some(down) || down(4)) noteInput('gamepad');
  if (down(4)) padHeld[4] = true; // LB doubles for the fifth note
  const now = { start: down(9), a: down(0), y: down(3), any: padHeld.some(Boolean) };
  if (now.start && !padPrev.start) {
    if (state === 'title') begin();
    else if (state === 'play') pause();
    else if (state === 'paused') resume();
    else if (state === 'over') restart();
  }
  if (state === 'title' && now.any && !padPrev.any) begin();
  if (state === 'over' && overT > 1 && now.a && !padPrev.a) restart();
  if (state === 'over' && now.y && !padPrev.y) toggleSong();
  padPrev = now;
}

// -------------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pollPad();
  if (state !== 'paused') time += dt;

  if (state === 'play') {
    // a callout about a danger slows time to 40% for a moment, then eases back
    const sdt = dt * (1 - 0.6 * clamp(slowT / 0.4, 0, 1));
    slowT = Math.max(0, slowT - dt);
    const n = Math.max(1, Math.ceil(sdt * 120));
    for (let k = 0; k < n && state === 'play'; k++) update(sdt / n);
  } else if (state === 'dying') {
    dieT += dt;
    updateCamera(dt);
    silenceY -= 40 * dt;
    if (dieT > 1.5) showOver();
  } else if (state === 'over') {
    overT += dt;
    silenceY -= 20 * dt;
    if (playback) drawRoll(AudioE.now() - playback.t0);
  } else if (state === 'title') {
    for (let i = 0; i < 5; i++) held[i] = false;
  }
  if (state !== 'paused') updateEffects(dt);
  draw();
  requestAnimationFrame(frame);
}

if (location.hash === '#debug') {
  window.__hollowsong = () => ({ state, P, crystals, inRange: inRange.slice(), silenceY, maxM, deathCause, playTime, held: held.slice(), layoutId,
    coach: coach && { text: coach.text, hold: coach.hold.slice() }, echoLead, callouts: callouts.map(c => c.kind) });
  window.__hollowsongStep = () => frame(performance.now());
  // Generates a fresh cave up to `top` (world y) and returns its crystals, for layout analysis.
  window.__hollowsongWorld = top => { reset(); genUpTo(top); return crystals.map(c => ({ x: c.x, y: c.y, note: c.note, spine: !!c.spine })); };
}

reset();
requestAnimationFrame(frame);
})();
