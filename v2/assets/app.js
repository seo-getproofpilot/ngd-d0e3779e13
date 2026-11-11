// Next Gen Drywall v2o.
// The hero walk plays itself as 60fps video (autoTour). walk() is the earlier scroll-scrubbed player, no longer used;
// the bid walk now plays as plain video beside its list. Each is AI-generated footage joined at its keyframes, encoded as video (tools-video.py). Scroll is mapped to how far the picture has moved
// (motion.json from tools-seq.py), not to clip time, so fast turns get more scroll and the camera walks at one pace.
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 820px)').matches;
// stamped by tools-build-preview.py with a hash of the footage, so a new deploy is never served from an old cache
const ASSET_V = 'f8b0eb0eac';

/* ---------- the walk player ---------- */
// The footage plays as real video (hardware-decoded, so it stays smooth on a phone), forward or, when you scroll
// back up, from a reversed copy. Your scroll only says where the walk is headed: a playhead walks there at one steady
// pace however hard you scroll, easing up to speed and easing to a stop, and the video's playback rate follows it.
// stops: which of motion.json's keys the walk halts at (one per card).
function walk({ section, canvas, seq, stops, HOLD, WALK, vh = 72, eager = false, drift = 1, pace = .38, holdPace = 1.4, frameEl, cards, onStage, onFrame, onDraw, focus }) {
  const ctx = canvas.getContext('2d'), dir = small ? 'm' : 'd', FPS = 24;
  const SEG = []; let U = 0;
  for (let k = 0; k < stops.length; k++) {
    SEG.push({ kind: 'hold', k, a: U, b: U += HOLD[k] });
    if (k < stops.length - 1) SEG.push({ kind: 'walk', k, a: U, b: U += WALK[k] });
  }
  section.style.height = `${100 + U * vh}vh`;

  let N = 0, KEY = [], M = [], ready = false, fwd = null, rev = null, active = null, way = 1;
  const poster = new Image(); poster.src = `assets/${seq}/${dir}/0000.webp?v=${ASSET_V}`;
  // Each video is downloaded whole and played from memory, so jumping to any point is instant whatever the server
  // supports. The forward walk streams first so it can start at once, then swaps to its in-memory copy unnoticed.
  const fresh = () => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto'; return v; };
  const whole = name => fetch(`assets/${seq}/${dir}-${name}.mp4?v=${ASSET_V}`).then(r => r.blob()).then(b => URL.createObjectURL(b));
  const start = () => fetch(`assets/${seq}/motion.json?v=${ASSET_V}`).then(r => r.json()).then(j => {
    N = j.n; KEY = stops.map(s => j.keys[s]); M = j.motion; ready = true;
    fwd = fresh(); fwd.src = `assets/${seq}/${dir}-fwd.mp4?v=${ASSET_V}`; active = fwd;
    onFrame && fwd.addEventListener('progress', () => { if (fwd.duration && fwd.buffered.length) onFrame(fwd.buffered.end(fwd.buffered.length - 1) / fwd.duration); });
    whole('fwd').then(url => {
      const t = fwd.currentTime, playing = !fwd.paused, rate = fwd.playbackRate;
      fwd.src = url;
      fwd.addEventListener('loadeddata', () => { fwd.currentTime = t; fwd.playbackRate = rate; if (playing) fwd.play().catch(() => {}); onFrame && onFrame(1); }, { once: true });
      return whole('rev');
    }).then(url => { const v = fresh(); v.src = url; rev = v; });
  });
  if (eager) start();
  else new IntersectionObserver(([e], io) => { if (e.isIntersecting) { start(); io.disconnect(); } }, { rootMargin: '1800px 0px' }).observe(section);

  let W = 1, H = 1, DPR = 1;
  const resize = () => { DPR = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); };
  addEventListener('resize', resize); resize();
  const posU = () => { const r = section.getBoundingClientRect(), span = r.height - innerHeight; return clamp(-r.top / span) * U; };
  // the frame whose cumulative on-screen motion matches m, between frames a and b
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
  // keep the video on the playhead: set its rate from the playhead's speed, nudge out small drift, seek only when paused or far off
  const ok = v => v && v.readyState >= 2;
  const toTime = (F, w) => (w > 0 ? F : N - 1 - F) / FPS;
  let lastF = 0;
  function sync(F, dt) {
    const fv = (F - lastF) / Math.max(dt, 1e-3); lastF = F;
    const want = fv < -.5 ? -1 : fv > .5 ? 1 : way;
    if (want === -1 && !ok(rev)) {   // reverse copy not ready yet: step the forward video back instead
      if (!fwd.paused) fwd.pause();
      if (!fwd.seeking && Math.abs(fwd.currentTime - toTime(F, 1)) > .5 / FPS) fwd.currentTime = toTime(F, 1);
      active = fwd; way = 1; return;
    }
    const v = want > 0 ? fwd : rev;
    if (want !== way || v !== active) { if (active && active !== v) active.pause(); way = want; active = v; v.currentTime = toTime(F, way); }
    const tt = toTime(F, way);
    if (Math.abs(fv) < .5) {
      if (!v.paused) v.pause();
      if (!v.seeking && Math.abs(v.currentTime - tt) > .6 / FPS) v.currentTime = tt;
      return;
    }
    const err = (tt - v.currentTime) * FPS;   // frames behind the playhead
    if (Math.abs(err) > 36 && !v.seeking) { v.currentTime = tt; return; }
    const rate = clamp((Math.abs(fv) + err * 1.6) / FPS, .1, 8);
    if (Math.abs(rate - v.playbackRate) > .03) v.playbackRate = rate;
    if (v.paused && !v.seeking) v.play().catch(() => {});
  }

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
    if (window.__ngdProbe && section.classList.contains('tour')) window.__ngdProbe.push([now, uP, goal, shown, active ? (way > 0 ? active.currentTime * FPS : N - 1 - active.currentTime * FPS) : -1, active ? active.playbackRate : 0, way, active ? [active.readyState, active.seeking, active.paused, active.error && active.error.code, active.currentTime, active.duration, active === fwd] : 0]);   // QC only
    if (ready && fwd) {
      shown = frameAt(u); sync(shown, dt);
      amp += ((reduced ? 0 : drift * (Math.abs(vel) > .05 && segAt(u).kind === 'walk' ? 1.5 : 1)) - amp) * (1 - Math.exp(-dt * 2.5));
    }
    const s = Math.max(W / 16, H / 9) * 1.07, w = 16 * s, h = 9 * s, tt = (now - t0) / 1000;
    const dx = (Math.sin(tt * .53) * 5 + Math.sin(tt * 1.37) * 2) * amp, dy = (Math.sin(tt * .71 + 1) * 3.5 + Math.sin(tt * 2.1) * 1.2) * amp;
    const rot = (Math.sin(tt * .43) * .0016 + Math.sin(tt * 1.1) * .0006) * amp;
    // on a tall phone the cover crop is narrow; `focus` says which part of the frame to keep (0 left, 1 right)
    const fx = focus ? focus(shown) : .5, cx = clamp(W / 2 + (.5 - fx) * w, W - w / 2, w / 2) - W / 2;
    const src = ok(active) ? active : poster.complete && poster.naturalWidth ? poster : null;
    if (src) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = '#151618'; ctx.fillRect(0, 0, W, H);
      ctx.setTransform(DPR, 0, 0, DPR, (W / 2 + dx + cx) * DPR, (H / 2 + dy) * DPR);
      ctx.rotate(rot); ctx.scale(w / W, h / H);
      ctx.drawImage(src, -W / 2, -H / 2, W, H);
    }
    onDraw && onDraw(shown, { x: (W - w) / 2 + dx + cx, y: (H - h) / 2 + dy, w, h });
    if (frameEl) Object.assign(frameEl.style, { left: `${(W - w) / 2 + dx + cx}px`, top: `${(H - h) / 2 + dy}px`, width: `${w}px`, height: `${h}px` });
    // which stage the playhead is in, and how visible its card is
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
  // off screen: stop the video and let the playhead jump straight to the scroll, so you come back to the right room
  const loop = now => {
    if (on) draw(now);
    else { prev = now; uP = posU(); vel = 0; if (active && !active.paused) active.pause(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return {
    goTo(k) {
      const s = SEG.find(x => x.kind === 'hold' && x.k === k), r = section.getBoundingClientRect(), span = r.height - innerHeight;
      const mid = k === 0 ? 0 : (s.a + s.b) / 2;
      scrollTo({ top: scrollY + r.top + (mid / U) * span, behavior: reduced ? 'auto' : 'smooth' });
    },
  };
}

/* ---------- the hero: a walkthrough that plays itself ---------- */
// The hero is one 60fps video (tools-hero.py) with the slow-downs into each room already in the footage, so it only
// ever plays at normal speed: the page just pauses it at each stop for the card, then plays on. It's a real <video>
// element, moved by a GPU transform for the handheld drift, which keeps it smooth on phones.
// cardOf: which card each stop shows.
function autoTour({ section, video: v, seq, cardOf, handAt = {}, drift = 1, cards, onStage, onFrame, onTime, onOutro }) {
  // It never stops: the slow-downs into each room are baked into the footage, so the camera lingers in a room and walks
  // on without a pause or a frozen frame. Each room's card comes up as you near it and hands off halfway down the next
  // hall. At the end the last room dissolves back to the street and it walks again.
  const dir = small ? 'm' : 'd';
  let STOP = null;
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.poster = `assets/${seq}/${dir}/0000.webp?v=${ASSET_V}`;
  v.src = `assets/${seq}/${dir}-fwd.mp4?v=${ASSET_V}`;
  onFrame && v.addEventListener('progress', () => { if (v.duration && v.buffered.length) onFrame(v.buffered.end(v.buffered.length - 1) / v.duration); });
  fetch(`assets/${seq}/motion.json?v=${ASSET_V}`).then(r => r.json()).then(j => { STOP = j.stops; });
  // the loop's dissolve: the last frame, held on a canvas over the video while it fades
  const fade = document.createElement('canvas'); fade.className = 'tour-fade'; fade.setAttribute('aria-hidden', 'true');
  v.after(fade);
  // the ending rests on the finished room with the logo for OUTRO ms, then dissolves back to the street
  let fadeT = -1, holdUntil = -1, outroT = -1;
  const OUTRO = 4000;
  // the opening rests on the aerial and the logo for a moment before the drone comes down, every time round
  const OPEN = 2600;
  const restart = now => {
    try { fade.width = v.videoWidth; fade.height = v.videoHeight; fade.getContext('2d').drawImage(v, 0, 0); fade.style.transform = v.style.transform; fadeT = now; fade.style.opacity = 1; } catch (e) {}
    v.currentTime = 0; v.pause(); holdUntil = now + OPEN;
  };

  let i = 0, paused = reduced, visible = true, stage = -1, amp = drift, zoom = 1.04, prev = performance.now();
  const t0 = prev;
  const shouldRun = () => STOP && visible && !paused && !document.hidden;

  function tick(now) {
    const dt = Math.min(.05, (now - prev) / 1000); prev = now;
    const t = v.currentTime;
    if (STOP) {
      // phones load nothing until play() is called, so the walk starts on the clock, not on loaded data
      if (holdUntil < 0) holdUntil = now + OPEN;
      if (!shouldRun() || now < holdUntil) { if (!v.paused) v.pause(); }
      else if (outroT < 0 && (t >= STOP[STOP.length - 1] - .03 || v.ended)) { outroT = now; v.pause(); }
      else if (outroT >= 0) { if (!v.paused) v.pause(); if (now - outroT >= OUTRO) { outroT = -1; restart(now); } }
      else if (v.paused && !v.seeking) v.play().catch(() => {});
      i = 0; for (let k = 1; k < STOP.length - 1; k++) if (t >= STOP[k] - .01) i = k;
    }
    if (fadeT >= 0) { const f = clamp((now - fadeT) / 1400); fade.style.opacity = 1 - smooth(f); if (f >= 1) fadeT = -1; }
    // a slow handheld drift
    amp += ((reduced ? 0 : drift * (v.paused ? 1 : 1.4)) - amp) * (1 - Math.exp(-dt * 2.5));
    const tt = (now - t0) / 1000;
    const dx = (Math.sin(tt * .53) * 5 + Math.sin(tt * 1.37) * 2) * amp, dy = (Math.sin(tt * .71 + 1) * 3.5 + Math.sin(tt * 2.1) * 1.2) * amp;
    const rot = (Math.sin(tt * .43) * .09 + Math.sin(tt * 1.1) * .035) * amp;
    // while it rests on the aerial, a slow push-in keeps the picture alive
    const rest = holdUntil > 0 && now < holdUntil ? 1 - (holdUntil - now) / OPEN : 1;
    if (!STOP) { v.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg) scale(${zoom.toFixed(4)})`; return; }
    // the walk's progress within the current leg, 0 at its room and 1 at the next
    const leg = clamp((t - STOP[i]) / (STOP[i + 1] - STOP[i]));
    // the last room opens out wide as you settle into it
    zoom += ((i === STOP.length - 2 && leg > .55 ? 1.015 : 1.04) - zoom) * (1 - Math.exp(-dt * 1.2));
    const push = i === 0 && t < .05 ? 1 + .025 * smooth(rest) : 1 + .025 * (1 - smooth(clamp(t / 1.2)));
    const out = outroT >= 0 ? clamp((now - outroT) / OUTRO) : 0;
    onOutro && onOutro(out);
    v.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg) scale(${(zoom * (i === 0 ? push : 1) * (1 + .03 * smooth(out))).toFixed(4)})`;
    onTime && onTime(i, leg);
    // the card for the room you're in, handing off to the next one halfway down the hall
    // it hands over where that walk actually crosses into the next room (handAt, per leg), not halfway, so a card is
    // never up over a room at another stage
    let k = cardOf[i], vis = 1;
    if (cardOf[i] !== cardOf[i + 1]) {
      const h = handAt[i] ?? .5;
      k = leg < h ? cardOf[i] : cardOf[i + 1];
      vis = leg < h ? 1 - smooth(clamp((leg - (h - .1)) / .1)) : smooth(clamp((leg - h) / .1));
    }
    cards.forEach((c, n) => {
      const on = n === k ? vis * (onStage.cardScale ? onStage.cardScale(n, i, leg) : 1) * (1 - smooth(clamp(out * 5))) : 0;
      c.style.opacity = on; c.style.transform = `translateY(${(1 - on) * 20}px)`; c.style.visibility = on > .01 ? 'visible' : 'hidden';
    });
    if (k !== stage) { stage = k; onStage(k); }
    onStage.vis && onStage.vis(clamp(t / STOP[STOP.length - 1]), vis * (1 - smooth(clamp(out * 5))));
  }
  section.__tour = { get t() { return v.currentTime; }, get mode() { return v.paused ? 'paused' : 'walk'; }, get i() { return i; }, get stops() { return STOP; } };   // QC only
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: .25 }).observe(section);
  const loop = now => { tick(now); requestAnimationFrame(loop); };
  requestAnimationFrame(now => { prev = now; loop(now); });
  return {
    // jump to the room that shows card c and walk on from there
    goTo(c) {
      const k = cardOf.indexOf(c); if (k < 0 || !STOP) return;
      v.currentTime = STOP[k]; if (shouldRun()) v.play().catch(() => {});
    },
    setPaused(p) { paused = p; if (p && !v.paused) v.pause(); },
  };
}

