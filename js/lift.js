/* Back to the top, as a lift. Press the panel and the page rides up, the floors counting down (each section of the page is a floor).
   The lamp swings when you arrive. Wheel, touch or a scrolling key hands the page back to you. Reduced motion: it just jumps. */
(() => {
  const lift = $('lift'), hud = $('hud'), hudNo = $('hudNo'), hudName = $('hudName'), hudNote = $('hudNote');
  if (!lift || !hud) return;
  const marks = [['Top', document.querySelector('.hero')], ['Doors', $('doors')], ['Work', $('work')], ['Story', $('story')], ['Contact', $('contact')]].filter(m => m[1]);
  $('liftNo').textContent = marks.length;
  const root = document.documentElement, lamp = $('lamp');
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let riding = false, raf = 0, hideT = 0;

  const docTop = el => el.getBoundingClientRect().top + window.scrollY;
  /* the floor you are on is the last section whose top has passed a line a little above the middle of the screen */
  const floorAt = (y, tops) => { const line = y + window.innerHeight * 0.4; let f = 0; tops.forEach((t, i) => { if (line >= t) f = i; }); return f; };
  function show(f) {
    hudNo.textContent = f + 1; hudName.textContent = marks[f][0];
    hudNo.classList.remove('tick'); void hudNo.offsetWidth; hudNo.classList.add('tick');
  }
  const swing = () => { if (!lamp) return; lamp.style.animation = 'none'; void lamp.offsetWidth; lamp.style.animation = 'swing 2.2s ease-out'; };
  /* keyboard and screen reader users start again from the top of the page, at the heading */
  const landOnTop = () => { const h = document.querySelector('.hero h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } };

  function ride() {
    if (riding) return;
    const from = window.scrollY;
    if (from < 4) return;
    const was = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';                             // the page has its own smooth scrolling: here we move it ourselves, frame by frame
    if (reduce()) { window.scrollTo(0, 0); root.style.scrollBehavior = was; landOnTop(); return; }
    riding = true;
    clearTimeout(hideT);
    const tops = marks.map(m => docTop(m[1]));
    const dur = Math.min(2600, Math.max(900, 600 + from * 0.3));
    lift.classList.add('called');
    hud.classList.remove('dinged'); hudNote.textContent = 'Going up'; hud.classList.add('on');
    const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    const evs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const take = e => {
      if (e.type === 'keydown') { if (e.repeat || !keys.includes(e.key) || (e.key === ' ' && lift.contains(e.target))) return; }
      else if (lift.contains(e.target)) return;                     // pressing the panel again is not "taking the wheel"
      finish(false);                                                // you took the wheel: the ride ends where you are
    };
    evs.forEach(n => addEventListener(n, take, { passive: true, capture: true }));
    function finish(arrived) {
      if (!riding) return;
      riding = false; cancelAnimationFrame(raf);
      evs.forEach(n => removeEventListener(n, take, { capture: true }));
      root.style.scrollBehavior = was;
      lift.classList.remove('called');
      if (arrived) {
        show(0); hudNote.textContent = 'Top floor'; hud.classList.add('dinged');
        swing(); landOnTop();
        hideT = setTimeout(() => hud.classList.remove('on'), 1200);
      } else hud.classList.remove('on');
    }
    let last = -1;
    const t0 = performance.now();
    const frame = now => {
      if (!riding) return;
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;    // starts and stops gently, like a lift
      const y = Math.round(from * (1 - e));
      window.scrollTo(0, y);
      const f = floorAt(y, tops);
      if (f !== last) { last = f; show(f); }
      if (p < 1) raf = requestAnimationFrame(frame); else finish(true);
    };
    show(floorAt(from, tops));
    raf = requestAnimationFrame(frame);
  }
  lift.addEventListener('click', ride);
})();
