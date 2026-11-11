/* The frozen ground: a field of square columns of stone and snow that runs out to the mist.
   Each column works out its own height from a noise function (low and rolling near the camera's path, rising into ridges at either side),
   so the ground goes on for ever: as the camera flies on, the columns that fall behind are moved to the front.
   The pointer presses the columns under it down and pushes the next ones outward, and every few steps it sends a ring across the field that rises, falls
   and dies away. A few columns glow faintly from inside, and glow brighter when a ring passes. */
(() => {
  const H = window.HALL; if (!H || !H.ok) return;
  const { T, scene, camera, U, st, GLSL, clamp } = H;

  /* the field at each quality: columns across, rows deep, the width of a column, and how many rows lie ahead of the camera (about 90 units either way) */
  const GRID = [{ cols: 36, rows: 30, cell: 3.6, ahead: 25 }, { cols: 48, rows: 40, cell: 2.8, ahead: 33 }, { cols: 64, rows: 54, cell: 2.2, ahead: 44 }];
  const MAXN = GRID[2].cols * GRID[2].rows;

  /* one column: a top and four sides (nothing underneath, nobody sees it) */
  const colGeo = new T.InstancedBufferGeometry();
  {
    const FACES = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]]];
    const pos = [], nor = [], idx = [];
    FACES.forEach(([n, u, w], f) => {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { for (let k = 0; k < 3; k++) { pos.push(n[k] * .5 + u[k] * a * .5 + w[k] * b * .5); nor.push(n[k]); } });
      idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
    });
    colGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    colGeo.setAttribute('normal', new T.BufferAttribute(new Float32Array(nor), 3));
    colGeo.setIndex(new T.BufferAttribute(new Uint16Array(idx), 1));
    const ids = new Float32Array(MAXN); for (let i = 0; i < MAXN; i++) ids[i] = i;
    colGeo.setAttribute('aId', new T.InstancedBufferAttribute(ids, 1));
  }

  const uGrid = { value: new Float32Array(4) }, uPtr = { value: new Float32Array(4) }, uWave = { value: new Float32Array(32) };
  const colVert = `
    attribute float aId;
    uniform vec4 uGrid, uPtr; uniform vec4 uWave[8]; uniform float uTime;
    varying vec3 vW; varying vec3 vN; varying vec4 vI; varying float vEdge;
    float hh(vec2 p){ p = fract(p * vec2(.1031, .1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hh(i), hh(i + vec2(1., 0.)), f.x), mix(hh(i + vec2(0., 1.)), hh(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return .5 * vn(p) + .27 * vn(p * 2.03 + 7.1) + .15 * vn(p * 4.1 + 3.3) + .08 * vn(p * 8.3 + 1.7); }
    float land(vec2 p){                                           // how high the ground is here: low and rolling along the path (x near 0), ridges to either side
      float ax = abs(p.x), side = smoothstep(7., 46., ax), path = smoothstep(2., 14., ax);   // path: 0 on the camera's way (kept low), 1 beside it
      float n = fbm(p * .045), r = fbm(p * .15 + 17.), big = fbm(p * .012 + 41.);
      float ridge = 1. - abs(2. * fbm(p * .02 + 91.) - 1.);
      float h = (n * 3.4 + r * 1.8) * (.25 + .75 * path) + pow(ridge, 3.) * 17. * side * smoothstep(.3, .7, big) + side * n * 3.;
      return max(h + (n - .5) * 1.2 * path, 0.);
    }
    void main(){
      float cols = uGrid.x, rows = uGrid.y, cell = uGrid.z, ahead = uGrid.w;
      float ix = mod(aId, cols), iz = floor(aId / cols);
      vec2 cc = floor(cameraPosition.xz / cell);
      float gx = ix + cols * floor((cc.x + cols * .5 - ix) / cols);                  // the column's place in the world: wrapped sideways, so the field is always around the camera
      float gz = cc.y + (rows - 1. - ahead) - iz;                                    // row 0 is the nearest, the last row the farthest: the nearest are drawn first, so the graphics card skips what they hide (the same ground, drawn in a cheaper order)
      vec2 pc = (vec2(gx, gz) + .5) * cell, p0 = pc;
      float h = floor(land(pc) / .45 + .5) * .45;                                    // heights in steps, so the ground reads as blocks
      float rnd = hh(vec2(gx, gz) * 1.37 + 5.);
      float dis = 0.;
      vec2 dp = pc - uPtr.xy; float dd = length(dp);
      float prox = exp(-dd * dd / (uPtr.z * uPtr.z)) * uPtr.w;                        // under the pointer: pressed down, and the columns beside it pushed outward
      h -= prox * 1.8; pc += (dd > .001 ? dp / dd : vec2(0.)) * prox * cell * .4; dis += prox * .6;
      for (int k = 0; k < 8; k++) {                                                  // the rings: each spreads, rises and falls, and dies away
        vec4 w = uWave[k]; float age = uTime - w.z;
        if (w.w > 0. && age > 0. && age < 5.) {
          float d2 = distance(p0, w.xy), R = age * 9.;
          float amp = w.w * exp(-age * .85) * exp(-pow((d2 - R) / (2.2 + age), 2.));
          h += amp * 2.6 * cos((d2 - R) * 1.5); dis += amp;
        }
      }
      float tf = (cameraPosition.z - p0.y) / (ahead * cell), tx = abs(p0.x - cameraPosition.x) / (cols * cell * .5);
      float edge = smoothstep(.8, 1., max(tf, tx));                                  // at the far edges the columns sink and melt into the mist
      h -= edge * (h + 8.);
      float y = mix(-8., h, position.y + .5);
      vec3 P = vec3(pc.x + position.x * cell * .955, y, pc.y + position.z * cell * .955);
      vW = P; vN = normal; vEdge = edge;
      vI = vec4(rnd, dis, rnd > .968 ? (rnd > .992 ? 2. : 1.) : 0., h);
      gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.);
    }`;
  const colFrag = `
    varying vec3 vW; varying vec3 vN; varying vec4 vI; varying float vEdge;
    ${GLSL.noise}
    ${GLSL.light}
    void main(){
      vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
      bool isTop = N.y > .5;
      float dist = distance(vW, cameraPosition), detail = exp(-dist * .03);          // the fine grain fades with distance, so far ground does not shimmer
      vec2 uv = isTop ? vW.xz : vec2(abs(N.x) > .5 ? vW.z : vW.x, vW.y);
      vec4 a = nz(uv * .16), b = nz(uv * .71 + 3.7);
      vec3 col;
      if (isTop) {                                                                   // snow
        vec3 snow = uSnow * (.8 + .4 * vI.x) * (.9 + .2 * (a.r - .5) + .12 * (b.g - .5) * detail);
        col = lightIt(snow, N, V, .35, 40., 1.);
        col += uKey * step(.965, b.a) * detail * (.5 + .5 * sin(uTime * 1.7 + b.r * 30.)) * .7 * (1. - uLight * .6);   // glints
      } else {                                                                       // stone and ice, banded, dusted with snow near the top
        float below = vI.w - vW.y;
        float band = .5 + .5 * sin(vW.y * 3.1 + a.r * 5.);
        vec3 rock = mix(uRockA, uRockB, smoothstep(.25, .75, a.g) * .6 + band * .25) * (.82 + .3 * (b.r - .5) * detail + .1);
        rock = mix(rock, uSnow, smoothstep(.5, .95, a.b + .55 - below * .5) * .5);
        float ao = mix(.22, 1., exp(-below * .28));
        col = lightIt(rock, N, V, .12, 24., ao);
        col += uSnow * smoothstep(.35, 0., below) * .12 * (1. - uLight * .5);         // a pale edge where the side meets the top
      }
      if (vI.z > .5) {                                                               // a column with a light inside
        vec3 gc = vI.z > 1.5 ? uAmber : uIce;
        float pulse = .72 + .28 * sin(uTime * 1.2 + vI.x * 50.);
        float k = isTop ? .7 : .45 * smoothstep(-1.6, 0., vW.y - vI.w);
        col += gc * k * pulse * (.5 + vI.y * 2.6) * uGlowK;
      } else col += uIce * vI.y * .22 * uGlowK * (isTop ? 1. : .5);                  // a ring passing over an ordinary column lights it faintly
      col = mix(col, uFog, clamp(max(fogAmt(vW) * (.8 + .2 * exp(-max(vW.y - 1., 0.) * .12)), vEdge), 0., 1.));
      gl_FragColor = vec4(col, 1.);
    }`;
  const colMat = new T.ShaderMaterial({ uniforms: Object.assign({ uGrid, uPtr, uWave }, U), vertexShader: colVert, fragmentShader: colFrag });
  const field = new T.Mesh(colGeo, colMat); field.frustumCulled = false; scene.add(field);

  /* the ground under the gaps between columns: a flat sheet that follows the camera, the colour of shadowed snow */
  const sheet = new T.Mesh(new T.PlaneGeometry(700, 700), new T.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vW; ${GLSL.light}
      void main(){ vec3 col = mix(uRockA * .5, uSnow * .4, .5) * (uKey * .15 + mix(uGnd, uAmb, .5)); gl_FragColor = vec4(mix(col, uFog, fogAmt(vW)), 1.); }`
  }));
  sheet.rotation.x = -Math.PI / 2; sheet.frustumCulled = false; sheet.renderOrder = 50; scene.add(sheet);   // drawn after the columns: it only has to be painted in the gaps between them

  /* ---- the pointer on the ground, and the rings it sends out */
  const ray = new T.Vector3(), org = new T.Vector3();
  const waves = [], MAXW = 8;                                      // {x, z, t, s}
  const ptrG = { x: 0, z: -20, p: 0, last: [0, 0], lastT: -9, on: false, tx: 0, tz: 0, tp: 0 };
  const GROUND = 1.1;                                              // roughly the height of the ground the pointer touches
  let waveI = 0;
  const hitGround = (nx, ny, out) => {                             // the pointer's line of sight meets the ground here, or nowhere (it points at the sky)
    org.copy(camera.position); ray.set(nx, ny, .5).unproject(camera).sub(org).normalize();
    if (ray.y > -.02) return false;
    const t = (GROUND - org.y) / ray.y; if (t < 1 || t > 150) return false;
    out[0] = org.x + ray.x * t; out[1] = org.z + ray.z * t; return true;
  };
  const addWave = (x, z, s) => { const i = waveI++ % MAXW; waves[i] = { x, z, t: st.t, s }; const a = uWave.value; a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = st.t; a[i * 4 + 3] = s; };
  const hit = [0, 0];
  const api = {
    /* the pointer moved (nx, ny: -1..1 across the screen, over: whether it is over the page's own words and panels, speed: how fast) */
    point(nx, ny, over, speed) {
      if (!hitGround(nx, ny, hit)) { ptrG.tp = 0; return; }
      ptrG.tx = hit[0]; ptrG.tz = hit[1]; ptrG.tp = over ? .5 : 1; ptrG.on = true;
      const d = Math.hypot(hit[0] - ptrG.last[0], hit[1] - ptrG.last[1]);
      if (d > 2.4 && st.t - ptrG.lastT > .12) { ptrG.last[0] = hit[0]; ptrG.last[1] = hit[1]; ptrG.lastT = st.t; addWave(hit[0], hit[1], clamp(.3 + speed * 9, .3, 1) * (over ? .55 : 1)); }
    },
    leave() { ptrG.tp = 0; },
    tap(nx, ny) { if (hitGround(nx, ny, hit)) { addWave(hit[0], hit[1], 1); ptrG.tx = hit[0]; ptrG.tz = hit[1]; ptrG.tp = 1; setTimeout(() => { ptrG.tp = 0; }, 260); } },
    burst(s) { addWave(camera.position.x, camera.position.z - 18, s || .9); }
  };

  H.systems.push({
    name: 'terrain',
    quality() {
      const g = GRID[st.Q]; uGrid.value.set([g.cols, g.rows, g.cell, g.ahead]); colGeo.instanceCount = g.cols * g.rows;
      uPtr.value[2] = 4.2 + g.cell * .6;
    },
    update(dt) {
      ptrG.x += (ptrG.tx - ptrG.x) * (1 - Math.exp(-dt * 10)); ptrG.z += (ptrG.tz - ptrG.z) * (1 - Math.exp(-dt * 10));
      ptrG.p += (ptrG.tp - ptrG.p) * (1 - Math.exp(-dt * (ptrG.tp > ptrG.p ? 9 : 3)));
      const a = uPtr.value; a[0] = ptrG.x; a[1] = ptrG.z; a[3] = ptrG.p;
      sheet.position.set(camera.position.x, -.4, camera.position.z);
    },
    move() { const p = H.ptr; api.point(p.nx, p.ny, !p.air, Math.hypot(p.vx, p.vy)); },
    tap() { api.tap(H.ptr.nx, H.ptr.ny); },
    away() { api.leave(); },
    destroy() { colGeo.dispose(); colMat.dispose(); sheet.geometry.dispose(); sheet.material.dispose(); scene.remove(field, sheet); }
  });
  H.terrain = Object.assign(api, { count: () => colGeo.instanceCount });
})();
