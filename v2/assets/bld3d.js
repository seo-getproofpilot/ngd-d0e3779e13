/* Builders: a white architect's model of a four-story build, front cut away, every floor's partitions at a real
   drywall stage. Framed studs, then hung board, taped joints, finished, painted. One floor behind the next, a week at
   a time. It turns slowly on its own and you can drag it round. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';

const fig = document.querySelector('.b3');
if (fig) start(fig);

function start(fig) {
  const cv = fig.querySelector('.b3-cv');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); }
  catch (e) { fig.classList.add('b3-off'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  const cam = new THREE.PerspectiveCamera(30, 1, .5, 400);

  // ---- light: a soft key from the upper left, throwing the model's shadow onto its base
  const key = new THREE.DirectionalLight(0xfff1de, 3.1);
  key.position.set(-24, 34, 22); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.normalBias = .02;
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8ba, .25));

  // ---- materials
  const M = (color, rough = .9) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: .45 });
  const model = M(0xeeebe5, .85), slabM = M(0xcfc9be, .9), wood = M(0xc79d66, .8), glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c8, roughness: .15, metalness: .1, transparent: true, opacity: .55 });
  const canvasTex = draw => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; draw(c.getContext('2d'), 512, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const board = (ctx, w, h) => { ctx.fillStyle = '#8c887f'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '40,36,30'},.05)`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } };
  const stageMats = [
    null,
    new THREE.MeshStandardMaterial({ map: canvasTex(board), roughness: .95, envMapIntensity: .45 }),
    new THREE.MeshStandardMaterial({ roughness: .95, envMapIntensity: .45, map: canvasTex((ctx, w, h) => {
      board(ctx, w, h);
      ctx.fillStyle = '#f1ede3';
      for (let x = 0; x <= w; x += w / 4) ctx.fillRect(x - 7, 0, 14, h);                       // tape on the 4-foot joints
      for (let x = w / 12; x < w; x += w / 6) for (let y = 20; y < h; y += 42) { ctx.beginPath(); ctx.ellipse(x, y, 7, 5, 0, 0, 7); ctx.fill(); }   // spotted screws
    }) }),
    new THREE.MeshStandardMaterial({ roughness: .9, envMapIntensity: .45, map: canvasTex((ctx, w, h) => {
      ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { const g = ctx.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, 60); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
    }) }),
    M(0x9fb1ea, .75),                                                                             // painted: the first colour on the wall
  ];

  // ---- the building: 20 m by 10 m, four floors at 3.2 m
  const W = 20, D = 10, FH = 3.2, N = 4, root = new THREE.Group(); scene.add(root);
  const box = (w, h, d, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; root.add(m); return m; };
  // base plinth and a shadow catcher
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.ShadowMaterial({ opacity: .16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.31; ground.receiveShadow = true; scene.add(ground);
  box(W + 3, .3, D + 3, model, 0, -.15, .6, false);
  for (let f = 0; f <= N; f++) box(W, .26, D, slabM, 0, f * FH + .13, 0);                       // slabs and roof
  box(W, N * FH, .3, model, 0, N * FH / 2, -D / 2 + .15);                                       // back wall
  for (const sx of [-1, 1]) {                                                                    // side walls with window slots
    box(.3, N * FH, D, model, sx * (W / 2 - .15), N * FH / 2, 0);
    for (let f = 0; f < N; f++) for (const z of [-2.4, 2.4]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.4, 1.6), glass); g.position.set(sx * (W / 2 + .01), f * FH + 1.8, z); root.add(g);
    }
  }
  // the roof parapet, a stair core at the back, balcony edges on the cut face
  box(W, .7, .25, model, 0, N * FH + .6, -D / 2 + .12); box(.25, .7, D, model, -W / 2 + .12, N * FH + .6, 0); box(.25, .7, D, model, W / 2 - .12, N * FH + .6, 0);
  box(2.6, N * FH + 1.2, 2.6, model, W / 2 - 1.6, (N * FH + 1.2) / 2, -D / 2 + 1.6);
  for (let f = 1; f <= N; f++) box(W, .12, .4, slabM, 0, f * FH + .02, D / 2 + .2);

  // ---- each floor's partitions: walls between units, the corridor wall, the back wall's inner face
  const floors = [];
  for (let f = 0; f < N; f++) {
    const y0 = f * FH + .26, h = FH - .26, studs = new THREE.Group(), walls = new THREE.Group();
    root.add(studs); root.add(walls);
    const wallRuns = [];
    for (const x of [-6.6, -2.2, 2.2]) wallRuns.push({ x, z: -D / 2 + .3 + 3.4, w: .14, d: 6.8 });     // demising walls, back wall to corridor
    wallRuns.push({ x: -2.2, z: 1.65, w: 13.2, d: .14 });                                              // corridor wall
    wallRuns.push({ x: -2.6, z: -D / 2 + .37, w: 14, d: .1, face: true });                             // inner face of the back wall
    for (const r of wallRuns) {
      // studs every 16 inches, plates top and bottom
      const long = r.w > r.d, len = long ? r.w : r.d, n = Math.floor(len / .406);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + i * len / n, s = new THREE.Mesh(new THREE.BoxGeometry(long ? .04 : .09, h, long ? .09 : .04), wood);
        s.position.set(r.x + (long ? t : 0), y0 + h / 2, r.z + (long ? 0 : t)); s.castShadow = true; studs.add(s);
      }
      for (const py of [y0 + .02, y0 + h - .02]) { const p = new THREE.Mesh(new THREE.BoxGeometry(long ? len : .09, .04, long ? .09 : len), wood); p.position.set(r.x, py, r.z); studs.add(p); }
      const wm = new THREE.Mesh(new THREE.BoxGeometry(r.w + (long ? 0 : .02), h, r.d + (long ? .02 : 0)), stageMats[1]);
      wm.position.set(r.x, y0 + h / 2, r.z); wm.castShadow = true; wm.receiveShadow = true; walls.add(wm);
      // fix the texture's scale to the wall's length so joints stay 4 feet apart
      const reps = len / 4.88; wm.userData.reps = reps;
    }
    walls.children.forEach(m => { m.geometry = m.geometry.clone(); const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * m.userData.reps); });
    floors.push({ f, studs, walls, stage: -1, grow: 1 });
  }
  stageMats.forEach(m => { if (m && m.map) { m.map.wrapS = THREE.RepeatWrapping; } });

  // ---- labels and the week, in HTML, pinned to the model
  const tagBox = fig.querySelector('.b3-tags'), wk = fig.querySelector('.b3-w');
  const NAMES = ['Framing', 'Hanging', 'Taping', 'Finishing', 'Painted'];
  floors.forEach(fl => { const t = document.createElement('p'); t.className = 'b3-tag'; t.innerHTML = `<b>Level ${fl.f + 1}</b><span></span>`; tagBox.appendChild(t); fl.tag = t; });

  const setStage = (fl, s) => {
    if (s === fl.stage) return; fl.stage = s;
    fl.studs.visible = s === 0 || fl.grow < 1;
    fl.walls.visible = s > 0;
    if (s > 0) fl.walls.children.forEach(m => { m.material = stageMats[s]; });
    if (s === 1) fl.grow = 0;                                                       // board goes up
    fl.tag.dataset.s = s; fl.tag.querySelector('span').textContent = NAMES[s];
  };
  const WEEKS = 12; let week = 0;
  const tick = () => {
    week = week % (WEEKS + 2) + 1; const w = Math.min(week, WEEKS); wk.textContent = w;
    floors.forEach(fl => { const start = 1 + fl.f * 2; setStage(fl, w < start ? 0 : Math.min(4, 1 + Math.floor((w - start) / 2))); });
  };
  tick();

  // ---- view: a three-quarter look at the cut face; slow sway; drag to turn
  let yaw = -.38, target = -.38, drag = null, last = performance.now(), visible = false, timer = 0;
  const size = () => {
    const r = cv.getBoundingClientRect(); renderer.setSize(r.width, r.height, false);
    cam.aspect = r.width / r.height; cam.fov = cam.aspect < 1 ? 44 : 30; cam.updateProjectionMatrix();
  };
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: target }; cv.setPointerCapture(e.pointerId); fig.classList.add('b3-grab'); });
  cv.addEventListener('pointermove', e => { if (drag) target = Math.max(-1.3, Math.min(.2, drag.y + (e.clientX - drag.x) * .006)); });
  const up = () => { drag = null; fig.classList.remove('b3-grab'); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const v = new THREE.Vector3();
  const place = () => { const R = cam.aspect < 1 ? 44 : 39; cam.position.set(Math.sin(yaw) * R * -1, 13.5, Math.cos(yaw) * R); cam.lookAt(-1, 6.2, 0); };
  const frame = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!drag) target += (-.38 + Math.sin(now / 5200) * .16 - target) * .01;
    yaw += (target - yaw) * .08;
    place();
    floors.forEach(fl => {
      if (fl.grow < 1) { fl.grow = Math.min(1, fl.grow + dt * 1.6); fl.walls.children.forEach(m => { m.scale.y = Math.max(.001, fl.grow); m.position.y = fl.f * FH + .26 + (FH - .26) * fl.grow / 2; }); if (fl.grow >= 1) fl.studs.visible = false; }
      // the label sits just off the cut face at the right end of the floor
      v.set(W / 2 + .6, fl.f * FH + FH / 2, D / 2 + .2).project(cam);
      const r = cv.getBoundingClientRect();
      const tx = Math.min((v.x + 1) / 2 * r.width, r.width - fl.tag.offsetWidth - 10);
      fl.tag.style.transform = `translate(${tx.toFixed(1)}px, ${((1 - v.y) / 2 * r.height).toFixed(1)}px) translate(0, -50%)`;
    });
    renderer.render(scene, cam);
    if (visible) requestAnimationFrame(frame);
  };
  size(); place(); new ResizeObserver(() => { size(); place(); renderer.render(scene, cam); }).observe(cv);
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); if (!timer) timer = setInterval(tick, 1700); }
    if (!visible && timer) { clearInterval(timer); timer = 0; }
  }, { threshold: .15 }).observe(fig);
  renderer.render(scene, cam);
}
