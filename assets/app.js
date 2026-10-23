import { mountSequence, STAGES } from './seq.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const sectionProgress = (el, start = 0, end = 0) => {   // 0 when el top hits viewport top, 1 when its scrollable length is used up
  const r = el.getBoundingClientRect();
  return clamp((-r.top + start) / Math.max(1, r.height - innerHeight + end));
};

/* ---------- nav ---------- */
const burger = $('.nav-burger'), menu = $('#menu');
burger.addEventListener('click', () => {
  const open = burger.getAttribute('aria-expanded') !== 'true';
  burger.setAttribute('aria-expanded', open); menu.hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
});
menu.addEventListener('click', e => { if (e.target.closest('a')) burger.click(); });

/* ---------- hero: 3D build tied to scroll ---------- */
const hero = $('.hero'), steps = $$('.build-list li');
const NAMES = ['Hang', 'Fasten', 'Tape', 'Mud', 'Level 5'];
const setStage = s => {
  $('.hud-stage').textContent = `${String(s + 1).padStart(2, '0')} · ${NAMES[s]}`;
  steps.forEach((li, i) => { li.classList.toggle('on', i === s); li.classList.toggle('done', i < s); });
};
const onProgress = p => {
  $('.hud-tape').style.setProperty('--p', p);
  steps.forEach((li, i) => li.style.setProperty('--f', clamp((p - STAGES[i]) / (STAGES[i + 1] - STAGES[i]))));
};
const load = $('.hero-load');
const api = mountSequence($('.hero-canvas'), { onStage: setStage, onProgress, reduced,
  onLoad: f => { load.style.setProperty('--l', f); if (f >= 1) load.classList.add('done'); } });

/* ---------- finish levels: sheets stack as you scroll ---------- */
const LV = [
  ['Hung, not finished', 'Board screwed off, no tape. Temporary walls, or work where the final decorating isn’t decided.'],
  ['Fire-taping, concealed areas', 'Tape bedded in compound, ridges left. Above ceilings and in attics, wherever a fire rating is the only job.'],
  ['Tile backer & utility', 'One coat over the tape and every screw. Garages, storage and walls that will take tile.'],
  ['Textured surfaces', 'Two coats, feathered. The base for orange peel, knockdown and skip trowel.'],
  ['Standard painted interior', 'Three coats, sanded smooth. Right for flat paint in most rooms. Low sun can still find the joints.'],
  ['Skim coat, gloss & premium', 'A tight skim over the whole face. Nothing flashes through paint, even in 6:40 PM light.'],
];
const lvTrack = $('.lv-track'), sheets = $$('.sheet'), lvRead = $('.lv-read'), ticks = $$('.lv-ticks button');
let lvShown = -1;
function levelsFrame() {
  const q = sectionProgress(lvTrack), a = clamp(q * 5.6 - .1, 0, 5);  // a: sheets in, fractional
  const TAB = 30, sheetH = $('.stack').clientHeight - 5 * TAB;
  sheets.forEach((s, i) => {
    const t = i === 0 ? 1 : ease(clamp(a - i + 1));                 // sheet i slides in while a goes i-1 -> i
    const under = clamp(a - i, 0, 5 - i);                            // sheets now lying on top of it
    // each sheet on top lifts the older one a tab-height, so every end-tape label stays readable
    s.style.transform = `translateY(${(1 - t) * (sheetH + 60) - under * TAB}px) scale(${1 - under * .012})`;
    s.style.setProperty('--dim', (under * .07).toFixed(3));
    s.style.zIndex = i;
  });
  const cur = clamp(Math.round(a - .2), 0, 5);
  if (cur !== lvShown) {
    if (lvShown >= 0 && cur > lvShown) { sheets[cur].classList.remove('arrive'); void sheets[cur].offsetWidth; sheets[cur].classList.add('arrive'); }
    lvShown = cur;
    $('.lv-num').textContent = cur; $('.lv-tag').textContent = LV[cur][0]; $('.lv-desc').textContent = LV[cur][1];
    lvRead.classList.remove('swap'); void lvRead.offsetWidth; lvRead.classList.add('swap');
    ticks.forEach((b, i) => b.classList.toggle('on', i === cur));
  }
}
ticks.forEach((b, i) => b.addEventListener('click', () => {
  const r = lvTrack.getBoundingClientRect(), top = scrollY + r.top;
  scrollTo({ top: top + ((i + .1) / 5.6) * (lvTrack.offsetHeight - innerHeight), behavior: reduced ? 'auto' : 'smooth' });
}));
const range = $('.sun-range'), levels = $('#levels');
range.addEventListener('input', () => levels.style.setProperty('--rake', range.value / 100));

