/* The doors section, when it scrolls into view: the heading rises out of a mask, the doors come up out of the floor one after another with the light
   in each fanlight flicking on, then every door swings open once and shuts again (a short tour). Touch a door and the tour stops.
   With reduced motion none of this happens: the doors are simply there. The styles are in 30-doors.css (the .rv rules). */
(() => {
  const sec = $('doors'), head = $('doors-h');
  const REVEAL_MS = 2500;                                          // how long the reveal plays (see the delays in 30-doors.css)
  const state = s => { sec.dataset.rv = s; };
  let timers = [], io = null, touring = false;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  /* the tour: each door open for a moment, one after another, then all shut again */
  function tour() {
    if (touched || touring) return;
    touring = true;
    let n = 0;
    const step = () => {
      if (touched) { touring = false; return; }
      if (document.hidden) { later(step, 800); return; }
      if (n < doors.length) { holdDoor('tour', n++); later(step, 1300); }
      else { holdDoor('tour', -1); touring = false; idle(); }
    };
    step();
  }

  /* everything back to its normal look (also called when you walk into a room, because the room copies the doors) */
  function unhide() {
    if (io) { io.disconnect(); io = null; }
    sec.classList.remove('rv', 'in-head', 'in-doors');
    state('done');
  }
  window.settleDoors = () => { timers.forEach(clearTimeout); timers = []; unhide(); };

  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof IntersectionObserver === 'function';
  if (!motion) { state('done'); return; }

  /* the heading's words, each one in its own mask so it can rise */
  head.innerHTML = head.textContent.trim().split(/\s+/).map((w, k) => '<span class="rw" style="--w:' + k + '"><span>' + esc(w) + '</span></span>').join(' ');
  sec.classList.add('rv');
  state('wait');
  io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    if (en.target === head) { sec.classList.add('in-head'); io.unobserve(head); }
    else {
      sec.classList.add('in-doors'); io.unobserve(corridor); state('run');
      later(() => { unhide(); later(tour, 350); }, REVEAL_MS);
    }
  }), { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
  io.observe(head);
  io.observe(corridor);
})();
