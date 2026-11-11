/* The sky and the snow.
   The sky is one flat shape that covers the screen and works out its colour from the direction each pixel looks in:
   dark blue overhead, pale mist at the horizon, a cold moon (or a pale sun, in the light theme) and a few stars at night.
   The snow is a cloud of points that falls past the camera and is blown by the same wind as everything else; flakes that fall behind you come back in front. */
(() => {
  const H = window.HALL; if (!H || !H.ok) return;
  const { T, scene, camera, U, st, GLSL } = H;

  /* ---- sky */
  const skyGeo = new T.BufferGeometry();
  skyGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));   // one big triangle that covers the screen
  const sky = new T.Mesh(skyGeo, new T.ShaderMaterial({
    uniforms: U,
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vec4 p = inverse(projectionMatrix) * vec4(position.xy, 1., 1.);
        vDir = transpose(mat3(viewMatrix)) * (p.xyz / p.w);
        gl_Position = vec4(position.xy, 1., 1.);
      }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSkyT, uSkyM, uSkyH, uSunCol, uSunDir, uAmber; uniform float uStars, uLight, uTime;
      float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uSkyH, uSkyM, smoothstep(-.02, .2, h));
        col = mix(col, uSkyT, smoothstep(.14, .8, h));
        col = mix(col, uSkyH * .94, smoothstep(0., -.3, h));
        float m = max(dot(d, uSunDir), 0.);
        col += uSunCol * (pow(m, 1100.) * 2.6 + pow(m, 46.) * .32 + pow(m, 7.) * .11);       // the moon (or the sun) and its glow
        col += uSkyH * .22 * exp(-abs(h) * 10.);                                            // mist lying on the horizon
        float az = atan(d.x, -d.z);
        col += uAmber * .17 * exp(-pow((az - .95) * 3.1, 2.)) * exp(-abs(h) * 16.) * (1. - .75 * uLight);   // a far, faint warm light low on the right
        if (uStars > .01 && h > .03) {
          vec2 sp = d.xz / (h + .8) * 70.; vec2 id = floor(sp), f = fract(sp) - .5;
          float r = h21(id), s = step(.987, r) * smoothstep(.2, .0, length(f + (vec2(h21(id + 3.1), h21(id + 7.7)) - .5) * .5));
          col += s * uStars * smoothstep(.03, .3, h) * (.35 + .65 * h21(id + 1.9)) * (.8 + .2 * sin(uTime * (.8 + r * 3.) + r * 60.));
        }
        gl_FragColor = vec4(col, 1.);
      }`,
    depthTest: true, depthWrite: false                              // it sits on the far plane and is drawn after the ground, so the graphics card only paints the sky where the sky can be seen
  }));
  sky.frustumCulled = false; sky.renderOrder = 90; scene.add(sky);

  /* ---- snow */
  const SNOW = [450, 900, 1700];                                   // flakes at each quality
  const snowGeo = new T.BufferGeometry();
  {
    const n = SNOW[2], pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) pos[i * 3 + k] = Math.random(); for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random(); }
    snowGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    snowGeo.setAttribute('aR', new T.BufferAttribute(rnd, 4));
  }
  const snowMat = new T.ShaderMaterial({
    uniforms: U,
    vertexShader: `
      attribute vec4 aR; uniform float uTime, uPx; uniform vec3 uWind;
      varying float vA;
      void main(){
        const vec3 SZ = vec3(64., 26., 84.), OFF = vec3(32., 8., 52.);     // the box of snow around the camera: wide, tall, and deeper ahead than behind
        vec3 q = position * SZ;
        q.y -= uTime * (.7 + aR.w * 1.0);
        q.x += uTime * uWind.x * (.55 + aR.z * .6) + sin(uTime * (.5 + aR.x) + aR.y * 40.) * .35;
        q.z += uTime * uWind.z * (.55 + aR.y * .6) + cos(uTime * (.4 + aR.z) + aR.x * 30.) * .35;
        vec3 w = cameraPosition + mod(q - cameraPosition + OFF, SZ) - OFF;
        vec4 mv = viewMatrix * vec4(w, 1.);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, .4);
        gl_PointSize = clamp((.05 + aR.w * .08) * uPx / dist, 1.3, 11.);
        vA = exp(-dist * .022) * smoothstep(.5, 3., dist) * (.55 + .45 * aR.x);
      }`,
    fragmentShader: `
      varying float vA; uniform float uLight;
      void main(){
        float r = length(gl_PointCoord - .5) * 2.;
        float a = 1. - smoothstep(.15, 1., r); a *= a;
        vec3 night = vec3(.80, .89, 1.);
        vec3 day = mix(vec3(.55, .66, .80), vec3(1.), smoothstep(.95, .35, r));    // a darker blue ring, so a white flake still shows against a pale sky
        gl_FragColor = vec4(mix(night, day, uLight), a * vA * mix(.9, .85, uLight));
      }`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending
  });
  const snow = new T.Points(snowGeo, snowMat); snow.frustumCulled = false; snow.renderOrder = 10; scene.add(snow);

  H.systems.push({
    name: 'sky',
    quality() { snowGeo.setDrawRange(0, SNOW[st.Q]); },
    look(v) { snowMat.blending = v ? T.NormalBlending : T.AdditiveBlending; snowMat.needsUpdate = true; },
    destroy() { skyGeo.dispose(); sky.material.dispose(); snowGeo.dispose(); snowMat.dispose(); scene.remove(sky, snow); }
  });
  H.snow = { count: () => SNOW[st.Q] };
})();
