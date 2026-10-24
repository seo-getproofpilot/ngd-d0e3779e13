// Next Gen Drywall v2f.
// Two scroll-scrubbed walks share one player: the hero (a house going from bare studs to paint-ready) and the bid
// walk (a second house, stopping at each thing that sets the price). Each is AI-generated footage joined at its
// keyframes and cut to every frame at 24fps (tools-seq.py). Scroll is mapped to how far the picture has moved, not to
// clip time, so fast turns get more scroll and the camera seems to walk at one steady pace.
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 820px)').matches;

/* ---------- the scrub player ---------- */
// stops: which of motion.json's keys the walk halts at (one per card)
function walk({ section, canvas, seq, stops, HOLD, WALK, vh = 72, eager = false, drift = 1, pace = .42, holdPace = 1.4, frameEl, cards, onStage, onFrame, onDraw, focus }) {
  const ctx = canvas.getContext('2d'), dir = small ? 'm' : 'd';
  const SEG = []; let U = 0;
  for (let k = 0; k < stops.length; k++) {
    SEG.push({ kind: 'hold', k, a: U, b: U += HOLD[k] });
    if (k < stops.length - 1) SEG.push({ kind: 'walk', k, a: U, b: U += WALK[k] });
  }
  section.style.height = `${100 + U * vh}vh`;

  let N = 0, KEY = [], M = [];
  const blobs = [], bmps = new Map();
  let fetched = 0, inflight = 0, decoding = 0, want = 0, last = null;
  const url = i => `assets/${seq}/${dir}/${String(i).padStart(4, '0')}.webp`;
  // fetch order: a coarse pass first so the whole walk is scrubbable fast, then fill in, always nearest to where you are
  const nextFetch = () => {
    let best = -1, cost = Infinity;
    for (let i = 0; i < N; i++) {
      if (blobs[i] !== undefined) continue;
      const c = Math.abs(i - want) / (i % 8 === 0 ? 10 : i % 2 === 0 ? 3 : 1);
      if (c < cost) { cost = c; best = i; }
    }
    return best;
  };
  const pump = () => {
    while (inflight < 8) {
      const i = nextFetch(); if (i < 0) return;
      blobs[i] = null; inflight++;
      fetch(url(i)).then(r => r.ok ? r.blob() : null).catch(() => null).then(b => {
        blobs[i] = b || false; inflight--; fetched++; onFrame && onFrame(fetched / N); pump();
      });
    }
  };
  // decoded frames live only in a window around where you are; everything else stays compressed
  const AHEAD = small ? 50 : 80, BEHIND = small ? 30 : 40;
  const decode = () => {
    for (const [i, b] of bmps) if (i < want - BEHIND - 20 || i > want + AHEAD + 20) { if (b && b !== last) b.close && b.close(); bmps.delete(i); }   // never close the frame on screen
    for (let d = 0; d <= AHEAD && decoding < 6; d++) for (const i of d ? [want + d, want - d] : [want]) {
      if (i < 0 || i >= N || i < want - BEHIND || bmps.has(i) || !blobs[i] || decoding >= 6) continue;
      decoding++; bmps.set(i, null);
      createImageBitmap(blobs[i]).then(b => { if (bmps.has(i)) bmps.set(i, b); else b.close && b.close(); }).catch(() => bmps.delete(i)).finally(() => decoding--);
    }
  };
  let ready = false;
  const start = () => fetch(`assets/${seq}/motion.json`).then(r => r.json()).then(j => {
    N = j.n; KEY = stops.map(s => j.keys[s]); M = j.motion; ready = true; pump();
  });
  if (eager) start();
  else new IntersectionObserver(([e], io) => { if (e.isIntersecting) { start(); io.disconnect(); } }, { rootMargin: '1800px 0px' }).observe(section);

  let W = 1, H = 1, DPR = 1;
  const resize = () => { DPR = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); };
  addEventListener('resize', resize); resize();
  const posU = () => { const r = section.getBoundingClientRect(), span = r.height - innerHeight; return clamp(-r.top / span) * U; };
  // the frame whose cumulative motion matches m, between frames a and b
  const atMotion = (m, a, b) => {
    let lo = a, hi = b;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (M[mid] < m) lo = mid; else hi = mid; }
    const span = M[hi] - M[lo];
    return lo + (span > 0 ? clamp((m - M[lo]) / span) : 0);
  };
  const frameAt = u => {
    for (const s of SEG) if (u <= s.b) {
      if (s.kind === 'hold') return KEY[s.k];
      const t = (u - s.a) / (s.b - s.a), te = .8 * t + .2 * smooth(t);   // a touch of ease at each end, like a real stop
      const a = KEY[s.k], b = KEY[s.k + 1];
      return atMotion(M[a] + te * (M[b] - M[a]), a, b);
    }
    return KEY[KEY.length - 1];
  };
  // The scroll only says where the walk is headed. A playhead walks there at one steady pace, however hard you
  // scroll: it eases up to speed, holds it, and eases to a stop, so the footage never sprints or lurches.
  // `pace` is walking speed in scroll units a second; standing in a room passes quicker (`holdPace`).
  let uP = posU(), vel = 0, shown = 0, stage = -1, amp = drift, prev = performance.now();
  const t0 = prev;
  const segAt = u => SEG.find(sg => u <= sg.b) || SEG[SEG.length - 1];
  function draw(now) {
    const dt = Math.min(.05, (now - prev) / 1000); prev = now;
    const goal = posU(), gap = goal - uP;
    if (reduced || window.__ngdInstant) uP = goal;   // __ngdInstant: screenshot QC only
    else {
      const top = segAt(uP).kind === 'hold' ? holdPace : pace;
      const want_v = Math.sign(gap) * Math.min(top, Math.abs(gap) * 2.2);   // slow down as it arrives
      vel += (want_v - vel) * (1 - Math.exp(-dt * 5));                       // and speed up gently
      uP += vel * dt;
      if (Math.abs(gap) < .002 && Math.abs(vel) < .01) { uP = goal; vel = 0; }
    }
    const u = uP;
    if (window.__ngdProbe && section.classList.contains('tour')) window.__ngdProbe.push([now, uP, goal]);   // QC only
    if (ready) {
      shown = frameAt(u);
      want = Math.round(shown); pump(); decode();
      amp += ((reduced ? 0 : drift * (Math.abs(vel) > .05 && segAt(u).kind === 'walk' ? 1.5 : 1)) - amp) * (1 - Math.exp(-dt * 2.5));
    }
    const s = Math.max(W / 16, H / 9) * 1.07, w = 16 * s, h = 9 * s, tt = (now - t0) / 1000;
    const dx = (Math.sin(tt * .53) * 5 + Math.sin(tt * 1.37) * 2) * amp, dy = (Math.sin(tt * .71 + 1) * 3.5 + Math.sin(tt * 2.1) * 1.2) * amp;
    const rot = (Math.sin(tt * .43) * .0016 + Math.sin(tt * 1.1) * .0006) * amp;
    // on a tall phone the cover crop is narrow; `focus` says which part of the frame to keep (0 left, 1 right)
    const fx = focus ? focus(shown) : .5, cx = clamp(W / 2 + (.5 - fx) * w, W - w / 2, w / 2) - W / 2;
    let im = bmps.get(want);
    if (!im) for (let d = 1; d < 40 && !im; d++) im = bmps.get(want - d) || bmps.get(want + d);
    if (im) last = im;
    if (last) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = '#151618'; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(DPR, 0, 0, DPR, (W / 2 + dx + cx) * DPR, (H / 2 + dy) * DPR);
      ctx.rotate(rot); ctx.scale(w / W, h / H);
      ctx.drawImage(last, -W / 2, -H / 2, W, H);
    }
    onDraw && onDraw(shown, { x: (W - w) / 2 + dx + cx, y: (H - h) / 2 + dy, w, h });
    if (frameEl) Object.assign(frameEl.style, { left: `${(W - w) / 2 + dx + cx}px`, top: `${(H - h) / 2 + dy}px`, width: `${w}px`, height: `${h}px` });
    // which stage you are in, and how visible its card is
    let k = 0, vis = 0;
    for (const sg of SEG) if (u >= sg.a && u <= sg.b) {
      if (sg.kind === 'hold') { k = sg.k; vis = 1; }
      else { const t = (u - sg.a) / (sg.b - sg.a); k = t < .5 ? sg.k : sg.k + 1; vis = t < .5 ? 1 - smooth(clamp(t / .22)) : smooth(clamp((t - .78) / .22)); }
    }
    if (u >= U) { k = stops.length - 1; vis = 1; }
    cards.forEach((c, i) => {
      const on = i === k ? vis : 0;
      c.style.opacity = on; c.style.transform = `translateY(${(1 - on) * 20}px)`; c.style.visibility = on > .01 ? 'visible' : 'hidden';
    });
    if (k !== stage) { stage = k; onStage(k); }
    onStage.vis && onStage.vis(u / U, vis);
  }
  let on = true;
  new IntersectionObserver(([e]) => { on = e.isIntersecting; }, { rootMargin: '200px' }).observe(section);
  // off screen, the playhead jumps straight to the scroll so you come back to the right room
  const loop = now => { if (on) draw(now); else { prev = now; uP = posU(); vel = 0; } requestAnimationFrame(loop); };
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
    // clips: sign → door, door → foyer, then one per room; the walk doesn't stop at the door
    section: $('.tour'), canvas: $('.tour-cv'), seq: 'seq', stops: [0, 2, 3, 4, 5, 6],
    HOLD: [.6, .9, .9, .9, .9, 1.2], WALK: [2.8, 1.2, 1.2, 1.2, 1.2], eager: true,
    cards: [$('.tour-intro'), ...$$('.room')], onStage,
    // open on the yard sign, then ease back to centre as you walk to the door
    focus: shown => .5 + .32 * (1 - smooth(clamp((shown - 12) / 120))),
    onDraw: (shown, r) => {
      const q = SIGN.map(([u, v]) => [r.x + u * r.w, r.y + v * r.h]);
      sign.style.transform = quadMatrix(1050, 930, q);
      sign.style.opacity = clamp(1 - shown / .7);   // hand off to the footage the moment the walk starts
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
    section: $('.bidwalk'), canvas: $('.bw-cv'), seq: 'seq2', stops: [0, 0, 1, 2, 3, 4, 5, 6],
    HOLD: [.7, .9, .9, .9, .9, .9, .9, 1.3], WALK: [.4, 1.2, 1.2, 1, 1, 1.2, 1.4], drift: .6,
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
