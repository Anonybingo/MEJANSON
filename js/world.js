/* The background: a frozen world, drawn with Three.js (js/three.min.js is a trimmed copy of the library: nothing to install).
   Snow falls through cold fog over a field of ice columns that rise and sink around the pointer. Blocks of stone and ice float above it,
   scatter and gather as you scroll, and at the bottom of the page a tunnel of blocks spirals away into the dark.
   This file is the shared base: the graphics context, the quality levels, the colours for day and night, a noise picture, the camera and the glow pass.
   Then each part adds itself: sky and snow (81), terrain (82), blocks (83), the tunnel (84), and the loop that runs it all (85).
   Everything else on the page floats over it as glass (see the glass rules in the stylesheet).
   No WebGL: the page keeps a calm gradient. "Reduce motion": one still frame. A slow computer: it draws less by itself. */
const HALL = window.HALL = { ok: false, systems: [] };
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
  const lerp = (a, b, k) => a + (b - a) * k;
  /* colours are written as they should look on the screen: no conversion on the way in */
  const rgb = (h, k = 1) => { const n = parseInt(h.slice(1), 16); return new T.Color().setRGB(((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k); };

  /* ---------------------------------------------------------------- the graphics context */
  /* ask the browser for the context ourselves: when there is none (WebGL switched off, an old device) we fall back quietly, with nothing printed to the console */
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
  const DPR = [1, 1.25, 1.75];
  const st = {
    Q: forced >= 0 ? forced : (coarse || weak ? 1 : 2),            // 2 full, 1 lighter, 0 lightest
    forced, coarse, still: mqReduce.matches,
    vw: 1, vh: 1, dpr: 1, t: 0, dt: 0, light: 0,
    z: 0, zv: 0, mx: 0, my: 0, smx: 0, smy: 0, intro: mqReduce.matches ? 1 : 0,
    fov: 54, shift: 0, lens: 0, sec: 0, gust: 0, rush: 0,
    vortex: 0,                                                     // how much of the tunnel is showing (set by 84)
    lean: [0, 0]                                                   // where the pointer leans the camera
  };
  const ptr = { nx: 0, ny: 0, vx: 0, vy: 0, seen: false, air: false, touchAt: -1e9 };   // the pointer: where it is, which way it moves, whether it is over open background (the loop in 85 fills it in)

  /* ---------------------------------------------------------------- colours: polar night (the dark switch) and overcast day (the light switch) */
  const LOOK = {
    dark: {
      skyT: '#04070F', skyM: '#0C1833', skyH: '#2F466C', fog: '#2A3F63', fogD: .016,
      key: ['#A8C2FF', .72], keyDir: [.55, .5, -.45], amb: ['#3B5688', .55], gnd: ['#121A2E', .7],
      snow: '#B4C6E2', rockA: '#232C42', rockB: '#44536F', ice: '#86C4FF', amber: '#FFB056',
      glow: 1, stars: 1, sun: ['#9DBBFF', .55, [.2366, .2079, -.949]], core: '#02040A', bloom: .6
    },
    light: {
      skyT: '#8EA3BA', skyM: '#BFCEDC', skyH: '#E8EDF1', fog: '#DCE4EB', fogD: .012,
      key: ['#FFF3E0', .85], keyDir: [.55, .5, -.45], amb: ['#9DB3CC', .78], gnd: ['#7F90A5', .7],
      snow: '#F2F6FA', rockA: '#7A8AA0', rockB: '#A9B7C7', ice: '#9ED2F5', amber: '#FFB766',
      glow: .22, stars: 0, sun: ['#FFF1D6', .8, [.2366, .2079, -.949]], core: '#6A7E94', bloom: .14
    }
  };
  const U = {                                                      // values every material reads
    uTime: { value: 0 }, uLight: { value: 0 }, uFog: { value: new T.Color() }, uFogD: { value: .0125 },
    uKey: { value: new T.Color() }, uKeyDir: { value: new T.Vector3(.55, .5, -.45).normalize() },
    uAmb: { value: new T.Color() }, uGnd: { value: new T.Color() }, uSnow: { value: new T.Color() },
    uRockA: { value: new T.Color() }, uRockB: { value: new T.Color() }, uIce: { value: new T.Color() }, uAmber: { value: new T.Color() },
    uSkyT: { value: new T.Color() }, uSkyM: { value: new T.Color() }, uSkyH: { value: new T.Color() }, uSunCol: { value: new T.Color() }, uSunDir: { value: new T.Vector3(.2366, .2079, -.949) },
    uGlowK: { value: 1 }, uStars: { value: 1 }, uWind: { value: new T.Vector3() }, uPx: { value: 600 }, tNoise: { value: null },
    uCoreCol: { value: new T.Color() }                              // the dark at the end of the tunnel (and what the tunnel's mist fades to)
  };

  /* ---------------------------------------------------------------- shared shader pieces */
  const GLSL = {
    /* one small picture of noise, drawn once at the start (see bakeNoise): the stone, the snow and the ice all read their grain from it */
    noise: `
      uniform sampler2D tNoise;
      vec4 nz(vec2 uv){ return texture2D(tNoise, fract(uv)); }
      vec4 tri(vec3 p, vec3 n){                                    // the picture, wrapped onto a solid from three sides
        vec3 w = pow(abs(n), vec3(5.)); w /= (w.x + w.y + w.z);
        return nz(p.zy) * w.x + nz(p.xz) * w.y + nz(p.xy) * w.z;
      }`,
    /* light and mist, the same for every surface */
    light: `
      uniform float uTime, uLight, uGlowK, uFogD; uniform vec3 uFog, uKey, uKeyDir, uAmb, uGnd, uSnow, uRockA, uRockB, uIce, uAmber;
      vec3 lightIt(vec3 alb, vec3 N, vec3 V, float spec, float shin, float ao){
        float lit = max(dot(N, uKeyDir), 0.);
        vec3 hemi = mix(uGnd, uAmb, .5 + .5 * N.y);
        vec3 col = alb * (uKey * lit + hemi) * ao;
        vec3 Hh = normalize(uKeyDir + V);
        col += uKey * pow(max(dot(N, Hh), 0.), shin) * spec * lit;
        col += uAmb * pow(1. - max(dot(N, V), 0.), 3.) * spec * .5 * ao;      // a cold rim where a surface turns away
        return col;
      }
      float fogAmt(vec3 P){ float d = distance(P, cameraPosition); return 1. - exp(-pow(d * uFogD, 1.3)); }`
  };

  /* ---------------------------------------------------------------- the picture of noise */
  const post = new T.Scene(), postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2)); quad.frustumCulled = false; post.add(quad);
  const pv = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const pass = (frag, uniforms) => new T.ShaderMaterial({ uniforms, vertexShader: pv, fragmentShader: frag, depthTest: false, depthWrite: false });
  const runPass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(post, postCam); };
  const noiseRT = new T.WebGLRenderTarget(256, 256, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, type: T.UnsignedByteType, depthBuffer: false });
  U.tNoise.value = noiseRT.texture;
  const matNoise = pass(`
    varying vec2 vUv;
    float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float pn(vec2 p, float per){                                    // value noise that repeats every "per" steps, so the picture tiles
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      vec2 a = mod(i, per), b = mod(i + 1., per);
      return mix(mix(h21(a), h21(vec2(b.x, a.y)), f.x), mix(h21(vec2(a.x, b.y)), h21(b), f.x), f.y);
    }
    float fb(vec2 p, float per, float s){ float a = 0., w = .5; for (int k = 0; k < 5; k++) { a += w * pn(p + s * 17.3, per); p *= 2.; per *= 2.; w *= .5; } return a / .96875; }
    void main(){
      vec2 p = vUv;
      float r = fb(p * 6., 6., 0.), g = fb(p * 10., 10., 1.), c = fb(p * 5., 5., 2.);
      c = 1. - abs(2. * c - 1.);                                    // ridges: where it is near 1 there is a crack
      gl_FragColor = vec4(r, g, c, pn(p * 128., 128.));
    }`, {});
  const bakeNoise = () => runPass(matNoise, noiseRT);

  /* ---------------------------------------------------------------- scene, camera */
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(54, 1, 0.1, 500); camera.rotation.order = 'YXZ';
  const rigCam = new T.PerspectiveCamera(54, 1, 0.1, 500); rigCam.rotation.order = 'YXZ';   // the same camera without the pointer's lean: loose blocks are laid out through it
  const TRAVEL = 150, CAM_Y = 4.4, PITCH = -.075;                  // how far the camera flies over the whole page, how high it is, and how far it looks down

  /* ---------------------------------------------------------------- post: glow, vignette, grain */
  const matBright = pass(`
    varying vec2 vUv; uniform sampler2D tIn; uniform vec2 uTexel;
    void main(){
      vec3 c = texture2D(tIn, vUv + uTexel * vec2(-1.5, -1.5)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.5, -1.5)).rgb
             + texture2D(tIn, vUv + uTexel * vec2(-1.5, 1.5)).rgb + texture2D(tIn, vUv + uTexel * vec2(1.5, 1.5)).rgb;
      c *= .25; float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(.3, .9, l), 1.);
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
    varying vec2 vUv; uniform sampler2D tScene, tB1, tB2; uniform vec2 uRes; uniform float uBloom, uLight, uTime, uFlash, uCore; uniform vec3 uFlashCol, uCoreCol; uniform vec2 uCoreAt;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      c += (texture2D(tB1, vUv).rgb * .85 + texture2D(tB2, vUv).rgb * 1.15) * uBloom;
      c = c / (1. + c * mix(.5, .08, uLight));
      vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
      float r = length(q);
      float v = 1. - smoothstep(.3, 1.2, r);
      c *= mix(mix(.55, .97, v), mix(.9, 1., v), uLight);
      vec2 q2 = (vUv - uCoreAt) * vec2(uRes.x / uRes.y, 1.);
      c = mix(c, uCoreCol, uCore * exp(-dot(q2, q2) * 13.) * .92);    // the dark at the far end of the tunnel
      c += (hash(vUv * uRes + fract(uTime) * 91.7) - .5) * mix(.022, .012, uLight);
      c = mix(c, uFlashCol, uFlash);
      gl_FragColor = vec4(c, 1.);
    }`, { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uRes: { value: new T.Vector2(1, 1) }, uBloom: { value: .6 }, uLight: U.uLight, uTime: U.uTime,
          uFlash: { value: 0 }, uFlashCol: { value: new T.Color(1, 1, 1) }, uCore: { value: 0 }, uCoreCol: U.uCoreCol, uCoreAt: { value: new T.Vector2(.5, .5) } });

  const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, type: T.UnsignedByteType, depthBuffer: false };
  let rtScene, rtA1, rtB1, rtA2, rtB2;
  function resize() {
    st.vw = Math.max(1, innerWidth); st.vh = Math.max(1, innerHeight);
    st.dpr = Math.min(devicePixelRatio || 1, DPR[st.Q]);
    root.dataset.q = st.Q;                                         // the glass in the stylesheet blurs less when the picture has to be cheap
    renderer.setPixelRatio(st.dpr); renderer.setSize(st.vw, st.vh, false);
    const w = Math.max(2, Math.floor(st.vw * st.dpr)), h = Math.max(2, Math.floor(st.vh * st.dpr));
    [rtScene, rtA1, rtB1, rtA2, rtB2].forEach(r => r && r.dispose());
    const aa = st.Q === 0 || w * h > 3.2e6 ? 0 : st.Q >= 2 ? 4 : 2;   // smoother edges on the blocks, but not on very large or slow pictures
    rtScene = new T.WebGLRenderTarget(w, h, Object.assign({}, rtOpts, { depthBuffer: true, samples: aa }));
    const q1 = [Math.max(2, w >> 2), Math.max(2, h >> 2)], q2 = [Math.max(2, w >> 3), Math.max(2, h >> 3)];
    rtA1 = new T.WebGLRenderTarget(q1[0], q1[1], rtOpts); rtB1 = new T.WebGLRenderTarget(q1[0], q1[1], rtOpts);
    rtA2 = new T.WebGLRenderTarget(q2[0], q2[1], rtOpts); rtB2 = new T.WebGLRenderTarget(q2[0], q2[1], rtOpts);
    matMix.uniforms.uRes.value.set(w, h);
    camera.aspect = rigCam.aspect = st.vw / st.vh; setFov(camera.fov);
    HALL.systems.forEach(s => s.resize && s.resize());
  }
  function setFov(f) {
    st.fov = camera.fov = rigCam.fov = f;
    const wide = st.vw / st.vh > 1.2; st.shift = wide ? st.vw * clamp((st.vw - 900) / 1100, 0, 1) * .13 : 0;   // on wide screens the middle of the picture sits a little right of centre, beside the words
    const oy = -st.lens * st.vh;                                   // while the tunnel is open the picture slides down a little, so the tunnel opens below the contact card and not behind it
    camera.setViewOffset(st.vw, st.vh, -st.shift, oy, st.vw, st.vh); rigCam.setViewOffset(st.vw, st.vh, -st.shift, oy, st.vw, st.vh);
    camera.updateProjectionMatrix(); rigCam.updateProjectionMatrix();
    U.uPx.value = (st.vh * st.dpr) / (2 * Math.tan(f * Math.PI / 360));
  }

  /* ---------------------------------------------------------------- the light / dark look */
  const isLight = () => root.dataset.theme ? root.dataset.theme === 'light' : !mqDark.matches;
  st.light = isLight() ? 1 : 0;
  function applyLook(v) {
    st.light = v;
    const L = v ? LOOK.light : LOOK.dark;
    U.uLight.value = v;
    U.uFog.value.copy(rgb(L.fog)); U.uFogD.value = L.fogD;
    U.uKey.value.copy(rgb(L.key[0], L.key[1])); U.uKeyDir.value.set(...L.keyDir).normalize();
    U.uAmb.value.copy(rgb(L.amb[0], L.amb[1])); U.uGnd.value.copy(rgb(L.gnd[0], L.gnd[1]));
    U.uSnow.value.copy(rgb(L.snow)); U.uRockA.value.copy(rgb(L.rockA)); U.uRockB.value.copy(rgb(L.rockB));
    U.uIce.value.copy(rgb(L.ice)); U.uAmber.value.copy(rgb(L.amber));
    U.uSkyT.value.copy(rgb(L.skyT)); U.uSkyM.value.copy(rgb(L.skyM)); U.uSkyH.value.copy(rgb(L.skyH)); U.uSunCol.value.copy(rgb(L.sun[0], L.sun[1])); U.uSunDir.value.set(...L.sun[2]).normalize();
    U.uGlowK.value = L.glow; U.uStars.value = L.stars;
    renderer.setClearColor(rgb(L.fog), 1);
    U.uCoreCol.value.copy(rgb(L.core));
    HALL.systems.forEach(s => s.look && s.look(v));
  }

  /* ---------------------------------------------------------------- scroll, pointer, camera */
  let docH = 1, zPrev = 0, born = 0;
  const secEls = ['.hero', '#doors', '#work', '#story', '#contact'].map(q => document.querySelector(q));
  const measure = () => { docH = Math.max(1, document.documentElement.scrollHeight - innerHeight); };
  const scrollP = () => clamp(window.scrollY / docH, 0, 1);
  const sections = () => {                                         // which section the middle of the screen is in: 0 hero, 1 doors, 2 work, 3 story, 4 contact (with the part-way through as a fraction)
    const line = innerHeight * .5; let s = 0;
    secEls.forEach((el, k) => { if (!el) return; const r = el.getBoundingClientRect(); if (r.top <= line) s = k + clamp((line - r.top) / Math.max(1, r.height), 0, .999); });
    return s;
  };
  function breeze(t) {                                             // a steady wind with gusts: the snow, the blocks and the columns all lean the same way
    const g = .5 + .5 * Math.sin(t * .13 + Math.sin(t * .031) * 2), g2 = .5 + .5 * Math.sin(t * .47 + 1.3);
    const s = .7 + 1.4 * g * g + .5 * g2 * g;
    st.gust = clamp((s - .7) / 1.9, 0, 1);
    U.uWind.value.set(s * .9, 0, s * .35);
  }
  function place(dt, t) {
    const target = -TRAVEL * scrollP();
    if (dt > 0) st.z += (target - st.z) * (1 - Math.exp(-dt * 4.2));
    const vel = dt > 0 ? (st.z - zPrev) / dt : 0; zPrev = st.z; st.zv = vel;
    const ease = 1 - Math.pow(1 - st.intro, 3);
    st.smx += (st.mx - st.smx) * (1 - Math.exp(-dt * 3)); st.smy += (st.my - st.smy) * (1 - Math.exp(-dt * 3));
    const calm = st.still ? 0 : 1;
    const x = st.smx * .55 * calm + Math.sin(t * .21) * .12 * calm, y = CAM_Y + st.vortex * 2.1 - st.smy * .2 * calm + Math.sin(t * .17) * .05 * calm;   // (it rises a little while the tunnel is open, so the tunnel is not half under the ground)
    const z = st.z + (1 - ease) * 7 - st.vortex * 3.2;             // inside the tunnel the camera has moved on a little
    camera.position.set(x, y, z);
    camera.rotation.set(PITCH - st.smy * .03 * calm, -st.smx * .05 * calm + Math.sin(t * .13) * .008 * calm, Math.sin(t * .07) * .004 * calm + st.vortex * Math.sin(t * .31) * .035);
    rigCam.position.set(0, CAM_Y, st.z); rigCam.rotation.set(PITCH, 0, 0);
    st.lens = st.still ? 0 : st.vortex * .2;
    const wantFov = 54 + clamp(Math.abs(vel) * .16, 0, 12) + (1 - ease) * 14 + st.vortex * 7 + st.rush * 9;
    st.fov += (wantFov - st.fov) * (1 - Math.exp(-dt * 5));
    setFov(st.still ? 54 : st.fov);
    camera.updateMatrixWorld(); rigCam.updateMatrixWorld();
    st.lean[0] = st.smx; st.lean[1] = st.smy;
  }

  /* ---------------------------------------------------------------- drawing */
  renderer.info.autoReset = false;                                 // so the counters cover a whole picture (the scene and the glow passes), not just the last pass
  function draw() {
    renderer.info.reset();
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    let b2 = 0;
    if (st.Q >= 1) {
      matBright.uniforms.tIn.value = rtScene.texture; matBright.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height);
      runPass(matBright, rtA1);
      matBlur.uniforms.tIn.value = rtA1.texture; matBlur.uniforms.uDir.value.set(1 / rtA1.width, 0); runPass(matBlur, rtB1);
      matBlur.uniforms.tIn.value = rtB1.texture; matBlur.uniforms.uDir.value.set(0, 1 / rtB1.height); runPass(matBlur, rtA1);
      if (st.Q >= 2) {
        matBlur.uniforms.tIn.value = rtA1.texture; matBlur.uniforms.uDir.value.set(1.5 / rtA2.width, 0); runPass(matBlur, rtA2);
        matBlur.uniforms.tIn.value = rtA2.texture; matBlur.uniforms.uDir.value.set(1 / rtA2.width, 0); runPass(matBlur, rtB2);
        matBlur.uniforms.tIn.value = rtB2.texture; matBlur.uniforms.uDir.value.set(0, 1 / rtB2.height); runPass(matBlur, rtA2);
        b2 = 1;
      }
    }
    const m = matMix.uniforms, L = st.light ? LOOK.light : LOOK.dark;
    m.tScene.value = rtScene.texture; m.tB1.value = st.Q >= 1 ? rtA1.texture : rtScene.texture; m.tB2.value = b2 ? rtA2.texture : rtA1.texture;
    m.uBloom.value = st.Q === 0 ? 0 : L.bloom * (st.Q === 1 ? .9 : 1) * (b2 ? 1 : 1.25);
    m.uCore.value = st.vortex * (st.light ? .55 : 1);
    runPass(matMix, null);
  }

  /* give back everything the core holds on the graphics card: the picture buffers, the baked noise and the passes (each part frees its own shapes and materials the same way) */
  const dispose = () => {
    [rtScene, rtA1, rtB1, rtA2, rtB2, noiseRT].forEach(r => r && r.dispose());
    [matNoise, matBright, matBlur, matMix].forEach(m => m.dispose());
    quad.geometry.dispose();
  };

  Object.assign(HALL, {
    ok: true, T, root, canvas, renderer, scene, camera, rigCam, roomEl, U, st, ptr, GLSL, LOOK, mqReduce, mqDark,
    clamp, smooth, lerp, rgb, post, matMix, pass, runPass, bakeNoise, resize, setFov, applyLook, isLight, measure, scrollP, sections, breeze, place, draw, dispose,
    TRAVEL, CAM_Y, PITCH, first: () => { measure(); applyLook(st.light); bakeNoise(); resize(); },
    get born() { return born; }, set born(v) { born = v; }
  });
})();
