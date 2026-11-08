/* The lights come on with the scroll, the bell copies the email. (What the doors do when they scroll into view is in 76-reveal.js.) */
(() => {
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
