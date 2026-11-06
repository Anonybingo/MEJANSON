/* The doors swing open one after another when the corridor scrolls into view (until you touch one), the lights come on with the scroll, the bell copies the email */
(() => {
  const seq = matchMedia('(prefers-reduced-motion: reduce)').matches ? [0] : [0, 1, 2, 3, 0];
  let n = 0;
  const step = () => {
    if (touched) return;
    if (document.hidden) { setTimeout(step, 1000); return; }
    openDoor(seq[n++]);
    if (n < seq.length) setTimeout(step, 2200);
  };
  new IntersectionObserver((es, o) => {
    if (!es[0].isIntersecting) return;
    o.disconnect();
    setTimeout(step, 450);
  }, { threshold: 0.4 }).observe(corridor);

  const list = $('lights'), items = [...list.children];
  let queued = false;
  function update() {
    queued = false;
    const r = list.getBoundingClientRect(), vh = innerHeight;
    list.style.setProperty('--p', Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height)).toFixed(3));
    items.forEach(li => li.classList.toggle('on', li.getBoundingClientRect().top < vh * 0.62));
  }
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();

  const bell = $('bell'), msg = $('bellMsg'), mail = $('email');
  bell.addEventListener('click', async () => {
    bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring');
    let ok = false;
    try { await navigator.clipboard.writeText(PROFILE.email); ok = true; }
    catch (e) {
      try { const r = document.createRange(); r.selectNodeContents(mail); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand('copy'); } catch (e2) {}
    }
    msg.textContent = ok ? 'Copied. Talk soon.' : 'Select the address above to copy it.';
  });
})();
