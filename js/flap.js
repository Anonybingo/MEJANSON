/* Split-flap board: the roles flip through letters like a station departures board */
(() => {
  const board = $('board'), roles = PROFILE.roles.map(r => r.toUpperCase());
  const cols = Math.max(...roles.map(r => r.length)), SET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&.-';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cells = range(cols).map(() => {
    const el = document.createElement('span'); el.className = 'cell';
    el.innerHTML = '<span class="half t"><i> </i></span><span class="half b"><i> </i></span><span class="flip t"><i> </i></span><span class="flip b"><i> </i></span>';
    board.appendChild(el);
    const q = s => el.querySelector(s);
    return { el, ch: ' ', ht: q('.half.t i'), hb: q('.half.b i'), ft: q('.flip.t i'), fb: q('.flip.b i') };
  });
  const paint = (c, ch) => { c.ht.textContent = c.hb.textContent = c.ft.textContent = c.fb.textContent = ch; c.ch = ch; };
  async function flip(c, ch, st) {
    c.ft.textContent = c.ch; c.ht.textContent = ch; c.fb.textContent = ch;
    c.el.style.setProperty('--st', st + 'ms');
    c.el.classList.remove('go'); void c.el.offsetWidth; c.el.classList.add('go');
    await sleep(st * 2 + 8);
    c.hb.textContent = ch; c.ft.textContent = ch; c.ch = ch; c.el.classList.remove('go');
  }
  async function show(word, instant) {
    const target = word.padEnd(cols, ' ').split('');
    await Promise.all(cells.map(async (c, i) => {
      const to = target[i]; if (c.ch === to) return;
      if (instant || reduce) return paint(c, to);
      await sleep(i * 35);
      const n = SET.length, idx = Math.max(SET.indexOf(to), 0), from = Math.max(SET.indexOf(c.ch), 0);
      const steps = Math.min((idx - from + n) % n || n, 5 + (i % 4));
      for (let k = steps - 1; k >= 0; k--) await flip(c, SET[(idx - k + n) % n], 55);
    }));
  }
  let at = 0, busy = false, inView = true;
  const next = async () => { if (busy) return; busy = true; at = (at + 1) % roles.length; await show(roles[at]); busy = false; };
  show(roles[0], true);
  board.addEventListener('click', next);
  new IntersectionObserver(es => { inView = es[0].isIntersecting; }).observe(board);
  (async function loop() {
    await sleep(2200);
    for (;;) { if (inView && !document.hidden) await next(); await sleep(3400); }
  })();
})();
