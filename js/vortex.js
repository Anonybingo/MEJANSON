/* The tunnel: rings of blocks that hang in a spiral round the camera and drift towards you, with a deepening dark at the far end.
   It does not stay on screen. It opens at the bottom of the page behind the contact card, and for a moment when you step through a door into a room
   (it opens and rushes past you), and again, running backwards, when you step back out. In between it is not drawn at all.
   The blocks of the scene are drawn into its spiral while it is open (see 83), so it feels like the same stones, gathered. */
(() => {
  const H = window.HALL; if (!H || !H.ok || !H.roundedBox) return;
  const { T, scene, camera, U, st, GLSL, clamp, smooth, lerp, ROUND, matMix } = H;

  const TUN = [16, 24, 32], PER = 14, MAXN = TUN[2] * PER, LEN = 51;          // rings at each quality, blocks in a ring, and how far the tunnel reaches
  const geo = H.roundedBox(3);                                                 // a rougher shape than the blocks have: there are many of them and they are small
  {
    let seed = 7741;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let a = Math.imul(seed ^ seed >>> 15, 1 | seed); a = a + Math.imul(a ^ a >>> 7, 61 | a) ^ a; return ((a ^ a >>> 14) >>> 0) / 4294967296; };
    const v = new Float32Array(MAXN * 4);
    for (let r = 0; r < TUN[2]; r++) for (let j = 0; j < PER; j++) v.set([r, j / PER, rnd(), rnd()], (r * PER + j) * 4);
    geo.setAttribute('aV', new T.InstancedBufferAttribute(v, 4));
  }
  const uTun = { value: new T.Vector3(32, 1.6, 2.5) }, uTravel = { value: 0 }, uTwist = { value: 0 }, uAmt = { value: 0 };
  const vert = `
    const float ROUND = ${ROUND.toFixed(3)};
    attribute vec3 aSg; attribute vec4 aV;
    uniform float uTravel, uTwist, uAmt, uTime; uniform vec3 uTun;           // uTun: rings, the gap between rings, how close the first ring is
    varying vec3 vW; varying vec3 vNw; varying vec3 vLoc; varying vec3 vLn; varying vec4 vM; varying vec2 vF;
    mat3 turn(vec3 k, float a){
      float c = cos(a), s = sin(a), t = 1. - c;
      return mat3(c + k.x*k.x*t,       k.x*k.y*t + k.z*s, k.x*k.z*t - k.y*s,
                  k.x*k.y*t - k.z*s,   c + k.y*k.y*t,     k.y*k.z*t + k.x*s,
                  k.x*k.z*t + k.y*s,   k.y*k.z*t - k.x*s, c + k.z*k.z*t);
    }
    void main(){
      float span = uTun.x * uTun.y;
      float d = mod(aV.x * uTun.y - uTravel, span), f = d / span;               // how far ahead of the camera: the rings stream towards you as uTravel grows, and wrap round at the back
      float ang = (aV.y + aV.x * .0836) * 6.28318 + uTwist * (.5 + .5 * f) + d * .045 + aV.z * .35;   // the spiral
      float rad = mix(6.4, 2.7, smoothstep(0., 1., f)) * (1. + .12 * (aV.w - .5)) + sin(d * .21 + uTime * .3) * .35;   // a funnel: narrower towards the far end
      vec3 rh = vec3(cos(ang), sin(ang), 0.), th = vec3(-sin(ang), cos(ang), 0.);
      mat3 R = mat3(rh, th, vec3(0., 0., 1.)) * turn(vec3(1., 0., 0.), (aV.z - .5) * 1.3 + sin(uTime * .21 + aV.w * 9.) * .12);   // lined up with the tunnel, then tipped a little each
      float reveal = smoothstep(f * .7, f * .7 + .3, uAmt) * smoothstep(.07, .3, f) * (1. - smoothstep(.9, 1., f));   // it opens from the near end, and each block grows into place (the nearest are still small: they have only just come into view)
      vec3 sz = vec3(1., 1.15, 1.35) * (.9 + 1.1 * aV.w) * (uTun.y / 1.6) * (.6 + .85 * f) * reveal;
      vec3 hs = sz * .5; float rr = min(sz.x, min(sz.y, sz.z)) * ROUND;
      vec3 lp = aSg * (hs - rr) + position * rr;
      vec4 w = vec4(R * lp + vec3(rh.xy * rad, 0.) + cameraPosition + vec3(0., 0., -(d + uTun.z)), 1.);
      vW = w.xyz; vNw = R * position; vLoc = lp; vLn = position; vF = vec2(f, ang);
      vM = vec4(aV.w < .55 ? 0. : aV.w < .88 ? 1. : 2., aV.z > .86 ? (aV.z > .955 ? 2. : 1.) : 0., aV.z, aV.w * 6.28);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const frag = `
    varying vec3 vW; varying vec3 vNw; varying vec3 vLoc; varying vec3 vLn; varying vec4 vM; varying vec2 vF;
    uniform vec3 uCoreCol;
    ${GLSL.noise}
    ${GLSL.light}
    void main(){
      vec3 N = normalize(vNw), V = normalize(cameraPosition - vW), nl = normalize(vLn), a = abs(nl);
      float f = vF.x;
      float bev = 1. - max(a.x, max(a.y, a.z)), ridge = smoothstep(.1, .34, bev);
      float kind = vM.x, ice = step(.5, kind) * step(kind, 1.5);
      vec4 c1 = tri(vLoc * .5 + vM.z * 17., nl);
      float lift = mix(3., 1., uLight);
      vec3 alb = kind < .5 ? mix(uRockA, uRockB, smoothstep(.25, .75, c1.r)) * (.8 + .4 * c1.g) * lift
               : ice > .5 ? mix(uIce * .75, vec3(1.), smoothstep(.25, .85, c1.r))
               : uRockA * (.7 + .5 * c1.g) * lift * .9;
      if (ice < .5) alb = mix(vec3(dot(alb, vec3(.3, .5, .2))), alb, .62);
      float dist = distance(vW, cameraPosition);
      float lamp = 1. / (1. + dist * dist * .0045);                            // a lantern carried by the viewer: it lights what is near and gives out with distance
      float facing = max(dot(N, V), 0.);
      vec3 col = alb * (uKey * (.3 + 1.1 * facing) * (.35 + .65 * lamp) + uAmb * (1.55 + .7 * facing) + uIce * .12 * lamp);
      col += uIce * pow(1. - facing, 2.4) * (.4 + .6 * lamp) * (.7 + ice * .5);   // a cold rim
      // light that runs down the spiral: bright streaks that travel away from you
      float run = pow(.5 + .5 * sin(f * 38. - uTime * 2.4 + vF.y * 2.), 7.);
      col += uIce * run * (.3 + .6 * ridge) * (1. - .5 * uLight) * smoothstep(.0, .25, f);
      float pulse = .75 + .25 * sin(uTime * (.8 + vM.z * 1.6) + vM.w);
      col += step(.5, vM.y) * (vM.y > 1.5 ? uAmber : uIce) * (.35 + .9 * pow(c1.b, 4.) + ridge * .8 + .5 * (1. - facing)) * pulse * uGlowK;
      vec3 mist = mix(uFog * .42, uCoreCol, smoothstep(.3, .95, f));               // far away it is lost in a cold mist, and at the very end in the dark
      col = mix(col, mist, clamp(1. - exp(-pow(dist * .032, 1.4)), 0., .95));
      gl_FragColor = vec4(col, 1.);
    }`;
  const mat = new T.ShaderMaterial({ uniforms: Object.assign({ uTun, uTravel, uTwist, uAmt }, U), vertexShader: vert, fragmentShader: frag });
  const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);

  /* ---- when it is open: how much, and how fast it rushes (rush: 1 rushing towards you, -1 backwards, 0 a quiet drift) */
  const el = { front: document.querySelector('.front') };
  let fxTarget = 0, fxRate = 3, rushTarget = 0, travel = 0, twist = 0, warm = false;
  const tv = new T.Vector3();
  H.fx = {
    /* step into the tunnel (a door was clicked): it opens fully and rushes towards you. Gives back how long the rush needs, in milliseconds. */
    dive(ms) { if (st.still) return 0; fxTarget = 1; fxRate = 3000 / (ms || 700); rushTarget = 1; return ms || 700; },
    /* come back out (a room is closing): the tunnel is open, runs backwards, and closes */
    surface(ms) { if (st.still) return 0; st.vortex = Math.max(st.vortex, .96); st.rush = -1; rushTarget = 0; fxTarget = 0; fxRate = 3000 / (ms || 900); return ms || 900; },
    clear() { fxTarget = 0; rushTarget = 0; fxRate = 3; }
  };
  H.vortexInfo = () => geo.instanceCount;

  H.systems.push({
    name: 'vortex',
    quality() { const k = TUN[st.Q]; geo.instanceCount = k * PER; uTun.value.set(k, LEN / k, 2.5); },
    update(dt, t) {
      // the very first picture draws the tunnel once while it is still closed (every block has no size yet): the graphics card gets its program ready now, not in the middle of the walk through a door
      if (!warm) { warm = true; mesh.visible = true; uAmt.value = 0; return; }
      // opened by the page: the contact card coming into view
      let want = 0;
      if (el.front) { const r = el.front.getBoundingClientRect(); want = smooth(st.vh * 1.02, st.vh * .5, r.top) * .85; }
      want = Math.max(want, fxTarget);
      const rate = fxTarget > .01 || st.rush !== 0 ? fxRate : 2.2;
      st.vortex += (want - st.vortex) * (1 - Math.exp(-dt * rate));
      if (Math.abs(want - st.vortex) < .002) st.vortex = want;
      st.rush += (rushTarget - st.rush) * (1 - Math.exp(-dt * (rushTarget === 0 ? 2.2 : 4)));
      if (Math.abs(st.rush) < .01 && rushTarget === 0) st.rush = 0;
      mesh.visible = st.vortex > .01;
      if (!mesh.visible) return;
      travel += dt * (2.4 + st.rush * 70 + Math.abs(st.zv) * .35); twist += dt * (.16 + st.rush * 1.1);
      uTravel.value = travel; uTwist.value = twist; uAmt.value = st.vortex;
      tv.set(camera.position.x, camera.position.y, camera.position.z - 80).project(camera);   // where the far end of the tunnel is on the screen: that is where the dark is
      matMix.uniforms.uCoreAt.value.set(tv.x * .5 + .5, tv.y * .5 + .5);
    },
    destroy() { geo.dispose(); mat.dispose(); scene.remove(mesh); }
  });
})();