/* ---------- the hero walk ---------- */
{
  // the job card taped to the wall on the right: one per stage, what the work is and what we check
  const SPEC = [
    { t: 'The walkthrough', line: 'One house, start to finish. Come on in.', rows: [
      ['Stages', 'Four, from bare board to sanded smooth'],
      ['Crew', 'One crew hangs, tapes and finishes every wall'],
      ['Serving', 'San Tan Valley, Queen Creek, the East Valley'] ] },
    { t: 'Hanging', line: 'Ceilings go up before the walls.', rows: [
      ['The work', 'Board screwed to every ceiling and wall'],
      ['Board', 'Standard, moisture- or fire-rated, matched to the room'],
      ['We check', 'Screws set just under the paper, none torn through'] ] },
    { t: 'Taping', line: 'Every seam, every corner.', rows: [
      ['The work', 'Paper tape bedded in compound over each seam'],
      ['Corners', 'Inside corners creased, outside corners beaded'],
      ['We check', 'No bubbles and no loose edges under the tape'] ] },
    { t: 'Putty & coats', line: 'Each coat a little wider than the last.', rows: [
      ['The work', 'Compound over the tape and every screw'],
      ['Coats', 'Two or three, each feathered wider'],
      ['Between', 'Every coat dries before the next goes on'] ] },
    { t: 'Finishing', line: 'Put a light across it. Not a ridge anywhere.', rows: [
      ['The work', 'Sanded flat, then textured or skim coated'],
      ['Light test', 'A work light raked along the wall finds any ridge'],
      ['Finishes', 'Smooth Level 5, orange peel, knockdown, skip trowel'] ] },
    { t: 'Ready for paint', line: 'And this is the part you keep.', rows: [
      ['The result', 'Seams that never show through paint'],
      ['Built for', 'Custom homes, builders and repairs'],
      ['Your job', 'Send plans or photos for an itemized bid'] ] },
  ];
  const tourEl = $('.tour'), routeBtns = $$('.route button'), spec = $('.spec'), fill = $('.route-line i'), loadBar = $('.tour-load i');
  const logo = $('.tour-logo'), pauseBtn = $('.tour-pause');
  let specT, logoO = 1, outroO = 0;
  // the branded tape: filled with copies of the real logo (the hero's own SVG), shown in the taping room
  const tapeRun = $('.tape-run'), track = $('.tape-track');
  if (tapeRun) {
    const svg = $('.tour-logo svg').outerHTML;
    track.innerHTML = Array.from({ length: 16 }, () => svg + '<i></i>').join('');
  }
  const onStage = k => {
    tourEl.dataset.stage = k;
    if (tapeRun) tapeRun.classList.toggle('on', k === 2);
    routeBtns.forEach((b, i) => { b.classList.toggle('on', i === k); b.classList.toggle('done', i < k); });
    spec.classList.remove('show'); clearTimeout(specT);
    specT = setTimeout(() => {
      const d = SPEC[k];
      $('.spec-n', spec).textContent = String(k).padStart(2, '0');
      $('.spec-t', spec).textContent = d.t;
      $('.spec-line', spec).textContent = d.line;
      $('.spec-rows', spec).innerHTML = d.rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
      spec.classList.add('show');
    }, 320);
  };
  // the big logo rides the aerial and lifts away as the drone comes down (the first leg, i = 0)
  const logoAt = (i, leg) => (i > 0 ? 0 : 1 - smooth(clamp((leg - .08) / .34)));
  onStage.vis = (p, vis) => { fill.style.transform = `scaleX(${p})`; spec.style.opacity = vis > .6 && logoO < .05 ? '' : 0; };
  // the aerial belongs to the logo; the headline only starts once the logo is completely gone, so they never overlap
  onStage.cardScale = (n, i, leg) => (n === 0 && i === 0 ? smooth(clamp((leg - .5) / .22)) : 1);
  if (reduced) { pauseBtn.setAttribute('aria-pressed', 'true'); pauseBtn.querySelector('span').textContent = 'Play'; }
  const hero = autoTour({
    // legs: aerial → yard, yard → foyer (through the front door), then one per room
    section: tourEl, video: $('.tour-vid'), seq: 'seq',
    // stops: aerial start, yard (closed front door), Hanging room, great room (Taping), kitchen (Putty), hallway and
    // bedroom (Finishing): one continuous walk (gen7)
    cardOf: [0, 0, 1, 2, 3, 4, 4],
    // each card changes where the walk crosses into that room: through the front door, then each doorway
    handAt: { 1: .7, 2: .69, 3: .6, 4: .63 },
    cards: [$('.tour-intro'), ...$$('.room')], onStage,
    onOutro: p => { outroO = p > 0 ? smooth(clamp((p - .08) / .25)) : 0; },
    onTime: (i, leg) => {
      const o = logoO = Math.max(logoAt(i, leg), outroO);
      logo.style.opacity = o; logo.style.transform = `translate(-50%, -50%) scale(${1 + (1 - o) * .12})`; logo.style.visibility = o > .01 ? 'visible' : 'hidden';
    },
    onFrame: f => { loadBar.style.transform = `scaleX(${f})`; if (f >= .999) $('.tour-load').classList.add('done'); },
  });
  routeBtns.forEach(b => b.addEventListener('click', () => hero.goTo(+b.dataset.go)));
  pauseBtn.addEventListener('click', () => {
    const p = pauseBtn.getAttribute('aria-pressed') !== 'true';
    pauseBtn.setAttribute('aria-pressed', p); pauseBtn.querySelector('span').textContent = p ? 'Play' : 'Pause'; hero.setPaused(p);
  });
  // the call clock runs in real time, like a live call
  const clock = $('.call-t'), t0 = performance.now();
  setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
}

