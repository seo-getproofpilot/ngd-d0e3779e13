// Next Gen Drywall v2d.
// Two scroll-scrubbed walks share one player: the hero (a house going from bare studs to paint-ready) and the bid
// walk (a second house, stopping at each thing that sets the price). Each is AI-generated footage joined at its
// keyframes and cut to frames at 12fps. The walk holds in each room long enough to read it, then moves on.
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 820px)').matches;

/* ---------- the scrub player ---------- */
function walk({ section, canvas, seq, N, KEY, HOLD, WALK, vh = 72, eager = false, drift = 1, frameEl, cards, onStage, onFrame, onDraw, focus }) {
  const ctx = canvas.getContext('2d'), dir = small ? 'm' : 'd';
  const SEG = []; let U = 0;
  for (let k = 0; k < KEY.length; k++) {
    SEG.push({ kind: 'hold', k, a: U, b: U += HOLD[k] });
    if (k < KEY.length - 1) SEG.push({ kind: 'walk', k, a: U, b: U += WALK[k] });
  }
  section.style.height = `${100 + U * vh}vh`;
  const frames = new Array(N).fill(null);
  let loaded = 0, started = false;
  const order = [];
  for (const step of [24, 6, 2, 1]) for (let i = 0; i < N; i += step) if (!order.includes(i)) order.push(i);
  let next = 0;
  const pump = () => {
    if (next >= order.length) return;
    const i = order[next++], im = new Image();
    im.decoding = 'async';
    im.onload = im.onerror = () => { if (im.naturalWidth) frames[i] = im; loaded++; onFrame && onFrame(loaded / N); pump(); };
    im.src = `assets/${seq}/${dir}/${String(i).padStart(3, '0')}.webp`;
  };
  const start = () => { if (started) return; started = true; for (let k = 0; k < 6; k++) pump(); };
  if (eager) start();
  else new IntersectionObserver(([e], io) => { if (e.isIntersecting) { start(); io.disconnect(); } }, { rootMargin: '1600px 0px' }).observe(section);
  const nearest = i => { for (let d = 0; d < N; d++) { if (frames[i - d]) return i - d; if (frames[i + d]) return i + d; } return -1; };

  let W = 1, H = 1, DPR = 1;
  const resize = () => { DPR = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); };
  addEventListener('resize', resize); resize();
  const posU = () => { const r = section.getBoundingClientRect(), span = r.height - innerHeight; return clamp(-r.top / span) * U; };
  const frameAt = u => {
    for (const s of SEG) if (u <= s.b) {
      if (s.kind === 'hold') return KEY[s.k];
      return KEY[s.k] + (KEY[s.k + 1] - KEY[s.k]) * smooth((u - s.a) / (s.b - s.a));
    }
    return KEY[KEY.length - 1];
  };
  let shown = 0, stage = -1;
  const t0 = performance.now();
  function draw(now) {
    const u = posU(), target = frameAt(u);
    shown += (target - shown) * (reduced ? 1 : .11);
    if (Math.abs(target - shown) < .01) shown = target;
    const s = Math.max(W / 16, H / 9) * 1.07, w = 16 * s, h = 9 * s, tt = (now - t0) / 1000;
    const amp = reduced ? 0 : drift * (1 + (Math.abs(target - shown) > .3 ? .6 : 0));
    const dx = (Math.sin(tt * .53) * 5 + Math.sin(tt * 1.37) * 2) * amp, dy = (Math.sin(tt * .71 + 1) * 3.5 + Math.sin(tt * 2.1) * 1.2) * amp;
    const rot = (Math.sin(tt * .43) * .0016 + Math.sin(tt * 1.1) * .0006) * amp;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#151618'; ctx.fillRect(0, 0, W, H);
    // on a tall phone the cover crop is narrow; `focus` says which part of the frame to keep (0 left, 1 right)
    const fx = focus ? focus(shown) : .5, cx = clamp(W / 2 + (.5 - fx) * w, W - w / 2, w / 2) - W / 2;
    ctx.setTransform(DPR, 0, 0, DPR, (W / 2 + dx + cx) * DPR, (H / 2 + dy) * DPR);
    ctx.rotate(rot); ctx.scale(w / W, h / H);
    const a = Math.floor(shown), b = Math.min(N - 1, a + 1), fr = shown - a, fa = frames[a] ? a : nearest(a);
    const put = (i, al) => { ctx.globalAlpha = al; ctx.drawImage(frames[i], -W / 2, -H / 2, W, H); };
    if (fa >= 0) put(fa, 1);
    if (fa === a && fr > .02 && frames[b]) put(b, fr);   // only blend true neighbours, never a stand-in frame
    ctx.globalAlpha = 1;
    onDraw && onDraw(shown, { x: (W - w) / 2 + dx + cx, y: (H - h) / 2 + dy, w, h });
    if (frameEl) Object.assign(frameEl.style, { left: `${(W - w) / 2 + dx + cx}px`, top: `${(H - h) / 2 + dy}px`, width: `${w}px`, height: `${h}px` });
    // which stage you are in, and how visible its card is
    let k = 0, vis = 0;
    for (const sg of SEG) if (u >= sg.a && u <= sg.b) {
      if (sg.kind === 'hold') { k = sg.k; vis = 1; }
      else { const t = (u - sg.a) / (sg.b - sg.a); k = t < .5 ? sg.k : sg.k + 1; vis = t < .5 ? 1 - smooth(clamp(t / .22)) : smooth(clamp((t - .78) / .22)); }
    }
    if (u >= U) { k = KEY.length - 1; vis = 1; }
    cards.forEach((c, i) => {
      const on = i === k ? vis : 0;
      c.style.opacity = on; c.style.transform = `translateY(${(1 - on) * 20}px)`; c.style.visibility = on > .01 ? 'visible' : 'hidden';
    });
    if (k !== stage) { stage = k; onStage(k); }
    onStage.vis && onStage.vis(u / U, vis);
  }
  let on = true;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }, { rootMargin: '100px' }).observe(section);
  const loop = now => { if (on) draw(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return {
    goTo(k) {
      const s = SEG.find(x => x.kind === 'hold' && x.k === k), r = section.getBoundingClientRect(), span = r.height - innerHeight;
      const mid = k === 0 ? 0 : (s.a + s.b) / 2;
      scrollTo({ top: scrollY + r.top + (mid / U) * span, behavior: reduced ? 'auto' : 'smooth' });
    },
  };
}

// CSS matrix3d that maps a w×h box onto any four screen points (TL, TR, BR, BL)
function quadMatrix(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${x0},${y0},0,1)`;
}

/* ---------- the hero walk ---------- */
{
  const LINES = [
    'The door’s open. Come on in.',
    'Foyer first. Ceilings go up before the walls.',
    'Every seam taped, every corner, every screw.',
    'Each coat goes on a little wider than the last.',
    'Put a light across it. Not a ridge anywhere.',
    'And this is the part you keep.',
  ];
  // a short walk up from the yard sign was joined onto the front of the footage
  const SEQ_N = 589, SEQ_KEY = [0, 204, 300, 396, 492, 588];
  const SIGN = [[1947.5 / 2560, 762 / 1440], [2204 / 2560, 763 / 1440], [2204 / 2560, 980 / 1440], [1947.5 / 2560, 999 / 1440]], sign = $('.sign-hd');
  const routeBtns = $$('.route button'), caption = $('.caption'), quote = $('.caption blockquote'), fill = $('.route-line i'), loadBar = $('.tour-load i');
  let capT;
  const onStage = k => {
    $('.tour').dataset.stage = k;
    routeBtns.forEach((b, i) => { b.classList.toggle('on', i === k); b.classList.toggle('done', i < k); });
    caption.classList.remove('show'); clearTimeout(capT);
    capT = setTimeout(() => { quote.textContent = LINES[k]; caption.classList.add('show'); }, 260);
  };
  onStage.vis = (p, vis) => { fill.style.transform = `scaleX(${p})`; caption.style.opacity = vis > .6 ? '' : 0; };
  const hero = walk({
    section: $('.tour'), canvas: $('.tour-cv'), seq: 'seq', N: SEQ_N, KEY: SEQ_KEY,
    HOLD: [.6, .9, .9, .9, .9, 1.2], WALK: [2.6, 1.15, 1.15, 1.15, 1.15], eager: true,
    cards: [$('.tour-intro'), ...$$('.room')], onStage,
    // open on the yard sign, then ease back to centre as you walk to the door
    focus: shown => .5 + .32 * (1 - smooth(clamp((shown - 6) / 60))),
    onDraw: (shown, r) => {
      // the sign's corners in the opening frame, as fractions of the frame
      const q = SIGN.map(([u, v]) => [r.x + u * r.w, r.y + v * r.h]);
      sign.style.transform = quadMatrix(1050, 930, q);
      sign.style.opacity = clamp(1 - shown / .35);   // hand off to the footage the moment the walk starts
    },
    onFrame: f => { loadBar.style.transform = `scaleX(${f})`; if (f >= 1) $('.tour-load').classList.add('done'); },
  });
  routeBtns.forEach(b => b.addEventListener('click', () => hero.goTo(+b.dataset.go)));
  // the call clock runs in real time, like a live call
  const clock = $('.call-t'), t0 = performance.now();
  setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
}

/* ---------- the bid walk: what sets your number ---------- */
{
  const notes = $$('.bidwalk .note, .bidwalk .tag'), sched = $('.sched'), rail = $('.bw-rail i');
  const onStage = k => {
    const n = k - 1;   // stage 0 is the intro; the stops start at 1
    notes.forEach(el => el.classList.toggle('on', +el.dataset.n === n));
    sched.classList.toggle('on', k === 7);
  };
  onStage.vis = (p, vis) => { rail.style.transform = `scaleX(${p})`; $('.bw-frame').style.opacity = vis > .5 ? 1 : 0; };
  walk({
    section: $('.bidwalk'), canvas: $('.bw-cv'), seq: 'seq2', N: 529, KEY: [0, 0, 96, 192, 264, 336, 432, 528],
    HOLD: [.7, .9, .9, .9, .9, .9, .9, 1.3], WALK: [.4, 1.1, 1.1, .9, .9, 1.1, 1.3], drift: .6,
    frameEl: $('.bw-frame'), cards: [$('.bw-intro'), ...$$('.stop')], onStage,
  });
}

/* ---------- nav goes solid once you leave the house ---------- */
const nav = $('.nav'), tour = $('.tour');
const navTone = () => nav.classList.toggle('solid', tour.getBoundingClientRect().bottom < 80);
addEventListener('scroll', navTone, { passive: true }); navTone();

/* ---------- services: pinned; the scroll opens each service in turn ---------- */
{
  const svc = $('.svc'), panels = $$('.panel'), tabs = $$('.svc-tabs button'), bar = $('.svc-bar i');
  let cur = -1;
  const open = i => {
    if (i === cur) return; cur = i;
    panels.forEach((x, k) => x.classList.toggle('on', k === i));
    tabs.forEach((t, k) => t.setAttribute('aria-selected', k === i));
  };
  const span = () => svc.offsetHeight - innerHeight;
  const frame = () => {
    const p = clamp(-svc.getBoundingClientRect().top / span());
    bar.style.transform = `scaleX(${p})`;
    open(Math.min(panels.length - 1, Math.floor(p * panels.length)));
  };
  addEventListener('scroll', frame, { passive: true }); addEventListener('resize', frame); frame();
  const go = i => scrollTo({ top: scrollY + svc.getBoundingClientRect().top + span() * (i + .5) / panels.length, behavior: reduced ? 'auto' : 'smooth' });
  panels.forEach((p, i) => $('.panel-btn', p).addEventListener('click', () => go(i)));
  tabs.forEach((t, i) => t.addEventListener('click', () => go(i)));
}

/* ---------- finish levels ---------- */
{
  const LV = [
    ['Level 0, hung', 'Board screwed off, no tape. Temporary walls, or work where the final decorating isn’t decided.'],
    ['Level 1, fire-taping', 'Tape bedded in compound, ridges left. Above ceilings and in attics, wherever a fire rating is the only job.'],
    ['Level 2, tile backer & utility', 'One coat over the tape and every screw. Garages, storage and walls that will take tile.'],
    ['Level 3, textured surfaces', 'Two coats, feathered. The base for orange peel, knockdown and skip trowel.'],
    ['Level 4, standard painted', 'Three coats, sanded smooth. Right for flat paint in most rooms. Low sun can still find the joints.'],
    ['Level 5, skim coat', 'A tight skim over the whole face. Nothing flashes through paint, even in 6:40 PM light.'],
  ];
  const imgs = $$('.lv-fig img'), inp = $('.lv-range input');
  inp.addEventListener('input', () => {
    const n = +inp.value;
    imgs.forEach((im, i) => { im.classList.toggle('on', i === n); im.alt = i === n ? `A drywall wall finished to Level ${n}, lit by low raking light` : ''; });
    $('.lv-tag').textContent = LV[n][0]; $('.lv-desc').textContent = LV[n][1];
  });
}

/* ---------- the texture wall: bare board, trowel a texture on ---------- */
{
  const wall = $('.wall'), cv = $('.wall-cv'), c = cv.getContext('2d'), knife = $('.knife');
  const SRC = { 'orange-peel': 'tex-orange-peel', knockdown: 'tex-knockdown', 'skip-trowel': 'tex-skip-trowel', smooth: 'level-5' };
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const pics = {};
  const want = [['base-rake', 'level-0-rake'], ['base-flat', 'level-0-flat']];
  for (const [k, f] of Object.entries(SRC)) want.push([`${k}-rake`, `${f}-rake`], [`${k}-flat`, `${f}-flat`]);
  let tex = 'orange-peel', light = 'rake';
  const mask = document.createElement('canvas'), mc = mask.getContext('2d');
  const tmp = document.createElement('canvas'), tc = tmp.getContext('2d');
  let W = 0, H = 0;
  const size = () => {
    const r = wall.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    const nw = Math.round(r.width * d), nh = Math.round(r.height * d);
    if (nw === W && nh === H) return;
    const keep = W ? document.createElement('canvas') : null;
    if (keep) { keep.width = W; keep.height = H; keep.getContext('2d').drawImage(mask, 0, 0); }
    W = cv.width = mask.width = tmp.width = nw; H = cv.height = mask.height = tmp.height = nh;
    if (keep) mc.drawImage(keep, 0, 0, W, H);
    paint();
  };
  const cover = (ctx, im) => { if (!im) return; const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); };
  function paint() {
    if (!W) return;
    cover(c, pics[`base-${light}`]);
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, W, H);
    cover(tc, pics[`${tex}-${light}`]);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(mask, 0, 0);
    c.drawImage(tmp, 0, 0);
  }
  // one pass of the knife: a soft-edged band, wider than it is tall, feathered at the ends
  const stamp = (x, y, ang) => {
    const R = Math.max(W, H) * .075;
    mc.save(); mc.translate(x, y); mc.rotate(ang); mc.scale(1, .55);
    const g = mc.createRadialGradient(0, 0, R * .2, 0, 0, R);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.6, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    mc.fillStyle = g; mc.beginPath(); mc.arc(0, 0, R, 0, Math.PI * 2); mc.fill(); mc.restore();
  };
  let last = null;
  const stroke = (x, y) => {
    const d = Math.min(devicePixelRatio || 1, 2); x *= d; y *= d;
    if (last) {
      const dx = x - last.x, dy = y - last.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) + Math.PI / 2;
      const n = Math.max(1, Math.ceil(dist / (W * .01)));
      for (let i = 1; i <= n; i++) stamp(last.x + dx * i / n, last.y + dy * i / n, ang);
    } else stamp(x, y, 0);
    last = { x, y }; paint();
  };
  const pos = e => { const r = wall.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const moveKnife = (x, y, tilt = -18) => { knife.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`; };
  let down = false, demoing = false;
  wall.addEventListener('pointerenter', () => wall.classList.add('live'));
  wall.addEventListener('pointerleave', () => { if (!demoing) wall.classList.remove('live'); down = false; last = null; });
  wall.addEventListener('pointerdown', e => {
    if (e.target.closest('.wall-bar')) return;
    down = true; wall.classList.add('touched', 'live'); last = null; wall.setPointerCapture(e.pointerId);
    const [x, y] = pos(e); moveKnife(x, y); stroke(x, y);
  });
  wall.addEventListener('pointermove', e => { const [x, y] = pos(e); moveKnife(x, y); if (down) stroke(x, y); });
  addEventListener('pointerup', () => { down = false; last = null; });
  $$('.tex-chips button').forEach(b => b.addEventListener('click', () => {
    $$('.tex-chips button').forEach(x => x.setAttribute('aria-checked', x === b));
    tex = b.dataset.tex; mc.clearRect(0, 0, W, H); paint(); demo();
  }));
  $$('.light button').forEach(b => b.addEventListener('click', () => {
    $$('.light button').forEach(x => x.classList.toggle('on', x === b));
    light = b.dataset.light; paint();
  }));
  $('.wall-reset').addEventListener('click', () => { mc.clearRect(0, 0, W, H); paint(); });
  // the wall demonstrates itself once: three overlapping passes of the knife, left to right
  function demo() {
    if (reduced) { mc.fillRect(0, 0, W, H); paint(); return; }
    demoing = true; wall.classList.add('live');
    const r = wall.getBoundingClientRect(), passes = [.3, .52, .74], t0 = performance.now(), per = 900;
    const step = now => {
      const t = (now - t0) / per, k = Math.floor(t), f = t - k;
      if (k >= passes.length) { demoing = false; last = null; if (!wall.matches(':hover')) wall.classList.remove('live'); return; }
      if (f < .05) last = null;
      const x = r.width * (.06 + .88 * f), y = r.height * (passes[k] + Math.sin(f * Math.PI) * -.05);
      moveKnife(x, y, -18 + f * 10); stroke(x, y);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  Promise.all(want.map(([k, f]) => load(`assets/img/${f}.webp`).then(im => { pics[k] = im; }))).then(() => {
    size();
    new ResizeObserver(size).observe(wall);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); demo(); } }, { threshold: .55 });
    io.observe(wall);
  });
}

