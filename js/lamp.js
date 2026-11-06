/* Light and dark: the pull cord, the bulb buttons, and a remembered choice */
(() => {
  const root = document.documentElement, mq = matchMedia('(prefers-color-scheme: dark)');
  const lamp = $('lamp'), pull = $('pull'), btns = [...document.querySelectorAll('[data-light]')];
  try { const t = localStorage.getItem('theme'); if (t === 'dark' || t === 'light') root.dataset.theme = t; } catch (e) {}
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : mq.matches;
  const sync = () => btns.forEach(b => b.setAttribute('aria-pressed', String(isDark())));
  if (mq.addEventListener) mq.addEventListener('change', sync);
  const swing = () => { lamp.style.animation = 'none'; void lamp.offsetWidth; lamp.style.animation = 'swing 2.2s ease-out'; };
  function toggle() {
    const t = isDark() ? 'light' : 'dark';
    root.dataset.theme = t;
    try { localStorage.setItem('theme', t); } catch (e) {}
    lamp.classList.add('used'); sync(); swing();
  }
  btns.forEach(b => b.addEventListener('click', toggle));
  sync();

  let pos = 0, vel = 0, raf = 0, down = false, y0 = 0, moved = 0;
  const apply = () => pull.style.setProperty('--pull', pos.toFixed(1) + 'px');
  const spring = () => {
    cancelAnimationFrame(raf);
    const step = () => {
      vel += -0.2 * pos; vel *= 0.8; pos += vel; apply();
      if (Math.abs(pos) > 0.2 || Math.abs(vel) > 0.2) raf = requestAnimationFrame(step);
      else { pos = 0; vel = 0; apply(); }
    };
    raf = requestAnimationFrame(step);
  };
  pull.addEventListener('pointerdown', e => {
    down = true; y0 = e.clientY; moved = 0; cancelAnimationFrame(raf);
    try { pull.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  pull.addEventListener('pointermove', e => {
    if (!down) return;
    const dy = e.clientY - y0; moved = Math.max(moved, Math.abs(dy));
    pos = Math.max(0, Math.min(64, dy * 0.85)); apply();
  });
  pull.addEventListener('pointerup', () => {
    if (!down) return; down = false;
    if (pos > 26 || moved < 5) { toggle(); if (moved < 5) pos = 22; }
    spring();
  });
  pull.addEventListener('pointercancel', () => { down = false; spring(); });
})();
