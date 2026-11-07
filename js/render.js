/* Fill the page from PROFILE */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = n => { const w = n.split(/\s+/).filter(Boolean); return !w.length ? 'ME' : w.length === 1 && w[0].length <= 8 ? w[0].toUpperCase() : w.slice(0, 2).map(x => x[0].toUpperCase()).join(''); };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
PROFILE.doors.forEach(d => { d.slug = slug(d.plate || d.title); });
if (PROFILE.name && PROFILE.name !== 'Your Name') document.title = PROFILE.name + ' | Portfolio';
document.querySelectorAll('[data-bind]').forEach(el => { const k = el.dataset.bind; el.textContent = k === 'initials' ? initials(PROFILE.name) : PROFILE[k]; });
$('rolesSr').textContent = 'Roles: ' + PROFILE.roles.map(r => r.toLowerCase()).join(', ') + '.';
{ const a = $('ghLink'); a.href = PROFILE.github; a.textContent = PROFILE.github.replace(/^https?:\/\//, ''); }

/* your portrait. 78-dust.js turns it into dust. The plain picture stays under the dust: it is what screen readers get, and what shows if the dust cannot run.
   If assets/photo.jpg is missing, the built-in copy (70-photo.js) is used; with no picture at all a silhouette shows, and you can click it to preview a picture from your computer */
{
  const fig = $('portrait'), img = $('photo'), pick = $('phFile');
  const backup = typeof PORTRAIT_FALLBACK === 'string' ? PORTRAIT_FALLBACK : '';
  img.alt = PROFILE.photoAlt || 'Portrait of ' + PROFILE.name;
  img.addEventListener('load', () => { fig.classList.remove('no-photo'); fig.classList.add('has-photo'); });
  img.addEventListener('error', () => {
    if (backup && img.getAttribute('src') !== backup) { img.src = backup; return; }
    fig.classList.remove('has-photo'); fig.classList.add('no-photo');
  });
  img.src = PROFILE.photo || backup;
  $('phBtn').addEventListener('click', () => pick.click());
  pick.addEventListener('change', () => {
    const f = pick.files && pick.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    img.src = url;
    if (window.dustPhoto) window.dustPhoto(url);
  });
}

const byId = id => PROFILE.projects.find(p => p.id === id);
const corridor = $('corridor'), behind = $('behind');
corridor.innerHTML = PROFILE.doors.map((d, i) => `<button class="door" type="button" style="--paint:var(--d${i + 1})" aria-haspopup="dialog" data-i="${i}"><span class="fan"></span><span class="jamb"><span class="inside">${ICONS[d.icon]}</span><span class="leaf"><span class="panel pa"></span><span class="panel pb"></span><span class="dplate" aria-hidden="true">${esc(d.plate)}</span><span class="knob"></span></span></span><span class="spill"></span><span class="sr-only">Step inside: ${esc(d.title)}</span></button>`).join('');
const doors = [...corridor.children];

function idle() {
  behind.className = 'behind idle';
  behind.style.removeProperty('--paint');
  behind.innerHTML = '<p>Click a door to step inside. Each one opens onto something I build.</p>';
}
function openDoor(i) {
  doors.forEach((b, k) => b.classList.toggle('open', k === i));
  if (i < 0) return idle();
  const d = PROFILE.doors[i];
  behind.className = 'behind';
  behind.style.setProperty('--paint', `var(--d${i + 1})`);
  behind.innerHTML = `<div><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></div><div class="more"><ul class="bl">${d.points.map(t => `<li>${esc(t)}</li>`).join('')}</ul><ul class="chips">${d.tools.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p><button class="btn btn-solid step" type="button" data-i="${i}">Step inside</button></p></div>`;
  void behind.offsetWidth;
  behind.classList.add('swap');
}
/* hovering or focusing a door peeks inside; clicking it walks in. Any of these ends the automatic tour in 75-misc.js */
let touched = false;
corridor.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest('.door');
  if (b && !b.classList.contains('open')) { touched = true; openDoor(+b.dataset.i); }
});
corridor.addEventListener('focusin', e => {
  const b = e.target.closest('.door');
  if (b && !b.classList.contains('open')) { touched = true; openDoor(+b.dataset.i); }
});
corridor.addEventListener('click', e => {
  const b = e.target.closest('.door'); if (!b) return;
  touched = true; enterRoom(+b.dataset.i, b);
});
behind.addEventListener('click', e => {
  const s = e.target.closest('.step'); if (!s) return;
  touched = true; enterRoom(+s.dataset.i, doors[+s.dataset.i]);
});
idle();

const cardHTML = (p, i, anchor) => `<article class="card"${anchor ? ` id="work-${esc(p.id)}"` : ''} style="--i:${i}"><figure class="art">${COVERS[p.cover] || ''}</figure><div class="info"><span class="status ${esc(p.state)}">${esc(p.status)}</span><h3>${esc(p.name)}</h3><p class="tag">${esc(p.tag)}</p><p>${esc(p.text)}</p><ul class="chips">${p.stack.map(s => `<li>${esc(s)}</li>`).join('')}</ul>${p.links.length ? `<p class="links">${p.links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</p>` : ''}</div></article>`;
$('stack').innerHTML = PROFILE.projects.map((p, i) => cardHTML(p, i, true)).join('');

$('lights').innerHTML = PROFILE.story.map(s => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('');
