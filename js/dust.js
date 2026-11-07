/* The portrait, made of dust.
   The idea comes from the hero of the Haki Boutique site (MOUSSA_MARKET, js/hero-dust.js): turn a picture into a brightness map, drop a few
   thousand specks on it with more of them where it is brighter, let every speck fly to its own spot along a curved path, let the pointer
   push them about, and let scrolling blow them apart. Here the picture is your photo. It is cut out from its backdrop and its tones are
   lifted, so a dark face still shows its eyes, nose and mouth.
   The plain photo stays in the page under the dust (for screen readers, and as the picture if the dust cannot run). */
(() => {
  const hero = document.querySelector('.hero'), fig = $('portrait'), arch = fig && fig.querySelector('.arch'), site = $('site');
  if (!hero || !arch || !document.createElement('canvas').getContext) return;

  const PW = 360, PH = 504;                              // the brightness map is 5:7, the shape of the doorway
  const NB = 8, TAU = Math.PI * 2;                       // brightness buckets, one fill each
  const TL = { fade: 0.7, converge: 0.25, end: 3.4 };    // seconds: dust fades in, starts flying, everything has landed
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rng = seed => {                                  // the same dust every time
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  /* ---------- 1. the picture becomes a brightness map ---------- */
  const loadImage = src => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('picture')); im.src = src; });

  /* the picture drawn into the doorway's 5:7 box, filling it and anchored near the top; getImageData throws if the browser
     will not let a page read this picture (a file opened from disk), and the caller then tries the built-in copy */
  async function pixels(src) {
    const im = await loadImage(src), c = document.createElement('canvas');
    c.width = PW; c.height = PH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH);
    x.imageSmoothingQuality = 'high';
    const s = Math.max(PW / im.naturalWidth, PH / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
    x.drawImage(im, (PW - w) * 0.5, (PH - h) * 0.12, w, h);
    return x.getImageData(0, 0, PW, PH).data;
  }

  function boxBlur(a, w, h, r) {                         // separable box blur, edges clamped
    const t = new Float32Array(a.length), b = new Float32Array(a.length), n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) { t[o + x] = s / n; s += a[o + Math.min(x + r + 1, w - 1)] - a[o + Math.max(x - r, 0)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += t[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { b[y * w + x] = s / n; s += t[Math.min(y + r + 1, h - 1) * w + x] - t[Math.max(y - r, 0) * w + x]; }
    }
    return b;
  }
  function minFilter(a, w, h, r) {                       // darkest value within r pixels
    const t = new Float32Array(a.length), b = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 9; const k1 = Math.min(w - 1, x + r);
      for (let k = Math.max(0, x - r); k <= k1; k++) m = Math.min(m, a[y * w + k]);
      t[y * w + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 9; const k1 = Math.min(h - 1, y + r);
      for (let k = Math.max(0, y - r); k <= k1; k++) m = Math.min(m, t[k * w + x]);
      b[y * w + x] = m;
    }
    return b;
  }

  /* RGBA pixels -> a map of how much dust each spot gets (0 to 1): nothing on the backdrop, a little on dark hair and clothes,
     most on the lit parts of the face */
  function densityMap(px) {
    const n = PW * PH;
    // the backdrop colour: the middle value of the border pixels
    const ch = [[], [], []];
    const edge = (x, y) => { const i = (y * PW + x) * 4; ch[0].push(px[i]); ch[1].push(px[i + 1]); ch[2].push(px[i + 2]); };
    for (let x = 0; x < PW; x++) for (let k = 0; k < 4; k++) { edge(x, k); edge(x, PH - 1 - k); }
    for (let y = 4; y < PH - 4; y++) for (let k = 0; k < 4; k++) { edge(k, y); edge(PW - 1 - k, y); }
    const mid = c => { c.sort((p, q) => p - q); return c[c.length >> 1]; };
    const bg = [mid(ch[0]), mid(ch[1]), mid(ch[2])];

    // flood in from the border through everything that looks like the backdrop. Bright spots inside the person (eyes, teeth) stay.
    const L = new Float32Array(n), like = new Uint8Array(n), out = new Uint8Array(n), stack = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      L[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      like[i] = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) < 26 ? 1 : 0;
    }
    let sp = 0;
    const seed = i => { if (like[i] && !out[i]) { out[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < PW; x++) { seed(x); seed((PH - 1) * PW + x); }
    for (let y = 0; y < PH; y++) { seed(y * PW); seed(y * PW + PW - 1); }
    while (sp) {
      const i = stack[--sp], x = i % PW, y = (i / PW) | 0;
      if (x > 0) seed(i - 1);
      if (x < PW - 1) seed(i + 1);
      if (y > 0) seed(i - PW);
      if (y < PH - 1) seed(i + PW);
    }
    let gone = 0;
    for (let i = 0; i < n; i++) gone += out[i];
    if (gone > n * 0.96) out.fill(0);                    // "backdrop" is nearly everything: there is nothing to cut out

    // how far every pixel is from the backdrop (a quick two-pass distance, in pixels)
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) dist[i] = out[i] ? 0 : 1e4;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = y * PW + x; let d = dist[i];
      if (!d) continue;
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) { d = Math.min(d, dist[i - PW] + 1); if (x > 0) d = Math.min(d, dist[i - PW - 1] + 1.4142); if (x < PW - 1) d = Math.min(d, dist[i - PW + 1] + 1.4142); }
      dist[i] = d;
    }
    for (let y = PH - 1; y >= 0; y--) for (let x = PW - 1; x >= 0; x--) {
      const i = y * PW + x; let d = dist[i];
      if (!d) continue;
      if (x < PW - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < PH - 1) { d = Math.min(d, dist[i + PW] + 1); if (x < PW - 1) d = Math.min(d, dist[i + PW + 1] + 1.4142); if (x > 0) d = Math.min(d, dist[i + PW - 1] + 1.4142); }
      dist[i] = d;
    }

    // tone. Next to the backdrop the edge pixels are blends with it and look bright: take the darkest nearby value instead.
    const Lm = minFilter(L, PW, PH, 4), Lc = new Float32Array(n), hist = new Uint32Array(256);
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      Lc[i] = dist[i] <= 4.5 ? Math.min(L[i], Lm[i]) : L[i];
      if (dist[i] > 4.5) { hist[Math.min(255, (Lc[i] * 255) | 0)]++; cnt++; }
    }
    const pct = q => { let s = 0; for (let k = 0; k < 256; k++) { s += hist[k]; if (s >= q * cnt) return k / 255; } return 1; };
    let lo = cnt ? pct(0.03) : 0, hi = cnt ? pct(0.985) * 1.12 : 1;     // the person's own light range is spread over 0..1
    if (hi < lo + 0.2) hi = lo + 0.2;
    const Dg = new Float32Array(n);
    for (let i = 0; i < n; i++) Dg[i] = clamp((Lc[i] - lo) / (hi - lo), 0, 1);
    const soft = boxBlur(boxBlur(boxBlur(Dg, PW, PH, 7), PW, PH, 7), PW, PH, 7);
    const dens = new Float32Array(n), cy = 0.5 * PW / PH;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = y * PW + x, u = x / PW, v = y / PH;
      const local = clamp(Dg[i] + 1.25 * (Dg[i] - soft[i]), 0, 1);                      // eyes, brows, nose and mouth stand out
      const ex = (u - 0.5) / 0.62, ey = (v - 0.40) / 0.52;                              // lamp light: strongest on the face, fading to the shoulders
      let lamp = clamp(1 - (ex * ex + ey * ey), 0, 1); lamp = 0.42 + 0.58 * lamp * lamp * (3 - 2 * lamp);
      let d = clamp((dist[i] - 1) / 2.5, 0, 1) * (0.1 + 0.9 * local * lamp);            // a little dust on dark hair and clothes keeps the outline
      if (v < cy) { const dx = (u - 0.5) / 0.5, dy = (v - cy) / cy; if (dx * dx + dy * dy > 0.93) d = 0; }   // stay inside the doorway's rounded top
      dens[i] = d;
    }
    return dens;
  }

  /* ---------- 2. specks on the map, more of them where it is brighter ---------- */
  function sample(dens, n, rand) {                       // -> [u, v, brightness] for n specks, u and v in 0..1
    const m = PW * PH, cdf = new Float64Array(m);
    let sum = 0;
    for (let i = 0; i < m; i++) { if (dens[i] > 0.02) sum += Math.pow(dens[i], 1.25); cdf[i] = sum; }
    const pts = new Float32Array(n * 3);
    if (!sum) return pts;
    for (let k = 0; k < n; k++) {
      const r = Math.max(1e-9, (k + rand()) / n * sum);                                   // one speck per equal slice of the total: no clumps
      let lo = 0, hi = m - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
      pts[k * 3] = ((lo % PW) + rand()) / PW;
      pts[k * 3 + 1] = (((lo / PW) | 0) + rand()) / PH;
      pts[k * 3 + 2] = dens[lo];
    }
    for (let k = n - 1; k > 0; k--) {                    // shuffle, so thinning and timing never follow the scan order
      const j = (rand() * (k + 1)) | 0;
      for (let c = 0; c < 3; c++) { const t = pts[k * 3 + c]; pts[k * 3 + c] = pts[j * 3 + c]; pts[j * 3 + c] = t; }
    }
    return pts;
  }

  /* ---------- 3. the dust ---------- */
  const canvas = document.createElement('canvas');
  canvas.className = 'dust'; canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.querySelector('.hero-in'));
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  const S = {
    ready: false, broken: false, visible: true, hold: false, T: 0, last: 0, lastY: -1, quality: 1, cost: 4, raf: 0, timer: 0,
    W: 0, H: 0, dpr: 1, R: 600, source: '', ptr: { x: -9999, y: -9999, on: false }, kick: null, moving: false
  };
  const colors = Array.from({ length: NB }, (_, k) => { const t = k / (NB - 1), c = (a, b) => Math.round(a + (b - a) * t); return `rgb(${c(172, 255)},${c(120, 243)},${c(54, 210)})`; });
  const bAlpha = Array.from({ length: NB }, (_, k) => 0.3 + 0.7 * Math.pow(k / (NB - 1), 0.9));

  let N = 0, M = 0, box = null, groups = [];
  let u0, v0, tx, ty, delay, dur, swirl, size, phase, freq, ddx, ddy, damp, bucket;   // fixed for each speck
  let sx, sy, gx, gy, qx, qy, ox, oy, vx, vy, mscale = 1;                            // placed by layout(); ox..vy is the pointer's push

  function build(dens) {
    const rand = rng(5), w = arch.clientWidth || 360;
    N = clamp(Math.round(w * w * 1.4 * 0.055 * Math.pow(380 / w, 0.6)), 2600, coarse ? 9000 : 12000);   // about one speck for every 18 px of doorway, more on small screens so the face keeps its detail
    M = coarse ? 36 : 70;                                                          // motes that drift in the light and never settle
    const pts = sample(dens, N, rand), TOT = N + M;
    const f = n => new Float32Array(n);
    u0 = f(TOT); v0 = f(TOT); tx = f(N); ty = f(N); delay = f(N); dur = f(N); swirl = f(N); size = f(TOT); phase = f(TOT); freq = f(TOT);
    ddx = f(TOT); ddy = f(TOT); damp = f(TOT); bucket = new Uint8Array(TOT);
    sx = f(TOT); sy = f(TOT); gx = f(TOT); gy = f(TOT); qx = f(N); qy = f(N); ox = f(N); oy = f(N); vx = f(N); vy = f(N);
    for (let i = 0; i < TOT; i++) {
      u0[i] = rand(); v0[i] = rand(); phase[i] = rand() * TAU; freq[i] = 0.6 + rand() * 1.1;
      const a = rand() * TAU; ddx[i] = Math.cos(a); ddy[i] = Math.sin(a); damp[i] = 110 + rand() * 320;
    }
    for (let i = 0; i < N; i++) {
      tx[i] = pts[i * 3]; ty[i] = pts[i * 3 + 1];
      const b = pts[i * 3 + 2];
      bucket[i] = Math.min(NB - 1, Math.floor(Math.pow(b, 0.85) * NB));
      size[i] = 0.95 + Math.pow(b, 0.8) * 1.35 + rand() * 0.25;
      const d = Math.hypot((tx[i] - 0.5) * 0.75, ty[i] - 0.34);                    // the middle of the face forms first, the edges last
      delay[i] = (d / 0.75) * 0.62 + rand() * 0.2;
      dur[i] = 0.9 + rand() * 0.7;
      swirl[i] = (rand() - 0.5) * 0.5;
    }
    for (let i = N; i < TOT; i++) { bucket[i] = 0; size[i] = 0.9 + rand() * 0.9; }
  }

  /* where the doorway is, and so where every speck lands and starts (the canvas covers the whole hero so that dust can leave the frame) */
  function layout() {
    if (!N) return;
    const hr = hero.getBoundingClientRect(), ar = arch.getBoundingClientRect(), bw = parseFloat(getComputedStyle(arch).borderTopWidth) || 0;
    const W = hero.clientWidth, H = hero.clientHeight;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * S.dpr); canvas.height = Math.round(H * S.dpr);
    S.W = W; S.H = H;
    box = { x: ar.left - hr.left + bw, y: ar.top - hr.top + bw, w: ar.width - 2 * bw, h: ar.height - bw };
    const sc = Math.max(box.w / PW, box.h / PH), mw = PW * sc, mx = box.x + (box.w - mw) / 2;
    mscale = clamp(box.w / 380, 0.7, 1.25);
    const x0 = Math.max(0, box.x - 0.9 * box.w), x1 = Math.min(W, box.x + 1.5 * box.w), y0 = Math.max(0, box.y - 0.3 * box.h), y1 = Math.min(H, box.y + 1.1 * box.h);
    const TOT = N + M, lists = Array.from({ length: NB + 1 }, () => []);
    for (let i = 0; i < TOT; i++) {
      sx[i] = x0 + u0[i] * (x1 - x0); sy[i] = y0 + v0[i] * (y1 - y0);
      if (i < N) {
        gx[i] = mx + tx[i] * mw; gy[i] = box.y + ty[i] * PH * sc;
        const dx = gx[i] - sx[i], dy = gy[i] - sy[i];
        qx[i] = -dy * swirl[i]; qy[i] = dx * swirl[i];                             // the flight bows sideways
        lists[bucket[i]].push(i);
      } else {
        sx[i] = box.x + u0[i] * box.w; sy[i] = box.y + v0[i] * box.h; gx[i] = sx[i]; gy[i] = sy[i];
        lists[NB].push(i);
      }
    }
    groups = lists.map(l => Uint32Array.from(l));
    // scrolling this far blows the dust away completely: about when the doorway has left the screen
    S.R = clamp(ar.bottom + scrollY - 0.12 * innerHeight, 220, 0.9 * innerHeight);
    if (still || !S.visible) draw(performance.now(), 0.016);
  }

  let agitated = false;
  function draw(now, dt) {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, S.W, S.H);
    if (!N || !groups.length) return;
    const T = S.T, dustIn = smooth(0, TL.fade, T);
    if (dustIn <= 0) return;
    const form = smooth(TL.converge + 0.3, TL.converge + 1.6, T);
    const D = still ? 0 : smooth(0.04, 0.9, window.scrollY / S.R);                 // 0 when you are at the top, 1 once you have scrolled past
    if (D > 0.97) return;
    const fade = 1 - 0.94 * D;

    // the pointer pushes the dust about, a tap throws it
    let px = -9999, py = -9999;
    if (S.ptr.on) { const hr = canvas.getBoundingClientRect(); px = S.ptr.x - hr.left; py = S.ptr.y - hr.top; }
    const pointerOn = S.ptr.on && form > 0.7;
    const kick = S.kick; S.kick = null;
    const physics = form > 0.7 && (pointerOn || agitated || kick);
    const PR = clamp(box.w * 0.22, 50, 90), PR2 = PR * PR;
    let moving = false;

    ctx.save();
    for (let g = 0; g <= NB; g++) {
      const list = groups[g], amb = g === NB;
      const len = amb ? list.length : Math.ceil(list.length * S.quality);
      if (!len) continue;
      let alpha;
      if (amb) alpha = 0.45 * dustIn;
      else { const loose = 0.34 + 0.12 * (g / (NB - 1)); alpha = (loose + (bAlpha[g] - loose) * form) * dustIn; }
      alpha *= fade;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = amb ? 'rgb(255,226,160)' : colors[g];
      ctx.beginPath();
      for (let k = 0; k < len; k++) {
        const i = list[k];
        let x, y, s = size[i] * mscale;
        if (amb) {
          x = sx[i] + Math.sin(now * 0.00022 * freq[i] + phase[i]) * 16; y = sy[i] + Math.cos(now * 0.00018 * freq[i] + phase[i] * 1.3) * 13;
        } else {
          const e = clamp((T - TL.converge - delay[i]) / dur[i], 0, 1), ee = e * e * (3 - 2 * e), bow = Math.sin(Math.PI * ee);
          x = sx[i] + (gx[i] - sx[i]) * ee + qx[i] * bow;
          y = sy[i] + (gy[i] - sy[i]) * ee + qy[i] * bow;
          if (e < 1) {                                   // still on its way: a slow drift, smaller until it lands
            x += Math.sin(now * 0.0004 * freq[i] + phase[i]) * 6 * (1 - ee); y += Math.cos(now * 0.00033 * freq[i] + phase[i]) * 5 * (1 - ee);
            s *= 0.6 + 0.4 * ee;
          } else {                                       // home: a faint shimmer
            x += Math.sin(now * 0.0019 * freq[i] + phase[i]) * 0.6; y += Math.cos(now * 0.0016 * freq[i] + phase[i]) * 0.6;
          }
          if (physics) {                                 // spring back to rest, pushed away by the pointer and by a tap
            let ax = -ox[i] * 38 - vx[i] * 5.2, ay = -oy[i] * 38 - vy[i] * 5.2;
            if (kick) {
              const kx = x - kick.x, ky = y - kick.y, kd2 = kx * kx + ky * ky;
              if (kd2 < kick.r * kick.r) {
                const kd = Math.sqrt(kd2) || 1, f = (1 - kd / kick.r) * kick.strength * (0.5 + damp[i] / 600);
                vx[i] += (kx / kd) * f; vy[i] += (ky / kd) * f;
              }
            }
            if (pointerOn) {
              const dx = x + ox[i] - px, dy = y + oy[i] - py, d2 = dx * dx + dy * dy;
              if (d2 < PR2) { const d = Math.sqrt(d2) || 1, f = (1 - d / PR) * (1 - d / PR) * 3600; ax += (dx / d) * f; ay += (dy / d) * f; }
            }
            vx[i] += ax * dt; vy[i] += ay * dt; ox[i] += vx[i] * dt; oy[i] += vy[i] * dt;
            if (Math.abs(ox[i]) + Math.abs(oy[i]) + Math.abs(vx[i]) + Math.abs(vy[i]) > 0.4) moving = true;
          }
          x += ox[i]; y += oy[i];
        }
        if (D > 0) { x += ddx[i] * D * damp[i]; y += (ddy[i] - 0.55) * D * damp[i]; }   // blown apart as you scroll
        const rad = s / 2;
        ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
    if (physics) agitated = moving;
    S.moving = agitated;
  }

  /* ---------- 4. the loop: only while the doorway is on screen, and only fast while something moves ---------- */
  function wake() {
    if (!S.ready || S.broken || still || !S.visible) return;
    if (S.timer) { clearTimeout(S.timer); S.timer = 0; }
    if (!S.raf) S.raf = requestAnimationFrame(frame);
  }
  function later(ms) {
    if (S.raf || S.timer || S.broken) return;
    S.timer = setTimeout(() => { S.timer = 0; if (!S.raf) S.raf = requestAnimationFrame(frame); }, ms);
  }
  function frame(now) {
    S.raf = 0;
    if (!S.ready || S.broken || !S.visible || document.hidden) return;
    if (site && site.inert) { later(300); return; }       // a room is open on top of the page
    const dt = clamp((now - S.last) / 1000 || 0.016, 0.001, 0.05); S.last = now;
    if (!S.hold) S.T = Math.min(S.T + dt, TL.end + 1);
    try {
      const t0 = performance.now();
      draw(now, dt);
      S.cost = S.cost * 0.9 + (performance.now() - t0) * 0.1;
      if (S.cost > 14 && S.quality > 0.4) S.quality = Math.max(0.4, S.quality - 0.05);       // thin the dust out if frames run long
      else if (S.cost < 6 && S.quality < 1) S.quality = Math.min(1, S.quality + 0.01);
    } catch (err) { console.error('dust:', err); return fail(); }
    const y = window.scrollY, scrolled = y !== S.lastY; S.lastY = y;
    if (S.T < TL.end || S.ptr.on || S.moving || scrolled || S.hold) wake(); else later(45);
  }
  function fail() { S.broken = true; canvas.remove(); fig.classList.remove('dust-on'); }

  /* ---------- 5. start ---------- */
  async function start(list) {
    let dens = null;
    for (const src of list) {
      try { dens = densityMap(await pixels(src)); S.source = src.slice(0, 40); break; } catch (e) { /* not readable here: try the next picture */ }
    }
    if (!dens) return fail();
    try { build(dens); } catch (err) { console.error('dust:', err); return fail(); }
    if (!canvas.isConnected) hero.insertBefore(canvas, hero.querySelector('.hero-in'));   // coming back after a failed first try
    S.broken = false; S.ready = true; S.T = still ? TL.end + 1 : 0; S.last = 0; agitated = false;
    fig.classList.add('dust-on');
    layout();
    wake();
  }

  let queued = 0;
  const relayout = () => { if (queued) return; queued = requestAnimationFrame(() => { queued = 0; layout(); wake(); }); };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(relayout); ro.observe(hero); ro.observe(arch); } else addEventListener('resize', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { S.visible = e.isIntersecting; if (S.visible) { S.last = 0; wake(); } }, { rootMargin: '300px 0px' }).observe(fig);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.last = 0; wake(); } });
  if (!still) {
    addEventListener('scroll', wake, { passive: true });
    hero.addEventListener('pointermove', e => { S.ptr.x = e.clientX; S.ptr.y = e.clientY; S.ptr.on = e.pointerType === 'mouse' || e.pointerType === 'pen'; wake(); }, { passive: true });
    hero.addEventListener('pointerleave', () => { S.ptr.on = false; wake(); });
    fig.addEventListener('pointerdown', e => {           // a tap or click on the doorway throws the dust, which then settles back
      const hr = canvas.getBoundingClientRect();
      S.kick = { x: e.clientX - hr.left, y: e.clientY - hr.top, r: clamp((box ? box.w : 360) * 0.6, 140, 260), strength: 520 }; agitated = true; wake();
    });
  }

  fig.classList.add('dust-on');                          // hides the plain photo from the very first paint; removed again if the dust fails
  window.__dust = { S, restart: list => start(list) };
  window.dustPhoto = url => start([url]);                // a picture picked from the computer (see 72-render.js)
  start([PROFILE.photo, typeof PORTRAIT_FALLBACK === 'string' ? PORTRAIT_FALLBACK : ''].filter(Boolean));
})();
