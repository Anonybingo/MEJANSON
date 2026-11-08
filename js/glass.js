/* Liquid glass, the small script. A soft light follows the pointer across the pane it is over (the stylesheet draws it from --mx and --my).
   The page works without this file: on a touch screen, or with "reduce motion", the panes simply sit still. */
(() => {
  if (!window.matchMedia || !matchMedia('(hover:hover) and (pointer:fine)').matches || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const SEL = '.nav-in,.btn-ghost,.behind,.card,.front';
  let el = null, x = 0, y = 0, raf = 0;
  const put = () => {
    raf = 0;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', Math.round(x - r.left) + 'px');
    el.style.setProperty('--my', Math.round(y - r.top) + 'px');
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(put); };
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    x = e.clientX; y = e.clientY;
    el = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (el) ask();
  }, { passive: true });
  addEventListener('scroll', () => { if (el) ask(); }, { passive: true });   // the pane moves under a still pointer, so the light has to follow it
  document.documentElement.addEventListener('pointerleave', () => { el = null; });
})();