/* ---------- what sets your number: the second walk plays itself beside the list ---------- */
// It used to be scroll-driven; now it's an ordinary muted video at 1.6x that plays while it's on screen and stops
// when it isn't, so scrolling past it is just scrolling. The line for whatever the camera is looking at lights up.
{
  const box = $('.bidwalk'), screen = $('.bw-screen'), v = $('.bw-vid'), items = $$('.bw-list li'), bar = $('.bw-bar i'), btn = $('.bw-pause');
  const chipN = $('.bw-chip-n'), chipT = $('.bw-chip-t');
  const KEY = [0, 192, 384, 528, 672, 864, 1056].map(f => f / 24), LEAD = 3, RATE = 1.3, REST = 2200;
  let on = -1, loaded = false, paused = reduced, visible = false, restT;
  const load = () => {
    if (loaded) return; loaded = true;
    const dir = small ? 'm' : 'd';
    v.poster = `assets/seq2/${dir}/0000.webp?v=${ASSET_V}`; v.src = `assets/seq2/${dir}-fwd.mp4?v=${ASSET_V}`; v.playbackRate = RATE;
  };
  const setOn = k => {
    items.forEach((li, j) => { if (j < k) li.classList.add('done'); });
    if (k === on) return; on = k;
    items.forEach((li, i) => li.classList.toggle('on', i === k));
    chipN.textContent = `${String(k + 1).padStart(2, '0')} / 07`; chipT.textContent = $('b', items[k]).textContent;
    const fc = $('.bw-fact'); if (fc) { $('.bw-stat', fc).textContent = items[k].dataset.stat; $('.bw-fact-t', fc).textContent = items[k].dataset.fact; fc.classList.remove('pop'); void fc.offsetWidth; fc.classList.add('pop'); }
  };
  setOn(0);
  const run = () => { if (visible && !paused && !document.hidden) v.play().catch(() => {}); else if (!v.paused) v.pause(); };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) load();
    visible = e.intersectionRatio > .35; run();
  }, { threshold: [0, .35, .6], rootMargin: '200px 0px 200px 0px' }).observe(screen);
  v.addEventListener('loadedmetadata', () => { v.playbackRate = RATE; });
  v.addEventListener('timeupdate', () => {
    const t = v.currentTime;
    let k = 0; for (let i = 1; i < KEY.length; i++) if (t >= KEY[i] - LEAD) k = i;
    setOn(k);
    const a = k ? KEY[k] - LEAD : 0, b = k < KEY.length - 1 ? KEY[k + 1] - LEAD : (v.duration || KEY[6]);
    items[k].style.setProperty('--p', clamp((t - a) / (b - a)).toFixed(3));
    if (v.duration) bar.style.transform = `scaleX(${(t / v.duration).toFixed(4)})`;
  });
  // it rests on the finished house for a moment, then walks it again
  v.addEventListener('ended', () => { clearTimeout(restT); restT = setTimeout(() => { v.currentTime = 0; run(); }, REST); });
  items.forEach((li, i) => $('button', li).addEventListener('click', () => {
    load(); clearTimeout(restT);
    v.currentTime = i ? KEY[i] - LEAD + .05 : 0; v.playbackRate = RATE; setOn(i); run();
  }));
  if (reduced) { btn.setAttribute('aria-pressed', 'true'); btn.setAttribute('aria-label', 'Play the video'); }
  btn.addEventListener('click', () => {
    paused = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', paused); btn.setAttribute('aria-label', paused ? 'Play the video' : 'Pause the video'); run();
  });
  document.addEventListener('visibilitychange', run);
  box.__bw = { get t() { return v.currentTime; }, get on() { return on; }, get paused() { return v.paused; } };   // QC only
}

/* ---------- nav goes solid once you leave the house ---------- */
const nav = $('.nav'), tour = $('.tour');
const navTone = () => nav.classList.toggle('solid', tour.getBoundingClientRect().bottom < 80);
addEventListener('scroll', navTone, { passive: true }); navTone();

/* ---------- finish levels ---------- */
{
  // [name, flag, in plain words, passes of compound (of 5), where it goes, good to know]
  const LV = [
    ['Hung', '', 'Board screwed off. No tape and no compound yet.', 0, 'Temporary walls, or work where the final finish isn’t decided.', 'Not meant to be seen.'],
    ['Fire-taped', 'Out of sight', 'Tape bedded in compound. Ridges and tool marks are left.', 1, 'Above ceilings, in attics and service areas, where a fire rating is the only job.', 'Not a finish you’d paint.'],
    ['Utility', 'Garages and tile', 'Tape bedded, then one coat over the tape and every screw.', 2, 'Garages, storage, and walls that will get tile.', 'Joints will show through paint.'],
    ['Textured', 'Under a texture', 'Tape plus two coats, feathered out and ready for texture.', 3, 'Rooms getting orange peel, knockdown or skip trowel.', 'The texture does the rest of the hiding.'],
    ['Smooth', 'The usual choice', 'Tape plus three coats, sanded smooth for flat paint.', 4, 'Most rooms in a home, with flat paint.', 'Low sun can still find the joints.'],
    ['Skim coat', 'Big rooms, low light', 'Level 4, then a thin skim coat over the whole wall.', 5, 'Great rooms, big windows, and gloss or satin paint.', 'Nothing flashes through the paint, even in evening light.'],
  ];
  const imgs = $$('.lv-fig img'), tabs = $$('.lv-pick button'), meter = $$('.lv-meter i');
  tabs.forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.lv, [name, flag, plain, coats, where, know] = LV[n];
    tabs.forEach(t => t.setAttribute('aria-selected', t === b));
    imgs.forEach((im, i) => { im.classList.toggle('on', i === n); im.alt = i === n ? `A drywall seam finished to Level ${n}, shown up close` : ''; });
    $('.lv-num b').textContent = n; $('.lv-tag').textContent = name;
    const fl = $('.lv-flag'); fl.textContent = flag; fl.hidden = !flag;
    $('.lv-plain').textContent = plain; $('.lv-where').textContent = where; $('.lv-know').textContent = know;
    meter.forEach((m, i) => m.classList.toggle('on', i < coats));
    lvNotes(n);
  }));
  {
    let lv = -1, t = 0, wait = 0;
    const show = $('.lv-show');
    const step = () => { if (Date.now() < wait) return; lv = (lv + 1) % 6; tabs[lv].click(); show.style.setProperty('--lvt', '0'); void show.offsetWidth; show.classList.remove('lv-run'); void show.offsetWidth; show.classList.add('lv-run'); };
    tabs.forEach(b => b.addEventListener('pointerdown', () => { wait = Date.now() + 9000; lv = +b.dataset.lv; show.classList.remove('lv-run'); }));
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !t) { step(); t = setInterval(step, 3000); }
      else if (!e.isIntersecting && t) { clearInterval(t); t = 0; }
    }, { threshold: .25 }).observe(show);
  }
}

/* ---------- services: the index on the left drives the photo frame on the right ---------- */
{
  const items = $$('.svx-list > li'), frames = [...$$('.svx-fig > img'), $('.svx-split')], capN = $('.svx-cap-n'), capT = $('.svx-cap-t');
  if (items.length) {
    let cur = 0, timer = 0, held = false;
    const set = i => {
      cur = i;
      items.forEach((li, k) => { li.classList.toggle('on', k === i); $('button', li).setAttribute('aria-selected', k === i); });
      frames.forEach((f, k) => f && f.classList.toggle('on', k === i));
      capN.textContent = String(i + 1).padStart(2, '0');
      capT.textContent = i === 3 ? 'Illustration of a typical repair' : 'Next Gen job site';
    };
    items.forEach((li, i) => {
      const b = $('button', li);
      b.addEventListener('click', () => { held = true; clearInterval(timer); set(i); });
      b.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover) and (min-width: 821px)').matches) { held = true; clearInterval(timer); set(i); } });
    });
    // on a wide screen it steps through on its own until someone picks one
    if (!reduced) new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting && !held && innerWidth > 820) timer = setInterval(() => set((cur + 1) % items.length), 5200);
    }, { threshold: .45 }).observe($('.svx'));
  }
}

