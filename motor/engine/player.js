/* Motor: a player for talking presentations.
   Reads window.SHOW, written by motor/build.py. No libraries: canvas particles, Web Audio music,
   narration decoded one chapter at a time, captions, chapters, transcript, EN/ES interface. */
(() => {
  'use strict';

  const SHOW = window.SHOW;
  const LANG_NAMES = { en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', pt: 'Português' };
  const UI = {
    en: {
      voice: 'Voice', language: 'Language', play: 'Play', ready: 'Getting ready…', readTranscript: 'Read the transcript',
      playAgain: 'Play again', hearAs: 'Hear it as {name}', notesLink: 'Liner notes', theEnd: 'The end',
      outroTitle: 'Thanks for watching.', notesEyebrow: 'Liner notes', notesTitle: 'How this was made',
      transcript: 'Transcript', tapLine: 'Tap any line to play from there.',
      captionsOnly: 'The voice couldn’t play here, so captions only.', noSound: 'Sound isn’t available here, so captions only.',
      pause: 'Pause', resume: 'Resume', next: 'Next chapter', chord: 'chord', download: 'Download as a single file',
      voiceLabel: 'Voice', voiceTitle: 'An open-source voice',
      voiceText: 'Kokoro, a small text-to-speech model with open weights, read the {n} lines of the script one at a time. They were joined with timed pauses so the captions and the light can follow along.',
      musicLabel: 'Music', musicTitle: 'Composed live in your browser',
      musicText: 'No samples or recordings. A small synthesizer built with the Web Audio API plays chord loops, a soft bass and a pentatonic melody that takes a random walk, so no two plays are the same. Each chapter sets a mood, and the music gets quieter whenever the voice speaks.',
      lightLabel: 'Light', lightTitle: 'Points that find their places',
      lightText: 'A particle system on a 2D canvas, written from scratch. Words are drawn off-screen and sampled into target positions; shapes like the sphere, the network or the compass are computed every frame. Overlapping points add up their light, and each frame only partly erases the last one, which leaves the trails.',
      specVoices: 'Voices', specLength: 'Length', specModel: 'Model', specTempo: 'Tempo',
      specParticles: 'Particles', specCues: 'Cues', specFps: 'Frame rate',
      onScreen: '{n} on this screen', perPlay: '{n} per play', fpsLive: '{n} fps, measured live',
      moods: { warm: 'Warm', inward: 'Inward', hush: 'Hush', resolve: 'Resolve' },
    },
    es: {
      voice: 'Voz', language: 'Idioma', play: 'Reproducir', ready: 'Preparando…', readTranscript: 'Leer la transcripción',
      playAgain: 'Volver a reproducir', hearAs: 'Escúchalo con {name}', notesLink: 'Notas', theEnd: 'Fin',
      outroTitle: 'Gracias por verlo.', notesEyebrow: 'Notas', notesTitle: 'Cómo se hizo',
      transcript: 'Transcripción', tapLine: 'Toca cualquier línea para reproducir desde ahí.',
      captionsOnly: 'La voz no se ha podido reproducir aquí; solo subtítulos.', noSound: 'Aquí no hay sonido; solo subtítulos.',
      pause: 'Pausa', resume: 'Continuar', next: 'Capítulo siguiente', chord: 'acorde', download: 'Descargar en un solo archivo',
      voiceLabel: 'Voz', voiceTitle: 'Una voz de código abierto',
      voiceText: 'Kokoro, un pequeño modelo de texto a voz de pesos abiertos, leyó las {n} frases del guion una a una. Se unieron con pausas medidas para que los subtítulos y la luz puedan seguirlas.',
      musicLabel: 'Música', musicTitle: 'Compuesta en directo en tu navegador',
      musicText: 'Sin muestras ni grabaciones. Un pequeño sintetizador hecho con la Web Audio API toca bucles de acordes, un bajo suave y una melodía pentatónica que avanza al azar, así que nunca suena igual. Cada capítulo marca un ambiente, y la música baja cuando habla la voz.',
      lightLabel: 'Luz', lightTitle: 'Puntos que encuentran su sitio',
      lightText: 'Un sistema de partículas en un canvas 2D, escrito desde cero. Las palabras se dibujan fuera de la pantalla y se convierten en puntos de destino; formas como la esfera, la red o la brújula se calculan en cada fotograma. Los puntos que se solapan suman su luz, y cada fotograma borra solo en parte el anterior, lo que deja la estela.',
      specVoices: 'Voces', specLength: 'Duración', specModel: 'Modelo', specTempo: 'Tempo',
      specParticles: 'Partículas', specCues: 'Indicaciones', specFps: 'Fotogramas',
      onScreen: '{n} en esta pantalla', perPlay: '{n} por reproducción', fpsLive: '{n} fps, medidos en directo',
      moods: { warm: 'Cálido', inward: 'Íntimo', hush: 'Susurro', resolve: 'Resolución' },
    },
  };

  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), canvas = $('field'), ctx = canvas.getContext('2d');
  const intro = $('intro'), outro = $('outro'), capBox = $('captions'), capEl = $('caption');
  const transport = $('transport'), pauseBtn = $('pause'), nextBtn = $('next'), tcEl = $('tc'), chordEl = $('chord'), noteEl = $('t-note');
  const progress = $('progress'), progBar = $('progress-bar'), renderView = $('render-view');
  const chapterCard = $('chapter-card'), chapterNum = $('chapter-num'), chapterName = $('chapter-name');
  const playBtn = $('play'), playLabel = $('play-label'), replayBtn = $('replay'), swapBtn = $('swap-voice'), swapLangBtn = $('swap-lang');
  const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = '"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif';
  const LEAD = 2.2; // seconds of music before the first word

  const pickLang = () => {
    const prefs = (navigator.languages || [navigator.language || 'en']).map((l) => String(l).slice(0, 2).toLowerCase());
    return prefs.find((p) => SHOW.languages.includes(p)) || SHOW.languages[0];
  };
  let lang = pickLang();
  let voice = SHOW.langs[lang].order[0];
  const L = () => SHOW.langs[lang];
  const V = () => L().voices[voice];
  const TX = () => L().texts;
  const S = () => Object.assign({}, UI.en, UI[lang] || {});
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

  let state = 'rest'; // rest | loading | playing | paused | ended
  let tl = null, narrStart = 0, events = [], evi = 0, capTimer = 0, cardTimer = 0, voiceReady = false;
  let level = 0, vEnv = 0, energy = 0;
  let cue = { type: 'drift' }, imgTimer = 0, pAlpha = 1, pAlphaT = 1, shapeT0 = 0;
  let CHAPTERS = [];

  function b64ToBuf(s) {
    const bin = atob(s), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  /* ================= particles ================= */
  const MAX_N = 4200;
  const px = new Float32Array(MAX_N), py = new Float32Array(MAX_N);
  const vx = new Float32Array(MAX_N), vy = new Float32Array(MAX_N);
  const tx = new Float32Array(MAX_N), ty = new Float32Array(MAX_N);
  const kmul = new Float32Array(MAX_N), ph = new Float32Array(MAX_N), rad = new Float32Array(MAX_N);
  const lx = new Float32Array(MAX_N), ly = new Float32Array(MAX_N), lz = new Float32Array(MAX_N);
  const spd = new Float32Array(MAX_N), dsc = new Float32Array(MAX_N).fill(1);
  const has = new Uint8Array(MAX_N), base = new Uint8Array(MAX_N), colr = new Uint8Array(MAX_N), kind = new Uint8Array(MAX_N);
  const order = new Uint16Array(MAX_N);
  let N = 0, W = 0, H = 0, DPR = 1, seeded = false, nDyn = 0;

  const PALETTE = [[255, 201, 143], [255, 138, 76], [237, 230, 220], [169, 184, 216]]; // amber, ember, paper, moon
  const WEIGHTS = [0.44, 0.24, 0.2, 0.12];
  function sprite(rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    const s = rgb.join(',');
    gr.addColorStop(0, `rgba(${s},1)`);
    gr.addColorStop(0.22, `rgba(${s},.85)`);
    gr.addColorStop(0.5, `rgba(${s},.2)`);
    gr.addColorStop(1, `rgba(${s},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return c;
  }
  let sprites = PALETTE.map(sprite);
  const RAMP_BASE = {}, TINY = {};
  for (const k of Object.keys(SHOW.images || {})) {
    const img = SHOW.images[k];
    RAMP_BASE[k] = sprites.length;
    sprites = sprites.concat(img.ramp.map(sprite));
    const im = new Image();
    im.src = img.tiny;
    TINY[k] = im;
    new Image().src = img.src; // warm the cache
  }
  const SPRITES = sprites;

  function pickColor() {
    let r = Math.random();
    for (let i = 0; i < WEIGHTS.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return i; }
    return 0;
  }
  function seedAll() {
    const small = W < 600;
    for (let i = 0; i < MAX_N; i++) {
      px[i] = Math.random() * W; py[i] = Math.random() * H; vx[i] = vy[i] = 0; has[i] = 0;
      base[i] = colr[i] = pickColor();
      kmul[i] = 0.65 + Math.random() * 0.7;
      ph[i] = Math.random();
      rad[i] = (small ? 3.1 : 3.7) * (0.7 + Math.random() * 0.6);
    }
    seeded = true;
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === W && nh === H) return;
    const ow = W, oh = H;
    W = nw; H = nh;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!seeded) seedAll();
    else if (ow && oh) for (let i = 0; i < MAX_N; i++) { px[i] *= W / ow; py[i] *= H / oh; }
    N = Math.round(Math.min(MAX_N, Math.max(2000, (W * H) / 170)));
    applyCue(cue, 0);
    const n = $('spec-n');
    if (n) n.textContent = fill(S().onScreen, { n: N.toLocaleString(lang) });
  }

  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });
  function offscreen(w, h) {
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; } else octx.clearRect(0, 0, w, h);
    return octx;
  }
  // Where shapes form: above whichever panel is showing, else between the chapter card and the captions.
  function box() {
    const panel = state === 'ended' ? outro : (state === 'rest' || state === 'loading') ? intro : null;
    const top = panel ? 14 : 70;
    let yMax = H * 0.7;
    if (panel && !panel.hidden) yMax = Math.min(H - 40, panel.offsetTop + 70);
    const h = Math.max(120, yMax - top);
    return { x: 16, y: top, w: Math.max(40, W - 32), h, cx: W / 2, cy: top + h / 2 };
  }

  function textPoints(str) {
    const b = box();
    const w = Math.floor(b.w), h = Math.floor(b.h);
    const o = offscreen(w, h);
    o.textAlign = 'left';
    o.textBaseline = 'alphabetic';
    o.font = `800 100px ${FONT}`;
    const m = o.measureText(str);
    const asc = m.actualBoundingBoxAscent || 74, desc = m.actualBoundingBoxDescent || 20;
    const tw = Math.max(1, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width));
    const fs = Math.min((100 * w * 0.9) / tw, (100 * h * 0.78) / (asc + desc), W < 600 ? 190 : 280);
    const k = fs / 100;
    o.font = `800 ${fs.toFixed(1)}px ${FONT}`;
    o.textAlign = 'center';
    o.fillStyle = '#fff';
    o.fillText(str, w / 2, h / 2 + ((asc - desc) * k) / 2);
    const d = o.getImageData(0, 0, w, h).data;
    let area = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 127) area += 4;
    const step = Math.max(1.4, Math.min(11, Math.sqrt(area / (N * 0.9))));
    const pts = [];
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const jx = x + (Math.random() - 0.5) * step * 0.7, jy = y + (Math.random() - 0.5) * step * 0.7;
        const ix = jx | 0, iy = jy | 0;
        if (ix >= 0 && iy >= 0 && ix < w && iy < h && d[(iy * w + ix) * 4 + 3] > 127) pts.push(b.x + jx, b.y + jy);
      }
    }
    return pts;
  }

  function imageRect(key) {
    const b = box(), ar = (SHOW.images[key] && SHOW.images[key].aspect) || 1;
    let w = Math.min(b.w, b.h * 1.04 * ar), h = w / ar;
    if (h > b.h * 1.04) { h = b.h * 1.04; w = h * ar; }
    return { x: b.cx - w / 2, y: b.cy - h / 2, w: Math.floor(w), h: Math.floor(h) };
  }
  function imagePoints(key) {
    const img = SHOW.images[key];
    if (!img) return null;
    const r = imageRect(key);
    if (renderView.getAttribute('src') !== img.src) renderView.setAttribute('src', img.src);
    Object.assign(renderView.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    const im = TINY[key];
    if (!im || !im.complete || !im.naturalWidth) return null;
    const Tw = 200, Th = Math.max(20, Math.round(200 / (img.aspect || 1)));
    const o = offscreen(Tw, Th);
    o.drawImage(im, 0, 0, Tw, Th);
    const d = o.getImageData(0, 0, Tw, Th).data;
    const pts = [], cols = [], Lr = img.ramp.length, rb = RAMP_BASE[key];
    for (let y = 0; y < Th; y++) {
      for (let x = 0; x < Tw; x++) {
        const k = (y * Tw + x) * 4;
        const lum = (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255;
        if (lum < 0.1) continue;
        pts.push(r.x + ((x + Math.random()) / Tw) * r.w, r.y + ((y + Math.random()) / Th) * r.h);
        cols.push(rb + Math.min(Lr - 1, Math.floor(lum * Lr)));
      }
    }
    return { pts, cols };
  }

  function shuffleOrder() {
    for (let i = 0; i < N; i++) order[i] = i;
    for (let i = N - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
  }
  function assign(pts, cols) {
    const count = pts.length / 2;
    const idx = new Uint32Array(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    for (let i = count - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const n = Math.min(count, Math.floor(N * 0.94));
    shuffleOrder();
    for (let j = 0; j < N; j++) {
      const i = order[j];
      dsc[i] = 1;
      if (j < n) { const p = idx[j]; tx[i] = pts[p * 2]; ty[i] = pts[p * 2 + 1]; has[i] = 1; colr[i] = cols ? cols[p] : base[i]; }
      else { has[i] = 0; colr[i] = base[i]; }
    }
    for (let i = N; i < MAX_N; i++) has[i] = 0;
  }
  function release() { for (let i = 0; i < MAX_N; i++) { has[i] = 0; colr[i] = base[i]; dsc[i] = 1; } }

  /* ----- computed shapes: local coordinates are set once per cue, targets every frame ----- */
  const FRAC = { wave: 0.88, ring: 0.9, sphere: 0.9, layers: 0.9, many: 0.9, compass: 0.92, heart: 0.9 };
  let NODES = [], EDGES = [], ringsK = 12, gridCols = 3;
  function setupDynamic(c) {
    shuffleOrder();
    const n = (nDyn = Math.floor(N * FRAC[c.type]));
    for (let j = 0; j < N; j++) { const i = order[j]; has[i] = j < n ? 1 : 0; colr[i] = base[i]; dsc[i] = 1; kind[i] = 0; }
    const R = Math.random;
    if (c.type === 'sphere') {
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let j = 0; j < n; j++) {
        const i = order[j], y = 1 - (2 * (j + 0.5)) / n, r = Math.sqrt(1 - y * y), th = golden * j;
        lx[i] = Math.cos(th) * r; ly[i] = y; lz[i] = Math.sin(th) * r;
      }
    } else if (c.type === 'layers') {
      const counts = W < 600 ? [3, 5, 5, 2] : [4, 6, 6, 6, 3];
      NODES = []; EDGES = [];
      const colStart = [];
      counts.forEach((cnt, ci) => {
        colStart.push(NODES.length);
        for (let k = 0; k < cnt; k++) NODES.push({ x: -1 + (2 * ci) / (counts.length - 1), y: cnt === 1 ? 0 : -1 + (2 * k) / (cnt - 1) });
      });
      for (let ci = 0; ci < counts.length - 1; ci++) {
        for (let a = 0; a < counts[ci]; a++) for (let bb = 0; bb < counts[ci + 1]; bb++) EDGES.push([colStart[ci] + a, colStart[ci + 1] + bb]);
      }
      const nNodes = Math.floor(n * 0.42);
      for (let j = 0; j < n; j++) {
        const i = order[j];
        if (j < nNodes) { kind[i] = 0; lx[i] = j % NODES.length; ly[i] = R() * Math.PI * 2; lz[i] = Math.sqrt(R()); colr[i] = R() < 0.6 ? 0 : 2; }
        else { kind[i] = 1; lx[i] = j % EDGES.length; ly[i] = R(); spd[i] = 0.18 + R() * 0.22; colr[i] = 3; dsc[i] = 0.62; }
      }
    } else if (c.type === 'many') {
      gridCols = W < 600 ? 3 : 6;
      ringsK = gridCols * (W < 600 ? 4 : 3);
      const per = n / ringsK;
      for (let j = 0; j < n; j++) { const i = order[j]; lx[i] = j % ringsK; ly[i] = (Math.floor(j / ringsK) / per) * Math.PI * 2; }
    } else if (c.type === 'compass') {
      const nRing = Math.floor(n * 0.42), nTick = Math.floor(n * 0.12), nNeedle = Math.floor(n * 0.42);
      for (let j = 0; j < n; j++) {
        const i = order[j];
        if (j < nRing) { kind[i] = 0; lx[i] = (j / nRing) * Math.PI * 2; ly[i] = 1 + (R() - 0.5) * 0.05; }
        else if (j < nRing + nTick) {
          const tk = j % 32, card = tk % 8 === 0;
          kind[i] = 1; lx[i] = (tk / 32) * Math.PI * 2; ly[i] = card ? 0.68 + R() * 0.22 : 0.8 + R() * 0.1;
          colr[i] = tk === 0 ? 1 : 2;
        } else if (j < nRing + nTick + nNeedle) {
          const u = R() * 2 - 1, v = (R() * 2 - 1) * (1 - Math.abs(u));
          kind[i] = 2; lx[i] = u; ly[i] = v; colr[i] = u > 0 ? 1 : 3;
        } else { kind[i] = 3; lx[i] = R() * Math.PI * 2; ly[i] = Math.sqrt(R()); colr[i] = 2; }
      }
    } else if (c.type === 'heart') {
      let j = 0;
      while (j < n) {
        const x = (R() * 2 - 1) * 1.15, y = R() * 2.3 - 1.05;
        const q = x * x + y * y - 1;
        if (q * q * q - x * x * y * y * y <= 0) { const i = order[j]; lx[i] = x; ly[i] = y; colr[i] = R() < 0.6 ? 1 : 0; j++; }
      }
    }
  }

  function dynTargets(t) {
    const b = box(), n = nDyn, tau = t - shapeT0;
    if (cue.type === 'wave') {
      const rows = 5, gap = Math.min(22, b.h / 9), per = n / rows;
      const amp = Math.min(b.h * 0.22, 90) * (0.45 + level * 1.6);
      for (let j = 0; j < n; j++) {
        const i = order[j], row = j % rows, u = (Math.floor(j / rows) + 0.5) / per;
        tx[i] = b.x + 8 + u * (b.w - 16);
        ty[i] = b.cy + (row - (rows - 1) / 2) * gap + amp * Math.sin(u * Math.PI * 3.2 + t * 1.7 + row * 0.55) * (0.6 + 0.4 * Math.sin(t * 0.6 + row));
      }
    } else if (cue.type === 'ring') {
      const R = Math.min(b.w, b.h) * 0.42, radii = [0.5, 0.74, 1.0], per = n / 3;
      for (let j = 0; j < n; j++) {
        const i = order[j], ring = j % 3;
        const a = (Math.floor(j / 3) / per) * Math.PI * 2 + t * 0.18 * (ring === 1 ? -1 : 1);
        const r = R * radii[ring] * (1 + (vEnv * 0.22 * (ring + 1)) / 1.5 + 0.035 * Math.sin(a * 7 + t * 2.3 + ring));
        tx[i] = b.cx + r * Math.cos(a);
        ty[i] = b.cy + r * Math.sin(a);
      }
    } else if (cue.type === 'sphere') {
      const R = Math.min(b.w, b.h) * 0.42 * (1 + vEnv * 0.06);
      const a = tau * 0.35 + 0.6, ca = Math.cos(a), sa = Math.sin(a), tilt = 0.38, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let j = 0; j < n; j++) {
        const i = order[j];
        const x1 = lx[i] * ca + lz[i] * sa, z1 = -lx[i] * sa + lz[i] * ca;
        const y2 = ly[i] * ct - z1 * st, z2 = ly[i] * st + z1 * ct;
        const p = 2.8 / (2.8 + z2);
        tx[i] = b.cx + x1 * R * p;
        ty[i] = b.cy - y2 * R * p;
        dsc[i] = 0.45 + 0.55 * (1 - (z2 + 1) / 2);
      }
    } else if (cue.type === 'layers') {
      const sx = b.w * 0.4, sy = Math.min(b.h * 0.38, b.w * 0.55), nr = Math.min(b.w, b.h) * 0.032 * (1 + vEnv * 0.6);
      for (let j = 0; j < n; j++) {
        const i = order[j];
        if (kind[i] === 0) {
          const nd = NODES[lx[i] | 0];
          tx[i] = b.cx + nd.x * sx + Math.cos(ly[i]) * lz[i] * nr;
          ty[i] = b.cy + nd.y * sy + Math.sin(ly[i]) * lz[i] * nr;
        } else {
          const e = EDGES[lx[i] | 0], A = NODES[e[0]], B = NODES[e[1]];
          const u = (ly[i] + tau * spd[i]) % 1;
          tx[i] = b.cx + (A.x + (B.x - A.x) * u) * sx;
          ty[i] = b.cy + (A.y + (B.y - A.y) * u) * sy;
        }
      }
    } else if (cue.type === 'many') {
      const rows = Math.ceil(ringsK / gridCols), cw = b.w / gridCols, chh = b.h / rows;
      const R = Math.min(cw, chh) * 0.3;
      for (let j = 0; j < n; j++) {
        const i = order[j], k = lx[i] | 0, col = k % gridCols, row = (k / gridCols) | 0;
        const cx = b.x + (col + 0.5) * cw, cy = b.y + (row + 0.5) * chh;
        const a = ly[i] + t * 0.5 * (k % 2 ? 1 : -1);
        const r = R * (1 + 0.14 * Math.sin(t * 2.1 + k * 1.37) + vEnv * 0.12);
        tx[i] = cx + r * Math.cos(a);
        ty[i] = cy + r * Math.sin(a);
      }
    } else if (cue.type === 'compass') {
      const R = Math.min(b.w, b.h) * 0.42, Ln = R * 0.74, Wd = R * 0.1;
      const th = (cue.off || 0) + 1.15 * Math.exp(-1.0 * tau) * Math.cos(3.1 * tau) + vEnv * 0.03 * Math.sin(t * 9);
      const dx = Math.sin(th), dy = -Math.cos(th); // needle direction, 0 = north (up)
      for (let j = 0; j < n; j++) {
        const i = order[j];
        if (kind[i] === 0) { tx[i] = b.cx + Math.cos(lx[i]) * R * ly[i]; ty[i] = b.cy + Math.sin(lx[i]) * R * ly[i]; }
        else if (kind[i] === 1) { const a = lx[i] - Math.PI / 2; tx[i] = b.cx + Math.cos(a) * R * ly[i]; ty[i] = b.cy + Math.sin(a) * R * ly[i]; }
        else if (kind[i] === 2) { const u = lx[i] * Ln, v = ly[i] * Wd; tx[i] = b.cx + dx * u - dy * v; ty[i] = b.cy + dy * u + dx * v; }
        else { tx[i] = b.cx + Math.cos(lx[i]) * ly[i] * R * 0.06; ty[i] = b.cy + Math.sin(lx[i]) * ly[i] * R * 0.06; }
      }
    } else if (cue.type === 'heart') {
      const Sz = Math.min(b.w, b.h) * 0.36;
      const phase = (tau * 1.2) % 1; // 72 BPM
      const pulse = Math.exp(-phase * 9) + (phase > 0.28 ? 0.55 * Math.exp(-(phase - 0.28) * 12) : 0);
      const sc = Sz * (1 + 0.06 * pulse + vEnv * 0.03);
      for (let j = 0; j < n; j++) { const i = order[j]; tx[i] = b.cx + lx[i] * sc; ty[i] = b.cy - (ly[i] - 0.12) * sc; }
    }
  }

  function applyCue(c, sound) {
    cue = c;
    shapeT0 = performance.now() / 1000;
    clearTimeout(imgTimer);
    if (c.type !== 'image') { renderView.classList.remove('on'); pAlphaT = 1; }
    if (c.type === 'text') assign(textPoints(c.value));
    else if (c.type === 'image') {
      const r = imagePoints(c.src);
      if (r) assign(r.pts, r.cols); else release();
      imgTimer = setTimeout(() => { if (cue.type === 'image') { renderView.classList.add('on'); pAlphaT = 0.35; } }, REDUCED ? 200 : 1500);
    } else if (FRAC[c.type]) setupDynamic(c);
    else release();
    if (sound && c.type !== 'drift') bell(sound);
  }

  function physics(t, dt) {
    const K = REDUCED ? 0.008 : 0.016, damp = Math.pow(0.86, dt);
    const wob = REDUCED ? 0.15 : 0.45 + energy * 2.6;
    const drift = REDUCED ? 0.02 : 0.05;
    for (let i = 0; i < N; i++) {
      let ax, ay;
      if (has[i]) {
        const p = ph[i] * 40;
        ax = (tx[i] + Math.sin(t * 1.7 + p) * wob - px[i]) * K * kmul[i];
        ay = (ty[i] + Math.cos(t * 1.3 + p * 0.8) * wob - py[i]) * K * kmul[i];
      } else {
        const a = Math.sin(px[i] * 0.0045 + t * 0.21) * 2.1 + Math.cos(py[i] * 0.0052 - t * 0.17) * 2.1 + ph[i] * 0.8;
        ax = Math.cos(a) * drift;
        ay = Math.sin(a) * drift - 0.006;
      }
      vx[i] = (vx[i] + ax * dt) * damp;
      vy[i] = (vy[i] + ay * dt) * damp;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      if (!has[i]) {
        if (px[i] < -12) px[i] += W + 24; else if (px[i] > W + 12) px[i] -= W + 24;
        if (py[i] < -12) py[i] += H + 24; else if (py[i] > H + 12) py[i] -= H + 24;
      }
    }
  }
  function draw() {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = cue.type === 'image' ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.26)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, pAlpha));
    const boost = (1 + energy * 0.55) * (cue.type === 'image' ? 0.72 : 1);
    for (let i = 0; i < N; i++) {
      const r = rad[i] * boost * dsc[i];
      ctx.drawImage(SPRITES[colr[i]], px[i] - r, py[i] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ================= music ================= */
  const BPM = 72, EIGHTH = 60 / BPM / 2;
  const C = (name, pad, bass, tones) => ({ name, pad, bass, tones });
  const DMAJ9 = C('Dmaj9', [50, 57, 61, 64, 66], 38, [62, 66, 69, 73, 76]);
  const BM9 = C('Bm9', [47, 54, 57, 61, 62], 35, [59, 62, 66, 69, 73]);
  const GMAJ9 = C('Gmaj9', [43, 50, 54, 57, 59], 31, [55, 59, 62, 66, 69]);
  const A7SUS = C('A7sus4', [45, 52, 55, 62, 64], 33, [57, 62, 64, 67, 69]);
  const GMAJ7 = C('Gmaj7', [43, 50, 54, 59, 62], 31, [55, 59, 62, 66, 67]);
  const EM9 = C('Em9', [40, 50, 54, 55, 59], 28, [59, 62, 64, 66, 67]);
  const FSM7 = C('F♯m7', [42, 49, 52, 57, 61], 30, [61, 64, 66, 69, 73]);
  const D_FS = C('D/F♯', [42, 50, 57, 62, 64], 30, [62, 66, 69, 74, 76]);
  const A7 = C('A7', [45, 52, 55, 61, 64], 33, [57, 61, 64, 67, 69]);
  const MOODS = {
    warm: { prog: [DMAJ9, BM9, GMAJ9, A7SUS], density: 1, lo: 0, hi: 8 },
    inward: { prog: [BM9, GMAJ7, EM9, FSM7], density: 0.55, lo: 0, hi: 6 },
    hush: { prog: [BM9, GMAJ7, EM9, FSM7], density: 0.22, lo: 0, hi: 4 },
    resolve: { prog: [GMAJ9, D_FS, EM9, A7], density: 0.85, lo: 1, hi: 8 },
  };
  const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let actx = null, limiter = null, voiceBus = null, IR = null, music = null, gen = 0;
  const ana = { node: null, buf: null };
  let schedTimer = 0, nextNote = 0, stepN = 0, walk = 4, chordLog = [], musicEnd = Infinity, bellIdx = 0;
  let curMood = 'warm', pendingMood = 'warm', barN = 0, curChord = null;

  function makeIR(sec) {
    const rate = actx.sampleRate, len = Math.floor(sec * rate);
    const buf = actx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.4 - 0.3 * t);
        d[i] = lp * Math.pow(1 - t, 2.4) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
      }
    }
    return buf;
  }
  function ensureAudio() {
    if (actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC({ latencyHint: 'playback' }); } catch (e) { try { actx = new AC(); } catch (e2) { return null; } }
    limiter = actx.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 4; limiter.ratio.value = 14;
    limiter.attack.value = 0.003; limiter.release.value = 0.2;
    limiter.connect(actx.destination);
    voiceBus = actx.createGain();
    voiceBus.gain.value = 1;
    voiceBus.connect(limiter);
    const an = actx.createAnalyser();
    an.fftSize = 1024;
    ana.node = an;
    ana.buf = new Float32Array(an.fftSize);
    // One silent frame inside the tap unlocks audio on iOS.
    const b = actx.createBuffer(1, 1, actx.sampleRate), s = actx.createBufferSource();
    s.buffer = b; s.connect(actx.destination); s.start(0);
    IR = makeIR(3.2);
    return actx;
  }
  function gain(v) { const g = actx.createGain(); g.gain.value = v; return g; }
  function buildMusic() {
    const bus = gain(0.0001);
    const glue = actx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.ratio.value = 2.5; glue.attack.value = 0.02; glue.release.value = 0.3;
    bus.connect(glue); glue.connect(limiter); glue.connect(ana.node);
    const verb = actx.createConvolver();
    verb.buffer = IR;
    const verbOut = gain(0.5); verb.connect(verbOut); verbOut.connect(bus);
    const dly = actx.createDelay(2); dly.delayTime.value = (60 / BPM) * 0.75;
    const fb = gain(0.32), dlp = actx.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    dly.connect(dlp); dlp.connect(fb); fb.connect(dly);
    const dOut = gain(0.35); dlp.connect(dOut); dOut.connect(bus); dOut.connect(verb);
    const pad = gain(0.9); pad.connect(bus); const padSend = gain(0.55); pad.connect(padSend); padSend.connect(verb);
    const arp = gain(0.9); arp.connect(bus); arp.connect(dly); const arpSend = gain(0.45); arp.connect(arpSend); arpSend.connect(verb);
    const bass = gain(1); bass.connect(bus);
    const bellBus = gain(0.8); bellBus.connect(bus); const bellSend = gain(0.7); bellBus.connect(bellSend); bellSend.connect(verb);
    return { bus, glue, pad, arp, bass, bell: bellBus };
  }
  function teardownMusic(m) {
    if (!m || !actx) return;
    const t = actx.currentTime, g = m.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.25);
    setTimeout(() => { try { m.glue.disconnect(); } catch (e) { /* already gone */ } }, 500);
  }
  function pad(ch, t, dur, out) {
    const end = t + dur;
    for (const m of ch.pad) {
      const f = mtof(m);
      const o1 = actx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
      const o2 = actx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = (Math.random() * 2 - 1) * 8;
      const g2 = gain(0.2);
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(600, t);
      lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.55);
      lp.frequency.linearRampToValueAtTime(700, end + 2);
      const env = gain(0);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.05, t + 1.8);
      env.gain.setValueAtTime(0.05, end - 0.1);
      env.gain.linearRampToValueAtTime(0, end + 2.2);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(env); env.connect(out.pad);
      o1.start(t); o2.start(t); o1.stop(end + 2.3); o2.stop(end + 2.3);
    }
  }
  function bassNote(ch, t, dur, out) {
    const end = t + dur;
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(ch.bass);
    const o2 = actx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(ch.bass + 12);
    const g2 = gain(0.12), env = gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.16, t + 0.9);
    env.gain.setValueAtTime(0.16, end - 0.3);
    env.gain.linearRampToValueAtTime(0, end + 0.6);
    o.connect(env); o2.connect(g2); g2.connect(env); env.connect(out.bass);
    o.start(t); o2.start(t); o.stop(end + 0.7); o2.stop(end + 0.7);
  }
  function pluck(m, t, vel, out) {
    const f = mtof(m);
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = actx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g2 = gain(0.16), env = gain(0.0001);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.1 * vel, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    let dest = env;
    if (actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = Math.random() * 0.8 - 0.4; env.connect(p); dest = p; }
    o.connect(env); o2.connect(g2); g2.connect(env); dest.connect(out.arp);
    o.start(t); o2.start(t); o.stop(t + 1.4); o2.stop(t + 1.4);
  }
  function currentChord() {
    if (!actx) return null;
    const now = actx.currentTime;
    for (let i = chordLog.length - 1; i >= 0; i--) if (chordLog[i].t <= now) return chordLog[i].ch;
    return null;
  }
  function bell(vel) {
    if (!actx || !music || state !== 'playing') return;
    const t = actx.currentTime + 0.03;
    const ch = currentChord() || DMAJ9;
    const f = mtof(ch.tones[(bellIdx++ * 2 + 1) % ch.tones.length] + 12);
    const car = actx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
    const mod = actx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 3.5;
    const idx = gain(f * 1.6);
    idx.gain.setValueAtTime(f * 1.6, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.6);
    mod.connect(idx); idx.connect(car.frequency);
    const env = gain(0.0001);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.05 * (typeof vel === 'number' ? vel : 1), t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    car.connect(env); env.connect(music.bell);
    car.start(t); mod.start(t); car.stop(t + 2.9); mod.stop(t + 2.9);
  }
  function step(i, t, out) {
    const pos = i % 16;
    if (pos === 0) {
      if (pendingMood !== curMood) { curMood = pendingMood; barN = 0; }
      const M = MOODS[curMood] || MOODS.warm;
      curChord = M.prog[barN % M.prog.length];
      barN++;
      pad(curChord, t, 16 * EIGHTH, out);
      bassNote(curChord, t, 16 * EIGHTH, out);
      chordLog.push({ t, ch: curChord });
      if (chordLog.length > 8) chordLog.shift();
    }
    if (i < 8 || !curChord) return; // let the pad breathe before the melody comes in
    const M = MOODS[curMood] || MOODS.warm, strong = pos % 4 === 0;
    if (Math.random() < (strong ? 0.72 : 0.38) * M.density) {
      const moves = [-2, -1, -1, 1, 1, 2];
      walk = Math.max(M.lo, Math.min(M.hi, walk + moves[(Math.random() * moves.length) | 0]));
      let note = PENTA[walk];
      if (strong) note = curChord.tones.reduce((a, b) => (Math.abs(b - note) < Math.abs(a - note) ? b : a), curChord.tones[0]);
      const swing = i % 2 ? EIGHTH * 0.1 : 0;
      pluck(note, t + swing + (Math.random() - 0.5) * 0.01, strong ? 0.75 + Math.random() * 0.25 : 0.4 + Math.random() * 0.35, out);
    }
  }
  function startScheduler(t0, g) {
    stopScheduler();
    nextNote = t0; stepN = 0; walk = 4; chordLog = []; barN = 0; curChord = null;
    const out = music;
    const tick = () => {
      if (g !== gen || !music) { stopScheduler(); return; }
      const horizon = actx.currentTime + 0.18;
      while (nextNote < horizon) {
        if (nextNote > musicEnd) { stopScheduler(); return; }
        step(stepN, nextNote, out);
        nextNote += EIGHTH;
        stepN++;
      }
    };
    schedTimer = setInterval(tick, 25);
    tick();
  }
  function stopScheduler() { clearInterval(schedTimer); schedTimer = 0; }
  function duck(g, t0, ns, t, from) {
    const inLine = from >= 0 && t.lines.some((l) => from >= l.start - 0.15 && from <= l.end + 0.05);
    const up = from < 0 ? 2.0 : 1.0;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(inLine ? 0.36 : 0.8, t0 + up);
    const tMin = t0 + up + 0.02;
    for (const l of t.lines) {
      const s = ns + l.start - 0.15, e = ns + l.end + 0.05;
      if (e <= tMin) continue;
      g.setTargetAtTime(0.36, Math.max(s, tMin), 0.08);
      g.setTargetAtTime(0.8, e, 0.35);
    }
    const end = Math.max(ns + t.duration, tMin + 0.05);
    g.setTargetAtTime(1.0, end, 0.8);
    g.setTargetAtTime(0.0001, end + 8, 1.8);
  }

  /* ================= narration, one chapter of audio at a time ================= */
  const segCache = new Map();
  let segSources = [];
  function decode(ab) {
    return new Promise((res, rej) => {
      const p = actx.decodeAudioData(ab, res, rej);
      if (p && typeof p.then === 'function') p.then(res, rej);
    });
  }
  function segAt(t) { let k = 0; V().segs.forEach((s, i) => { if (s.t <= t) k = i; }); return k; }
  function loadSeg(k) {
    const key = `${lang}|${voice}|${k}`;
    for (const kk of [...segCache.keys()]) {
      const p = kk.split('|');
      if (p[0] !== lang || p[1] !== voice || +p[2] < k - 1 || +p[2] > k + 1) segCache.delete(kk);
    }
    if (!segCache.has(key)) {
      const seg = V().segs[k];
      const bytes = seg.b64
        ? Promise.resolve().then(() => b64ToBuf(seg.b64))
        : fetch(seg.url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
      const p = bytes.then(decode);
      p.catch(() => segCache.delete(key));
      segCache.set(key, p);
    }
    return segCache.get(key);
  }
  function stopVoice() {
    segSources.forEach((s) => { try { s.stop(); } catch (e) { /* not started */ } });
    segSources = [];
  }
  function startSeg(buf, when, offset) {
    const now = actx.currentTime + 0.02;
    if (when < now) { offset += now - when; when = now; }
    if (offset >= buf.duration) return;
    const s = actx.createBufferSource();
    s.buffer = buf;
    s.connect(voiceBus);
    s.start(when, offset);
    segSources.push(s);
    s.onended = () => { segSources = segSources.filter((x) => x !== s); };
  }
  const waitFor = (t, g) => new Promise((res) => {
    const check = () => (g !== gen || actx.currentTime >= t ? res() : setTimeout(check, 250));
    check();
  });
  async function playSegments(from, g) {
    const segs = V().segs;
    let k = segAt(Math.max(0, from));
    try {
      let buf = await loadSeg(k);
      if (g !== gen) return;
      const off0 = Math.max(0, from - segs[k].t);
      startSeg(buf, narrStart + segs[k].t + off0, off0);
      for (k += 1; k < segs.length; k++) {
        await waitFor(narrStart + segs[k].t - 4, g); // decode the next chapter shortly before it starts
        if (g !== gen) return;
        buf = await loadSeg(k);
        if (g !== gen) return;
        startSeg(buf, narrStart + segs[k].t, 0);
      }
    } catch (e) {
      if (g === gen) { noteEl.textContent = S().captionsOnly; noteEl.hidden = false; }
    }
  }

  /* ================= sequence ================= */
  const clock = () => (actx ? actx.currentTime : performance.now() / 1000);
  const narrTime = () => (tl ? clock() - narrStart : -1);
  function fmt(s) { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function chaptersOf(t) {
    const out = [];
    t.lines.forEach((l, idx) => { if (l.chapter) out.push({ name: l.chapter, start: l.start, idx, num: out.length + 1 }); });
    return out;
  }
  function buildEvents(t) {
    const ev = [];
    t.lines.forEach((line, idx) => {
      ev.push({ t: line.start, kind: 'line', line, idx });
      if (line.music) ev.push({ t: Math.max(-LEAD - 1, line.start - 3.3), kind: 'mood', mood: line.music });
      (line.caps || []).slice(1).forEach((c) => ev.push({ t: c.t, kind: 'cap', text: c.text }));
      (line.subcues || []).forEach((s) => ev.push({ t: s.t, kind: 'cue', cue: s.cue }));
    });
    return ev.sort((a, b) => a.t - b.t);
  }
  const firstCap = (line) => (line.caps ? line.caps[0].text : line.caption);
  function setCaption(text, instant) {
    clearTimeout(capTimer);
    if (instant || REDUCED) { capEl.textContent = text; capEl.classList.remove('swap'); return; }
    capEl.classList.add('swap');
    capTimer = setTimeout(() => { capEl.textContent = text; capEl.classList.remove('swap'); }, 140);
  }
  function markLine(i) {
    const prev = document.querySelector('.line-btn.now');
    if (prev) prev.classList.remove('now');
    const b = document.querySelector(`.line-btn[data-i="${i}"]`);
    if (b) b.classList.add('now');
  }
  function showChapter(lineIdx, fresh) {
    const ch = CHAPTERS.find((c) => c.idx === lineIdx);
    if (!ch) return;
    chapterNum.textContent = `${ch.num} / ${CHAPTERS.length}`;
    chapterName.textContent = ch.name;
    chapterCard.hidden = false;
    clearTimeout(cardTimer);
    if (fresh && !REDUCED) {
      chapterCard.classList.add('fresh');
      cardTimer = setTimeout(() => chapterCard.classList.remove('fresh'), 2600);
    } else chapterCard.classList.remove('fresh');
    nextBtn.disabled = ch.num >= CHAPTERS.length;
  }
  function fire(e) {
    if (e.kind === 'line') {
      setCaption(firstCap(e.line));
      markLine(e.idx);
      if (e.line.chapter) showChapter(e.idx, true);
      if (e.line.cue) applyCue(e.line.cue, 1);
    } else if (e.kind === 'cap') setCaption(e.text);
    else if (e.kind === 'mood') pendingMood = e.mood;
    else applyCue(e.cue, 0.6);
  }
  function sequence(nt) {
    while (evi < events.length && events[evi].t <= nt) fire(events[evi++]);
    tcEl.textContent = `${fmt(nt)} / ${fmt(tl.duration)}`;
    progBar.style.width = `${Math.max(0, Math.min(100, (nt / tl.duration) * 100))}%`;
    const ch = currentChord();
    if (ch && chordEl.textContent !== ch.name) chordEl.textContent = ch.name;
    if (nt > tl.duration + 1.4) finish();
  }

  async function start(from) {
    if (state === 'loading') return;
    if (typeof from !== 'number') from = -LEAD;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    ensureAudio();
    const resuming = actx && actx.state !== 'running' ? actx.resume() : null; // must be called inside the tap
    state = 'loading';
    playBtn.disabled = replayBtn.disabled = swapBtn.disabled = swapLangBtn.disabled = true;
    playLabel.textContent = S().ready;
    if (resuming) { try { await resuming; } catch (e) { /* keep going with captions */ } }
    let ok = false;
    if (actx) { try { await loadSeg(segAt(Math.max(0, from))); ok = true; } catch (e) { ok = false; } }
    begin(ok, from);
  }

  function begin(ok, from) {
    gen++;
    const g = gen;
    tl = V().timeline;
    voiceReady = ok;
    teardownMusic(music);
    music = null;
    stopVoice();
    state = 'playing';
    intro.hidden = true; outro.hidden = true;
    capBox.hidden = false; transport.hidden = false; progress.hidden = false;
    noteEl.textContent = !actx ? S().noSound : ok ? '' : S().captionsOnly;
    noteEl.hidden = !noteEl.textContent;
    pauseBtn.hidden = !actx;
    pauseBtn.classList.remove('paused');
    pauseBtn.setAttribute('aria-label', S().pause);

    // Catch up silently to `from`: caption, chapter, visual and mood as they would be at that moment.
    events = buildEvents(tl);
    evi = 0;
    let lastLine = null, lastCap = '', lastCue = null, lastChapter = -1, mood = 'warm';
    while (evi < events.length && events[evi].t <= from) {
      const e = events[evi++];
      if (e.kind === 'line') { lastLine = e; lastCap = firstCap(e.line); if (e.line.cue) lastCue = e.line.cue; if (e.line.chapter) lastChapter = e.idx; }
      else if (e.kind === 'cap') lastCap = e.text;
      else if (e.kind === 'cue') lastCue = e.cue;
      else if (e.kind === 'mood') mood = e.mood;
    }
    curMood = pendingMood = mood;

    const t0 = clock(), startAt = t0 + 0.12;
    narrStart = startAt - from;
    musicEnd = narrStart + tl.duration + 12;
    if (actx) {
      music = buildMusic();
      duck(music.bus.gain, t0, narrStart, tl, from);
      startScheduler(t0 + 0.06, g);
    }
    if (ok) playSegments(from, g);
    setCaption(lastCap, true);
    markLine(lastLine ? lastLine.idx : -1);
    if (lastChapter >= 0) showChapter(lastChapter, false);
    else { chapterCard.hidden = true; nextBtn.disabled = CHAPTERS.length === 0; }
    applyCue(lastCue || { type: 'drift' }, 0);
    playBtn.disabled = replayBtn.disabled = swapBtn.disabled = swapLangBtn.disabled = false;
    playLabel.textContent = TX().play || S().play;
    requestWake();
  }

  function finish() {
    state = 'ended';
    capBox.hidden = true; transport.hidden = true; progress.hidden = true; chapterCard.hidden = true;
    renderOutro();
    outro.hidden = false;
    markLine(-1);
    // Keep the last word on screen (re-placed above the outro panel) unless the script names one.
    const word = TX().outro_word;
    applyCue(word ? { type: 'text', value: word } : cue.type === 'text' ? cue : { type: 'text', value: lang === 'es' ? 'fin' : 'the end' }, 0);
    releaseWake();
  }

  function playFrom(from) {
    if (state === 'rest' || state === 'loading' || !actx) { start(from); return; }
    const go = () => {
      if (voiceReady) loadSeg(segAt(Math.max(0, from))).then(() => begin(true, from), () => begin(false, from));
      else begin(false, from);
    };
    if (actx.state !== 'running') actx.resume().then(go, go); else go();
  }
  function nextChapter() {
    if (!tl) return;
    const nt = narrTime();
    const nx = CHAPTERS.find((c) => c.start > nt + 0.6);
    if (nx) playFrom(Math.max(0, nx.start - 0.3));
  }
  async function togglePause() {
    if (!actx) return;
    if (state === 'playing') {
      state = 'paused';
      pauseBtn.classList.add('paused');
      pauseBtn.setAttribute('aria-label', S().resume);
      releaseWake();
      try { await actx.suspend(); } catch (e) { /* ignore */ }
    } else if (state === 'paused') {
      try { await actx.resume(); } catch (e) { /* ignore */ }
      state = 'playing';
      pauseBtn.classList.remove('paused');
      pauseBtn.setAttribute('aria-label', S().pause);
      requestWake();
    }
  }
  let wake = null;
  async function requestWake() {
    try {
      if ('wakeLock' in navigator && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch (e) { wake = null; }
  }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ignore */ } wake = null; }

  /* ================= text, pickers and notes ================= */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const setText = (id, text) => { const e = $(id); if (e) { e.textContent = text || ''; e.hidden = !text; } };
  const otherVoice = () => L().order.find((v) => v !== voice);
  const otherLang = () => SHOW.languages.find((l) => l !== lang);

  function chips(host, name, items, current, onPick) {
    host.textContent = '';
    items.forEach(([value, label]) => {
      const lab = el('label', 'chip');
      const input = el('input');
      input.type = 'radio'; input.name = name; input.id = `${name}-${value}`; input.value = value; input.checked = value === current;
      input.addEventListener('change', () => { if (input.checked) onPick(value); });
      lab.append(input, el('span', null, label));
      host.append(lab);
    });
  }
  function renderIntro() {
    const s = S(), t = TX();
    document.documentElement.lang = lang;
    document.title = t.title;
    setText('intro-eyebrow', t.eyebrow);
    $('intro-title').textContent = t.title;
    setText('intro-lede', t.lede);
    playLabel.textContent = t.play || s.play;
    $('transcript-link').textContent = s.readTranscript;
    const langPicker = $('lang-picker');
    langPicker.hidden = SHOW.languages.length < 2;
    $('lang-legend').textContent = s.language;
    chips($('lang-chips'), 'lang', SHOW.languages.map((l) => [l, LANG_NAMES[l] || l]), lang, setLang);
    $('voice-picker').hidden = L().order.length < 2;
    $('voice-legend').textContent = t.voice_prompt || s.voice;
    chips($('voice-chips'), 'voice', L().order.map((v) => [v, L().voices[v].label]), voice, setVoice);
    pauseBtn.setAttribute('aria-label', s.pause);
    nextBtn.setAttribute('aria-label', s.next);
    $('chord-label').textContent = s.chord;
    tcEl.textContent = `0:00 / ${fmt(V().timeline.duration)}`;
  }
  function renderOutro() {
    const s = S(), t = TX();
    setText('outro-eyebrow', t.outro_eyebrow || s.theEnd);
    $('outro-title').textContent = t.outro_title || s.outroTitle;
    setText('outro-text', t.outro_text);
    $('replay-label').textContent = s.playAgain;
    const ov = otherVoice(), ol = otherLang();
    swapBtn.hidden = !ov;
    if (ov) swapBtn.textContent = fill(s.hearAs, { name: L().voices[ov].label });
    swapLangBtn.hidden = !ol;
    if (ol) swapLangBtn.textContent = LANG_NAMES[ol] || ol;
    $('notes-link').textContent = s.notesLink;
  }
  function renderNotes() {
    const s = S(), t = TX(), host = $('notes');
    host.textContent = '';
    const head = el('header', 'notes-head');
    head.append(el('p', 'eyebrow', s.notesEyebrow), el('h2', null, s.notesTitle));
    if (t.notes) head.append(el('p', null, t.notes));
    host.append(head);

    const spec = (dl, k, v) => { const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); dl.append(d); return d; };
    const credit = (label, title, text, rows) => {
      const a = el('article', 'credit');
      a.append(el('p', 'label', label), el('h3', null, title), el('p', null, text));
      const dl = el('dl', 'specs');
      rows(dl);
      a.append(dl);
      return a;
    };
    const credits = el('div', 'credits');
    credits.append(credit(s.voiceLabel, s.voiceTitle, fill(s.voiceText, { n: V().timeline.lines.length }), (dl) => {
      spec(dl, s.specModel, 'Kokoro-82M, Apache 2.0');
      spec(dl, s.specVoices, L().order.map((v) => L().voices[v].label).join(' · '));
      spec(dl, s.specLength, L().order.map((v) => fmt(L().voices[v].timeline.duration)).join(' · '));
    }));
    const moods = [...new Set(V().timeline.lines.filter((l) => l.music).map((l) => l.music))];
    credits.append(credit(s.musicLabel, s.musicTitle, s.musicText, (dl) => {
      spec(dl, s.specTempo, '72 BPM');
      moods.forEach((m) => spec(dl, s.moods[m] || m, (MOODS[m] || MOODS.warm).prog.map((c) => c.name).join(' · ')));
    }));
    const cues = V().timeline.lines.reduce((n, l) => n + (l.cue ? 1 : 0) + (l.subcues ? l.subcues.length : 0), 0);
    credits.append(credit(s.lightLabel, s.lightTitle, s.lightText, (dl) => {
      spec(dl, s.specParticles, fill(s.onScreen, { n: N.toLocaleString(lang) })).querySelector('dd').id = 'spec-n';
      spec(dl, s.specCues, fill(s.perPlay, { n: cues }));
      spec(dl, s.specFps, fill(s.fpsLive, { n: Math.round(fpsAvg) })).querySelector('dd').id = 'spec-fps';
    }));
    host.append(credits);

    const keys = Object.keys(SHOW.images || {});
    if (keys.length) {
      const plates = el('div', 'plates');
      keys.forEach((k) => {
        const img = SHOW.images[k], info = (t.images || {})[k] || {};
        const fig = el('figure', 'plate');
        const im = el('img');
        im.src = img.src; im.alt = info.alt || ''; im.loading = 'lazy';
        if (img.w) { im.width = img.w; im.height = img.h; }
        const cap = el('figcaption');
        if (info.title) cap.append(el('h3', null, info.title));
        if (info.caption) cap.append(el('p', null, info.caption));
        fig.append(im, cap);
        plates.append(fig);
      });
      host.append(plates);
    }

    const tr = el('section', 'transcript');
    tr.id = 'transcript';
    tr.append(el('h2', null, s.transcript), el('p', null, s.tapLine));
    let sec = null, ol = null;
    V().timeline.lines.forEach((l, i) => {
      if (l.chapter || !sec) {
        sec = el('section', 'tr-chapter');
        const h = el('h3');
        const ch = CHAPTERS.find((c) => c.idx === i);
        h.append(el('span', null, ch ? `${ch.num} / ${CHAPTERS.length}` : ''), document.createTextNode(l.chapter || ''));
        ol = el('ol');
        sec.append(h, ol);
        tr.append(sec);
      }
      const b = el('button', 'line-btn');
      b.type = 'button';
      b.dataset.i = i;
      const tm = el('time', null, fmt(l.start));
      b.append(tm, el('span', null, l.caption));
      b.addEventListener('click', () => {
        playFrom(Math.max(0, l.start - 0.25));
        stage.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      });
      const li = el('li');
      li.append(b);
      ol.append(li);
    });
    host.append(tr);

    const foot = el('footer', 'colophon');
    if (t.colophon) foot.append(el('p', null, t.colophon));
    if (SHOW.single) {
      const p = el('p'), a = el('a', null, s.download);
      a.href = SHOW.single; a.setAttribute('download', '');
      p.append(a);
      foot.append(p);
    }
    if (foot.childNodes.length) host.append(foot);
  }
  function renderAll() {
    CHAPTERS = chaptersOf(V().timeline);
    renderIntro();
    renderOutro();
    renderNotes();
  }
  function setVoice(v) {
    voice = v;
    renderAll();
  }
  function setLang(l) {
    lang = l;
    voice = L().order[0];
    renderAll();
    if (state === 'rest') applyCue({ type: 'text', value: TX().idle || (lang === 'es' ? 'hola' : 'hello') }, 0);
  }

  /* ================= loop & wiring ================= */
  let last = 0, fpsAvg = 60;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = now - last;
    last = now;
    const dt = Math.min(3, Math.max(0.2, rawDt / 16.667));
    if (rawDt > 0 && rawDt < 250) fpsAvg += (1000 / rawDt - fpsAvg) * 0.05;
    const t = now / 1000;
    let lv = 0;
    if (ana.node && state === 'playing') {
      ana.node.getFloatTimeDomainData(ana.buf);
      let s = 0;
      for (let i = 0; i < ana.buf.length; i++) s += ana.buf[i] * ana.buf[i];
      lv = Math.min(1, Math.sqrt(s / ana.buf.length) * 5);
    }
    level += (lv - level) * 0.1;
    let ve = 0;
    if (tl && state === 'playing') {
      const nt = narrTime();
      const ch = nt >= 0 ? tl.env.charAt(Math.floor(nt * tl.envFps)) : '';
      if (ch) ve = parseInt(ch, 36) / 35;
      sequence(nt);
    }
    vEnv += (ve - vEnv) * 0.3;
    energy = Math.max(vEnv * 0.85, level * 0.9);
    if (FRAC[cue.type]) dynTargets(t);
    pAlpha += (pAlphaT - pAlpha) * 0.04;
    physics(t, dt);
    draw();
  }

  playBtn.addEventListener('click', () => start());
  replayBtn.addEventListener('click', () => { state = 'ended'; start(); });
  swapBtn.addEventListener('click', () => { const v = otherVoice(); if (v) setVoice(v); state = 'ended'; start(); });
  swapLangBtn.addEventListener('click', () => { const l = otherLang(); if (l) setLang(l); state = 'ended'; start(); });
  pauseBtn.addEventListener('click', togglePause);
  nextBtn.addEventListener('click', nextChapter);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });
  setInterval(() => { const f = $('spec-fps'); if (f) f.textContent = fill(S().fpsLive, { n: Math.round(fpsAvg) }); }, 1000);

  renderAll();
  cue = { type: 'text', value: TX().idle || (lang === 'es' ? 'hola' : 'hello') };
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);
  const fontsReady = document.fonts && document.fonts.load ? document.fonts.load('800 100px "Bricolage Grotesque"') : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => { if (cue.type === 'text') applyCue(cue, 0); }, () => {});
  requestAnimationFrame((n) => { last = n; frame(n); });
})();
