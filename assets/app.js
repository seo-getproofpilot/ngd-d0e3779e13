import { mountHero } from './hero3d.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* ---------- nav ---------- */
const nav = $('#nav'), burger = $('.nav-burger'), menu = $('#menu');
burger.addEventListener('click', () => {
  const open = burger.getAttribute('aria-expanded') !== 'true';
  burger.setAttribute('aria-expanded', open); menu.hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
  nav.classList.toggle('solid', open || scrollY > 40);
});
menu.addEventListener('click', e => { if (e.target.closest('a')) burger.click(); });

/* ---------- hero: 3D build tied to scroll ---------- */
const hero = $('.hero'), rail = $('.build-rail');
const CAPS = [
  ['Frame', 'Studs 16 in on center. Laser at 48 in.'],
  ['Hang', '5/8 in board, screws set just under the paper.'],
  ['Tape', 'Paper tape bedded over every seam.'],
  ['Mud', 'Three coats, each feathered wider than the last.'],
  ['Level 5', 'A skim over the whole face. Nothing flashes.'],
];
const setStage = s => {
  $('.rail-n').textContent = String(s + 1).padStart(2, '0');
  $('.rail-t').textContent = CAPS[s][0]; $('.rail-c').textContent = CAPS[s][1];
  $$('.rail-steps li').forEach((li, i) => li.classList.toggle('on', i <= s));
};
let api = null;
try { api = mountHero($('.hero-canvas'), { onStage: setStage, reduced }); } catch (e) { console.warn(e); }
if (!api) document.documentElement.classList.add('no-gl');

const callbar = $('.callbar');
function onScroll() {
  const y = scrollY;
  nav.classList.toggle('solid', y > 40 || !menu.hidden);
  const total = hero.offsetHeight - innerHeight;
  const p = clamp(y / total);
  api && api.setProgress(p);
  rail.style.setProperty('--p', p);
  hero.classList.toggle('away', p > .14);
  callbar.classList.toggle('on', y > innerHeight * .6);
  const b = $('.belief'), r = b.getBoundingClientRect();
  if (r.bottom > 0 && r.top < innerHeight) $('.belief-img').style.setProperty('--py', `${(r.top / innerHeight) * -6}%`);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();
// click a stage on the tape to jump there
$('.rail-tape').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  const p = (e.clientX - r.left) / r.width;
  scrollTo({ top: p * (hero.offsetHeight - innerHeight), behavior: reduced ? 'auto' : 'smooth' });
});
$('.rail-tape').style.cursor = 'pointer';

/* ---------- reveals + chalk-line snaps ---------- */
$$('.lv, .ticket, .crew-tile, .lic-card, .badge-card, .b-list li, .faq-list details, .tx').forEach((el, i) => {
  el.classList.add('rv'); el.style.transitionDelay = `${(i % 6) * 60}ms`;
});
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -12% 0px' });
$$('.rv, .snap, .step').forEach(el => io.observe(el));

/* ---------- the sun: noon to raking evening light ---------- */
const levels = $('#levels'), range = $('.sun-range'), sun = $('.sun');
const setRake = v => { levels.style.setProperty('--rake', v); sun.style.setProperty('--rake', v); };
range.addEventListener('input', () => setRake(range.value / 100));
if (!reduced) {
  // one demo pass when the board first comes into view
  const demo = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return; demo.disconnect();
    const t0 = performance.now();
    const step = t => {
      const k = clamp((t - t0) / 2600), v = Math.sin(k * Math.PI * .75) / Math.sin(Math.PI * .75) * .75;
      const val = k < 1 ? Math.min(1, v) : .75;
      range.value = val * 100; setRake(val);
      if (k < 1 && !range.matches(':active')) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { threshold: .35 });
  demo.observe($('.lv-grid'));
}

/* ---------- scope tickets: drag to scroll ---------- */
const tk = $('.tickets');
let down = null;
tk.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; down = { x: e.clientX, s: tk.scrollLeft, moved: false }; });
addEventListener('pointermove', e => {
  if (!down) return; const dx = e.clientX - down.x;
  if (Math.abs(dx) > 4) { down.moved = true; tk.classList.add('dragging'); }
  tk.scrollLeft = down.s - dx;
});
addEventListener('pointerup', () => { if (!down) return; setTimeout(() => tk.classList.remove('dragging'), 0); down = null; });
tk.addEventListener('click', e => { if (tk.classList.contains('dragging')) e.preventDefault(); }, true);

