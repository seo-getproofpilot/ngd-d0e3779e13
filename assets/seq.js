// Hero: the wall builds itself as you scroll.
//  1. Hang (procedural): four sheets lie flat on the slab and stand up one at a time, hinged at the base of the
//     wall like a ladder being raised, drawn in true perspective over a photo of the empty room. Each sheet is
//     textured with its own slice of the real hung-wall photo, so when it lands it sits exactly where that sheet is.
//  2. Fasten: the composite cross-fades into the first frame of the footage (screws in).
//  3. Tape, mud, knife, Level 5: scroll-scrubbed footage frames, nearest frame wins.
export const STAGES = [0, 0.12, 0.24, 0.41, 0.83, 1];   // hang | fasten | tape | mud | level 5
const HANG_END = 0.19, FOOT_START = 0.24;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// geometry, in the 1600x900 space of the reference photo
const REF_W = 1600, REF_H = 900;
const CX = 800, CY = 410, D = 3000;                // principal point / horizon, and camera distance to the wall (flat sheets land in frame)
const BASE = 752, TOP = 63, SH = BASE - TOP;       // wall base and top; sheet height
const XS = [268, 627, 918, 1210, 1500];            // sheet seams across the wall
const STRIPS = 90;

export function mountSequence(canvas, { onStage, onProgress, onLoad, reduced, frames: N = 184 } = {}) {
  const ctx = canvas.getContext('2d');
  const dir = matchMedia('(max-width: 820px)').matches ? 'm' : 'd';
  const frames = new Array(N).fill(null);
  const img = src => new Promise(r => { const i = new Image(); i.decoding = 'async'; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  let plate = null; const raw = [], lit = [];
  const total = N + 9; let got = 0;
  const tick = () => { got++; onLoad && onLoad(got / total); };
  img(`assets/hang/plate-${dir}.webp`).then(i => { plate = i; tick(); });
  for (let k = 0; k < 4; k++) {
    img(`assets/hang/sheet${k}-raw.webp`).then(i => { raw[k] = i; tick(); });
    img(`assets/hang/sheet${k}-lit.webp`).then(i => { lit[k] = i; tick(); });
  }
  const order = [];
  for (const step of [16, 4, 1]) for (let i = 0; i < N; i += step) if (!order.includes(i)) order.push(i);
  let next = 0;
  const pump = () => {
    if (next >= order.length) return;
    const i = order[next++];
    img(`assets/seq/${dir}/${String(i).padStart(3, '0')}.webp`).then(im => { frames[i] = im; tick(); pump(); });
  };
  for (let k = 0; k < 6; k++) pump();
  const nearest = i => { for (let d = 0; d < N; d++) { if (frames[i - d]) return i - d; if (frames[i + d]) return i + d; } return -1; };

  let progress = 0, shown = 0, intro = 0, lastStage = -1, W = 1, H = 1, mx = 0, my = 0, smx = 0, smy = 0, running = true;
  let rect = { x: 0, y: 0, w: 1, h: 1 };
  const t0 = performance.now();

  // where a 16:9 image lands when it covers the canvas (plus a breath of parallax)
  const layout = () => {
    const s = Math.max(W / 16, H / 9) * 1.04, w = 16 * s, h = 9 * s;
    rect = { x: (W - w) / 2 + smx * W * .012, y: (H - h) / 2 + smy * H * .012, w, h };
  };
  const toCanvas = (u, v) => [rect.x + u / REF_W * rect.w, rect.y + v / REF_H * rect.h];
  const project = (X, Y, z) => { const Z = D - z; return [CX + X * D / Z, CY - Y * D / Z]; };

  // one sheet, raised to `deg` (0 flat on the slab, 90 standing on the studs)
  function drawSheet(k, deg, litMix) {
    const tex = raw[k], texL = lit[k];
    if (!tex) return;
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const X0 = XS[k] - CX, X1 = XS[k + 1] - CX, Yb = CY - BASE;
    const pt = (X, s) => project(X, Yb + s * SH * sa, s * SH * ca);
    const strips = (im, alpha) => {
      ctx.globalAlpha = alpha;
      if (deg >= 78) {                                         // near vertical: one piece, no strip seams in the cross-fade
        const [l0, v0] = pt(X0, 0), [r1, v1] = pt(X1, 1), [l1] = pt(X0, 1), [r0] = pt(X1, 0);
        const [x0, y1] = toCanvas((l0 + l1) / 2, v1), [x1, y0] = toCanvas((r0 + r1) / 2, v0);
        ctx.drawImage(im, x0, y1, x1 - x0, y0 - y1); return;
      }
      for (let j = 0; j < STRIPS; j++) {
        const s0 = j / STRIPS, s1 = (j + 1) / STRIPS;
        const [l0, v0] = pt(X0, s0), [r0] = pt(X1, s0), [l1, v1] = pt(X0, s1), [r1] = pt(X1, s1);
        const [cl, cv0] = toCanvas((l0 + l1) / 2, v0), [cr, cv1] = toCanvas((r0 + r1) / 2, v1);
        const top = Math.min(cv0, cv1), hh = Math.abs(cv1 - cv0) + .8;
        const sy = (1 - s1) * im.naturalHeight, sh = im.naturalHeight / STRIPS;   // texture top is the sheet top
        ctx.drawImage(im, 0, sy, im.naturalWidth, sh, cl, top, cr - cl, hh);
      }
    };
    const c = [pt(X0, 0), pt(X1, 0), pt(X1, 1), pt(X0, 1)].map(([u, v]) => toCanvas(u, v));
    const poly = () => { ctx.beginPath(); c.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
    // soft shadow under the sheet while it's in the air
    if (deg > 2 && deg < 89) {
      ctx.save(); ctx.globalAlpha = .55 * Math.sin(a * 2); ctx.shadowColor = 'rgba(10,6,2,.85)'; ctx.shadowBlur = 40 * (rect.w / 1600);
      ctx.shadowOffsetY = 14 * (rect.w / 1600) * ca; ctx.fillStyle = '#2a2219'; poly(); ctx.fill(); ctx.restore();
    }
    strips(tex, 1);
    if (litMix > 0 && texL) strips(texL, litMix);
    // light falls off toward the far end of a tilted sheet; the face toward the window stays warm
    if (litMix < 1 && deg > 1) {
      const [, yb] = c[0], [, yt] = c[3];
      const g = ctx.createLinearGradient(0, yb, 0, yt);
      g.addColorStop(0, 'rgba(255,200,140,0)'); g.addColorStop(1, `rgba(20,14,8,${(.28 * Math.sin(a * 2)).toFixed(3)})`);
      ctx.globalAlpha = 1 - litMix; ctx.fillStyle = g; poly(); ctx.fill();
    }
    // the board's 5/8" edge catches light along the top while it swings up
    if (deg > 3 && deg < 88) {
      ctx.globalAlpha = .9 * Math.sin(a * 2); ctx.strokeStyle = '#f1ede4'; ctx.lineWidth = Math.max(1.5, 4 * rect.w / 1600);
      ctx.beginPath(); ctx.moveTo(...c[3]); ctx.lineTo(...c[2]); ctx.stroke();
    }
    // a sheet tilting up turns away from the window light until it picks up the wall's own light
    const shade = Math.sin(a * 2) * .14 + (1 - litMix) * sa * .1;
    if (shade > .005) { ctx.globalAlpha = shade; ctx.fillStyle = '#1b160f'; poly(); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawHang(p) {
    if (plate) ctx.drawImage(plate, rect.x, rect.y, rect.w, rect.h);
    const q = p / HANG_END;                                   // 0..1 across the hang stage
    for (let k = 0; k < 4; k++) {
      const deg = ease(clamp((q - k * .19) / .42)) * 90;     // overlapping, left to right
      drawSheet(k, deg, clamp((deg - 78) / 12));
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
    W = Math.max(1, r.width * dpr); H = Math.max(1, r.height * dpr);
    canvas.width = W; canvas.height = H;
  }

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!reduced) intro = Math.min(.025, ((t - t0) / 2400) * .025);   // the first sheet starts to stir on load
    const target = Math.max(progress, intro);
    shown += (target - shown) * (reduced ? 1 : .16);
    smx += (mx - smx) * .05; smy += (my - smy) * .05;
    layout();
    ctx.globalAlpha = 1; ctx.fillStyle = '#15110e'; ctx.fillRect(0, 0, W, H);
    if (shown < FOOT_START) {
      drawHang(Math.min(shown, HANG_END));
      const f = clamp((shown - HANG_END) / (FOOT_START - HANG_END));   // fasten: the real footage takes over
      if (f > 0 && frames[0]) { ctx.globalAlpha = f; ctx.drawImage(frames[0], rect.x, rect.y, rect.w, rect.h); ctx.globalAlpha = 1; }
    } else {
      const k = nearest(Math.round((shown - FOOT_START) / (1 - FOOT_START) * (N - 1)));
      if (k >= 0) ctx.drawImage(frames[k], rect.x, rect.y, rect.w, rect.h);
    }
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
