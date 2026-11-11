/* The background. A long hall of lit doorways, drawn with Three.js (js/three.min.js is a trimmed copy of the library: nothing to install).
   Scrolling flies the camera down the hall, the mouse leans it a little, and the lamp's light/dark switch changes the whole hall.
   Glowing cubes and slowly turning cuboids drift between the doorways in the door colours, and spin faster while you scroll.
   Everything else on the page floats over it as glass (see the glass rules in the stylesheet).
   No WebGL: the page keeps a calm gradient. "Reduce motion": one still frame. A slow computer: it draws fewer pixels by itself. */
(() => {
  const root = document.documentElement, canvas = document.getElementById('gl');
  if (!canvas || !window.THREE) { root.classList.add('gl-off'); return; }
  if (typeof PROFILE !== 'undefined' && PROFILE.background3d === false) { root.classList.add('gl-off'); return; }   // switched off in js/data.js
  const T = THREE;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const roomEl = document.getElementById('room');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hex = h => new T.Color(h);

  /* ---------------------------------------------------------------- the hall */
  const W = 11, H = 7.6, GAP = 10, N = 14, LAST = N - 1;          // 14 doorways, ten steps apart; the last one is the exit
  const gz = k => -(k + 1) * GAP - 4;                              // -14 ... -144
  const END_Z = gz(LAST) - 6, CAM_END = gz(LAST) + 12;             // the end wall, and where the camera stops at the bottom of the page
  const PAL = {
    dark:  { brass: '#FFC46B', d1: '#5675FF', d2: '#26AE9F', d3: '#B866C4', d4: '#FF7A5F', exit: '#FFE2A6' },
    light: { brass: '#D9962B', d1: '#2F55E0', d2: '#14867A', d3: '#8A3F95', d4: '#E4563F', exit: '#F0B04A' }
  };
  /* doorway colours: brass for the lamp, then the four door paints in order (these pass by while you are at "Pick a door") */
  const SEQ = ['brass', 'd1', 'd2', 'd3', 'd4', 'brass', 'd2', 'd1', 'd4', 'd3', 'brass', 'd3', 'd4', 'exit'];
  const SKY = { dark: hex('#05070E'), light: hex('#CDD5CE') };
  const FOG = { dark: hex('#070A14'), light: hex('#CBD3CC') };

  /* ---------------------------------------------------------------- renderer */
  /* ask the browser for the graphics context ourselves: when there is none (WebGL switched off, an old device) we fall back quietly, with nothing printed to the console */
  const attrs = { antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' };
  let ctx = null, renderer;
  try { ctx = canvas.getContext('webgl2', attrs); } catch (e) {}
  if (!ctx) { root.classList.add('gl-off'); return; }
  try { renderer = new T.WebGLRenderer({ canvas, context: ctx, ...attrs }); }
  catch (e) { root.classList.add('gl-off'); return; }

  const coarse = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let forced = -1;
  try { const f = localStorage.getItem('hallQ'); if (f === '0' || f === '1' || f === '2') forced = +f; } catch (e) {}   // a switch for testing: localStorage.hallQ = "0" | "1" | "2"
  let Q = forced >= 0 ? forced : (coarse || weak ? 1 : 2);        // 2 full, 1 lighter, 0 lightest
  const DPR = [1, 1.25, 1.75], DUST = [420, 800, 1400];
  const still = mqReduce.matches;

  /* ---------------------------------------------------------------- shared shader pieces */
  const POOLS = `
    uniform float uZ[${N}]; uniform vec3 uC[${N}]; uniform float uI[${N}];
    vec3 pools(vec3 w){                                            // light spilling out of every doorway, along the hall
      vec3 a = vec3(0.);
      for (int i = 0; i < ${N}; i++) { float dz = w.z - uZ[i]; a += uC[i] * (uI[i] * exp(-dz * dz * 0.085)); }
      return a;
    }`;
  const NOISE = `
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return .56 * vnoise(p) + .3 * vnoise(p * 2.1 + 7.3) + .14 * vnoise(p * 4.3 + 1.7); }`;

  const uZ = [], uC = [], uI = [];
  for (let k = 0; k < N; k++) { uZ.push(gz(k)); uC.push(new T.Vector3()); uI.push(1); }
  const shared = { uZ: { value: uZ }, uC: { value: uC }, uI: { value: uI } };
  const U = {                                                      // values every material reads
    uTime: { value: 0 }, uLight: { value: 0 }, uFog: { value: FOG.dark.clone() }
  };

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(54, 1, 0.1, 400);
  camera.rotation.order = 'YXZ';

  /* ---- walls, floor, ceiling */
  const hallVert = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const hallFrag = `
    varying vec3 vW; uniform float uKind, uTime, uLight; uniform vec3 uFog;
    ${POOLS}
    void main(){
      vec3 w = vW;
      vec3 pl = pools(w);
      float lum = dot(pl, vec3(.3, .5, .2));
      vec3 cD, cL; float alpha = 1.;
      if (uKind < .5) {                                            // floor: dark polished stone with a runner down the middle
        float ax = abs(w.x);
        float runner = 1. - smoothstep(1.7, 1.78, ax);
        float e1 = 1. - smoothstep(0., .035, abs(ax - 1.8));
        float e2 = (1. - smoothstep(0., .02, abs(ax - 1.6))) * .6;
        float seam = 1. - smoothstep(0., .03, abs(fract(w.z / 2.5) - .5) - .46);
        vec3 b = mix(vec3(.011, .013, .024), vec3(.034, .018, .017), runner);
        cD = b + pl * (.07 + .32 * runner) + vec3(1., .74, .36) * (e1 + e2) * (.05 + lum * 1.5) + seam * runner * .006;
        vec3 bl = mix(vec3(.73, .76, .73), vec3(.64, .57, .52), runner);
        cL = bl * (1. - .10 * clamp(lum, 0., 1.)) + pl * .16 - (e1 + e2) * .05 + vec3(.55, .40, .12) * (e1 + e2) * .18;
        alpha = mix(.86, .94, uLight);
      } else if (uKind < 1.5) {                                    // side walls: panels, a rail, a lit cove under the ceiling
        float y = w.y;
        float seam = 1. - smoothstep(0., .04, abs(fract(w.z / 1.8 + .5) - .5) * 1.8);
        float rail = 1. - smoothstep(0., .045, abs(y - 1.15));
        float cove = 1. - smoothstep(0., .07, abs(y - 7.2));
        float base = 1. - smoothstep(0., .05, abs(y - .22));
        float panel = smoothstep(1.2, 1.6, y) * (1. - smoothstep(6.8, 7.1, y));
        vec3 lines = (rail + cove + base) * vec3(1., .74, .36);
        cD = vec3(.016, .020, .036) + pl * (.20 + .12 * panel) + seam * panel * pl * .45 + lines * (.045 + lum * 1.2);
        cL = vec3(.79, .82, .79) * (1. - .10 * seam * panel) + pl * .12 - (rail + cove + base) * .06 + vec3(.55, .42, .14) * (rail + cove + base) * .20;
      } else if (uKind < 2.5) {                                    // ceiling
        float strip = 1. - smoothstep(0., 1.6, abs(w.x));
        cD = vec3(.010, .013, .024) + pl * .16 + strip * pl * .22;
        cL = vec3(.85, .87, .84) * (1. - .06 * strip) + pl * .10;
      } else {                                                     // the wall at the far end
        float r = length((w.xy - vec2(0., 3.6)) / vec2(3.2, 4.6));
        cD = vec3(.012, .014, .026) + pl * .5 * (1. - r * .4);
        cL = vec3(.80, .83, .80) + pl * .1;
      }
      vec3 col = mix(cD, cL, uLight);
      float dist = distance(w, cameraPosition);
      float fog = 1. - exp(-dist * mix(.032, .012, uLight));
      col = mix(col, uFog, fog);
      gl_FragColor = vec4(col, alpha);
    }`;
  const hallMat = kind => new T.ShaderMaterial({
    uniforms: Object.assign({ uKind: { value: kind } }, U, shared), vertexShader: hallVert, fragmentShader: hallFrag,
    side: T.DoubleSide, transparent: kind === 0, depthWrite: kind !== 0
  });
  {
    const zMid = (14 + END_Z) / 2, L = 14 - END_Z;
    const floor = new T.Mesh(new T.PlaneGeometry(W, L), hallMat(0)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zMid); floor.renderOrder = 2;
    const ceil = new T.Mesh(new T.PlaneGeometry(W, L), hallMat(2)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zMid);
    const wl = new T.Mesh(new T.PlaneGeometry(L, H), hallMat(1)); wl.rotation.y = Math.PI / 2; wl.position.set(-W / 2, H / 2, zMid);
    const wr = new T.Mesh(new T.PlaneGeometry(L, H), hallMat(1)); wr.rotation.y = -Math.PI / 2; wr.position.set(W / 2, H / 2, zMid);
    const we = new T.Mesh(new T.PlaneGeometry(W, H), hallMat(3)); we.position.set(0, H / 2, END_Z);
    scene.add(floor, ceil, wl, wr, we);
  }

  /* ---- the doorways: one flat shape each, drawn as a distance field (a door with a half-round fanlight) */
  const gateVert = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.); }`;
  const gateFrag = `
    varying vec2 vP; uniform vec3 uColor; uniform float uTime, uSeed, uInt, uLight, uRef, uExit;
    const float DW = 1.7, DH = 4.3;
    ${NOISE}
    float sdDoor(vec2 p){ float r = max(abs(p.x) - DW, -p.y); float c = length(p - vec2(0., DH)) - DW; return p.y < DH ? r : c; }
    void main(){
      vec2 p = vP;
      float d = sdDoor(p);
      float px = max(fwidth(d), 1e-4);
      float soft = 1. + uRef * 1.6;                                // a reflection is softer than the thing itself
      float th = max(.04, px * 1.5) * soft;
      float inside = 1. - smoothstep(-px, px, d);
      float frame = 1. - smoothstep(th, th + px * 1.6 * soft, abs(d));
      float casing = (1. - smoothstep(th * .4, th * .4 + px * 1.6 * soft, abs(d - .24))) * .5;
      float halo = (exp(-abs(d) * 2.6) * .30 + exp(-abs(d) * .6) * .10) * (1. - .6 * inside);
      halo *= (1. - smoothstep(3.7, 5.2, abs(p.x))) * (1. - smoothstep(6.6, 7.8, p.y));
      float h = fbm(p * vec2(.8, .5) + vec2(uTime * .015, -uTime * .02) + uSeed * 10.);
      float foot = exp(-max(p.y, 0.) * .4);
      float cen = 1. - .45 * smoothstep(0., DW, abs(p.x));
      float fill = inside * (.07 + .22 * h) * (.45 + 1.1 * foot) * cen;
      float ang = atan(p.y - DH, p.x);
      float spoke = smoothstep(.86, .99, cos(ang * 10.)) * step(DH, p.y) * inside;
      fill += spoke * .14;
      fill += uExit * inside * (.8 + .8 * foot + .4 * h);          // the exit door is full of light
      float e = (frame * 1.05 + casing * .7 + halo + fill) * smoothstep(-.05, .12, p.y);   // nothing below the floor line: that would show through it as a hard edge
      float k = uInt;
      if (uRef > .5) k *= .34 * exp(-max(p.y, 0.) * .2);
      if (uLight < .5) gl_FragColor = vec4(uColor * (e * k), 1.);
      else gl_FragColor = vec4(uColor, clamp(e * k * .5, 0., .95));
    }`;
  const gateGeo = new T.PlaneGeometry(10.6, 8.2); gateGeo.translate(0, 3.7, 0);
  const gates = [];
  for (let k = 0; k < N; k++) {
    const mk = ref => new T.ShaderMaterial({
      uniforms: Object.assign({ uColor: { value: new T.Color() }, uSeed: { value: k * .37 + .1 }, uInt: { value: 1 }, uRef: { value: ref }, uExit: { value: k === LAST ? 1 : 0 } }, U),
      vertexShader: gateVert, fragmentShader: gateFrag, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending
    });
    const front = new T.Mesh(gateGeo, mk(0)), mirror = new T.Mesh(gateGeo, mk(1));
    front.position.z = mirror.position.z = gz(k);
    mirror.scale.y = -1; mirror.renderOrder = 1; front.renderOrder = 3;
    scene.add(front, mirror);
    gates.push({ front, mirror, key: SEQ[k], base: k === LAST ? 1.25 : 1 });
  }

  /* ---- dust hanging in the light */
  const dustGeo = new T.BufferGeometry();
  {
    const n = DUST[2], pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * (W - .6); pos[i * 3 + 1] = .2 + Math.random() * (H - .6); pos[i * 3 + 2] = 8 - Math.random() * (8 - END_Z - 2);
      for (let j = 0; j < 4; j++) rnd[i * 4 + j] = Math.random();
    }
    dustGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aR', new T.BufferAttribute(rnd, 4));
  }
  const dustMat = new T.ShaderMaterial({
    uniforms: Object.assign({ uPx: { value: 600 }, uSize: { value: .05 } }, U, shared),
    vertexShader: `
      attribute vec4 aR; uniform float uTime, uPx, uSize; varying vec3 vW; varying float vS; varying float vTw;
      void main(){
        vec3 p = position; float t = uTime;
        p.x += sin(t * .11 + aR.x * 6.28) * .35 + sin(t * .23 + aR.y * 6.28) * .12;
        p.y += sin(t * .09 + aR.z * 6.28) * .4;
        p.z += sin(t * .07 + aR.w * 6.28) * .35;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * (.5 + aR.w * 1.1) * uPx / max(-mv.z, .4), 1., 24.);
        vW = p; vS = smoothstep(.5, 2.4, -mv.z); vTw = .65 + .35 * sin(t * (.8 + aR.x * 1.6) + aR.y * 40.);
      }`,
    fragmentShader: `
      varying vec3 vW; varying float vS; varying float vTw; uniform float uLight;
      ${POOLS}
      void main(){
        vec2 q = gl_PointCoord - .5; float r = length(q) * 2.;
        float a = 1. - smoothstep(0., 1., r); a *= a;
        vec3 pl = pools(vW);
        float lum = dot(pl, vec3(.3, .5, .2));
        float dist = distance(vW, cameraPosition);
        float far = exp(-dist * .016);
        if (uLight < .5) gl_FragColor = vec4((vec3(.5, .4, .3) * .04 + pl * 1.5) * (a * vS * vTw * far), 1.);
        else gl_FragColor = vec4(vec3(.12, .13, .18), a * vS * vTw * far * (.12 + clamp(lum, 0., 1.) * .35));
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  const dust = new T.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 4; scene.add(dust);

  /* ---- glowing cubes and turning cuboids, drifting between the doorways.
     One merged geometry: every box carries its own centre, size, spin axis and colour, and the vertex shader does the tumbling,
     so moving them costs nothing on the CPU. Boxes come in three passes, so a lighter quality simply draws fewer of them. */
  let seed = 20261109;                                             // a fixed seed: the same boxes in the same places on every visit
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let a = Math.imul(seed ^ seed >>> 15, 1 | seed); a = a + Math.imul(a ^ a >>> 7, 61 | a) ^ a; return ((a ^ a >>> 14) >>> 0) / 4294967296; };
  const PER_GAP = [3, 3, 4];                                       // boxes per gap between doorways, in each of three passes
  const KEY = { brass: 0, d1: 1, d2: 2, d3: 3, d4: 4, exit: 0 };
  const CAM_Y = 1.65;
  const boxes = [[], [], []];
  for (let pass = 0; pass < 3; pass++) for (let g = 0; g < N; g++) {
    const first = g === 0, m = first ? 2 : PER_GAP[pass];          // the first gap is the one on the first screen: a few boxes, kept above and right of the words
    const z0 = gz(g) + 1.9, z1 = first ? -6.4 : gz(g - 1) - 1.9;   // (the first gap's boxes stay a good way off, so they never crowd the lamp)
    for (let i = 0; i < m; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const kr = rnd(), kind = first ? (kr < .7 ? 0 : 1) : kr < .5 ? 0 : kr < .82 ? 1 : 2;   // 0 cube, 1 long cuboid, 2 door-like slab that turns about its own height
        let sc;
        if (kind === 0) { const q = first ? .34 + rnd() * .4 : .26 + Math.pow(rnd(), 2.2) * .85; sc = [q, q, q]; }
        else if (kind === 1) {
          const b = (.26 + rnd() * .3) * (first ? .85 : 1), l = b * (2 + rnd() * 2.3), c = b * (.7 + rnd() * .8), long = Math.floor(rnd() * 3);
          sc = [b, b, b]; sc[long] = l; sc[(long + 1) % 3] = c;
        }
        else sc = [.85 + rnd() * .6, 2.1 + rnd() * 1.1, .07 + rnd() * .06];
        const r = .5 * Math.hypot(sc[0], sc[1], sc[2]);
        const side = rnd() < .6 ? 1 : -1;                          // a little more on the right, away from the words
        const x = first ? 1.5 + rnd() * 1.9 : side * (1.1 + rnd() * (W / 2 - .45 - r - 1.1));
        const y = first ? 2.8 + rnd() * 2.1 : kind === 2 ? sc[1] / 2 + .45 + rnd() * 1.3 : .3 + r + Math.pow(rnd(), 1.3) * (H - .7 - 2 * r);
        const z = z0 + (z1 - z0) * ((i + rnd()) / m);
        if (Math.hypot(x, y - CAM_Y) < r + 1.3) continue;           // never on the camera's path
        if (Math.abs(x) + r > W / 2 - .25 || y + r > H - .25 || y - r < .15) continue;
        let ax = [rnd() - .5, rnd() - .5, rnd() - .5]; const al = Math.hypot(...ax) || 1; ax = ax.map(v => v / al);
        if (kind === 2) ax = [0, 1, 0];
        const sp = (kind === 2 ? .2 + rnd() * .36 : .14 + rnd() * .42) * (rnd() < .5 ? -1 : 1);   // radians a second: a full turn takes somewhere between 11 and 45 seconds
        const near = KEY[SEQ[g]];
        const ph = rnd() * 6.2832, gl = .75 + rnd() * .6, pc = rnd() < .6 ? near : Math.floor(rnd() * 5), sd = rnd();
        boxes[pass].push({ c: [x, y, z], s: sc, a: [ax[0], ax[1], ax[2], sp], p: [ph, gl, pc + (sd < .3 ? 8 : 0), sd] });   // about one in three is "lit": a soft light inside (+8 on the colour number marks it)
        break;
      }
    }
  }
  const all = boxes[0].concat(boxes[1], boxes[2]), NB = all.length;
  const COUNT = [boxes[0].length, boxes[0].length + boxes[1].length, NB];   // what each quality draws
  const aOArr = new Float32Array(NB * 4), aO = new T.InstancedBufferAttribute(aOArr, 4); aO.setUsage(T.DynamicDrawUsage);   // what the pointer has done to each box: how far it is pushed, and how much it is twisted
  /* The shape is a cube with its edges rounded off. Each corner point is stored as a direction on a sphere plus which corner of the box it belongs to;
     the vertex shader puts it at (corner x (half the size - the rounding)) + (direction x the rounding), so the rounding stays the same size however long the box is.
     One copy of the shape is drawn once per box (instancing), and each box brings its own centre, size, spin axis and colour. */
  const RN = 5, ROUND = .24;                                       // five steps across each face, so each rounded edge is four steps; the rounding is 24% of the thinnest side
  const cubeGeo = new T.InstancedBufferGeometry();
  {
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
    cubeGeo.setAttribute('position', new T.BufferAttribute(pos, 3)); cubeGeo.setAttribute('aSg', new T.BufferAttribute(sgn, 3));
    cubeGeo.setIndex(new T.BufferAttribute(idx, 1));
    const perBox = (name, size, get) => { const a = new Float32Array(NB * size); all.forEach((b, i) => a.set(get(b), i * size)); cubeGeo.setAttribute(name, new T.InstancedBufferAttribute(a, size)); };
    perBox('aC', 3, b => b.c); perBox('aS', 3, b => b.s); perBox('aA', 4, b => b.a); perBox('aP', 4, b => b.p);
    cubeGeo.setAttribute('aO', aO);
    cubeGeo.instanceCount = COUNT[Q];
  }
  const uPal = []; for (let i = 0; i < 5; i++) uPal.push(new T.Color());
  const uSpin = { value: 0 };
  const cubeVert = `
    const float ROUND = ${ROUND.toFixed(3)};
    attribute vec3 aSg; attribute vec3 aC; attribute vec3 aS; attribute vec4 aA; attribute vec4 aP; attribute vec4 aO;
    uniform float uTime, uSpin; uniform vec3 uPal[5];
    varying vec3 vW; varying vec3 vN; varying vec3 vLn; varying vec3 vTint; varying vec4 vP;
    mat3 turn(vec3 k, float a){                                    // rotate about the axis k by the angle a
      float c = cos(a), s = sin(a), t = 1. - c;
      return mat3(c + k.x*k.x*t,       k.x*k.y*t + k.z*s, k.x*k.z*t - k.y*s,
                  k.x*k.y*t - k.z*s,   c + k.y*k.y*t,     k.y*k.z*t + k.x*s,
                  k.x*k.z*t + k.y*s,   k.y*k.z*t - k.x*s, c + k.z*k.z*t);
    }
    void main(){
      float lit = step(7.5, aP.z), pal = aP.z - 8. * lit;          // the colour number carries the "lit" mark
      float kick = length(aO.xyz);                                 // how far the pointer has pushed this box
      mat3 R = turn(normalize(aA.xyz), aP.x + uSpin * aA.w + aO.w);
      vec3 hs = aS * .5; float rr = min(aS.x, min(aS.y, aS.z)) * ROUND;
      vec3 lp = aSg * (hs - rr) + position * rr;                   // the rounded box
      vec3 c = aC + aO.xyz + vec3(sin(uTime * .23 + aP.w * 9.1) * .12, sin(uTime * .31 + aP.w * 6.28) * .18, 0.);   // a slow drift, so even a still box floats
      vec4 w = modelMatrix * vec4(R * lp + c, 1.);
      vW = w.xyz; vN = mat3(modelMatrix) * (R * position); vLn = position;
      vTint = uPal[int(pal + .5)]; vP = vec4(aP.y, aP.w, lit, min(kick * 2.6, 1.4));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const cubeFrag = `
    varying vec3 vW; varying vec3 vN; varying vec3 vLn; varying vec3 vTint; varying vec4 vP;
    uniform float uTime, uLight, uRef; uniform vec3 uFog;
    ${POOLS}
    void main(){
      vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
      vec3 a = abs(normalize(vLn));
      float bev = 1. - max(a.x, max(a.y, a.z));                    // 0 across a flat face, rising round the rounded edges and corners
      float rim = smoothstep(.02, .24, bev), ridge = smoothstep(.1, .3, bev);
      float fr = pow(1. - abs(dot(n, V)), 2.4);
      float grad = .5 + .5 * dot(n, normalize(vec3(.35, .85, .4)));
      float pulse = .88 + .12 * sin(uTime * (.7 + vP.y * 1.3) + vP.y * 40.);
      vec3 pl = pools(vW);
      float dist = distance(vW, cameraPosition);
      float fog = 1. - exp(-dist * mix(.032, .012, uLight));
      float keep = exp(-dist * mix(.014, .008, uLight));          // the glowing edges keep their light far into the fog
      float lit = vP.z, fl = vP.w;                                 // fl: a box that has just been touched flares
      float ed = (ridge * 1.7 + rim * .7) * vP.x * pulse + fl * (ridge * 1.3 + rim * .7);
      vec3 bD = vec3(.012, .015, .03) + vec3(.02, .025, .05) * grad + vTint * (.04 + .12 * fr) * vP.x + pl * (.25 + .35 * grad);
      vec3 lD = mix(vTint, vec3(1.), .28) * (.16 + .20 * grad + .22 * fr) * (.8 + .2 * pulse);   // a lit box glows softly from inside
      vec3 cD = mix(mix(bD, lD, lit), uFog, fog * .9) + vTint * (ed * keep + fl * .12);
      vec3 bL = mix(vec3(.97, .975, .96), vTint, .12 + .16 * fr) * (.78 + .22 * grad);
      vec3 lL = mix(vec3(1.), vTint, .42 + .18 * fr) * (.72 + .28 * grad);
      vec3 cL = mix(mix(mix(bL, lL, lit), uFog, fog * .8), vTint * .85, clamp(ed * keep * .55, 0., 1.));
      vec3 col = mix(cD, cL, uLight);
      if (uRef > .5) col *= .9 * exp(vW.y * .2);                   // the reflection in the floor: fainter the deeper it goes
      gl_FragColor = vec4(col, 1.);
    }`;
  const cubeMat = () => new T.ShaderMaterial({ uniforms: Object.assign({ uPal: { value: uPal }, uSpin, uRef: { value: 0 } }, U, shared), vertexShader: cubeVert, fragmentShader: cubeFrag });
  const cubeFront = new T.Mesh(cubeGeo, cubeMat()), cubeMirror = new T.Mesh(cubeGeo, cubeMat());
  cubeMirror.material.uniforms.uRef = { value: 1 }; cubeMirror.scale.y = -1;
  cubeFront.frustumCulled = cubeMirror.frustumCulled = false;
  scene.add(cubeFront, cubeMirror);

  /* ---------------------------------------------------------------- post: glow, vignette, grain */
  const post = new T.Scene(), postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2)); quad.frustumCulled = false; post.add(quad);
  const pv = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const pass = (frag, uniforms) => new T.ShaderMaterial({ uniforms, vertexShader: pv, fragmentShader: frag, depthTest: false, depthWrite: false });
  const matBright = pass(`
    varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uTexel;
    void main(){
      vec3 c = texture2D(tIn, vUv + uTexel * vec2(-1.5, -1.5)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.5, -1.5)).rgb
             + texture2D(tIn, vUv + uTexel * vec2(-1.5, 1.5)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.5, 1.5)).rgb;
      c *= .25; float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(.22, .8, l), 1.);
    }`, { tIn: { value: null }, uTexel: { value: new T.Vector2() } });
  const matBlur = pass(`
    varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uDir;
    void main(){
      vec3 c = texture2D(tIn, vUv).rgb * .227027;
      c += (texture2D(tIn, vUv + uDir * 1.3846).rgb + texture2D(tIn, vUv - uDir * 1.3846).rgb) * .3162162;
      c += (texture2D(tIn, vUv + uDir * 3.2308).rgb + texture2D(tIn, vUv - uDir * 3.2308).rgb) * .0702703;
      gl_FragColor = vec4(c, 1.);
    }`, { tIn: { value: null }, uDir: { value: new T.Vector2() } });
  const matMix = pass(`
    varying vec2 vUv; uniform sampler2D tScene, tB1, tB2; uniform vec2 uRes; uniform float uBloom, uLight, uTime, uFlash; uniform vec3 uFlashCol;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      c += (texture2D(tB1, vUv).rgb * .85 + texture2D(tB2, vUv).rgb * 1.15) * uBloom;
      c = c / (1. + c * mix(.5, .08, uLight));
      vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
      float v = 1. - smoothstep(.3, 1.2, length(q));
      c *= mix(mix(.5, .96, v), mix(.88, 1., v), uLight);
      c += (hash(vUv * uRes + fract(uTime) * 91.7) - .5) * mix(.022, .012, uLight);
      c = mix(c, uFlashCol, uFlash);
      gl_FragColor = vec4(c, 1.);
    }`, { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uRes: { value: new T.Vector2(1, 1) }, uBloom: { value: .8 }, uLight: U.uLight, uTime: U.uTime, uFlash: { value: 0 }, uFlashCol: { value: new T.Color(1, 1, 1) } });

  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, type: T.UnsignedByteType, depthBuffer: false };
  let rtScene, rtA1, rtB1, rtA2, rtB2, vw = 1, vh = 1, dpr = 1;
  function resize() {
    vw = Math.max(1, innerWidth); vh = Math.max(1, innerHeight);
    dpr = Math.min(devicePixelRatio || 1, DPR[Q]);
    root.dataset.q = Q;                                           // the glass in the stylesheet blurs less when the picture has to be cheap
    renderer.setPixelRatio(dpr); renderer.setSize(vw, vh, false);
    const w = Math.max(2, Math.floor(vw * dpr)), h = Math.max(2, Math.floor(vh * dpr));
    [rtScene, rtA1, rtB1, rtA2, rtB2].forEach(r => r && r.dispose());
    const aa = Q === 0 || w * h > 3.2e6 ? 0 : Q >= 2 ? 4 : 2;     // smoother edges on the boxes, but not on very large or slow pictures
    rtScene = new T.WebGLRenderTarget(w, h, Object.assign({}, rtOpts, { depthBuffer: true, samples: aa }));
    cubeGeo.instanceCount = COUNT[Q];
    const q1 = [Math.max(2, w >> 2), Math.max(2, h >> 2)], q2 = [Math.max(2, w >> 3), Math.max(2, h >> 3)];
    rtA1 = new T.WebGLRenderTarget(q1[0], q1[1], rtOpts); rtB1 = new T.WebGLRenderTarget(q1[0], q1[1], rtOpts);
    rtA2 = new T.WebGLRenderTarget(q2[0], q2[1], rtOpts); rtB2 = new T.WebGLRenderTarget(q2[0], q2[1], rtOpts);
    matMix.uniforms.uRes.value.set(w, h);
    camera.aspect = vw / vh; setFov(camera.fov);
  }
  function setFov(f) {
    camera.fov = f;
    const wide = vw / vh > 1.2, shift = wide ? vw * clamp((vw - 900) / 1100, 0, 1) * .13 : 0;   // on wide screens the far end of the hall sits a little right of centre, beside the words
    camera.setViewOffset(vw, vh, -shift, 0, vw, vh);
    camera.updateProjectionMatrix();
    dustMat.uniforms.uPx.value = (vh * dpr) / (2 * Math.tan(f * Math.PI / 360));
  }
  const runPass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(post, postCam); };

  /* ---------------------------------------------------------------- the light / dark look */
  const isLight = () => root.dataset.theme ? root.dataset.theme === 'light' : !mqDark.matches;
  let light = isLight() ? 1 : 0, flip = null;
  function applyLook(v) {
    light = v;
    const pal = v ? PAL.light : PAL.dark, blend = v ? T.NormalBlending : T.AdditiveBlending;
    U.uLight.value = v;
    U.uFog.value.copy(v ? FOG.light : FOG.dark);
    renderer.setClearColor(v ? SKY.light : SKY.dark, 1);
    gates.forEach(g => { const c = hex(pal[g.key]); g.front.material.uniforms.uColor.value.copy(c); g.mirror.material.uniforms.uColor.value.copy(c); g.front.material.blending = g.mirror.material.blending = blend; });
    dustMat.blending = blend;
    gates.forEach((g, k) => { const c = hex(pal[g.key]); uC[k].set(c.r, c.g, c.b).multiplyScalar(v ? .85 : .5 * g.base); });
    ['brass', 'd1', 'd2', 'd3', 'd4'].forEach((k, i) => uPal[i].copy(hex(pal[k])));
    matMix.uniforms.uBloom.value = v ? .14 : .6;
  }
  function onTheme() {
    const want = isLight() ? 1 : 0;
    if (want === (flip ? flip.to : light)) return;
    if (still || !running) { flip = null; applyLook(want); drawOnce(); return; }
    flip = { to: want, t: 0, done: false };                         // the lamp clicks: a quick flash covers the swap
  }
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  if (mqDark.addEventListener) mqDark.addEventListener('change', onTheme);

  /* ---------------------------------------------------------------- scroll, mouse, camera */
  let docH = 1, zNow = 0, zPrev = 0, fovNow = 54, mx = 0, my = 0, smx = 0, smy = 0, born = 0, introT = still ? 1 : 0;
  const measure = () => { docH = Math.max(1, document.documentElement.scrollHeight - innerHeight); };

  /* ---------------------------------------------------------------- the boxes answer to the pointer
     Move over one (anywhere that is not text or a button) and it springs away from you, twists and flares, the ones around it get a nudge,
     and when you move off it settles back with a little bounce. A click or a tap sends a bigger ripple through the boxes nearby. */
  const SOLID = 'a,button,input,label,h1,h2,h3,h4,p,li,small,b,em,i,img,svg,.nav,.lamp,.behind,.card,.front,.door,.corridor,.stack,.lights,.foot,.room,.board';
  const ptr = { nx: 0, ny: 0, vx: 0, vy: 0, seen: false, air: false, touchAt: -1e9 };
  const bOff = new Float32Array(NB * 3), bVel = new Float32Array(NB * 3), bTgt = new Float32Array(NB * 3), live = new Set();
  const STIFF = 95, DAMP = 6.5;                                    // a spring that overshoots a little, so the box settles back with a bounce
  const rayO = new T.Vector3(), rayD = new T.Vector3(), pv3 = new T.Vector3();
  const cen = [0, 0, 0], dirA = [0, 0, 0], dirB = [0, 0, 0], lo = [0, 0, 0], ld = [0, 0, 0];
  let hov = -1;
  const aim = (e, move) => {
    const nx = e.clientX / vw * 2 - 1, ny = -(e.clientY / vh * 2 - 1);
    if (move && ptr.seen) { ptr.vx = ptr.vx * .5 + (nx - ptr.nx) * .5; ptr.vy = ptr.vy * .5 + (ny - ptr.ny) * .5; }   // which way the pointer is travelling
    ptr.nx = nx; ptr.ny = ny;
    ptr.air = !(e.target && e.target.closest && e.target.closest(SOLID));
  };
  const aimRay = () => { rayO.copy(camera.position); rayD.set(ptr.nx, ptr.ny, .5).unproject(camera).sub(rayO).normalize(); };
  const centreOf = (i, rest) => {                                  // where box i is right now (the same drift as in the vertex shader); "rest": where it would be without a push
    const b = all[i], k = U.uTime.value, o = rest ? 0 : 1;
    cen[0] = b.c[0] + o * bOff[i * 3] + Math.sin(k * .23 + b.p[3] * 9.1) * .12;
    cen[1] = b.c[1] + o * bOff[i * 3 + 1] + Math.sin(k * .31 + b.p[3] * 6.28) * .18;
    cen[2] = b.c[2] + o * bOff[i * 3 + 2];
  };
  const twistOf = i => Math.hypot(bOff[i * 3], bOff[i * 3 + 1], bOff[i * 3 + 2]) * 1.5 * Math.sign(all[i].a[3]);
  const unturn = (a, ang, x, y, z, out) => {                       // the vertex shader's turn, run backwards
    const c = Math.cos(ang), s = -Math.sin(ang), d = a[0] * x + a[1] * y + a[2] * z, k = 1 - c;
    out[0] = x * c + (a[1] * z - a[2] * y) * s + a[0] * d * k;
    out[1] = y * c + (a[2] * x - a[0] * z) * s + a[1] * d * k;
    out[2] = z * c + (a[0] * y - a[1] * x) * s + a[2] * d * k;
  };
  function hitT(i, rest) {                                         // how far along the pointer's line of sight box i is hit, or Infinity
    centreOf(i, rest);
    const dx = cen[0] - rayO.x, dy = cen[1] - rayO.y, dz = cen[2] - rayO.z, t = dx * rayD.x + dy * rayD.y + dz * rayD.z;
    if (t < .5 || t > 70) return Infinity;
    const b = all[i], pad = .06 + t * .004, R = .5 * Math.hypot(b.s[0], b.s[1], b.s[2]) + pad;
    if (dx * dx + dy * dy + dz * dz - t * t > R * R) return Infinity;
    const ang = b.p[0] + uSpin.value * b.a[3] + (rest ? 0 : twistOf(i));
    unturn(b.a, ang, -dx, -dy, -dz, lo); unturn(b.a, ang, rayD.x, rayD.y, rayD.z, ld);
    let t0 = -1e9, t1 = 1e9;
    for (let k = 0; k < 3; k++) {
      const h = b.s[k] * .5 + pad;
      if (Math.abs(ld[k]) < 1e-9) { if (Math.abs(lo[k]) > h) return Infinity; continue; }
      let u = (-h - lo[k]) / ld[k], w = (h - lo[k]) / ld[k];
      if (u > w) { const x = u; u = w; w = x; }
      t0 = Math.max(t0, u); t1 = Math.min(t1, w);
      if (t0 > t1) return Infinity;
    }
    return t1 < 0 ? Infinity : Math.max(t0, 0);
  }
  const pickNearest = () => { let best = -1, bt = Infinity; const n = COUNT[Q]; for (let i = 0; i < n; i++) { const t = hitT(i); if (t < bt) { bt = t; best = i; } } return best; };
  const awayFrom = (i, out) => {                                   // which way is "away from the pointer" for box i: sideways, out of its line of sight (when the pointer is on its middle: the way the pointer was travelling), and a little deeper
    centreOf(i);
    const b = all[i], dx = cen[0] - rayO.x, dy = cen[1] - rayO.y, dz = cen[2] - rayO.z, t = dx * rayD.x + dy * rayD.y + dz * rayD.z;
    const px = dx - rayD.x * t, py = dy - rayD.y * t, pz = dz - rayD.z * t, pl = Math.hypot(px, py, pz);
    const k = Math.min(1, pl / (.18 * Math.hypot(b.s[0], b.s[1], b.s[2]) + 1e-4));   // 0: the pointer is on the very middle, 1: clearly to one side of it
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
  const ripple = (i, s) => {                                       // the boxes around the one touched get a push too, fading with distance
    centreOf(i);
    const cx = cen[0], cy = cen[1], cz = cen[2], R = 3.2, n = COUNT[Q];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      centreOf(j);
      const dx = cen[0] - cx, dy = cen[1] - cy, dz = cen[2] - cz, d = Math.hypot(dx, dy, dz);
      if (d < R && d > 1e-3) { const f = 1 - d / R; dirB[0] = dx / d; dirB[1] = dy / d; dirB[2] = dz / d; kick(j, s * f * f, dirB); }
    }
  };
  const engage = i => {                                            // the pointer arrives on box i: it is held a little way off while the pointer stays, with a springy kick
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
      // a box that has been pushed away keeps the pointer while it is over where the box is, or where it was (otherwise a small box would dodge, come back, dodge again)
      h = hov >= 0 && hov < COUNT[Q] && (hitT(hov) < Infinity || hitT(hov, true) < Infinity) ? hov : pickNearest();
    }
    if (h === hov) return;
    if (hov >= 0) release(hov);
    hov = h;
    if (h >= 0) engage(h);
  }
  function tap() {                                                 // a click or a tap: a bigger kick, and a ripple through the boxes around
    aimRay(); const h = pickNearest();
    if (h < 0) return;
    awayFrom(h, dirA); kick(h, 8, dirA); ripple(h, 5);
  }
  function stepBoxes(dt) {                                         // the spring: pulled towards where it should rest, slowed by damping
    if (!live.size) return;
    const h = Math.min(dt, .05);
    for (const i of live) {
      let e = 0;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        bVel[j] += (STIFF * (bTgt[j] - bOff[j]) - DAMP * bVel[j]) * h; bOff[j] += bVel[j] * h;
        e += Math.abs(bOff[j]) + Math.abs(bVel[j]) + Math.abs(bTgt[j]);
      }
      if (e < 2e-3) { for (let k = 0; k < 3; k++) { bOff[i * 3 + k] = 0; bVel[i * 3 + k] = 0; } live.delete(i); aOArr.fill(0, i * 4, i * 4 + 4); }
      else { aOArr[i * 4] = bOff[i * 3]; aOArr[i * 4 + 1] = bOff[i * 3 + 1]; aOArr[i * 4 + 2] = bOff[i * 3 + 2]; aOArr[i * 4 + 3] = twistOf(i); }
    }
    aO.needsUpdate = true;
  }
  const screenOf = i => { centreOf(i); pv3.set(cen[0], cen[1], cen[2]).project(camera); return { x: (pv3.x * .5 + .5) * vw, y: (-pv3.y * .5 + .5) * vh, z: pv3.z }; };   // (used by the tests)
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || e.timeStamp - ptr.touchAt < 1200) return;   // a finger does not hover, and some browsers make up a mouse move right after a tap
    mx = clamp(e.clientX / vw * 2 - 1, -1, 1); my = clamp(e.clientY / vh * 2 - 1, -1, 1);
    aim(e, true); ptr.seen = true;
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') { ptr.seen = false; ptr.touchAt = e.timeStamp; }   // touch: let go of anything held under a pointer that is not really there
    aim(e); if (ptr.air && running && !still) tap();
  }, { passive: true });
  addEventListener('pointerup', e => { if (e.pointerType === 'touch') ptr.touchAt = e.timeStamp; }, { passive: true });
  addEventListener('scroll', () => { ptr.air = false; }, { passive: true });   // while the page scrolls the text moves under a resting pointer: wait for it to move again
  document.documentElement.addEventListener('mouseleave', () => { ptr.seen = false; });
  const scrollP = () => clamp(window.scrollY / docH, 0, 1);

  function place(dt, t) {
    const target = CAM_END * scrollP();
    if (dt > 0) zNow += (target - zNow) * (1 - Math.exp(-dt * 4.2));
    const vel = dt > 0 ? (zNow - zPrev) / dt : 0; zPrev = zNow;
    uSpin.value += dt * (1 + clamp(Math.abs(vel) * .12, 0, 2.5));   // the boxes turn faster while you fly
    const ease = 1 - Math.pow(1 - introT, 3);
    smx += (mx - smx) * (1 - Math.exp(-dt * 3)); smy += (my - smy) * (1 - Math.exp(-dt * 3));
    const calm = still ? 0 : 1;
    const x = smx * .45 * calm + Math.sin(t * .21) * .1 * calm, y = 1.65 - smy * .16 * calm + Math.sin(t * .17) * .035 * calm;
    const z = zNow + (1 - ease) * 5;
    camera.position.set(x, y, z);
    camera.rotation.set(-smy * .03 * calm - .012, -smx * .05 * calm + Math.sin(t * .13) * .008 * calm, 0);
    const wantFov = 54 + clamp(Math.abs(vel) * .2, 0, 14) + (1 - ease) * 14;
    fovNow += (wantFov - fovNow) * (1 - Math.exp(-dt * 5));
    setFov(still ? 54 : fovNow);
    camera.updateMatrixWorld();
    // the doorways: dim with distance, melt away as you pass through, and never draw behind you
    for (let k = 0; k < N; k++) {
      const g = gates[k], a = z - gz(k);
      const on = a > -.5;
      g.front.visible = g.mirror.visible = on;
      const v = on ? g.base * smooth(.4, 5, a) * Math.exp(-a * .017) * (1 + .05 * Math.sin(t * .6 + k)) : 0;
      g.front.material.uniforms.uInt.value = g.mirror.material.uniforms.uInt.value = v;
      uI[k] = (on ? 1 : .6) * g.base * (1 + .05 * Math.sin(t * .6 + k));
    }
  }

  /* ---------------------------------------------------------------- drawing */
  function draw() {
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    let b2 = 0;
    if (Q >= 1) {
      matBright.uniforms.tIn.value = rtScene.texture; matBright.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height);
      runPass(matBright, rtA1);
      matBlur.uniforms.tIn.value = rtA1.texture; matBlur.uniforms.uDir.value.set(1 / rtA1.width, 0); runPass(matBlur, rtB1);
      matBlur.uniforms.tIn.value = rtB1.texture; matBlur.uniforms.uDir.value.set(0, 1 / rtB1.height); runPass(matBlur, rtA1);
      if (Q >= 2) {
        matBlur.uniforms.tIn.value = rtA1.texture; matBlur.uniforms.uDir.value.set(1.5 / rtA2.width, 0); runPass(matBlur, rtA2);
        matBlur.uniforms.tIn.value = rtA2.texture; matBlur.uniforms.uDir.value.set(1 / rtA2.width, 0); runPass(matBlur, rtB2);
        matBlur.uniforms.tIn.value = rtB2.texture; matBlur.uniforms.uDir.value.set(0, 1 / rtB2.height); runPass(matBlur, rtA2);
        b2 = 1;
      }
    }
    const m = matMix.uniforms;
    m.tScene.value = rtScene.texture; m.tB1.value = Q >= 1 ? rtA1.texture : rtScene.texture; m.tB2.value = b2 ? rtA2.texture : rtA1.texture;
    m.uBloom.value = Q === 0 ? 0 : (light ? .14 : (Q === 1 ? .55 : .6)) * (b2 ? 1 : 1.25);
    runPass(matMix, null);
  }
  const drawOnce = () => { place(0, 0); draw(); };

  /* ---------------------------------------------------------------- the loop */
  let running = false, raf = 0, last = 0, t = 0, frames = 0, acc = 0, accN = 0, firstDone = false;
  const covered = () => !!roomEl && !roomEl.hidden && !document.querySelector('.stage');   // a room fully covers the page: nothing to draw
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || covered()) { last = 0; return; }
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now; t += dt;
    if (!born) born = now;
    introT = clamp((now - born) / 2600, 0, 1);
    if (flip) {
      flip.t += dt / .8;
      const k = clamp(flip.t, 0, 1), amp = Math.pow(Math.sin(Math.PI * k), 1.4) * .9;
      matMix.uniforms.uFlash.value = amp; matMix.uniforms.uFlashCol.value.setScalar(flip.to ? 1 : 0);
      if (!flip.done && flip.t >= .5) { flip.done = true; applyLook(flip.to); }
      if (flip.t >= 1) { flip = null; matMix.uniforms.uFlash.value = 0; }
    }
    U.uTime.value = t;
    place(dt, t); stepBoxes(dt); hoverTick(); draw();
    frames++;
    if (!firstDone) { firstDone = true; root.classList.add('gl-on'); root.dataset.gl = 'on'; }
    // a slow computer asks for less: if frames keep taking too long, draw fewer pixels
    if (forced < 0 && frames > 40 && dt > 0) {
      acc += dt; accN++;
      if (accN >= 45) { if (acc / accN > .036 && Q > 0) { Q--; resize(); } acc = 0; accN = 0; }
    }
  }
  function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------------------------------------------------------------- go */
  try {
    measure(); applyLook(light); resize(); dustGeo.setDrawRange(0, DUST[Q]);
    if (still) { drawOnce(); root.classList.add('gl-on'); root.dataset.gl = 'still'; }
    else start();
  } catch (e) { root.classList.add('gl-off'); stop(); return; }
  const onResize = () => { measure(); resize(); if (still || !running) drawOnce(); };
  addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
  mqReduce.addEventListener && mqReduce.addEventListener('change', () => location.reload());
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); root.classList.remove('gl-on'); root.classList.add('gl-off'); root.dataset.gl = 'lost'; });
  canvas.addEventListener('webglcontextrestored', () => { root.classList.remove('gl-off'); resize(); applyLook(light); root.dataset.gl = still ? 'still' : 'on'; root.classList.add('gl-on'); still ? drawOnce() : start(); });

  window.__hall = {
    get frames() { return frames; }, get quality() { return Q; }, get light() { return light; }, get z() { return zNow; }, get running() { return running; },
    get hover() { return hov; }, get moving() { return live.size; }, get boxes() { return COUNT[Q]; }, get air() { return ptr.air; }, get seen() { return ptr.seen; }, screenOf,
    off: i => [bOff[i * 3], bOff[i * 3 + 1], bOff[i * 3 + 2]]
  };
})();