/* ---------- repair: drag between before and after ---------- */
{
  const ba = $('.ba'), inp = $('.ba-in');
  inp.addEventListener('input', () => ba.style.setProperty('--x', `${inp.value}%`));
  // it sweeps once on arrival so the after is obvious
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting || reduced) return; io.disconnect();
    const t0 = performance.now();
    const step = now => { const t = clamp((now - t0) / 1800), v = 50 + Math.sin(t * Math.PI * 2) * 32 * (1 - t); ba.style.setProperty('--x', `${v}%`); inp.value = v; if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, { threshold: .6 }).observe(ba);
}

/* ---------- builders: each floor at a different stage ---------- */
{
  const fls = $$('.fl'); let i = 0;
  const tick = () => { fls.forEach((f, k) => f.classList.toggle('on', k === i)); i = (i + 1) % fls.length; };
  tick(); if (!reduced) setInterval(tick, 2200);
}

/* ---------- reveal on scroll ---------- */
const rv = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
$$('.sec-head, .steps li, .record, .crew li, .caps li, .faq details').forEach(el => { el.classList.add('rv'); rv.observe(el); });

/* ---------- bid: the blueprint. Mark rooms, fill in the title block, stamp it ---------- */
{
  const form = $('.print'), fileIn = $('.tb-file input'), sel = $('.print-sel span');
  $('.tb-today').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rooms = $$('.plan .rm');
  const marked = () => rooms.filter(r => r.getAttribute('aria-checked') === 'true').map(r => r.dataset.room);
  const toggle = r => { r.setAttribute('aria-checked', r.getAttribute('aria-checked') !== 'true'); const m = marked(); sel.textContent = m.length ? m.join(', ') : 'none yet'; };
  rooms.forEach(r => {
    r.addEventListener('click', () => toggle(r));
    r.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(r); } });
  });
  fileIn.addEventListener('change', () => {
    const n = fileIn.files.length;
    $('.bf-file-t').textContent = n ? `${n} file${n > 1 ? 's' : ''} attached: ${[...fileIn.files].map(f => f.name).join(', ').slice(0, 60)}` : 'Attach plans or photos';
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form), msg = $('.bf-msg');
    const bad = ['name', 'phone'].filter(k => !String(f.get(k) || '').trim());
    $$('input', form).forEach(i => i.classList.toggle('bad', bad.includes(i.name)));
    if (bad.length) { msg.textContent = 'Add your name and phone so we can call you back.'; return; }
    const body = [
      `Name: ${f.get('name')}`, `Company: ${f.get('company') || '-'}`, `Phone: ${f.get('phone')}`, `Email: ${f.get('email') || '-'}`,
      `Project type: ${f.get('type')}`, `Rooms: ${marked().join(', ') || '-'}`, `Location: ${f.get('location') || '-'}`, '', `${f.get('details') || ''}`,
      fileIn.files.length ? `\n(Attaching: ${[...fileIn.files].map(x => x.name).join(', ')})` : '',
    ].join('\n');
    form.classList.remove('sent'); void form.offsetWidth; form.classList.add('sent');
    void body;
    msg.textContent = 'Stamped. Preview only: on the live site this goes straight to Next Gen Drywall.';
  });
}

/* preview build: calls, email and the bid form are off */
(function () {
  const t = document.createElement('div'); t.className = 'pv-toast'; document.body.appendChild(t); let k;
  const say = m => { t.textContent = m; t.classList.add('on'); clearTimeout(k); k = setTimeout(() => t.classList.remove('on'), 2600); };
  document.addEventListener('click', e => { if (e.target.closest('[data-preview-off]')) { e.preventDefault(); say('Preview only. Calls and email are off in this concept.'); } }, true);
})();
