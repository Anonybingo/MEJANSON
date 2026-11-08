/* Rooms. Click a door and the camera pushes through the doorway into the room behind it.
   The button at the bottom left, the Escape key and the browser's Back button all walk you back out to all the doors. */
(() => {
  const site = $('site'), room = $('room'), scroller = $('roomScroll'), title = $('roomTitle'), back = $('back'), sec = $('doors');
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = typeof room.animate === 'function';
  let state = 'idle', cur = -1, pushed = false, wantOut = false;

  const hashFor = i => '#/door/' + PROFILE.doors[i].slug;
  const doorFromHash = () => {
    const m = /^#\/door\/([\w-]+)$/.exec(location.hash);
    return m ? PROFILE.doors.findIndex(d => d.slug === m[1]) : -1;
  };

  /* put the door's words and its projects into the room */
  function fill(i) {
    const d = PROFILE.doors[i];
    room.style.setProperty('--paint', 'var(--d' + (i + 1) + ')');
    title.textContent = d.title;
    $('roomText').textContent = d.text;
    $('roomSign').innerHTML = ICONS[d.icon] || '';
    $('roomPoints').innerHTML = d.points.map(t => '<li>' + esc(t) + '</li>').join('');
    $('roomTools').innerHTML = d.tools.map(t => '<li>' + esc(t) + '</li>').join('');
    $('roomStack').innerHTML = d.see.map(byId).filter(Boolean).map((p, k) => cardHTML(p, k, false)).join('');
    scroller.scrollTop = 0;
  }

  /* A copy of the doors section is laid exactly over the real one on a fixed stage. Zooming the copy toward the
     doorway looks like walking up to it, and the real page underneath is never moved or stretched. */
  function stageFor(i, startOpen) {
    const sr = sec.getBoundingClientRect(), jb = doors[i].querySelector('.jamb').getBoundingClientRect();
    const clone = sec.cloneNode(true);
    clone.removeAttribute('id'); clone.removeAttribute('aria-labelledby');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.inert = true; clone.setAttribute('aria-hidden', 'true');
    clone.classList.remove('rv', 'in-head', 'in-doors');          // the copy never replays the scroll reveal
    const cd = [...clone.querySelectorAll('.door')];
    cd.forEach((b, k) => b.classList.toggle('open', k === startOpen));
    Object.assign(clone.style, { position: 'absolute', left: sr.left + 'px', top: sr.top + 'px', width: sr.width + 'px', height: sr.height + 'px', margin: '0' });
    const px = jb.left + jb.width / 2, py = jb.top + jb.height / 2;
    clone.style.transformOrigin = (px - sr.left) + 'px ' + (py - sr.top) + 'px';
    const stage = document.createElement('div');
    stage.className = 'stage'; stage.setAttribute('aria-hidden', 'true');
    stage.appendChild(clone); document.body.appendChild(stage);
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const scale = Math.max(vw / jb.width, vh / jb.height) * 1.3;
    return { stage, clone, doors: cd, end: 'translate(' + (vw / 2 - px) + 'px,' + (vh / 2 - py) + 'px) scale(' + scale + ')' };
  }

  /* make sure the door we are walking back to is on screen (most of it, so a door that is already in view never makes the page jump) */
  function keepInView(btn) {
    const r = btn.getBoundingClientRect(), vh = window.innerHeight;
    if ((Math.min(r.bottom, vh) - Math.max(r.top, 64)) / r.height >= 0.75) return;
    const el = document.documentElement, was = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    window.scrollTo(0, window.scrollY + r.top + r.height / 2 - vh / 2);
    el.style.scrollBehavior = was;
  }

  /* While a room is open the browser must not restore an old scroll position when Back is pressed: the page behind has not moved,
     and a late jump would break the walk back out. (The mode belongs to the history entry, so it is set before the room's entry is added.) */
  const holdScroll = on => { try { history.scrollRestoration = on ? 'manual' : 'auto'; } catch (e) {} };

  /* the address bar follows the room, so the browser's Back button closes it */
  function push(i) {
    holdScroll(true);
    try { history.pushState({ door: i }, '', hashFor(i)); pushed = true; }
    catch (e) { try { location.hash = hashFor(i); pushed = true; } catch (e2) {} }
  }
  function clearHash() {
    if (!location.hash) return;
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { try { location.hash = ''; } catch (e2) {} }
  }

  async function enter(i, btn, o = {}) {
    if (state !== 'idle' || !PROFILE.doors[i]) return;
    state = 'entering'; cur = i; wantOut = false; touch();
    if (window.settleDoors) settleDoors();                          // the doors are copied below, so they must be in their normal state first
    holdScroll(true);
    let mode = o.mode || 'zoom';
    if (!canAnimate) mode = 'none';
    else if (reduce() && mode === 'zoom') mode = 'fade';
    const before = doors.findIndex(b => b.classList.contains('open'));
    holdDoor('room', i);                                            // the door stays open for as long as you are inside
    fill(i);
    let S = null;
    try {
      if (mode === 'zoom') S = stageFor(i, before);
      site.inert = true;
      room.style.setProperty('--d', mode === 'zoom' ? '.72s' : '0s');
      room.classList.add('arrive');
      room.hidden = false;
      if (!o.fromHistory) push(i); else if (mode !== 'none') pushed = true;
      if (mode === 'zoom') {
        void S.stage.offsetWidth;                                   // the copy is drawn once as it is, so the door below can swing open
        S.doors.forEach((b, k) => b.classList.toggle('open', k === i));
        S.stage.classList.add('go');
        const zoom = S.clone.animate([{ transform: 'none' }, { transform: S.end }], { duration: 980, delay: 150, easing: 'cubic-bezier(.62,0,.9,.5)', fill: 'both' });
        const fade = room.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 440, delay: 780, easing: 'ease-out', fill: 'both' });
        await Promise.all([zoom.finished, fade.finished]).catch(() => {});
        fade.cancel(); zoom.cancel();
      } else if (mode === 'fade') {
        const fade = room.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'both' });
        await fade.finished.catch(() => {});
        fade.cancel();
      }
    } catch (err) {
      room.hidden = false;
    }
    if (S) S.stage.remove();
    state = 'inside';
    title.focus({ preventScroll: true });
    if (wantOut) { wantOut = false; goBack(); } else sync();
  }

  async function leave() {
    if (state !== 'inside') return;
    state = 'leaving';
    const i = cur, btn = doors[i];
    const mode = !canAnimate ? 'none' : reduce() ? 'fade' : 'zoom';
    let S = null;
    try {
      keepInView(btn);
      if (mode === 'zoom') {
        S = stageFor(i, i);
        const zoom = S.clone.animate([{ transform: S.end }, { transform: 'none' }], { duration: 920, delay: 140, easing: 'cubic-bezier(.1,.62,.28,1)', fill: 'both' });
        const fade = room.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-in', fill: 'both' });
        await Promise.all([zoom.finished, fade.finished]).catch(() => {});
        room.hidden = true; fade.cancel(); zoom.cancel();
      } else if (mode === 'fade') {
        const fade = room.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'both' });
        await fade.finished.catch(() => {});
        room.hidden = true; fade.cancel();
      }
    } catch (err) {}
    room.hidden = true;
    if (S) S.stage.remove();
    room.classList.remove('arrive');
    site.inert = false;
    btn.focus({ preventScroll: true });
    holdScroll(false);
    state = 'idle'; cur = -1;
    setTimeout(() => { if (state === 'idle') holdDoor('room', -1); }, 320);   // the door swings shut behind you, unless the mouse or keyboard is on it
    sync();
  }

  function goBack() {
    if (state === 'entering') { wantOut = true; return; }
    if (state !== 'inside') return;
    if (pushed) {
      pushed = false;
      history.back();
      setTimeout(() => { if (state === 'inside') { clearHash(); leave(); } }, 500);   // if the browser did not move, close it ourselves
    } else { clearHash(); leave(); }
  }

  /* keep the room and the address bar in step (Back and Forward buttons, a link to #/door/mobile) */
  function sync() {
    const i = doorFromHash();
    if (state === 'idle') { if (i >= 0) enter(i, doors[i], { mode: 'fade', fromHistory: true }); }
    else if (state === 'inside') {
      if (i < 0) leave();
      else if (i !== cur) { cur = i; holdDoor('room', i); fill(i); }
    }
    else if (state === 'entering' && i < 0) wantOut = true;
  }

  back.addEventListener('click', goBack);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (state === 'inside' || state === 'entering')) { e.preventDefault(); goBack(); }
  });
  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);
  window.enterRoom = (i, btn) => enter(i, btn, { mode: 'zoom' });

  const first = doorFromHash();
  if (first >= 0) enter(first, doors[first], { mode: 'none', fromHistory: true });
})();