/* ---------- the texture wall: the whole wall behind is bare board; trowel a texture on ---------- */
{
  const DPR = () => Math.min(devicePixelRatio || 1, 1.25);
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
    const r = wall.getBoundingClientRect(), d = DPR();
    const nw = Math.round(r.width * d), nh = Math.round(r.height * d);
    if (nw === W && nh === H) return;
    const keep = W ? document.createElement('canvas') : null;
    if (keep) { keep.width = W; keep.height = H; keep.getContext('2d').drawImage(mask, 0, 0); }
    W = cv.width = mask.width = tmp.width = nw; H = cv.height = mask.height = tmp.height = nh;
    if (keep) mc.drawImage(keep, 0, 0, W, H);
    paint();
  };
  const cover = (ctx, im) => { if (!im) return; const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); };
  // the bare wall: board, hung in staggered 4x8 sheets with their joints taped, cached per light and size
  const baseCache = {};
  const baseOf = lt => {
    const key = `${lt}-${W}x${H}`;
    if (baseCache[key]) return baseCache[key];
    const b = document.createElement('canvas'); b.width = W; b.height = H; const g = b.getContext('2d');
    const d = DPR(), sw = Math.max(W / 2.3, 560 * d), sh = sw / 2, tw = Math.max(11 * d, sw / 26), rake = lt === 'rake';
    g.fillStyle = rake ? '#cfccc3' : '#d9d7d0'; g.fillRect(0, 0, W, H);
    // the paper face: fine fibre, a little mottling
    const nz = document.createElement('canvas'); nz.width = nz.height = 180; const nc = nz.getContext('2d'), id = nc.createImageData(180, 180);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random(); id.data[i] = id.data[i + 1] = id.data[i + 2] = v > .5 ? 255 : 40; id.data[i + 3] = Math.random() * (rake ? 26 : 14); }
    nc.putImageData(id, 0, 0); g.fillStyle = g.createPattern(nz, 'repeat'); g.fillRect(0, 0, W, H);
    if (rake) { const lg = g.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, 'rgba(255, 236, 205, .18)'); lg.addColorStop(.55, 'rgba(0, 0, 0, 0)'); lg.addColorStop(1, 'rgba(20, 18, 14, .14)'); g.fillStyle = lg; g.fillRect(0, 0, W, H); }
    // screws every 16 inches down each stud, 12 inches apart
    const ft = sw / 8;
    for (let x = ft * 1.33 * .5; x < W; x += ft * 1.333) for (let y = ft * .5; y < H; y += ft) {
      g.fillStyle = 'rgba(60, 54, 44, .45)'; g.beginPath(); g.arc(x, y, 1.6 * d, 0, 6.3); g.fill();
      g.fillStyle = 'rgba(255, 255, 255, .35)'; g.beginPath(); g.arc(x + .8 * d, y + .8 * d, 1.4 * d, 0, 6.3); g.fill();
    }
    // the joints carry Next Gen's own paper tape, printed along its length; the texture covers it, the way mud does
    const PRINT = '\u25A0  NEXT GEN DRYWALL  ', fs = tw * .4;
    const tapeRun = (x0, y0, len, vertical) => {
      g.save(); g.translate(x0, y0); if (vertical) g.rotate(Math.PI / 2);
      g.fillStyle = 'rgba(246, 242, 232, .62)'; g.fillRect(0, -tw / 2, len, tw);
      g.beginPath(); g.rect(0, -tw / 2, len, tw); g.clip();
      g.font = `400 ${fs}px Michroma, sans-serif`; g.fillStyle = 'rgba(47, 85, 228, .42)'; g.textBaseline = 'middle';
      const step = g.measureText(PRINT).width || fs * 12;
      for (let x = -((x0 * 1.7 + y0) % step); x < len; x += step) g.fillText(PRINT, x, fs * .06);
      g.restore();
    };
    for (let row = 0, y = -sh * .35; y < H; row++, y += sh) {
      tapeRun(0, y, W, false);
      g.fillStyle = 'rgba(70, 62, 50, .16)'; g.fillRect(0, y, W, Math.max(1, d * .8));
      for (let x = (row % 2 ? -sw / 2 : 0) + sw * .62; x < W; x += sw) {
        tapeRun(x, y + tw / 2, sh - tw, true);
        g.fillStyle = 'rgba(70, 62, 50, .16)'; g.fillRect(x, y, Math.max(1, d * .8), sh);
      }
    }
    return (baseCache[key] = b);
  };
  const tiles = {};
  const tileOf = key => {
    const im = pics[key]; if (!im) return null;
    const tw = Math.round(620 * DPR()), th = Math.round(tw * im.height / im.width), k = `${key}-${tw}`;
    if (tiles[k]) return tiles[k];
    // a seamless tile without mirroring: the image rolled by half (its edges now meet in the middle) under the image
    // itself, which is feathered out toward its own edges, so every edge of the tile is continuous
    const t = document.createElement('canvas'); t.width = tw; t.height = th; const g = t.getContext('2d');
    const hw = tw / 2, hh = th / 2;
    g.drawImage(im, 0, 0, tw, th, -hw, -hh, tw, th); g.drawImage(im, 0, 0, tw, th, hw, -hh, tw, th);
    g.drawImage(im, 0, 0, tw, th, -hw, hh, tw, th); g.drawImage(im, 0, 0, tw, th, hw, hh, tw, th);
    const o = document.createElement('canvas'); o.width = tw; o.height = th; const og = o.getContext('2d');
    og.drawImage(im, 0, 0, tw, th); og.globalCompositeOperation = 'destination-in';
    const fx = og.createLinearGradient(0, 0, tw, 0); fx.addColorStop(0, 'rgba(0,0,0,0)'); fx.addColorStop(.22, '#000'); fx.addColorStop(.78, '#000'); fx.addColorStop(1, 'rgba(0,0,0,0)');
    og.fillStyle = fx; og.fillRect(0, 0, tw, th);
    const fy = og.createLinearGradient(0, 0, 0, th); fy.addColorStop(0, 'rgba(0,0,0,0)'); fy.addColorStop(.22, '#000'); fy.addColorStop(.78, '#000'); fy.addColorStop(1, 'rgba(0,0,0,0)');
    og.fillStyle = fy; og.fillRect(0, 0, tw, th);
    g.drawImage(o, 0, 0);
    return (tiles[k] = t);
  };
  if (document.fonts) document.fonts.load('400 12px Michroma').then(() => { for (const k in baseCache) delete baseCache[k]; paint(); }).catch(() => {});
  function paint() {
    if (!W) return;
    c.drawImage(baseOf(light), 0, 0);
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, W, H);
    const tl = tileOf(`${tex}-${light}`);
    if (tl) { tc.fillStyle = tc.createPattern(tl, 'repeat'); tc.fillRect(0, 0, W, H); } else cover(tc, pics[`${tex}-${light}`]);
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
    const d = DPR(); x *= d; y *= d;
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
    const r = wall.getBoundingClientRect(), band = Math.max(W, H) * .075 * .55 * 1.7 / DPR(), n = Math.max(4, Math.ceil(r.height / band));
    const passes = Array.from({ length: n }, (_, i) => .04 + .92 * (i + .5) / n), t0 = performance.now(), per = Math.max(380, 3600 / n);
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

/* ---------- repair: a piece of wall you turn and swipe through the stages ---------- */
{
  const box = $('.rpm');
  if (box) {
    const scene = $('.rpm-scene', box), slab = $('.slab', box), inp = $('.rpm-scrub input', box), steps = $$('.rp-steps li');
    const chipN = $('.rpm-n', box), chipT = $('.rpm-t', box);
    const NAMES = $$('.rp-steps button').map(b => b.textContent.replace(/^\d+/, '').trim());
    let p = 0, target = 0, tilt = 0, raf = 0, auto = 0, touched = false;
    const draw = () => {
      p += (target - p) * .12; tilt *= .9;
      if (Math.abs(target - p) < .002) p = target;
      box.style.setProperty('--p', p.toFixed(3));
      slab.style.setProperty('--ry', `${(-18 + (p - 2.5) * 4 + tilt).toFixed(2)}deg`);
      slab.style.setProperty('--rx', `${(7 - Math.abs(tilt) * .15).toFixed(2)}deg`);
      const k = Math.min(5, Math.round(p));
      chipN.textContent = `${String(k + 1).padStart(2, '0')} / 06`; chipT.textContent = NAMES[k];
      steps.forEach((li, i) => li.classList.toggle('on', i === k));
      if (document.activeElement !== inp) inp.value = p.toFixed(2);
      raf = (Math.abs(target - p) > .001 || Math.abs(tilt) > .05) ? requestAnimationFrame(draw) : 0;
    };
    const go = v => { target = Math.max(0, Math.min(5, v)); if (!raf) raf = requestAnimationFrame(draw); };
    const stopAuto = () => { touched = true; clearInterval(auto); };
    // swipe: a full width of drag runs the whole repair; the slab leans with the drag
    let sx = null, sp = 0;
    scene.addEventListener('pointerdown', e => { stopAuto(); sx = e.clientX; sp = target; scene.setPointerCapture(e.pointerId); });
    scene.addEventListener('pointermove', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, w = scene.getBoundingClientRect().width;
      tilt = Math.max(-14, Math.min(14, dx / w * 30)); go(sp + dx / w * 6);
    });
    const end = () => { if (sx === null) return; sx = null; go(Math.round(target)); };
    scene.addEventListener('pointerup', end); scene.addEventListener('pointercancel', end);
    inp.addEventListener('input', () => { stopAuto(); go(+inp.value); });
    inp.addEventListener('change', () => go(Math.round(+inp.value)));
    $$('.rp-steps button').forEach(b => b.addEventListener('click', () => { stopAuto(); go(+b.dataset.s); }));
    // on arrival it repairs itself once, a stage at a time
    new IntersectionObserver(([e], io) => {
      if (!e.isIntersecting || touched) return; io.disconnect();
      if (reduced) { go(5); return; }
      let k = 0; auto = setInterval(() => { if (++k > 5) { clearInterval(auto); return; } go(k); }, 1500);
    }, { threshold: .5 }).observe(scene);
    draw();
  }
}

