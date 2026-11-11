/* The loop. It reads the pointer, moves the camera, lets every part (sky, terrain, blocks, tunnel) update itself, and draws.
   It also looks after the things that must never break the page: a hidden tab or a covered page stops drawing, a slow computer gets a lighter picture,
   a lost graphics context falls back to the calm gradient (and comes back when the browser gives the context back), and "reduce motion" draws one still frame. */
(() => {
  const H = window.HALL; if (!H || !H.ok) return;
  const { root, canvas, st, U, matMix, clamp, mqReduce, roomEl, systems } = H;
  const each = (name, a, b) => systems.forEach(s => s[name] && s[name](a, b));
  const offs = [];                                                 // every way this file listens to the page, so destroy() can let go of all of it
  const on = (target, type, fn, opts) => {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts));
  };

  /* ---------------------------------------------------------------- the pointer
     (the blocks and the terrain read it: where it is, which way it is moving, and whether it is over the page's own words and panels or over open background) */
  const SOLID = 'a,button,input,label,h1,h2,h3,h4,p,li,small,b,em,i,img,svg,.nav,.lamp,.behind,.card,.front,.door,.corridor,.stack,.lights,.foot,.room,.board';
  const ptr = H.ptr;
  const aim = (e, move) => {
    const nx = e.clientX / st.vw * 2 - 1, ny = -(e.clientY / st.vh * 2 - 1);
    if (move && ptr.seen) { ptr.vx = ptr.vx * .5 + (nx - ptr.nx) * .5; ptr.vy = ptr.vy * .5 + (ny - ptr.ny) * .5; }   // which way the pointer is travelling
    ptr.nx = nx; ptr.ny = ny;
    ptr.air = !(e.target && e.target.closest && e.target.closest(SOLID));
  };
  on(window, 'pointermove', e => {
    if (e.pointerType === 'touch' || e.timeStamp - ptr.touchAt < 1200) return;   // a finger does not hover, and some browsers make up a mouse move right after a tap
    st.mx = clamp(e.clientX / st.vw * 2 - 1, -1, 1); st.my = clamp(e.clientY / st.vh * 2 - 1, -1, 1);
    aim(e, true); ptr.seen = true; each('move');
  }, { passive: true });
  on(window, 'pointerdown', e => {
    if (e.pointerType === 'touch') { ptr.seen = false; ptr.touchAt = e.timeStamp; }   // touch: let go of anything held under a pointer that is not really there
    aim(e); if (running && !st.still) each('tap');
  }, { passive: true });
  on(window, 'pointerup', e => { if (e.pointerType === 'touch') ptr.touchAt = e.timeStamp; }, { passive: true });
  on(window, 'scroll', () => { ptr.air = false; }, { passive: true });   // while the page scrolls the text moves under a resting pointer: wait for it to move again
  on(document.documentElement, 'mouseleave', () => { ptr.seen = false; each('away'); });

  /* ---------------------------------------------------------------- the light / dark switch: a quick flash covers the swap */
  let flip = null, running = false, raf = 0, last = 0, frames = 0, acc = 0, accN = 0, firstDone = false;
  function onTheme() {
    const want = H.isLight() ? 1 : 0;
    if (want === (flip ? flip.to : st.light)) return;
    if (st.still || !running) { flip = null; H.applyLook(want); drawOnce(); return; }
    flip = { to: want, t: 0, done: false };
  }
  const themeWatch = new MutationObserver(onTheme); themeWatch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  offs.push(() => themeWatch.disconnect());
  on(H.mqDark, 'change', onTheme);

  /* ---------------------------------------------------------------- drawing */
  function step(dt) {
    H.breeze(st.t); U.uTime.value = st.t;
    H.place(dt, st.t);
    st.sec = H.sections();
    each('update', dt, st.t);
    H.draw();
  }
  const drawOnce = () => { st.dt = 0; step(0); };
  const covered = () => !!roomEl && !roomEl.hidden && !document.querySelector('.stage');   // a room fully covers the page: nothing to draw
  const setQuality = q => { st.Q = q; H.resize(); each('quality'); };

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden || covered()) { last = 0; return; }
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now; st.t += dt; st.dt = dt;
    if (!H.born) H.born = now;
    st.intro = clamp((now - H.born) / 2600, 0, 1);
    if (flip) {
      flip.t += dt / .8;
      const k = clamp(flip.t, 0, 1), amp = Math.pow(Math.sin(Math.PI * k), 1.4) * .9;
      matMix.uniforms.uFlash.value = amp; matMix.uniforms.uFlashCol.value.setScalar(flip.to ? 1 : 0);
      if (!flip.done && flip.t >= .5) { flip.done = true; H.applyLook(flip.to); }
      if (flip.t >= 1) { flip = null; matMix.uniforms.uFlash.value = 0; }
    }
    step(dt);
    frames++;
    if (!firstDone) { firstDone = true; root.classList.add('gl-on'); root.dataset.gl = 'on'; }
    // a slow computer asks for less: if frames keep taking too long, draw less
    if (st.forced < 0 && frames > 40 && dt > 0) {
      acc += dt; accN++;
      if (accN >= 45) { if (acc / accN > .036 && st.Q > 0) setQuality(st.Q - 1); acc = 0; accN = 0; }
    }
  }
  function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------------------------------------------------------------- go */
  try {
    H.first(); each('quality');
    if (st.still) { drawOnce(); root.classList.add('gl-on'); root.dataset.gl = 'still'; }
    else start();
  } catch (e) { root.classList.add('gl-off'); stop(); return; }
  const onResize = () => { H.measure(); H.resize(); each('quality'); if (st.still || !running) drawOnce(); };
  on(window, 'resize', onResize);
  if (window.ResizeObserver) { const bodyWatch = new ResizeObserver(H.measure); bodyWatch.observe(document.body); offs.push(() => bodyWatch.disconnect()); }
  on(mqReduce, 'change', () => location.reload());
  on(canvas, 'webglcontextlost', e => { e.preventDefault(); stop(); root.classList.remove('gl-on'); root.classList.add('gl-off'); root.dataset.gl = 'lost'; });
  on(canvas, 'webglcontextrestored', () => { root.classList.remove('gl-off'); H.first(); each('quality'); root.dataset.gl = st.still ? 'still' : 'on'; root.classList.add('gl-on'); st.still ? drawOnce() : start(); });

  /* free everything the scene holds: stop drawing, let go of every listener and observer, give back the shapes, materials and picture buffers
     (nothing on the page calls this: it is here for tests and for anyone who embeds the scene) */
  let gone = false;
  function destroy() {
    if (gone) return; gone = true;
    stop(); offs.forEach(f => f()); offs.length = 0;
    each('destroy'); systems.length = 0; H.dispose();
    H.renderer.dispose(); root.classList.remove('gl-on'); root.classList.add('gl-off'); root.dataset.gl = 'off';
    window.hallFx = null;
  }

  window.__hall = {                                                // a peek for the tests
    get frames() { return frames; }, get quality() { return st.Q; }, get light() { return st.light; }, get z() { return st.z; }, get running() { return running; },
    get section() { return st.sec; }, get vortex() { return st.vortex; }, get air() { return ptr.air; }, get seen() { return ptr.seen; },
    get hover() { return H.blocks ? H.blocks.hover : -1; }, get moving() { return H.blocks ? H.blocks.moving : 0; }, get boxes() { return H.blocks ? H.blocks.count : 0; },
    screenOf: i => H.blocks ? H.blocks.screenOf(i) : null, off: i => H.blocks ? H.blocks.off(i) : [0, 0, 0],
    info: () => ({ calls: H.renderer.info.render.calls, triangles: H.renderer.info.render.triangles, columns: H.terrain ? H.terrain.count() : 0, flakes: H.snow ? H.snow.count() : 0,
                   blocks: H.blocks ? H.blocks.count : 0, tunnel: H.vortexInfo ? H.vortexInfo() : 0,
                   geometries: H.renderer.info.memory.geometries, textures: H.renderer.info.memory.textures, programs: (H.renderer.info.programs || []).length }),
    dive: ms => H.fx ? H.fx.dive(ms) : 0, surface: ms => H.fx ? H.fx.surface(ms) : 0, clear: () => H.fx && H.fx.clear(),
    destroy
  };
  window.hallFx = H.fx || null;                                    // the rooms use this: the tunnel opens when a door is opened (see js/rooms.js)
  H.running = () => running; H.drawOnce = drawOnce;
})();