/* ---------- step 03: skim the wall with a knife ---------- */
(function skimGame() {
  const card = $('.skim-card'), cv = $('.skim-canvas'), ctx = cv.getContext('2d');
  const wrap = $('.skim-canvas-wrap'), knife = $('.skim-knife'), pct = $('.skim-pct b');
  const rough = new Image(), smooth = new Image();
  rough.src = 'assets/img/skim-rough.webp'; smooth.src = 'assets/img/skim-smooth.webp';
  const mask = document.createElement('canvas'); mask.width = 900; mask.height = 560;
  const mctx = mask.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = 900; tmp.height = 560;
  const tctx = tmp.getContext('2d');
  const probe = document.createElement('canvas'); probe.width = 90; probe.height = 56;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  let last = null, dirty = true, loaded = 0, done = false;
  const draw = () => {
    if (loaded < 2) return;
    ctx.drawImage(rough, 0, 0, 900, 560);
    tctx.clearRect(0, 0, 900, 560); tctx.globalCompositeOperation = 'source-over';
    tctx.drawImage(smooth, 0, 0, 900, 560);
    tctx.globalCompositeOperation = 'destination-in'; tctx.drawImage(mask, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  };
  [rough, smooth].forEach(im => im.onload = () => { loaded++; draw(); });
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 900, y: (e.clientY - r.top) / r.height * 560, rx: e.clientX - r.left, ry: e.clientY - r.top }; };
  const stroke = (a, b) => {
    // a 10" knife held flat: a wide rectangle dragged from a to b
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    mctx.fillStyle = '#000';
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      mctx.globalAlpha = .9; mctx.fillRect(x - 95, y - 14, 190, 28);
    }
    mctx.globalAlpha = 1; dirty = true;
  };
  const measure = () => {
    pctx.clearRect(0, 0, 90, 56); pctx.drawImage(mask, 0, 0, 90, 56);
    const d = pctx.getImageData(0, 0, 90, 56).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 160) n++;
    const v = Math.round(n / (90 * 56) * 100); pct.textContent = v;
    if (v >= 88 && !done) { done = true; card.classList.add('done'); mctx.fillRect(0, 0, 900, 560); dirty = true; pct.textContent = 100; }
  };
  const loop = () => { if (dirty) { draw(); dirty = false; } requestAnimationFrame(loop); };
  loop();
  const moveKnife = p => { knife.style.transform = `translate(${p.rx - 60}px, ${p.ry - 46}px)`; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); last = toCanvas(e); card.classList.add('started', 'dragging'); stroke(last, last); moveKnife(last); });
  cv.addEventListener('pointermove', e => { const p = toCanvas(e); moveKnife(p); if (!last) return; stroke(last, p); last = p; });
  const end = () => { if (!last) return; last = null; card.classList.remove('dragging'); measure(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  let mt = 0; cv.addEventListener('pointermove', () => { if (last && performance.now() - mt > 160) { mt = performance.now(); measure(); } });
  $('.skim-reset').addEventListener('click', () => {
    mctx.clearRect(0, 0, 900, 560); done = false; card.classList.remove('done', 'started'); pct.textContent = 0; dirty = true;
  });
})();

/* ---------- bid form: prefilled email (demo has no backend) ---------- */
const form = $('.bid-form');
$('.bf-date').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fileIn = $('.bf-file input');
fileIn.addEventListener('change', () => {
  const n = fileIn.files.length;
  $('.bf-file-t').textContent = n ? `${n} file${n > 1 ? 's' : ''} ready: ${[...fileIn.files].map(f => f.name).join(', ').slice(0, 60)}` : 'Add plans or photos';
});
form.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(form), msg = $('.bf-msg');
  const bad = ['name', 'phone'].filter(k => !String(f.get(k) || '').trim());
  $$('input', form).forEach(i => i.classList.toggle('bad', bad.includes(i.name)));
  if (bad.length) { msg.textContent = 'Add your name and phone so we can call you back.'; return; }
  const body = [
    `Name: ${f.get('name')}`, `Company: ${f.get('company') || '-'}`, `Phone: ${f.get('phone')}`, `Email: ${f.get('email') || '-'}`,
    `Project type: ${f.get('type')}`, `Location: ${f.get('location') || '-'}`, '', `${f.get('details') || ''}`,
    fileIn.files.length ? `\n(Attaching: ${[...fileIn.files].map(x => x.name).join(', ')})` : '',
  ].join('\n');
  void body;
  msg.textContent = 'Preview only. On the live site this request goes straight to Next Gen Drywall.';
});

/* preview build: calls, email and the bid form are off */
(function () {
  const t = document.createElement('div'); t.className = 'pv-toast'; document.body.appendChild(t); let k;
  const say = m => { t.textContent = m; t.classList.add('on'); clearTimeout(k); k = setTimeout(() => t.classList.remove('on'), 2600); };
  document.addEventListener('click', e => { if (e.target.closest('[data-preview-off]')) { e.preventDefault(); say('Preview only. Calls and email are off in this concept.'); } }, true);
  document.addEventListener('submit', () => say('Preview only. On the live site this request goes to Next Gen Drywall.'), true);
})();
