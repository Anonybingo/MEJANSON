/* The background. A long hall of lit doorways, drawn with Three.js (js/three.min.js is a trimmed copy of the library: nothing to install).
   Scrolling flies the camera down the hall, the mouse leans it a little, and the lamp's light/dark switch changes the whole hall.
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
    rtScene = new T.WebGLRenderTarget(w, h, Object.assign({}, rtOpts, { depthBuffer: true }));
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
  addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; mx = clamp(e.clientX / vw * 2 - 1, -1, 1); my = clamp(e.clientY / vh * 2 - 1, -1, 1); }, { passive: true });
  const scrollP = () => clamp(window.scrollY / docH, 0, 1);

  function place(dt, t) {
    const target = CAM_END * scrollP();
    if (dt > 0) zNow += (target - zNow) * (1 - Math.exp(-dt * 4.2));
    const vel = dt > 0 ? (zNow - zPrev) / dt : 0; zPrev = zNow;
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
    place(dt, t); draw();
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

  window.__hall = { get frames() { return frames; }, get quality() { return Q; }, get light() { return light; }, get z() { return zNow; }, get running() { return running; } };
})();