/* ---------- process: tape unrolls ---------- */
const run = $('.run');
function runFrame() {
  const r = run.getBoundingClientRect(), narrow = innerWidth <= 960;
  const p = narrow ? clamp((innerHeight * .7 - r.top) / r.height) : clamp((innerHeight * .85 - r.top) / (innerHeight * .5));
  run.style.setProperty('--run', p);
  $$('.rs', run).forEach((el, i) => el.classList.toggle('in', p > (narrow ? i / 4 : i * .22 + .05)));
}

/* ---------- builders: floors move through the trades as you scroll ---------- */
// production climbs the building: floor 1 is hung first, so mid-scroll every floor sits at a different stage
const FLOW = [['Hanging', '#d9f23c'], ['Taping', '#e6cf95'], ['Finishing', '#ffffff'], ['Paint-ready', '#7fd6a2']];
const floorsEl = $$('.fl');
function siteFrame() {
  const r = $('.site-photo').getBoundingClientRect();
  const phase = clamp((innerHeight - r.top) / (r.height + innerHeight)) * 6.3;   // centred photo = every floor at a different stage
  floorsEl.forEach((fl, i) => {
    const k = 3 - i;                                                  // .fl order is FL 4 down to FL 1
    const st = Math.min(3, Math.floor(phase - k * .9));
    fl.classList.toggle('on', st >= 0);
    if (st >= 0) { fl.style.setProperty('--c', FLOW[st][1]); $('em', fl).textContent = FLOW[st][0]; }
  });
}

/* ---------- services: cards slide in from the right and stack ---------- */
const svcTrack = $('.svc-track'), cards = $$('.sc'), svcIdx = $$('.svc-index li');
function servicesFrame() {
  const deck = $('.svc-deck'), Wd = deck.clientWidth, spine = parseFloat(getComputedStyle(deck).getPropertyValue('--spine')) || 58;
  const a = clamp(sectionProgress(svcTrack) * 6.3 - .25, 0, 5);
  cards.forEach((c, i) => {
    const t = i === 0 ? 1 : ease(clamp(a - i + 1));
    const home = i * spine, start = Wd + 40;
    c.style.transform = `translateX(${start + (home - start) * t}px)`;
    c.style.zIndex = i;
    c.style.setProperty('--sp', a > i + .35 ? 1 : 0);                 // once covered, the spine label shows
  });
  const cur = Math.round(a);
  svcIdx.forEach((li, i) => { li.classList.toggle('on', i === cur); li.classList.toggle('done', i < cur); });
}

/* ---------- texture lab: a work light you move; drifts on its own when you don't ---------- */
$$('.lab-img').forEach((el, k) => {
  let held = false, live = false, raf = 0;
  const set = (x, y) => { el.style.setProperty('--lx', x + '%'); el.style.setProperty('--ly', y + '%'); };
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); held = true; set((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100); });
  el.addEventListener('pointerleave', () => { held = false; });
  const drift = t => { if (!live) return; raf = requestAnimationFrame(drift); if (held || reduced) return;
    const s = t / 1000 + k * 1.7; set(50 + Math.sin(s * .6) * 34, 46 + Math.sin(s * .9 + k) * 30); };
  new IntersectionObserver(([e]) => { live = e.isIntersecting; cancelAnimationFrame(raf); if (live) raf = requestAnimationFrame(drift); }).observe(el);
});

