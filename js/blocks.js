/* The blocks: a company of stone and ice cuboids that floats above the frozen ground.
   They drift and turn in the wind. Move the pointer through them and they spring away, twist, and settle back with a little bounce; a click or a tap sends a ripple through the ones nearby.
   Scroll and they come together: under the doors they gather into a low wall of stones, around the story they build a broken frame, and at the end of the page they are drawn into the spiral of the tunnel.
   (Laid out as pieces of the page: the stones are placed from the real positions of the doors and the story on screen, so they stay with the words as the page scrolls.)
   Every block is worked out here, a few numbers each, and handed to the graphics card as one list: one shape, drawn once per block. */
(() => {
  const H = window.HALL; if (!H || !H.ok) return;
  const { T, scene, camera, rigCam, U, st, ptr, GLSL, clamp, smooth, lerp } = H;

  /* the shape: a box with its edges rounded off. Each corner point is stored as a direction on a sphere plus which corner of the box it belongs to;
     the vertex shader puts it at (corner x (half the size - the rounding)) + (direction x the rounding), so the rounding stays the same size however long the box is.
     One copy is drawn once per block (instancing); each block brings its own centre, size, turn and look. */
  const ROUND = .1;                                                 // how much the edges are rounded off (a tenth of the thinnest side): chiselled, not pebbles
  function roundedBox(RN) {                                        // RN steps across each face
    const geo = new T.InstancedBufferGeometry();
    const FACES = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
                   [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    const per = (RN + 1) * (RN + 1), pos = new Float32Array(per * 6 * 3), sgn = new Float32Array(per * 6 * 3), idx = new Uint16Array(RN * RN * 6 * 6);
    let v = 0, o = 0;
    FACES.forEach(([n, u, w]) => {
      const base = v;
      for (let j = 0; j <= RN; j++) for (let i = 0; i <= RN; i++, v++) {
        const cu = -1 + 2 * i / RN, cw = -1 + 2 * j / RN, p = [0, 0, 0];
        for (let k = 0; k < 3; k++) p[k] = n[k] * .5 + u[k] * cu * .5 + w[k] * cw * .5;      // a point on the unit cube
        const q = p.map(c => c - Math.sign(c) * .5 / RN), len = Math.hypot(q[0], q[1], q[2]);   // half a step towards the middle, then made into a direction
        for (let k = 0; k < 3; k++) { pos[v * 3 + k] = q[k] / len; sgn[v * 3 + k] = Math.sign(p[k]); }
      }
      for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
        const a = base + j * (RN + 1) + i, b = a + 1, c = b + RN + 1, d = a + RN + 1;
        idx.set([a, b, c, a, c, d], o); o += 6;
      }
    });
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aSg', new T.BufferAttribute(sgn, 3));
    geo.setIndex(new T.BufferAttribute(idx, 1));
    return geo;
  }
  H.roundedBox = roundedBox; H.ROUND = ROUND;

  /* ---------------------------------------------------------------- the cast */
  let seed = 20261110;                                             // a fixed seed: the same blocks in the same places on every visit
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let a = Math.imul(seed ^ seed >>> 15, 1 | seed); a = a + Math.imul(a ^ a >>> 7, 61 | a) ^ a; return ((a ^ a >>> 14) >>> 0) / 4294967296; };
  const frac = x => x - Math.floor(x), hash = x => frac(Math.sin(x * 127.1 + 311.7) * 43758.5453);
  const PASS = [60, 36, 44], NB = 140, COUNT = [PASS[0], PASS[0] + PASS[1], NB];   // three passes, so a lighter quality simply draws the first of them
  const B = {
    u: new Float32Array(NB), v: new Float32Array(NB), d: new Float32Array(NB),     // where it floats: across and up the screen (-1..1) and how far away
    size: new Float32Array(NB * 3), axis: new Float32Array(NB * 3), spin: new Float32Array(NB), phase: new Float32Array(NB),
    mat: new Float32Array(NB * 4),                                 // what it is: stone, ice or dark granite; whether it glows; a seed; a phase
    delay: new Float32Array(NB), arc: new Float32Array(NB * 3), par: new Float32Array(NB), spinAcc: new Float32Array(NB),
    pos: new Float32Array(NB * 3), cur: new Float32Array(NB * 3), ang: new Float32Array(NB), vis: new Float32Array(NB), asm: new Float32Array(NB)   // each frame: where it is, how big, how turned, how visible, how far it has come together
  };
  for (let pass = 0, i = 0; pass < 3; pass++) for (let k = 0; k < PASS[pass]; k++, i++) {
    const d = 12 + Math.pow(rnd(), 1.35) * 78;                      // 12 to 90 units away
    let u = 1.04 - 2.25 * Math.pow(rnd(), 1.3);                     // across the screen: more on the right, where the words are not
    if (u < .1 && d < 52) u = Math.abs(u) * .8 + .12;               // blocks that are not far away stay off the words on the left
    const v = rnd() < .2 ? -.26 + rnd() * .3 : .08 + rnd() * .84;   // a few low over the ground, the rest in the sky
    const kr = rnd(), kind = kr < .5 ? 0 : kr < .82 ? 1 : 2, sr = rnd();
    const grow = (.8 + d / 55) * (.5 + .5 * smooth(14, 46, d));      // far blocks are made larger, so they do not shrink to specks; near ones are kept small, so none of them fills the screen
    let s;
    if (sr < .55) { const q = (.55 + Math.pow(rnd(), 2.2) * 2.2) * grow; s = [q, q * (.8 + rnd() * .4), q * (.8 + rnd() * .4)]; }          // a cube
    else if (sr < .88) { const b = (.4 + rnd() * .65) * grow, l = b * (2 + rnd() * 2.8), c = b * (.7 + rnd() * .8), lg = Math.floor(rnd() * 3); s = [b, b, b]; s[lg] = l; s[(lg + 1) % 3] = c; }   // a long cuboid
    else s = [(1.5 + rnd() * 1.5) * grow, (.35 + rnd() * .3) * grow, (1 + rnd() * .9) * grow];                                              // a flat slab
    let ax = [rnd() - .5, rnd() - .5, rnd() - .5]; const al = Math.hypot(...ax) || 1; ax = ax.map(c => c / al);
    const gr = rnd(), glow = gr < .13 ? 1 : gr < .18 ? 2 : 0;       // about one in eight has an icy light inside, a few an amber one
    B.u[i] = u; B.v[i] = v; B.d[i] = d; B.size.set(s, i * 3); B.axis.set(ax, i * 3);
    B.spin[i] = (.12 + rnd() * .4) * (rnd() < .5 ? -1 : 1);         // radians a second: a full turn takes somewhere between 12 and 50 seconds
    B.phase[i] = rnd() * 6.2832; B.mat.set([kind, glow, rnd(), rnd() * 6.2832], i * 4);
    B.delay[i] = rnd(); B.par[i] = (1 - d / 90) * .04 * (.6 + .8 * rnd());
    let ar = [rnd() - .5, rnd() - .2, rnd() - .5]; const l2 = Math.hypot(...ar) || 1; B.arc.set(ar.map(c => c / l2), i * 3);
  }

  /* ---------------------------------------------------------------- what is drawn */
  const geo = roundedBox(5);
  const dyn = (n, sz) => { const a = new T.InstancedBufferAttribute(new Float32Array(NB * sz), sz); a.setUsage(T.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
  const aC = dyn('aC', 3), aS = dyn('aS', 3), aQ = dyn('aQ', 4), aE = dyn('aE', 4);
  geo.setAttribute('aM', new T.InstancedBufferAttribute(B.mat, 4));
  const vert = `
    const float ROUND = ${ROUND.toFixed(3)};
    attribute vec3 aSg; attribute vec3 aC; attribute vec3 aS; attribute vec4 aQ; attribute vec4 aM; attribute vec4 aE;
    varying vec3 vW; varying vec3 vNw; varying vec3 vLoc; varying vec3 vLn; varying vec4 vM; varying vec4 vE;
    mat3 turn(vec3 k, float a){                                    // rotate about the axis k by the angle a
      float c = cos(a), s = sin(a), t = 1. - c;
      return mat3(c + k.x*k.x*t,       k.x*k.y*t + k.z*s, k.x*k.z*t - k.y*s,
                  k.x*k.y*t - k.z*s,   c + k.y*k.y*t,     k.y*k.z*t + k.x*s,
                  k.x*k.z*t + k.y*s,   k.y*k.z*t - k.x*s, c + k.z*k.z*t);
    }
    void main(){
      mat3 R = turn(normalize(aQ.xyz), aQ.w);
      vec3 hs = aS * .5; float rr = min(aS.x, min(aS.y, aS.z)) * ROUND;
      vec3 lp = aSg * (hs - rr) + position * rr;                   // the rounded box
      vec4 w = vec4(R * lp + aC, 1.);
      vW = w.xyz; vNw = R * position; vLoc = lp; vLn = position; vM = aM; vE = aE;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const frag = `
    varying vec3 vW; varying vec3 vNw; varying vec3 vLoc; varying vec3 vLn; varying vec4 vM; varying vec4 vE;
    ${GLSL.noise}
    ${GLSL.light}
    void main(){
      vec3 N0 = normalize(vNw), V = normalize(cameraPosition - vW);
      vec3 nl = normalize(vLn), a = abs(nl);
      float bev = 1. - max(a.x, max(a.y, a.z));                    // 0 across a flat face, rising round the rounded edges and corners
      float edge = smoothstep(.03, .3, bev), ridge = smoothstep(.12, .34, bev);
      float kind = vM.x, ice = step(.5, kind) * step(kind, 1.5);   // 0 stone, 1 ice, 2 dark granite
      float dist = distance(vW, cameraPosition), detail = exp(-dist * .02);
      vec3 P = vLoc * .5 + vM.z * 23.;                             // the grain is laid on the block itself, so it turns with it
      vec4 c1 = tri(P, nl), c2 = tri(P * 3.3 + 4.7, nl);
      float hgt = (c1.g * .55 + c2.g * .45 + c1.b * .35 * ice) * .06 * detail;   // a little relief: rough stone, crazed ice
      vec3 sx = dFdx(vW), sy = dFdy(vW), r1 = cross(sy, N0), r2 = cross(N0, sx);
      float det = dot(sx, r1), ad = max(abs(det), 1e-9);
      vec3 N = normalize(ad * N0 - sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2));
      float lift = mix(2.1, 1., uLight);                           // at night the stone is made paler, so it is not lost against the dark
      vec3 alb = kind < .5 ? mix(uRockA, uRockB, smoothstep(.25, .75, c1.r)) * (.78 + .5 * c2.g) * lift
               : ice > .5 ? mix(uIce * .7, vec3(1.), smoothstep(.2, .85, c1.r)) * (.88 + .2 * c2.g)
               : uRockA * (.6 + .6 * c2.a) * (.8 + .4 * c1.g) * lift * .85;
      if (ice < .5) alb = mix(vec3(dot(alb, vec3(.3, .5, .2))), alb, .62);                // slate, not blue: only a hint of the cold colour is left in the stone
      float up = smoothstep(.45, .85, N0.y + (c1.r - .5) * .7 + (c2.g - .5) * .35);   // snow settles where a surface faces up
      alb = mix(alb, uSnow, up * mix(.92, .35, ice));
      alb = mix(alb, mix(alb, vec3(1.), .5), ridge * .35 * (1. - up));                   // frost on the worn edges
      float ao = .55 + .45 * smoothstep(-.9, .6, N0.y);
      vec3 col = lightIt(alb, N, V, mix(.15, .9, ice) * (1. - .8 * up), mix(20., 70., ice), ao);
      float facing = max(dot(N, V), 0.);
      col += alb * (uAmb * 1.7 + uIce * .1) * pow(facing, 1.4) * (.45 + .55 * exp(-dist * .014)) * (1. - uLight);   // the sky is behind the blocks: a soft cold fill on the faces that look at you
      float toMoon = smoothstep(-.25, .65, dot(N0, uKeyDir));
      col += uKey * pow(1. - facing, 2.6) * toMoon * mix(.55, .2, uLight);                                     // and a bright edge where a face turns towards the moon
      float fr = pow(1. - abs(dot(N0, V)), 2.);
      col += ice * uIce * (.06 + .2 * fr) * (.5 + .5 * smoothstep(.55, .9, c1.b)) * (.6 + .4 * uGlowK);   // ice looks deep: brighter at a slant, with pale cracks
      float glw = vM.y, pulse = .8 + .2 * sin(uTime * (.7 + vM.z * 1.3) + vM.w);
      vec3 gc = glw > 1.5 ? uAmber : uIce;
      col += step(.5, glw) * gc * (.22 + .55 * fr + 1.1 * pow(c1.b, 5.) + ridge * .6) * pulse * uGlowK;   // a light inside: it shows through the cracks and along the edges
      col += uIce * vE.x * (ridge * .9 + edge * .4) * .8;                                                // a block that has just been touched flares
      col += uAmber * vE.y * (.1 + .22 * max(N0.y, 0.) + .12 * ridge) * (1. - .55 * uLight);             // gathered round the page, it catches the warm light of the doors and the story
      col = mix(col, uFog, clamp(fogAmt(vW) * .95, 0., 1.));
      gl_FragColor = vec4(col, 1.);
    }`;
  const mat = new T.ShaderMaterial({ uniforms: U, vertexShader: vert, fragmentShader: frag });
  const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);

  /* ---------------------------------------------------------------- places on the screen
     (a point that appears at a given place on the screen, a given distance in front of a camera) */
  const tv = new T.Vector3();
  function plane(cam, px, py, depth, out, o) {
    tv.set(px / st.vw * 2 - 1, -(py / st.vh * 2 - 1), .5).unproject(cam);
    const e = cam.matrixWorld.elements;
    let dx = tv.x - e[12], dy = tv.y - e[13], dz = tv.z - e[14]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const t = depth / Math.max(-(dx * e[8] + dy * e[9] + dz * e[10]), .2);     // along the ray until it is that far in front of the camera
    out[o] = e[12] + dx * t; out[o + 1] = e[13] + dy * t; out[o + 2] = e[14] + dz * t;
  }
  const mpp = depth => 2 * depth * Math.tan(st.fov * Math.PI / 360) / st.vh;   // how much of the world one pixel covers at that distance

  /* ---------------------------------------------------------------- formations
     Under the doors: a low wall of stones. Around the story: a broken frame. At the end of the page: a spiral around the tunnel.
     Each is a list of slots (a place, a size), worked out from where the doors and the story are on screen right now. A slot is filled by the block with the same rank in a shuffled order. */
  const MAXS = 56, D_LEDGE = 15, D_FRAME = 18;
  const mkSlots = () => ({ n: 0, pos: new Float32Array(MAXS * 3), size: new Float32Array(MAXS * 3), w: 0, rank: new Int32Array(NB) });
  const SL = { ledge: mkSlots(), frame: mkSlots() };
  const shuffle = n => { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ORD = { ledge: shuffle(NB), frame: shuffle(NB) };
  const rankBlocks = () => { for (const f of ['ledge', 'frame']) { let r = 0; for (const b of ORD[f]) SL[f].rank[b] = b < COUNT[st.Q] ? r++ : 1e9; } };
  const el = { corridor: document.getElementById('corridor'), lights: document.getElementById('lights') };
  const rise = (top, bottom) => smooth(st.vh * 1.0, st.vh * .6, top) * (1 - smooth(st.vh * .4, st.vh * .05, bottom));   // how much an element is in view

  function put(S, cx, cy, wpx, hpx, depth) {                       // one slot: a box wpx by hpx on the screen, centred on (cx, cy), depth in front of the camera
    if (S.n >= MAXS) return;
    const k = S.n++, mp = mpp(depth);
    plane(camera, cx, cy, depth, S.pos, k * 3);
    S.size[k * 3] = Math.max(wpx * mp, .2); S.size[k * 3 + 1] = Math.max(hpx * mp, .2); S.size[k * 3 + 2] = Math.max(Math.min(wpx, hpx * 2.2) * mp * .9, .3);
  }
  function fillLedge() {
    const S = SL.ledge, r = el.corridor.getBoundingClientRect(); S.n = 0;
    S.w = rise(r.top, r.bottom);
    if (S.w <= .001 || r.width < 40) return;
    const m = clamp(Math.round(r.width / 120), 6, 14);
    for (let k = 0; k < m; k++) {                                   // the wall under the doors
      const x0 = r.left + r.width * k / m, x1 = r.left + r.width * (k + 1) / m, h = 34 + 46 * hash(k + 1);
      put(S, (x0 + x1) / 2, r.bottom + h * .15, (x1 - x0) * .93, h, D_LEDGE);
    }
    for (let side = 0; side < 2; side++) for (let k = 0; k < 3; k++) {   // a stack of stones at each end
      const w = 74 - k * 16 + 14 * hash(k + side * 5), h = 40 + 16 * hash(k * 3 + side);
      put(S, side ? r.right + 34 - k * 6 : r.left - 34 + k * 6, r.bottom - h * (k + .35) + 40, w, h, D_LEDGE + k * .6);
    }
  }
  function fillFrame() {
    const S = SL.frame, r = el.lights.getBoundingClientRect(); S.n = 0;
    S.w = rise(r.top, r.bottom);
    if (S.w <= .001 || r.width < 40) return;
    const M = 26, x0 = Math.max(10, r.left - M), x1 = Math.min(st.vw - 10, r.right + M), y0 = r.top - M, y1 = r.bottom + M;
    const edge = (horizontal, fixed, from, to, depth) => {         // a run of stones along one side, with a stone missing here and there
      let pos = from, k = 0;
      while (pos < to - 16 && S.n < MAXS) {
        const len = Math.min(to - pos, 120 + 90 * hash(S.n + k * 1.7 + (horizontal ? 0 : 9))), th = 26 + 18 * hash(S.n + 4.2 + k);
        if (hash(S.n * 3.1 + k) > .12 || k === 0) put(S, horizontal ? pos + len / 2 : fixed, horizontal ? fixed : pos + len / 2, horizontal ? len * .965 : th, horizontal ? th : len * .965, depth);
        pos += len; k++;
      }
    };
    edge(true, y0, x0, x1, D_FRAME); edge(true, y1, x0, x1, D_FRAME);
    edge(false, x0, y0 + 20, y1 - 20, D_FRAME + .4); edge(false, x1, y0 + 20, y1 - 20, D_FRAME + .4);
  }

  /* ---------------------------------------------------------------- the pointer: the blocks answer it
     Move over one (anywhere that is not text or a button) and it springs away from you, twists and flares, and the ones around it get a nudge;
     when you move off it settles back with a little bounce. Moving through a crowd of them parts it. A click or a tap sends a bigger ripple. */
  const bOff = new Float32Array(NB * 3), bVel = new Float32Array(NB * 3), bTgt = new Float32Array(NB * 3), live = new Set();
  const STIFF = 95, DAMP = 6.5;                                    // a spring that overshoots a little, so the block settles back with a bounce
  const rayO = new T.Vector3(), rayD = new T.Vector3(), pv3 = new T.Vector3();
  const cen = [0, 0, 0], dirA = [0, 0, 0], dirB = [0, 0, 0], lo = [0, 0, 0], ld = [0, 0, 0];
  let hov = -1;
  const aimRay = () => { rayO.copy(camera.position); rayD.set(ptr.nx, ptr.ny, .5).unproject(camera).sub(rayO).normalize(); };
  const centreOf = (i, rest) => { const o = rest ? 0 : 1; cen[0] = B.pos[i * 3] + o * bOff[i * 3]; cen[1] = B.pos[i * 3 + 1] + o * bOff[i * 3 + 1]; cen[2] = B.pos[i * 3 + 2] + o * bOff[i * 3 + 2]; };   // "rest": where it would be without a push
  const twistOf = i => Math.hypot(bOff[i * 3], bOff[i * 3 + 1], bOff[i * 3 + 2]) * 1.5 * Math.sign(B.spin[i]);
  const unturn = (a, ang, x, y, z, out) => {                       // the vertex shader's turn, run backwards
    const c = Math.cos(ang), s = -Math.sin(ang), d = a[0] * x + a[1] * y + a[2] * z, k = 1 - c;
    out[0] = x * c + (a[1] * z - a[2] * y) * s + a[0] * d * k;
    out[1] = y * c + (a[2] * x - a[0] * z) * s + a[1] * d * k;
    out[2] = z * c + (a[0] * y - a[1] * x) * s + a[2] * d * k;
  };
  const axisOf = i => [B.axis[i * 3], B.axis[i * 3 + 1], B.axis[i * 3 + 2]];
  function hitT(i, rest) {                                         // how far along the pointer's line of sight block i is hit, or Infinity
    if (B.vis[i] < .5) return Infinity;
    centreOf(i, rest);
    const dx = cen[0] - rayO.x, dy = cen[1] - rayO.y, dz = cen[2] - rayO.z, t = dx * rayD.x + dy * rayD.y + dz * rayD.z;
    if (t < .5 || t > 120) return Infinity;
    const sx = B.cur[i * 3], sy = B.cur[i * 3 + 1], sz = B.cur[i * 3 + 2], pad = .06 + t * .004, R = .5 * Math.hypot(sx, sy, sz) + pad;
    if (dx * dx + dy * dy + dz * dz - t * t > R * R) return Infinity;
    const ang = B.ang[i] + (rest ? 0 : twistOf(i)), a = axisOf(i), s = [sx, sy, sz];
    unturn(a, ang, -dx, -dy, -dz, lo); unturn(a, ang, rayD.x, rayD.y, rayD.z, ld);
    let t0 = -1e9, t1 = 1e9;
    for (let k = 0; k < 3; k++) {
      const h = s[k] * .5 + pad;
      if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > h) return Infinity; continue; }
      let u = (-h - lo[k]) / ld[k], w = (h - lo[k]) / ld[k];
      if (u > w) { const x = u; u = w; w = x; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, w);
      if (t0 > t1) return Infinity;
    }
    return t1 < 0 ? Infinity : Math.max(t0, 0);
  }
  const pickNearest = () => { let best = -1, bt = Infinity; const n = COUNT[st.Q]; for (let i = 0; i < n; i++) { const t = hitT(i); if (t < bt) { bt = t; best = i; } } return best; };
  const awayFrom = (i, out) => {                                   // which way is "away from the pointer" for block i: sideways, out of its line of sight (when the pointer is on its middle: the way the pointer was travelling), and a little deeper
    centreOf(i);
    const dx = cen[0] - rayO.x, dy = cen[1] - rayO.y, dz = cen[2] - rayO.z, t = dx * rayD.x + dy * rayD.y + dz * rayD.z;
    const px = dx - rayD.x * t, py = dy - rayD.y * t, pz = dz - rayD.z * t, pl = Math.hypot(px, py, pz);
    const k = Math.min(1, pl / (.18 * Math.hypot(B.cur[i * 3], B.cur[i * 3 + 1], B.cur[i * 3 + 2]) + 1e-4));   // 0: the pointer is on the very middle, 1: clearly to one side of it
    const m = camera.matrixWorld.elements, sl = Math.hypot(ptr.vx, ptr.vy);
    let sx = .9, sy = .3, sz = 0;                                  // pointer not moving: any way will do
    if (sl > 1e-5) { const ux = ptr.vx / sl, uy = ptr.vy / sl; sx = m[0] * ux + m[4] * uy; sy = m[1] * ux + m[5] * uy; sz = m[2] * ux + m[6] * uy; }   // screen right/up -> the world
    const q = pl > 1e-6 ? k / pl : 0;
    const ax = px * q + sx * (1 - k) + rayD.x * .3, ay = py * q + sy * (1 - k) + rayD.y * .3, az = pz * q + sz * (1 - k) + rayD.z * .3, l = Math.hypot(ax, ay, az) || 1;
    out[0] = ax / l; out[1] = ay / l; out[2] = az / l;
  };
  const kick = (i, s, d) => {
    let vx = bVel[i * 3] + d[0] * s, vy = bVel[i * 3 + 1] + d[1] * s, vz = bVel[i * 3 + 2] + d[2] * s;
    const m = Math.hypot(vx, vy, vz); if (m > 9) { vx *= 9 / m; vy *= 9 / m; vz *= 9 / m; }
    bVel[i * 3] = vx; bVel[i * 3 + 1] = vy; bVel[i * 3 + 2] = vz; live.add(i);
  };
  const ripple = (i, s) => {                                       // the blocks around the one touched get a push too, fading with distance
    centreOf(i);
    const cx = cen[0], cy = cen[1], cz = cen[2], R = 3.6 + .02 * Math.hypot(cx - rayO.x, cz - rayO.z), n = COUNT[st.Q];
    for (let j = 0; j < n; j++) {
      if (j === i || B.vis[j] < .5) continue;
      centreOf(j);
      const dx = cen[0] - cx, dy = cen[1] - cy, dz = cen[2] - cz, d = Math.hypot(dx, dy, dz);
      if (d < R && d > 1e-3) { const f = 1 - d / R; dirB[0] = dx / d; dirB[1] = dy / d; dirB[2] = dz / d; kick(j, s * f * f, dirB); }
    }
  };
  const engage = i => {                                            // the pointer arrives on block i: it is held a little way off while the pointer stays, with a springy kick
    aimRay(); awayFrom(i, dirA);
    const sp = Math.min(1, Math.hypot(ptr.vx, ptr.vy) * 14);       // a quick flick of the pointer sends it harder (it bounces more)
    bTgt[i * 3] = dirA[0] * .5; bTgt[i * 3 + 1] = dirA[1] * .5; bTgt[i * 3 + 2] = dirA[2] * .5;
    kick(i, 3.2 + 3.2 * sp, dirA); ripple(i, 2 + 2 * sp);
  };
  const release = i => { bTgt[i * 3] = bTgt[i * 3 + 1] = bTgt[i * 3 + 2] = 0; live.add(i); };
  function hoverTick() {
    let h = -1;
    if (ptr.seen && ptr.air) {
      aimRay();
      // a block that has been pushed away keeps the pointer while it is over where the block is, or where it was (otherwise a small block would dodge, come back, dodge again)
      h = hov >= 0 && hov < COUNT[st.Q] && (hitT(hov) < Infinity || hitT(hov, true) < Infinity) ? hov : pickNearest();
    }
    if (h === hov) return;
    if (hov >= 0) release(hov);
    hov = h;
    if (h >= 0) engage(h);
  }
  function fieldPush(dt) {                                         // moving the pointer through a crowd of blocks parts it: the ones close to its line of sight are pushed aside
    if (!ptr.seen || !ptr.air) return;
    const sp = Math.hypot(ptr.vx, ptr.vy); if (sp < .004) return;
    aimRay();
    const n = COUNT[st.Q], push = (1.4 + 5 * Math.min(sp * 14, 1)) * dt * 60;
    for (let i = 0; i < n; i++) {
      if (i === hov || B.vis[i] < .5) continue;
      centreOf(i);
      const dx = cen[0] - rayO.x, dy = cen[1] - rayO.y, dz = cen[2] - rayO.z, t = dx * rayD.x + dy * rayD.y + dz * rayD.z;
      if (t < 3 || t > 90) continue;
      const px = dx - rayD.x * t, py = dy - rayD.y * t, pz = dz - rayD.z * t, pl = Math.hypot(px, py, pz);
      const R = .5 * Math.hypot(B.cur[i * 3], B.cur[i * 3 + 1], B.cur[i * 3 + 2]) + 1.5 + t * .02;
      if (pl > R || pl < 1e-4) continue;
      const f = 1 - pl / R; dirB[0] = px / pl; dirB[1] = py / pl; dirB[2] = pz / pl; kick(i, push * f * f, dirB);
    }
  }
  function tap() {                                                 // a click or a tap: a bigger kick, and a ripple through the blocks around
    aimRay(); const h = pickNearest();
    if (h < 0) return;
    awayFrom(h, dirA); kick(h, 8, dirA); ripple(h, 5);
  }
  function stepBlocks(dt) {                                        // the spring: pulled towards where it should rest, slowed by damping
    if (!live.size) return;
    const h = Math.min(dt, .05);
    for (const i of live) {
      let e = 0;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        bVel[j] += (STIFF * (bTgt[j] - bOff[j]) - DAMP * bVel[j]) * h; bOff[j] += bVel[j] * h;
        e += Math.abs(bOff[j]) + Math.abs(bVel[j]) + Math.abs(bTgt[j]);
      }
      if (e < 2e-3) { for (let k = 0; k < 3; k++) { bOff[i * 3 + k] = 0; bVel[i * 3 + k] = 0; } live.delete(i); }
    }
  }
  const screenOf = i => { centreOf(i); pv3.set(cen[0], cen[1], cen[2]).project(camera); return { x: (pv3.x * .5 + .5) * st.vw, y: (-pv3.y * .5 + .5) * st.vh, z: pv3.z }; };   // (used by the tests)

  /* ---------------------------------------------------------------- every frame */
  const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const lp = [0, 0, 0], hp = [0, 0, 0];
  function update(dt, t) {
    const n = COUNT[st.Q], calm = st.still ? 0 : 1;
    fillLedge(); fillFrame();
    const wl = SL.ledge.w, wf = SL.frame.w, wh = smooth(.2, .85, st.vortex);
    const sway = st.gust * 1.1, turnK = 1 + st.gust * 1.2 + clamp(Math.abs(st.zv) * .12, 0, 2.5);   // wind leans the blocks and turns them faster; so does flying
    for (let i = 0; i < n; i++) {
      const o3 = i * 3, dl = B.delay[i], ph = B.mat[i * 4 + 3];
      // where it floats when nothing gathers it
      const d = Math.max(B.d[i] + st.z * B.par[i], 7);
      plane(rigCam, (B.u[i] * .5 + .5) * st.vw, (-B.v[i] * .5 + .5) * st.vh, d, lp, 0);
      lp[0] += (Math.sin(t * .23 + ph * 1.3) * .45 + sway * (.4 + dl)) * calm; lp[1] += Math.sin(t * .31 + ph) * .4 * calm; lp[2] += Math.sin(t * .19 + ph * 2.1) * .5 * calm;
      let sx = B.size[o3], sy = B.size[o3 + 1], sz = B.size[o3 + 2];
      lp[1] = Math.max(lp[1], 1.5 + Math.max(sx, sy, sz) * .5);
      let px = lp[0], py = lp[1], pz = lp[2], vis = smooth(5, 10, d), asm = 0;
      // gathered into the wall under the doors, or the frame round the story
      for (let f = 0; f < 2; f++) {
        const S = f ? SL.frame : SL.ledge, w = f ? wf : wl;
        if (w <= .001) continue;
        const rk = S.rank[i]; if (rk >= S.n) continue;
        const wb = smooth(0, 1, clamp(w * 1.6 - dl * .6, 0, 1)), k = rk * 3, fly = Math.sin(Math.PI * wb) * .14;
        px = lerp(px, S.pos[k], wb) + B.arc[o3] * fly * 14; py = lerp(py, S.pos[k + 1], wb) + B.arc[o3 + 1] * fly * 14; pz = lerp(pz, S.pos[k + 2], wb) + B.arc[o3 + 2] * fly * 14;
        sx = lerp(sx, S.size[k], wb); sy = lerp(sy, S.size[k + 1], wb); sz = lerp(sz, S.size[k + 2], wb);
        asm = Math.max(asm, wb); vis = Math.max(vis, wb);
      }
      // drawn into the spiral around the tunnel
      if (wh > .001) {
        const wb = smooth(0, 1, clamp(wh * 1.6 - dl * .6, 0, 1)), a = i * 2.39996 + t * .22 * calm, r = 8 + 4.5 * frac(i * .618), dd = 14 + 46 * frac(i * .381 + .1);
        const hx = Math.cos(a) * r, hy = CAM_Y_OF() + st.vortex * 2.1 + Math.sin(a) * r * .8;
        px = lerp(px, hx, wb); py = lerp(py, hy, wb); pz = lerp(pz, st.z - dd, wb);
        sx *= 1 - .5 * wb; sy *= 1 - .5 * wb; sz *= 1 - .5 * wb;         // in the spiral they are smaller, like the stones of the tunnel itself
      }
      B.pos[o3] = px; B.pos[o3 + 1] = py; B.pos[o3 + 2] = pz; B.cur[o3] = sx; B.cur[o3 + 1] = sy; B.cur[o3 + 2] = sz;
      B.asm[i] = asm; B.vis[i] = vis;
      // the turn: it spins while loose; once it is gathered it unwinds and lies square
      if (asm < .001) B.spinAcc[i] += dt * B.spin[i] * turnK * calm;
      B.ang[i] = wrapPi(B.spinAcc[i] + B.phase[i]) * (1 - asm);
    }
    stepBlocks(dt); hoverTick(); if (!st.still) fieldPush(dt);
    const cE = aC.array, sE = aS.array, qE = aQ.array, eE = aE.array;
    for (let i = 0; i < n; i++) {
      const o3 = i * 3, o4 = i * 4, vs = B.vis[i];
      cE[o3] = B.pos[o3] + bOff[o3]; cE[o3 + 1] = B.pos[o3 + 1] + bOff[o3 + 1]; cE[o3 + 2] = B.pos[o3 + 2] + bOff[o3 + 2];
      sE[o3] = B.cur[o3] * vs; sE[o3 + 1] = B.cur[o3 + 1] * vs; sE[o3 + 2] = B.cur[o3 + 2] * vs;
      qE[o4] = B.axis[o3]; qE[o4 + 1] = B.axis[o3 + 1]; qE[o4 + 2] = B.axis[o3 + 2]; qE[o4 + 3] = B.ang[i] + twistOf(i);
      eE[o4] = Math.min(Math.hypot(bOff[o3], bOff[o3 + 1], bOff[o3 + 2]) * 2.6, 1.4); eE[o4 + 1] = B.asm[i];
    }
    aC.needsUpdate = aS.needsUpdate = aQ.needsUpdate = aE.needsUpdate = true;
  }
  const CAM_Y_OF = () => H.CAM_Y;

  H.systems.push({
    name: 'blocks',
    quality() { geo.instanceCount = COUNT[st.Q]; rankBlocks(); if (hov >= COUNT[st.Q]) { release(hov); hov = -1; } },
    update, tap,
    destroy() { geo.dispose(); mat.dispose(); scene.remove(mesh); }
  });
  H.blocks = {
    get hover() { return hov; }, get moving() { return live.size; }, get count() { return COUNT[st.Q]; }, screenOf,
    off: i => [bOff[i * 3], bOff[i * 3 + 1], bOff[i * 3 + 2]], assembled: i => B.asm[i], visible: i => B.vis[i], slots: () => ({ ledge: SL.ledge.n, frame: SL.frame.n, wl: SL.ledge.w, wf: SL.frame.w })
  };
})();