/* ---------- services: the deck, driven by the scroll. The section pins and each quarter of the scroll brings the next
   sheet to the front, so nobody scrolls past without seeing all four. On phones it's a swipe row. ---------- */
{
  const deck = $('.deck'), svc = $('.svc');
  if (deck) {
    const cards = $$('.dk', deck), bars = $$('.deck-nav i');
    cards.forEach((c, i) => { const sp = document.createElement('div'); sp.className = 'dk-spine'; sp.setAttribute('aria-hidden', 'true'); sp.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b><span>${$('h3', c).textContent}</span>`; c.appendChild(sp); });
    let cur = -1;
    const set = i => {
      if (i === cur) return; cur = i;
      cards.forEach((c, k) => { c.classList.toggle('on', k === i); c.style.setProperty('--z', k === i ? 10 : k + 1); });
    };
    const wide = () => innerWidth > 820;
    const onScroll = () => {
      if (!wide()) { set(0); return; }
      const r = svc.getBoundingClientRect(), span = r.height - innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(span, 1)));
      const f = p * cards.length, i = Math.min(cards.length - 1, Math.floor(f));
      set(i);
      bars.forEach((b, k) => b.style.setProperty('--f', Math.min(1, Math.max(0, f - k)).toFixed(3)));
    };
    // clicking a sheet scrolls to its stretch of the pin
    cards.forEach((c, i) => c.addEventListener('click', e => {
      if (e.target.closest('a') || !wide()) return;
      const top = svc.getBoundingClientRect().top + scrollY, span = svc.offsetHeight - innerHeight;
      scrollTo({ top: top + span * (i + .5) / cards.length, behavior: 'smooth' });
    }));
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();
  }
}

/* ---------- process: a light walks through the four steps ---------- */
{
  const items = $$('.flow li');
  if (items.length && !reduced) {
    let k = 0, t = 0;
    const set = i => items.forEach((li, j) => li.classList.toggle('on', j === i));
    items.forEach((li, i) => li.addEventListener('mouseenter', () => { clearInterval(t); t = 0; set(i); }));
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !t) t = setInterval(() => set(k = (k + 1) % items.length), 2600);
      else if (!e.isIntersecting && t) { clearInterval(t); t = 0; }
    }, { threshold: .4 }).observe($('.flow'));
  }
}

/* ---------- process: told like the walkthrough. Each step is a room; the route along the bottom fills ---------- */
{
  const sx = $('.sx');
  if (sx) {
    const bgs = $$('.sx-bgs img', sx), cards = $$('.sx-card', sx), btns = $$('.sx-route button', sx), line = $('.sx-line i', sx), T = 4200;
    let cur = 0, t = 0;
    const set = i => {
      cur = i;
      [bgs, cards].forEach(list => list.forEach((el, k) => el.classList.toggle('on', k === i)));
      btns.forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('done', k < i); });
      line.style.transform = `scaleX(${(i / (btns.length - 1)).toFixed(3)})`;
    };
    const run = () => { clearInterval(t); t = setInterval(() => set((cur + 1) % cards.length), T); };
    btns.forEach((b, i) => b.addEventListener('click', () => { set(i); run(); }));
    set(0);
    if (!reduced) new IntersectionObserver(([e]) => { if (e.isIntersecting) run(); else { clearInterval(t); t = 0; } }, { threshold: .4 }).observe(sx);
  }
}

/* ---------- repair: the trowel wipes the stain off, step by step, then rests on the finished ceiling ---------- */
{
  const rw = $('.rw-stage');
  if (rw) {
    const steps = $$('.rw-steps li'), X0 = innerWidth > 820 ? 34 : 0, RUN = 6500, REST = 2600;
    let t0 = 0, raf = 0, live = false;
    const frame = now => {
      if (!t0) t0 = now;
      const t = now - t0;
      let f = Math.min(1, t / RUN); f = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      const x = X0 + (100 - X0) * f;
      rw.style.setProperty('--x', `${x.toFixed(2)}%`);
      const k = t >= RUN ? 5 : Math.min(4, Math.floor(f * 5));
      steps.forEach((li, i) => { li.classList.toggle('on', i === k && t < RUN); li.classList.toggle('done', i < k || t >= RUN); });
      if (t > RUN + REST) t0 = now;                   // and again
      raf = live ? requestAnimationFrame(frame) : 0;
    };
    if (reduced) { rw.style.setProperty('--x', '100%'); steps.forEach(li => li.classList.add('done')); }
    else new IntersectionObserver(([e]) => {
      live = e.isIntersecting;
      if (live && !raf) { t0 = 0; raf = requestAnimationFrame(frame); }
    }, { threshold: .35 }).observe(rw);
  }
}

/* ---------- process: the sheets go up on the studs as you scroll (pinned on wide screens) ---------- */
{
  const sec = $('.hang');
  if (sec) {
    const faces = $$('.bd-face', sec), seams = $$('.seams i', sec), n = faces.length;
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const onScroll = () => {
      if (innerWidth <= 820) { faces.forEach(f => f.style.setProperty('--t', 1)); return; }
      const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(span, 1)));
      faces.forEach((f, i) => f.style.setProperty('--t', ease(Math.min(1, Math.max(0, p * (n + .6) - i))).toFixed(3)));
      const tape = Math.min(1, Math.max(0, (p - .88) / .1));
      seams.forEach((s, i) => s.style.setProperty('--tape', Math.min(1, Math.max(0, tape * 1.6 - i * .3)).toFixed(3)));
    };
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();
  }
}

/* ---------- repairs: four kinds, each a before and after; it sweeps each one and moves on until someone picks ---------- */
{
  const sec = $('.rx');
  if (sec) {
    const stage = $('.rx-stage', sec), inp = $('.rx-in', sec), tabs = $$('.rx-tabs button', sec);
    const after = $('.rx-after', stage), before = $('.rx-before img', stage);
    const SET = [
      ['assets/img/repair-before.webp', 'assets/img/repair-after.webp', 'A ceiling with a large brown water stain', 'The same ceiling after the repair'],
      ['assets/img/rep-doorknob-before.webp', 'assets/img/rep-doorknob-after.webp', 'A doorknob hole punched through a wall', 'The same wall, patched and textured'],
      ['assets/img/rep-cutout-before.webp', 'assets/img/rep-cutout-after.webp', 'An access hole cut in a wall for wiring', 'The same wall, closed up and matched'],
      ['assets/img/rep-crack-before.webp', 'assets/img/rep-crack-after.webp', 'A settling crack running from a door corner', 'The same wall, re-taped and blended'],
    ];
    SET.forEach(([b, a]) => { new Image().src = b; new Image().src = a; });
    let cur = 0, raf = 0, t0 = 0, live = false, held = false;
    const RUN = 6400;
    const setX = x => { stage.style.setProperty('--x', `${x.toFixed(2)}%`); inp.value = x; };
    const show = i => {
      cur = i; const [b, a, ab, aa] = SET[i];
      before.src = b; before.alt = ab; after.src = a; after.alt = aa;
      tabs.forEach((t, k) => { t.classList.remove('on'); if (k === i) { void t.offsetWidth; t.classList.add('on'); } });
      t0 = 0;
    };
    const frame = now => {
      if (held) { raf = 0; return; }
      if (!t0) t0 = now;
      const t = (now - t0) / RUN;
      // rest on the before, sweep across to the after, rest, then the next repair
      const k = t < .18 ? 0 : t < .7 ? (t - .18) / .52 : 1, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setX(96 - 92 * e);
      if (t >= 1) show((cur + 1) % SET.length);
      raf = live && !held ? requestAnimationFrame(frame) : 0;
    };
    const go = () => { if (!raf && live && !held) raf = requestAnimationFrame(frame); };
    tabs.forEach((b, i) => b.addEventListener('click', () => { held = true; sec.classList.add('held'); show(i); setX(50); }));
    inp.addEventListener('input', () => { held = true; sec.classList.add('held'); stage.style.setProperty('--x', `${inp.value}%`); });
    new IntersectionObserver(([e]) => { live = e.isIntersecting; go(); }, { threshold: .35 }).observe(stage);
    setX(50);
  }
}

/* ---------- process: the hero's great room. Steps 1-3 happen on bare studs (texts, ballpark, walkthrough and bid);
   in step 4 the crew shows up and the board goes up as you scroll ---------- */
{
  const sec = $('.hroom');
  if (sec) {
    const cv = $('.hroom-cv', sec), ctx = cv.getContext('2d'), steps = $$('.hr-step', sec), stage = $('.hroom-stage', sec);
    const msgs = $$('.msg', sec), lines = $$('.bid-lines li', sec), dims = $$('.dm', sec), pct = $('.cw-pct', sec), meter = $('.cw-meter', sec);
    const N = 73, frames = new Array(N);
    let want = 0, drawn = -1, started = false;
    const STAGES = ['Open studs', 'Board going up', 'Hung and screwed'];
    const nearest = i => { for (let k = 0; k < N; k++) { for (const j of [i - k, i + k]) { const im = frames[j]; if (im && im.complete && im.naturalWidth) return im; } } return null; };
    function draw() {
      if (want === drawn) return;
      const im = nearest(want); if (!im) return;
      const W = cv.width, H = cv.height, s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
      const w = im.naturalWidth * s, h2 = im.naturalHeight * s;
      ctx.drawImage(im, (W - w) / 2, (H - h2) / 2, w, h2);
      if (im === frames[want]) drawn = want;
    }
    const size = () => { const d = Math.min(devicePixelRatio || 1, 1.5); cv.width = Math.round(cv.clientWidth * d); cv.height = Math.round(cv.clientHeight * d); drawn = -1; draw(); };
    const load = () => {
      if (started) return; started = true;
      for (let i = 0; i < N; i++) { const im = new Image(); im.decoding = 'async'; im.onload = () => { if (Math.abs(i - want) < 3) { drawn = -1; draw(); } }; im.src = `assets/hang/${String(i).padStart(4, '0')}.webp`; frames[i] = im; }
    };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) load(); }, { rootMargin: '150% 0px' }).observe(sec);
    // where each step starts in the scroll, and which messages show by when
    const START = [.03, .22, .40, .62];
    const MSG_AT = [.06, .11, .16, .25, .28, .32, .35, .37];
    const sub = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
    const onScroll = () => {
      const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(span, 1)));
      let k = -1; START.forEach((s0, i) => { if (p >= s0) k = i; });
      sec.dataset.step = k + 1;
      steps.forEach((el, i) => { el.classList.toggle('in', i <= k); el.classList.toggle('now', i === k); el.classList.toggle('past', i < k); });
      // 1-2: the text thread fills in; the dots give way to the reply
      msgs.forEach((m, i) => m.classList.toggle('show', p >= MSG_AT[i] && !(m.classList.contains('typing') && p >= MSG_AT[i + 1])));
      // 3: the tape goes on each wall, then the bid lines come in
      const t3 = sub(p, .41, .52), fadeDims = 1 - sub(p, .64, .70);
      dims.forEach((d, i) => { d.style.setProperty('--d', sub(t3, i * .2, i * .2 + .4).toFixed(3)); d.style.setProperty('--o', (k >= 2 ? fadeDims : 0).toFixed(2)); });
      const t3b = sub(p, .47, .6);
      lines.forEach((l, i) => l.classList.toggle('show', t3b > i / lines.length));
      // 4: the crew hangs the board
      const f = sub(p, .66, .95);
      want = Math.round(f * (N - 1)); draw();
      pct.textContent = Math.round(f * 100) + '%'; meter.style.setProperty('--hp', (f * 100).toFixed(1) + '%');
      const st = f < .02 ? 0 : f < .98 ? 1 : 2;
      if (stage.dataset.s !== String(st)) { stage.dataset.s = st; $('span', stage).textContent = STAGES[st]; }
      sec.classList.toggle('hung', st === 2);
    };
    addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', size);
    size(); onScroll();
  }
}

/* ---------- repairs: four before/afters; each sweeps across on its own, staggered, until someone drags it ---------- */
{
  const cards = $$('.rxc');
  if (cards.length) {
    const st = cards.map((el, i) => ({ el, inp: $('.rxc-in', el), held: false, off: i * 900 }));
    const setX = (c, x) => { c.el.style.setProperty('--x', `${x.toFixed(2)}%`); c.inp.value = x; };
    st.forEach(c => c.inp.addEventListener('input', () => { c.held = true; c.el.style.setProperty('--x', `${c.inp.value}%`); }));
    const CYCLE = 7200;
    let raf = 0, live = false, t0 = 0;
    const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const frame = now => {
      if (!t0) t0 = now;
      st.forEach(c => {
        if (c.held) return;
        const t = (((now - t0 - c.off) % CYCLE) + CYCLE) % CYCLE / CYCLE;
        // rest on before, sweep to after, rest on after, sweep back
        const k = t < .14 ? 0 : t < .44 ? ease((t - .14) / .3) : t < .72 ? 1 : t < .92 ? 1 - ease((t - .72) / .2) : 0;
        setX(c, now - t0 < c.off ? 96 : 96 - 92 * k);
      });
      raf = live ? requestAnimationFrame(frame) : 0;
    };
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live && !raf) raf = requestAnimationFrame(frame); }, { threshold: .2 }).observe($('.rx2-grid'));
  }
}

/* ---------- services: the tape on the wall carries the real logo, from the hero's own SVG ---------- */
{
  const tracks = $$('.svt-track'), src = $('.tour-logo svg');
  if (tracks.length && src) {
    const svg = src.outerHTML;
    tracks.forEach(t => { t.innerHTML = Array.from({ length: 12 }, () => svg + '<i></i>').join(''); });
  }
}

/* ---------- builders: the building. Each floor's tag shows which trade is on it; they move up a floor at a time ---------- */
{
  const fig = $('.bld-fig');
  if (fig) {
    const floors = $$('.bld-fl', fig), wk = $('.bld-w', fig), NAMES = ['Framed', 'Hanging', 'Taping', 'Finishing', 'Paint-ready'], WEEKS = 12;
    let w = 0, t = 0;
    const tick = () => {
      w = w % (WEEKS + 2) + 1;
      const week = Math.min(w, WEEKS); wk.textContent = week;
      floors.forEach(fl => {
        const f = +fl.dataset.f, start = 1 + (f - 1) * 2;
        const st = week < start ? 0 : Math.min(4, 1 + Math.floor((week - start) / 2));
        fl.dataset.s = st; $('.bld-st', fl).textContent = NAMES[st];
      });
    };
    tick();
    if (!reduced) new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !t) t = setInterval(tick, 1600);
      else if (!e.isIntersecting && t) { clearInterval(t); t = 0; }
    }, { threshold: .3 }).observe(fig);
    else { w = 7; tick(); }
  }
}

/* ---------- builders: the phase board. Floors move through the trades, one behind the other ---------- */
{
  const pb = $('.pb');
  if (pb) {
    const floors = $$('.pb-fl', pb), wk = $('.pb-w', pb), NAMES = ['Framed', 'Hung', 'Taped', 'Finished', 'Paint-ready'], WEEKS = 12;
    let w = 0, t = 0;
    const tick = () => {
      w = w % (WEEKS + 2) + 1;                      // two weeks resting on the finished building, then again
      const week = Math.min(w, WEEKS); wk.textContent = week;
      floors.forEach(fl => {
        const f = +fl.dataset.f, start = 1 + (f - 1) * 2;
        const s = week < start ? 0 : Math.min(4, 1 + Math.floor((week - start) / 2));
        fl.dataset.s = s; $('.pb-st', fl).textContent = NAMES[s];
      });
    };
    tick();
    if (!reduced) new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !t) t = setInterval(tick, 1100);
      else if (!e.isIntersecting && t) { clearInterval(t); t = 0; }
    }, { threshold: .3 }).observe(pb);
    else { w = WEEKS - 1; tick(); }
  }
}

/* ---------- the raking light: each finished-wall headline is lit by a sweep as it comes into view ---------- */
{
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -18% 0px' });
  $$('.lit').forEach(el => io.observe(el));
}

/* ---------- reveal on scroll ---------- */
const rv = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rv.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
$$('.us, .lic, .how li, .faq details').forEach(el => { el.classList.add('rv'); rv.observe(el); });

// the service sheets stand up off the floor when they come into view
{
  const sh = $('.sheets');
  if (sh && !reduced) {
    sh.classList.add('wait');
    new IntersectionObserver(([e], io) => { if (e.isIntersecting) { sh.classList.remove('wait'); io.disconnect(); } }, { rootMargin: '0px 0px -18% 0px' }).observe(sh);
  }
}

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

/* ---------- builders: the phase plan draws in and "today" walks across the weeks while it's on screen ---------- */
{
  const g = $('.gantt');
  if (g) {
    const now = $('.g-now', g);
    let raf = 0, live = false, t0 = 0;
    const frame = t => { if (!t0) t0 = t; const k = ((t - t0) / 14000) % 1; now.style.setProperty('--t', (.04 + k * .92).toFixed(4)); raf = live ? requestAnimationFrame(frame) : 0; };
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live) { g.classList.add('in'); if (!raf && !reduced) raf = requestAnimationFrame(frame); } }, { threshold: .3 }).observe(g);
  }
}

/* ---------- repairs: a Next Gen knife wipes each repair in, then the next ticket comes up; drag or tap to take over ---------- */
{
  const sec = $('.rx3');
  if (sec) {
    const stage = $('.rx3-stage', sec), A = $('.rx3-a', stage), B = $('.rx3-b', stage), inp = $('.rx3-in', stage), tks = $$('.tk', sec);
    const SET = JSON.parse(stage.dataset.set);
    SET.forEach(([b, a]) => { new Image().src = b; new Image().src = a; });
    const RUN = 6200;
    let cur = 0, raf = 0, t0 = 0, live = false, held = false;
    const setX = x => { stage.style.setProperty('--x', `${x.toFixed(2)}%`); inp.value = x; stage.classList.toggle('kdone', x > 97); };
    const show = i => {
      cur = i; const [b, a, ab, aa] = SET[i];
      stage.classList.add('swap');
      setTimeout(() => { B.src = b; B.alt = ab; A.src = a; A.alt = aa; stage.classList.remove('swap'); }, 300);
      tks.forEach((t, k) => { t.classList.remove('on'); if (k === i) { void t.offsetWidth; t.classList.add('on'); } });
      t0 = 0;
    };
    const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const frame = now => {
      if (held) { raf = 0; return; }
      if (!t0) t0 = now;
      const t = (now - t0) / RUN;
      // rest on the damage, one slow pass of the knife, rest on the repair
      const k = t < .16 ? 0 : t < .72 ? ease((t - .16) / .56) : 1;
      setX(100 * k);
      if (t >= 1) show((cur + 1) % SET.length);
      raf = live ? requestAnimationFrame(frame) : 0;
    };
    const go = () => { if (!raf && live && !held) raf = requestAnimationFrame(frame); };
    const hold = () => { held = true; sec.classList.add('held'); };
    tks.forEach((b, i) => b.addEventListener('click', () => { hold(); show(i); setX(0); requestAnimationFrame(() => { let s0 = 0; const run = n => { if (!s0) s0 = n; const k = Math.min(1, (n - s0) / 2200); setX(100 * ease(k)); if (k < 1) requestAnimationFrame(run); }; requestAnimationFrame(run); }); }));
    inp.addEventListener('input', () => { hold(); stage.style.setProperty('--x', `${inp.value}%`); });
    new IntersectionObserver(([e]) => { live = e.isIntersecting; go(); }, { threshold: .35 }).observe(stage);
  }
}

/* ---------- repairs: the repair log steps through each repair's four stages, then the next repair ---------- */
{
  const sec = $('.rlog');
  if (sec) {
    const card = $('.rl-card', sec), SET = JSON.parse(card.dataset.set), picks = $$('.rl-pick', sec);
    const imgs = $$('.rl-img', card), sts = $$('.rl-st', card), tape = $('.rl-tape', card), job = $('.rl-job', card), stepN = $('.rl-step-n b', card);
    const STEP = 2500;
    let r = 0, k = 0, timer = 0, live = false, held = false;
    SET.forEach(([key]) => { for (let j = 1; j <= 4; j++) new Image().src = `assets/img/rxs-${key}-${j}.webp`; });
    sec.style.setProperty('--rl-t', `${STEP * 4 / 1000}s`);
    const paint = () => {
      const [key, st, al] = SET[r];
      imgs.forEach((im, j) => { im.classList.toggle('on', j === k); });
      sts.forEach((el, j) => { el.classList.toggle('on', j === k); el.classList.toggle('done', j < k); $('b', el).textContent = st[j]; });
      $('span', tape).textContent = `Step ${k + 1}`; $('b', tape).textContent = st[k]; stepN.textContent = k + 1;
    };
    const setRepair = i => {
      r = i; k = 0; const [key, st, al] = SET[i];
      imgs.forEach((im, j) => { im.src = `assets/img/rxs-${key}-${j + 1}.webp`; im.alt = al[j]; });
      job.textContent = $('.rl-t', picks[i]).textContent;
      picks.forEach((p, j) => { p.classList.remove('on'); if (j === i) { void p.offsetWidth; p.classList.add('on'); } });
      paint();
    };
    const tick = () => { if (held || !live) return; if (k < 3) { k++; paint(); } else setRepair((r + 1) % SET.length); };
    const start = () => { if (!timer) timer = setInterval(tick, STEP); };
    const stop = () => { clearInterval(timer); timer = 0; };
    picks.forEach((p, i) => p.addEventListener('click', () => { held = false; sec.classList.remove('held'); stop(); setRepair(i); start(); }));
    sts.forEach((el, j) => el.addEventListener('click', () => { held = true; sec.classList.add('held'); k = j; paint(); }));
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live) start(); else stop(); }, { threshold: .3 }).observe(card);
  }
}

/* ---------- finish levels: the crew's marker notes on the seam, and the Next Gen pick stamp ---------- */
function lvNotes(n) {
  const svg = $('.lv-notes'), stamp = $('.lv-stamp');
  if (!svg) return;
  // [text, text x, text y, arrow to x, arrow to y]
  const N = [
    [['no tape yet', 330, 300, 935, 470], ['screws set just under the paper', 420, 880, 345, 1030]],
    [['tape bedded in mud', 330, 300, 915, 470], ['screws still bare', 470, 880, 345, 1030]],
    [['1 coat over the tape', 330, 300, 900, 470], ['screws spotted once', 470, 880, 345, 1030]],
    [['2 coats, about 9″ wide', 300, 300, 880, 470], ['screws spotted twice', 470, 880, 345, 1030]],
    [['3 coats, feathered 14″', 300, 300, 850, 470], ['spotted 3 times, sanded', 450, 880, 345, 1030]],
    [['skim coat, whole wall', 330, 300, 760, 520], ['nothing flashes in low sun', 330, 900, 700, 760]],
  ][n];
  svg.innerHTML = N.map(([t, x, y, tx, ty], i) => {
    const mx = (x + tx) / 2 + (i ? -60 : 60), my = (y + ty) / 2 + (i ? 40 : -40);
    const ang = Math.atan2(ty - my, tx - mx), h1 = [tx - 34 * Math.cos(ang - .45), ty - 34 * Math.sin(ang - .45)], h2 = [tx - 34 * Math.cos(ang + .45), ty - 34 * Math.sin(ang + .45)];
    const sy = y + (ty > y ? 18 : -46);
    const ex = x + Math.min(t.length * 24, 560) * (tx > x ? 1 : .35);
    return `<g class="lvn" style="--i:${i}"><text x="${x}" y="${y}">${t}</text><path pathLength="1" d="M${ex} ${sy} Q${(ex + tx) / 2 + (i ? -40 : 40)} ${(sy + ty) / 2 - (i ? -30 : 50)} ${tx} ${ty}M${h1[0]} ${h1[1]}L${tx} ${ty}L${h2[0]} ${h2[1]}"/></g>`;
  }).join('') + (n === 1 ? `<text class="lv-tape" transform="translate(946 -40) rotate(90)">${'\u25A0 NEXT GEN DRYWALL '.repeat(4)}</text>` : '');
  if (stamp) { stamp.hidden = !(n === 4 || n === 5); $('b', stamp).textContent = n === 4 ? 'Most homes' : 'Big light, satin paint'; }
}

/* ---------- services: the wall photo is placed so its joints miss the copy; the tape goes on those joints ---------- */
{
  const wall = $('.svc-wall');
  if (wall) {
    // the photo is 2400 x 1018; joints measured in photo pixels
    const IW = 2400, IH = 1018, HY = 310, V1 = 710, V2 = 1658, TAPE = 40;
    const seams = $$('.seam', wall), head = $('.svc-head'), wrap = $('.svc .wrap');
    const place = () => {
      const W = wall.clientWidth, H = wall.clientHeight; if (!W || !head) return;
      const wr = wall.getBoundingClientRect(), hr = head.getBoundingClientRect(), cr = wrap.getBoundingClientRect();
      // the horizontal joint runs just above the heading; the lower vertical joint sits in the margin left of the content
      const ty = Math.max(14, hr.top - wr.top - 34), tx = Math.max(10, cr.left - wr.left - 46);
      const s = Math.max(W / IW, H / IH, (H - ty) / (IH - HY) + .002, (W - tx) / (IW - V1) + .002);
      const oy = Math.min(0, ty - HY * s), ox = Math.min(0, Math.max(W - IW * s, tx - V1 * s));
      wall.style.backgroundSize = `100% 100%, ${IW * s}px ${IH * s}px`;
      wall.style.backgroundPosition = `0 0, ${ox}px ${oy}px`;
      const tw = Math.max(26, TAPE * s), Y = oy + HY * s;
      const set = (el, css) => { el.style.cssText = css; el.style.setProperty('--tw', tw + 'px'); };
      seams.forEach(el => {
        const k = el.dataset.seam;
        if (k === 'h') set(el, `left:-20px;top:${Y - tw / 2}px;width:${W + 40}px;height:${tw}px`);
        if (k === 'v1') { const x = ox + V1 * s, top = Y + tw / 2; set(el, `left:${x + tw / 2}px;top:${top}px;width:${H + 20 - top}px;height:${tw}px;transform:rotate(90deg);transform-origin:0 0`); }
        if (k === 'v2') { const x = ox + V2 * s, bot = Y - tw / 2; set(el, `left:${x + tw / 2}px;top:-20px;width:${bot + 20}px;height:${tw}px;transform:rotate(90deg);transform-origin:0 0;display:${bot > 4 ? 'flex' : 'none'}`); }
      });
    };
    new ResizeObserver(place).observe(wall); addEventListener('load', place); place();
  }
}

/* ---------- repairs: four real stages per repair, with the crew's blue crayon marks drawn on as each one comes up ---------- */
{
  const sec = $('.rfix');
  if (sec) {
    const stage = $('.rf-stage', sec), SET = JSON.parse(stage.dataset.set), picks = $$('.rf-pick', sec), sts = $$('.rf-st', sec);
    const imgs = $$('.rf-img', sec), marks = $('.rf-marks', sec), job = $('.rf-job', sec), count = $('.rf-count b', sec);
    // where the damage sits in each photo (1600 x 893): centre and half-size, and the crew's notes for each step
    const GEO = [[790, 400, 320, 215], [818, 397, 100, 100], [811, 373, 170, 232], [793, 268, 200, 205]];
    const NOTE = [
      ['wet board, comes out', 'cut back to dry framing', 'tape + 3 coats', 'knockdown matched'],
      ['no backing here', 'cut square, backer in', 'tape + 3 coats, feathered', 'orange peel matched'],
      ['open to the studs', 'squared up, backer in', 'patched around the box', 'plate on, matched'],
      ['settling crack', 'mesh tape, pops reset', 'coated 14″ wide', 'blended, gone']];
    const STEP = 2800; let r = 0, k = 0, timer = 0, held = false, live = false;
    sec.style.setProperty('--step', STEP / 1000 + 's');
    const wob = (cx, cy, rx, ry) => { let d = ''; for (let i = 0; i < 24; i++) { const a = -2.2 + i / 24 * Math.PI * 2, j = 1 + Math.sin(i * 1.7) * .04; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rx * j).toFixed(0) + ' ' + (cy + Math.sin(a) * ry * j).toFixed(0); } return d; };
    // step 3: the coated patch, half-width and bottom edge, so the crew's dimension line spans the real patch
    const PATCH = [[858, 436, 670], [820, 256, 647], [809, 253, 692], [869, 202, 446]];
    const draw = () => {
      const [cx, cy, rx, ry] = GEO[r], t = NOTE[r][k];
      let g = '', tx = cx, ty = Math.min(cy + ry * 1.18 + 82, 860);
      if (k === 0) g = `<path pathLength="1" d="${wob(cx, cy, rx * 1.18, ry * 1.18)}Z"/>`;
      if (k === 1) g = `<rect pathLength="1" x="${cx - rx * 1.1}" y="${cy - ry * 1.1}" width="${rx * 2.2}" height="${ry * 2.2}" rx="6"/>`;
      if (k === 2) { const [px, pw, pb] = PATCH[r], y = pb + 34; tx = px; ty = Math.min(y + 82, 860); g = `<path pathLength="1" d="M${px - pw} ${y}H${px + pw}M${px - pw} ${y - 18}V${y + 18}M${px + pw} ${y - 18}V${y + 18}"/>`; }
      if (k === 3) g = `<ellipse class="dash ghost" cx="${cx}" cy="${cy}" rx="${rx * 1.18}" ry="${ry * 1.18}"/>`;
      const label = k === 3 ? `${t} \u2713 <tspan class="ng">NG</tspan>` : t;
      marks.innerHTML = `<g>${g}<text x="${tx}" y="${ty}" text-anchor="middle">${label}</text></g>`;
    };
    const show = () => {
      imgs.forEach((im, j) => { im.classList.toggle('on', j === k); im.alt = j === k ? `${SET[r][1]}, step ${k + 1}: ${SET[r][2][k]}` : ''; });
      sts.forEach((b, j) => { b.classList.toggle('on', j === k); void b.offsetWidth; });
      count.textContent = k + 1; draw();
    };
    const setRepair = n => {
      r = n; job.textContent = SET[r][1];
      picks.forEach((p, j) => { p.classList.toggle('on', j === r); p.setAttribute('aria-pressed', j === r); });
      imgs.forEach((im, j) => { im.src = `assets/img/rxs-${SET[r][0]}-${j + 1}.webp`; });
      sts.forEach((b, j) => { $('img', b).src = `assets/img/rxs-${SET[r][0]}-${j + 1}.webp`; $('b', b).textContent = SET[r][2][j]; });
    };
    const tick = () => { clearTimeout(timer); if (held || !live || reduced) return; timer = setTimeout(() => { k++; if (k > 3) { k = 0; setRepair((r + 1) % 4); } show(); tick(); }, STEP); };
    picks.forEach((p, j) => p.addEventListener('click', () => { held = false; stage.classList.remove('held'); setRepair(j); k = 0; show(); tick(); }));
    sts.forEach((b, j) => b.addEventListener('click', () => { held = true; stage.classList.add('held'); clearTimeout(timer); k = j; show(); }));
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live) { show(); tick(); } else clearTimeout(timer); }, { threshold: .35 }).observe(stage);
    show();
  }
}

/* ---------- the work: the house draws itself, the windows light up, one at a time; tap a window to look inside ---------- */
{
  const house = $('.wk-house');
  if (house) {
    const wins = $$('.hw', house), n = $('.wk-n'), cap = $('.wk-cap'), box = $('.wk-box');
    const CAPS = wins.map(w => w.getAttribute('aria-label').replace('Look inside: ', ''));
    let cur = 0, timer = 0, live = false, open = -1;
    const lite = i => { cur = i; wins.forEach((w, j) => w.classList.toggle('lit', j === i)); n.textContent = `${String(i + 1).padStart(2, '0')} / ${wins.length}`; cap.textContent = CAPS[i]; };
    const cycle = () => { clearTimeout(timer); if (!live || reduced || open > -1) return; timer = setTimeout(() => { lite((cur + 1) % wins.length); cycle(); }, 2600); };
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live) { house.classList.add('in'); setTimeout(() => { lite(cur); cycle(); }, reduced ? 0 : 1800); } else clearTimeout(timer); }, { threshold: .3 }).observe(house);
    const show = i => {
      open = (i + wins.length) % wins.length; const im = $('img', wins[open]);
      $('img', box).src = im.currentSrc || im.src; $('img', box).alt = im.alt;
      $('.wk-bn', box).textContent = `${String(open + 1).padStart(2, '0')} / ${wins.length}`; $('figcaption b', box).textContent = CAPS[open];
      lite(open);
    };
    wins.forEach((w, i) => { w.addEventListener('mouseenter', () => { clearTimeout(timer); lite(i); }); w.addEventListener('mouseleave', cycle);
      w.addEventListener('click', () => { show(i); if (box.showModal) box.showModal(); clearTimeout(timer); }); });
    $('.wk-x', box).addEventListener('click', () => box.close());
    $('.wk-prev', box).addEventListener('click', () => show(open - 1));
    $('.wk-next', box).addEventListener('click', () => show(open + 1));
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(open - 1); if (e.key === 'ArrowRight') show(open + 1); });
    box.addEventListener('close', () => { open = -1; cycle(); });
  }
}

/* ---------- builders: scroll moves twelve weeks; each floor is hung, inspected, taped, finished, then painted ---------- */
{
  const sec = $('.bld3');
  if (sec) {
    const floors = $$('.fl', sec), stat = [], items = $$('.fm-list > li', sec), rows = $$('.fm-dt tr[data-w]', sec);
    $$('.fm-status li', sec).forEach(li => { stat[+li.dataset.l] = li; });
    const wkEl = $('.fm-wk', sec), dateEl = $('.fm-date', sec), track = $('.fm-track', sec);
    const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const START = new Date(2026, 2, 9), RANGE = [[0, 2.8], [2.8, 5.6], [5.6, 8.4], [8.4, 12.01]];
    const seg = (w, a, b) => clamp((w - a) / (b - a), 0, 1);
    let mode = 'scroll', on = -1, held = -1;
    const render = w => {
      floors.forEach((f, i) => {
        const s = 2 * i, hang = seg(w, s, s + 2), tape = seg(w, s + 2.3, s + 3.5), fin = seg(w, s + 3.5, s + 4.6), paint = seg(w, s + 4.8, s + 6.6);
        f.style.setProperty('--hang', hang.toFixed(3)); f.style.setProperty('--tape', tape.toFixed(3)); f.style.setProperty('--fin', fin.toFixed(3)); f.style.setProperty('--paint', paint.toFixed(3));
        f.dataset.board = hang > .5 ? 1 : 0;
        f.classList.toggle('inspect', w >= s + 2 && w < s + 2.3);
        const st = paint > 0 ? ['paint', 'PAINT MOVES IN'] : fin >= 1 ? ['us', 'READY FOR PAINT'] : fin > 0 ? ['us', 'NEXT GEN · FINISHING'] : tape > 0 ? ['us', 'NEXT GEN · TAPING'] : w >= s + 2 ? ['us', 'INSPECTED ✓'] : hang > 0 ? ['us', 'NEXT GEN · HANGING'] : ['wait', 'FRAMED, WAITING'];
        f.dataset.st = st[0]; const t = $('.fl-chip text', f); if (t.textContent !== st[1]) t.textContent = st[1];
        const row = stat[i]; if (row) { row.dataset.st = st[0]; const sp = $('span', row); if (sp.textContent !== st[1]) sp.textContent = st[1]; }
      });
      const wk = Math.min(12, Math.floor(w) + 1), d = new Date(START); d.setDate(d.getDate() + Math.min(Math.floor(w * 7), 82));
      if (d.getDay() === 0) d.setDate(d.getDate() + 1); if (d.getDay() === 6) d.setDate(d.getDate() - 1);
      wkEl.textContent = String(wk).padStart(2, '0'); dateEl.textContent = `${D[d.getDay()]}, ${M[d.getMonth()]} ${d.getDate()}`;
      track.style.setProperty('--w', Math.min(12, w).toFixed(2));
      rows.forEach(r => r.classList.toggle('done', w >= +r.dataset.w));
      const k = held > -1 ? held : RANGE.findIndex(([a, b]) => w >= a && w < b);
      if (k !== on && k > -1) { on = k; items.forEach((li, j) => li.classList.toggle('on', j === k)); }
    };
    // it plays on its own while it's on screen: twelve weeks in about 18 seconds, a beat on week 12, then again
    const SPEED = 1500, HOLD = 3.5;
    let raf = 0, t0 = 0, live = false;
    const loop = now => { if (!t0) t0 = now; const w = ((now - t0) / SPEED) % (12 + HOLD); render(Math.min(w, 12)); if (w < .05) held = -1; raf = live ? requestAnimationFrame(loop) : 0; };
    new IntersectionObserver(([e]) => { live = e.isIntersecting; if (live && !reduced && !raf) { t0 = 0; raf = requestAnimationFrame(loop); } }, { threshold: .25 }).observe($('.fm-draw', sec));
    // a tap on a promise jumps the clock to that part of the job and keeps it playing from there
    items.forEach((li, j) => $('button', li).addEventListener('click', () => {
      if (reduced) { held = j; render(RANGE[j][0] + 1); return; }
      t0 = performance.now() - (RANGE[j][0] + .2) * SPEED;
    }));
    render(reduced ? 7 : 0);
  }
}

/* preview build: calls, email and the bid form are off */
(function () {
  const t = document.createElement('div'); t.className = 'pv-toast'; document.body.appendChild(t); let k;
  const say = m => { t.textContent = m; t.classList.add('on'); clearTimeout(k); k = setTimeout(() => t.classList.remove('on'), 2600); };
  document.addEventListener('click', e => { if (e.target.closest('[data-preview-off]')) { e.preventDefault(); say('Preview only. Calls and email are off in this concept.'); } }, true);
})();
