// Scroll-scrubbed footage of the wall building itself: 163 frames drawn to a canvas, nearest frame wins.
// Frames load coarse-to-fine (every 16th, then every 4th, then all) so scrubbing works before the set is in.
export const STAGES = [0, 0.15, 0.24, 0.5, 0.75, 1];   // hang | fasten | tape | mud | level 5
const N = 163;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function mountSequence(canvas, { onStage, onProgress, onLoad, reduced } = {}) {
  const ctx = canvas.getContext('2d');
  const dir = matchMedia('(max-width: 820px)').matches ? 'm' : 'd';
  const frames = new Array(N).fill(null);
  let loaded = 0, progress = 0, shown = 0, intro = 0, lastStage = -1, W = 1, H = 1, dpr = 1, mx = 0, my = 0, smx = 0, smy = 0;
  const t0 = performance.now();

  const order = [];
  for (const step of [16, 4, 1]) for (let i = 0; i < N; i += step) if (!order.includes(i)) order.push(i);
  let next = 0;
  const pump = () => {
    if (next >= order.length) return;
    const i = order[next++], im = new Image();
    im.decoding = 'async';
    im.onload = () => { frames[i] = im; loaded++; onLoad && onLoad(loaded / N); pump(); };
    im.onerror = pump;
    im.src = `assets/seq/${dir}/${String(i).padStart(3, '0')}.webp`;
  };
  for (let k = 0; k < 6; k++) pump();

  const nearest = i => {                       // closest loaded frame at or before i, else after
    for (let d = 0; d < N; d++) { if (frames[i - d]) return i - d; if (frames[i + d]) return i + d; }
    return -1;
  };
  const cover = (im, alpha) => {
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * 1.04;
    const w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (W - w) / 2 + smx * W * .012, (H - h) / 2 + smy * H * .012, w, h);
  };

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio, 2); W = Math.max(1, r.width * dpr); H = Math.max(1, r.height * dpr);
    canvas.width = W; canvas.height = H;
  }

  let running = true;
  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!reduced) intro = Math.min(.05, ((t - t0) / 2200) * .05);   // the first sheet starts to lift on load
    const target = Math.max(progress, intro);
    shown += (target - shown) * (reduced ? 1 : .16);
    smx += (mx - smx) * .05; smy += (my - smy) * .05;
    const f = shown * (N - 1), i0 = Math.floor(f), a = f - i0;
    const k0 = nearest(i0);
    if (k0 < 0) return;
    ctx.fillStyle = '#15110e'; ctx.globalAlpha = 1; ctx.fillRect(0, 0, W, H);
    cover(frames[a > .5 && frames[i0 + 1] ? i0 + 1 : k0], 1);
    ctx.globalAlpha = 1;
    let st = 0; for (let i = 0; i < 5; i++) if (shown >= STAGES[i] - .001) st = i;
    if (st !== lastStage) { lastStage = st; onStage && onStage(st); }
    onProgress && onProgress(shown);
  }

  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * -2; my = (e.clientY / innerHeight - .5) * -2; }, { passive: true });
  new IntersectionObserver(([e]) => { const was = running; running = e.isIntersecting; if (running && !was) requestAnimationFrame(frame); }).observe(canvas);
  requestAnimationFrame(frame);
  return { setProgress(p) { progress = clamp(p); } };
}