/* ---------- one scroll loop ---------- */
const callbar = $('.callbar');
let ticking = false;
function onScroll() {
  ticking = false;
  const total = hero.offsetHeight - innerHeight, p = clamp(scrollY / total);
  api && api.setProgress(p);
  hero.classList.toggle('moved', scrollY > 40);
  callbar.classList.toggle('on', scrollY > innerHeight * .6);
  levelsFrame(); runFrame(); siteFrame(); servicesFrame();
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
addEventListener('resize', onScroll);
onScroll();

/* ---------- reveals ---------- */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -18% 0px' });
$$('.permit, .cred, .bid, .gantt').forEach(el => io.observe(el));

/* ---------- crews: panels light up on their own, in random order ---------- */
(function crews() {
  const panels = $$('.cp'), DUR = 2200;
  panels.forEach(p => { const b = document.createElement('i'); b.className = 'cp-bar'; p.appendChild(b); p.style.setProperty('--dur', DUR + 'ms'); });
  let cur = -1, timer = null, held = false, bag = [];
  const next = () => {
    if (!bag.length) bag = panels.map((_, i) => i).filter(i => i !== cur).sort(() => Math.random() - .5);
    return bag.shift();
  };
  const show = i => { cur = i; panels.forEach((p, k) => p.classList.toggle('on', k === i)); };
  const tick = () => { if (!held && !document.hidden) show(next()); };
  show(1);
  if (!reduced) timer = setInterval(tick, DUR);
  panels.forEach((p, i) => {
    p.addEventListener('pointerenter', () => { held = true; show(i); });
    p.addEventListener('pointerleave', () => { held = false; });
    p.addEventListener('click', () => show(i));
  });
})();

/* ---------- faq: roll the answer on ---------- */
$$('.fq').forEach(f => $('.fq-q', f).addEventListener('click', () => {
  const open = !f.classList.contains('open');
  f.classList.toggle('open', open); $('.fq-q', f).setAttribute('aria-expanded', open);
}));

/* ---------- step 03: skim the wall with a knife ---------- */
(function skimGame() {
  const host = $('.try'), cv = $('.skim-canvas'), ctx = cv.getContext('2d');
  const knife = $('.skim-knife'), pct = $('.skim-pct b');
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
  [rough, smooth].forEach(im => im.onload = () => { loaded++; dirty = true; });
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 900, y: (e.clientY - r.top) / r.height * 560, rx: e.clientX - r.left, ry: e.clientY - r.top }; };
  const stroke = (a, b) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    mctx.fillStyle = '#000';
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      mctx.globalAlpha = .9; mctx.fillRect(x - 95, y - 16, 190, 32);
    }
    mctx.globalAlpha = 1; dirty = true;
  };
  const measure = () => {
    pctx.clearRect(0, 0, 90, 56); pctx.drawImage(mask, 0, 0, 90, 56);
    const d = pctx.getImageData(0, 0, 90, 56).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 160) n++;
    const v = Math.round(n / (90 * 56) * 100); pct.textContent = v;
    if (v >= 85 && !done) { done = true; host.classList.add('done'); mctx.fillRect(0, 0, 900, 560); dirty = true; pct.textContent = 100; }
  };
  const loop = () => { if (dirty) { draw(); dirty = false; } requestAnimationFrame(loop); };
  loop();
  const moveKnife = p => { knife.style.transform = `translate(${p.rx - 60}px, ${p.ry - 46}px)`; };
  cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch {} last = toCanvas(e); host.classList.add('started', 'dragging'); stroke(last, last); moveKnife(last); });
  let mt = 0;
  cv.addEventListener('pointermove', e => {
    const p = toCanvas(e); moveKnife(p); if (!last) return; stroke(last, p); last = p;
    if (performance.now() - mt > 160) { mt = performance.now(); measure(); }
  });
  const end = () => { if (!last) return; last = null; host.classList.remove('dragging'); measure(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('.skim-reset').addEventListener('click', () => {
    mctx.clearRect(0, 0, 900, 560); done = false; host.classList.remove('done', 'started'); pct.textContent = 0; dirty = true;
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
