// Scroll-driven 3D build: frame -> hang -> tape -> mud -> Level 5.
// One wall, 16 ft x 8 ft, four 4x8 sheets of 5/8" board on studs 16" on center. Units are feet.
import * as THREE from './vendor/three.module.min.js';

const STAGES = [0, 0.18, 0.45, 0.62, 0.82, 1];   // frame | hang | tape | mud | level 5
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

export function mountHero(canvas, { onStage, reduced } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d0c);
  scene.fog = new THREE.Fog(0x0d0d0c, 26, 60);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);

  // ---------- procedural textures ----------
  const tex = (w, h, draw, repeat) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  };
  const speckle = (g, w, h, n, a, light) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = light ? `rgba(255,255,255,${Math.random() * a})` : `rgba(0,0,0,${Math.random() * a})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
  };
  const boardTex = tex(512, 1024, (g, w, h) => {
    g.fillStyle = '#c9c2b2'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, .05); speckle(g, w, h, 9000, .05, true);
    for (const side of [0, 1]) {                // tapered long edges read slightly darker
      const gr = g.createLinearGradient(side ? w : 0, 0, side ? w - 40 : 40, 0);
      gr.addColorStop(0, 'rgba(90,80,60,.16)'); gr.addColorStop(1, 'rgba(90,80,60,0)');
      g.fillStyle = gr; g.fillRect(side ? w - 40 : 0, 0, 40, h);
    }
  });
  const coreTex = tex(64, 64, (g, w, h) => { g.fillStyle = '#f1efe9'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, .12); });
  const skimTex = tex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f3f2ee'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 14000, .025); speckle(g, w, h, 6000, .04, true);
  });
  const featherTex = tex(256, 16, (g, w, h) => {   // mud band: opaque middle, feathered edges
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(252,252,250,0)'); gr.addColorStop(.22, 'rgba(252,252,250,.92)');
    gr.addColorStop(.78, 'rgba(252,252,250,.92)'); gr.addColorStop(1, 'rgba(252,252,250,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const dabTex = tex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(247,246,242,1)'); gr.addColorStop(.6, 'rgba(247,246,242,.9)'); gr.addColorStop(1, 'rgba(247,246,242,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const floorTex = tex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#3a3936'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {               // trowelled slab blotches
      const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 140;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const a = Math.random() * .09;
      gr.addColorStop(0, Math.random() > .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, 40000, .14); speckle(g, w, h, 12000, .08, true);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;   // saw-cut control joints
    g.beginPath(); g.moveTo(0, h * .5); g.lineTo(w, h * .5); g.moveTo(w * .5, 0); g.lineTo(w * .5, h); g.stroke();
  }, [6, 6]);
  const logoTex = new THREE.TextureLoader().load('assets/img/logo-white.png');
  logoTex.colorSpace = THREE.SRGBColorSpace;

  // ---------- materials ----------
  const M = {
    steel: new THREE.MeshStandardMaterial({ color: 0xb8bdc2, metalness: .85, roughness: .38 }),
    board: [
      new THREE.MeshStandardMaterial({ map: coreTex, roughness: .95 }), new THREE.MeshStandardMaterial({ map: coreTex, roughness: .95 }),
      new THREE.MeshStandardMaterial({ map: coreTex, roughness: .95 }), new THREE.MeshStandardMaterial({ map: coreTex, roughness: .95 }),
      new THREE.MeshStandardMaterial({ map: boardTex, roughness: .88 }), new THREE.MeshStandardMaterial({ color: 0x8a8273, roughness: .95 }),
    ],
    screw: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: .6, roughness: .45 }),
    tape: new THREE.MeshStandardMaterial({ color: 0xe6cf95, roughness: .85 }),
    mud: new THREE.MeshStandardMaterial({ map: featherTex, transparent: true, roughness: .8, depthWrite: false }),
    dab: new THREE.MeshStandardMaterial({ map: dabTex, transparent: true, roughness: .8, depthWrite: false }),
    skim: new THREE.MeshStandardMaterial({ map: skimTex, transparent: true, roughness: .62, depthWrite: false }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: .92 }),
    laser: new THREE.MeshBasicMaterial({ color: 0x4dff6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    logo: new THREE.MeshBasicMaterial({ map: logoTex, color: 0x1a1a18, transparent: true, opacity: 0, depthWrite: false }),
    blade: new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: .22 }),
    handle: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: .5 }),
    hivis: new THREE.MeshStandardMaterial({ color: 0xd9f23c, roughness: .5, emissive: 0x2a3300 }),
    chalk: new THREE.MeshBasicMaterial({ color: 0x3f7fd6, transparent: true, opacity: .75 }),
  };

  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(22, .03), M.chalk);   // snapped chalk line for the track
  chalk.rotation.x = -Math.PI / 2; chalk.position.set(0, .004, -.15); scene.add(chalk);

  // ---------- framing: steel C-studs 16" o.c. + track ----------
  const D = .30, F = .104, T = .006;            // 3-5/8" web, 1-1/4" flange, 20ga
  const cStud = (len, horizontal) => {
    const g = new THREE.Group();
    const web = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : T, horizontal ? T : len, D), M.steel);
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : F, horizontal ? F : len, T), M.steel);
    const f2 = f1.clone();
    if (horizontal) { f1.position.set(0, F / 2, D / 2); f2.position.set(0, F / 2, -D / 2); }
    else { f1.position.set(F / 2, 0, D / 2); f2.position.set(F / 2, 0, -D / 2); }
    for (const m of [web, f1, f2]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    return g;
  };
  const framing = new THREE.Group(); framing.position.z = -D / 2; scene.add(framing);
  const studs = [];
  for (let i = 0; i <= 12; i++) {
    const s = cStud(8 - .04, false);
    s.userData.x = -8 + i * (16 / 12); s.position.set(s.userData.x - F / 2, 4, 0);
    framing.add(s); studs.push(s);
  }
  const trackB = cStud(16.2, true), trackT = cStud(16.2, true);
  trackB.position.set(0, .01, 0); trackT.position.set(0, 8 - .01, 0); trackT.rotation.x = Math.PI;
  framing.add(trackB, trackT);

  // laser level line on the stud faces at 48"
  const laser = new THREE.Mesh(new THREE.PlaneGeometry(1, .018), M.laser);
  laser.position.set(0, 4, .01); scene.add(laser);
  const laserDot = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 12), M.laser); scene.add(laserDot);

  // ---------- board: 4 sheets ----------
  const BT = .052;                                  // 5/8"
  const boards = [];
  const boardGeo = new THREE.BoxGeometry(4, 8, BT);
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(boardGeo, M.board);
    b.castShadow = b.receiveShadow = true;
    b.userData.home = new THREE.Vector3(-6 + k * 4, 4, BT / 2);
    b.userData.stack = new THREE.Vector3(12.5, BT / 2 + (3 - k) * BT * 1.02 + .02, 4.5);
    scene.add(b); boards.push(b);
  }
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2 - .12));
  const qWall = new THREE.Quaternion();

  // ---------- screws ----------
  const screwPos = [];
  boards.forEach((b, k) => {
    const x0 = -8 + k * 4;
    for (let i = 0; i <= 3; i++) {
      let x = x0 + i * (4 / 3);
      if (i === 0) x += .05; if (i === 3) x -= .05;
      for (let r = 0; r < 8; r++) screwPos.push({ k, x, y: .5 + r, seam: i === 0 || i === 3 });
    }
  });
  const screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(.022, .022, .012, 10), M.screw, screwPos.length);
  const dabs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), M.dab, screwPos.length);
  dabs.renderOrder = 3;
  scene.add(screws, dabs);
  const dummy = new THREE.Object3D();

  // ---------- tape, mud, skim ----------
  const seams = [-4, 0, 4];
  const bottomPivot = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const topPivot = new THREE.PlaneGeometry(1, 1).translate(0, -.5, 0);
  const tapes = seams.map(x => { const m = new THREE.Mesh(bottomPivot, M.tape); m.position.set(x, 0, BT + .002); m.receiveShadow = true; scene.add(m); return m; });
  const coats = [.55, .9, 1.25].map((w, c) => seams.map(x => {
    const m = new THREE.Mesh(topPivot, M.mud.clone()); m.position.set(x, 8, BT + .004 + c * .001);
    m.userData.w = w; m.renderOrder = 2 + c; scene.add(m); return m;
  }));
  const skimGeo = new THREE.PlaneGeometry(1, 8).translate(.5, 4, 0);
  const skim = new THREE.Mesh(skimGeo, M.skim); skim.position.set(-8, 0, BT + .01); skim.renderOrder = 6; scene.add(skim);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6 * 342 / 704), M.logo);
  logo.position.set(0, 4.3, BT + .03); logo.renderOrder = 7; scene.add(logo);

  // ---------- the taping knife that does the work ----------
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1, .34, .008), M.blade);
  blade.position.y = -.17; blade.castShadow = true;
  const ferrule = new THREE.Mesh(new THREE.BoxGeometry(.22, .06, .04), M.blade); ferrule.position.y = .02;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.05, .065, .55, 12), M.handle); handle.position.y = .32;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.068, .068, .14, 12), M.hivis); grip.position.y = .5;
  knife.add(blade, ferrule, handle, grip);
  const knifeHolder = new THREE.Group(); knifeHolder.add(knife);
  knife.rotation.x = -.95;                          // blade held ~35 degrees off the wall
  knife.position.z = .22;
  scene.add(knifeHolder); knifeHolder.visible = false;

  // ---------- gypsum dust in the light ----------
  const N = 700, dustPos = new Float32Array(N * 3), dustSeed = new Float32Array(N);
  for (let i = 0; i < N; i++) { dustPos[i * 3] = (Math.random() - .5) * 22; dustPos[i * 3 + 1] = Math.random() * 9; dustPos[i * 3 + 2] = Math.random() * 7; dustSeed[i] = Math.random() * 100; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xfff6e0, size: .035, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1712, .45));
  const work = new THREE.SpotLight(0xfff1d6, 400, 60, .62, .55, 1.6);      // the work light, raking from the left
  work.position.set(-15, 6.5, 9); work.target.position.set(1, 3.6, 0);
  work.castShadow = true; work.shadow.mapSize.set(2048, 2048); work.shadow.bias = -.0004; work.shadow.normalBias = .02;
  scene.add(work, work.target);
  const fill = new THREE.DirectionalLight(0xc9d4ff, .35); fill.position.set(10, 12, 14); scene.add(fill);
  const rim = new THREE.PointLight(0xd9f23c, 14, 20, 2); rim.position.set(9, 1.2, 3); scene.add(rim);

  // ---------- camera path ----------
  const K = [   // [progress, camPos, target]
    [0.00, [11, 7.5, 29], [-1, 3.8, 0]],
    [0.18, [10, 6.5, 24], [0, 3.9, 0]],
    [0.40, [9, 5.5, 19], [0, 4, 0]],
    [0.50, [5.5, 5.4, 13], [0, 4.4, 0]],
    [0.62, [3, 5, 11.5], [0, 4.3, 0]],
    [0.80, [-4, 4.6, 12.5], [0, 4.2, 0]],
    [0.92, [-1, 4.3, 20], [0, 4.1, 0]],
    [1.00, [-1.5, 4.3, 24], [0, 4.1, 0]],
  ];
  const v3 = a => new THREE.Vector3(...a);
  const posCurve = new THREE.CatmullRomCurve3(K.map(k => v3(k[1])), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(K.map(k => v3(k[2])), false, 'centripetal');
  const curveU = p => {               // map progress to curve parameter through the keyframes
    for (let i = 0; i < K.length - 1; i++) if (p <= K[i + 1][0]) return (i + ease(span(p, K[i][0], K[i + 1][0]))) / (K.length - 1);
    return 1;
  };

  // ---------- state ----------
  let progress = 0, shown = 0, intro = reduced ? STAGES[1] * .98 : 0, introStart = performance.now();
  let mx = 0, my = 0, smx = 0, smy = 0, W = 1, H = 1, narrow = false, lastStage = -1, running = true;
  const tmpQ = new THREE.Quaternion();

  function resize() {
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    narrow = W < 820;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = narrow ? 50 : 34;
    // push the wall to the right on desktop so the headline owns the left side
    if (!narrow) camera.setViewOffset(W, H, -W * .17, 0, W, H); else camera.setViewOffset(W, H, 0, -H * .14, W, H);
    camera.updateProjectionMatrix();
  }

  function apply(p, t) {
    // framing: bottom track, studs drop in, top track, laser sweeps
    trackB.scale.x = Math.max(.001, easeOut(span(p, 0, .04)));
    studs.forEach((s, i) => {
      const k = easeOut(span(p, .015 + i * .0085, .06 + i * .0085));
      s.position.y = 4 + (1 - k) * 9; s.visible = k > 0;
      s.rotation.z = (1 - k) * .25 * (i % 2 ? 1 : -1);
    });
    trackT.scale.x = Math.max(.001, easeOut(span(p, .12, .16)));
    trackT.visible = p > .12;
    const ls = span(p, .09, .17), lf = 1 - span(p, .2, .26);
    M.laser.opacity = Math.min(1, ls * 4) * lf * .95;
    laser.scale.x = Math.max(.001, ease(ls) * 17); laser.position.x = -8.5 + ease(ls) * 8.5;
    laserDot.position.set(-8.6, 4, .2);

    // hang: boards leave the stack one at a time and land on the studs
    boards.forEach((b, k) => {
      const a = .19 + k * .06, u = ease(span(p, a, a + .065));
      const s = b.userData.stack, h = b.userData.home;
      const lift = new THREE.Vector3(lerp(s.x, h.x + 2.5, .5), 6.4, lerp(s.z, h.z, .4) + 2.2);
      const q1 = 1 - u, pos = s.clone().multiplyScalar(q1 * q1).add(lift.clone().multiplyScalar(2 * q1 * u)).add(h.clone().multiplyScalar(u * u));
      b.position.copy(pos);
      tmpQ.slerpQuaternions(qFlat, qWall, easeOut(span(u, .05, .8))); b.quaternion.copy(tmpQ);
      b.userData.landed = span(p, a + .062, a + .1);
    });

    // screws: run down each board after it lands
    screwPos.forEach((s, i) => {
      const land = boards[s.k].userData.landed;
      const order = (i % 32) / 32, on = clamp((land - order * .85) * 8);
      dummy.position.set(s.x, s.y, BT + .004 + (1 - on) * .08);
      dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.setScalar(on > 0 ? 1 : .0001);
      dummy.updateMatrix(); screws.setMatrixAt(i, dummy.matrix);
      // compound over each field screw, a little wider every coat
      const c1 = span(p, .64, .68), c2 = span(p, .7, .74), c3 = span(p, .76, .8);
      const r = s.seam ? 0 : (c1 * .16 + c2 * .07 + c3 * .07);
      dummy.position.set(s.x, s.y, BT + .013); dummy.rotation.set(0, 0, i);
      dummy.scale.set(r > 0 ? r * 1.6 : .0001, r > 0 ? r : .0001, 1); dummy.updateMatrix(); dabs.setMatrixAt(i, dummy.matrix);
    });
    screws.instanceMatrix.needsUpdate = true; dabs.instanceMatrix.needsUpdate = true;

    // tape, bottom to top, one seam after another
    let knifeAt = null;
    tapes.forEach((m, i) => {
      const a = .46 + i * .05, u = span(p, a, a + .05);
      m.scale.set(.3, Math.max(.0001, u * 8), 1); m.visible = u > 0;
      if (u > 0 && u < 1) knifeAt = { x: seams[i], y: u * 8, w: .5 };
    });
    // three coats, top to bottom, each wider
    coats.forEach((row, c) => row.forEach((m, i) => {
      const a = [.63, .69, .75][c] + i * .018, u = ease(span(p, a, a + .03));
      m.scale.set(m.userData.w, Math.max(.0001, u * 8), 1); m.visible = u > 0;
      m.material.opacity = c === 0 ? .9 : .8;
      if (u > 0 && u < 1) knifeAt = { x: seams[i], y: 8 - u * 8, w: m.userData.w * .8 };
    }));
    // Level 5: one skim across the whole face, left to right with a wide knife
    const sk = span(p, .83, .93);
    skim.scale.x = Math.max(.0001, ease(sk) * 16); skim.visible = sk > 0;
    M.skim.opacity = .97;
    if (sk > 0 && sk < 1) knifeAt = { x: -8 + ease(sk) * 16, y: 4 + Math.sin(sk * 40) * 2.6, w: 1.1, sweep: true };
    if (knifeAt) {
      knifeHolder.visible = true;
      knifeHolder.position.set(knifeAt.x, knifeAt.y, BT);
      knife.scale.set(knifeAt.w, 1, 1);
      knifeHolder.rotation.z = knifeAt.sweep ? Math.PI / 2 : 0;
      knife.rotation.x = knifeAt.sweep ? -.95 : (p > .62 ? -.95 : -1.1);
    } else knifeHolder.visible = false;

    // finish: raking light sweeps the finished face, logo comes up
    const fin = span(p, .92, 1);
    work.position.x = lerp(-15, -11, fin); work.position.z = lerp(9, 6, fin);
    M.logo.opacity = ease(span(p, .95, 1)) * .82;
    dustMat.opacity = .18 + .3 * span(p, .7, .9);

    // camera (on phones the wall drops below the headline, then centres once the copy clears)
    if (narrow) { camera.setViewOffset(W, H, 0, -H * .14 * (1 - ease(span(p, .1, .22))), W, H); camera.updateProjectionMatrix(); }
    const u = curveU(p);
    const cp = posCurve.getPoint(u), ct = tgtCurve.getPoint(u);
    smx += (mx - smx) * .05; smy += (my - smy) * .05;
    const far = narrow ? 1.55 : 1;
    camera.position.set(ct.x + (cp.x - ct.x) * far + smx * .9, ct.y + (cp.y - ct.y) * far - smy * .5 + (narrow ? .6 : 0), ct.z + (cp.z - ct.z) * far);
    camera.lookAt(ct.x + smx * .2, ct.y + (narrow ? .2 : 0), ct.z);

    // dust drift
    const arr = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += Math.sin(t * .0004 + dustSeed[i]) * .0025 + .0012;
      arr[i * 3] += Math.cos(t * .0003 + dustSeed[i]) * .002;
      if (arr[i * 3 + 1] > 9) arr[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;

    let st = 0; for (let i = 0; i < 5; i++) if (p >= STAGES[i] - .001) st = i;
    if (st !== lastStage) { lastStage = st; onStage && onStage(st); }
  }

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!reduced) intro = Math.min(STAGES[1] * .98, ease(clamp((t - introStart) / 2600)) * STAGES[1] * .98);
    const target = Math.max(progress, intro);
    shown += (target - shown) * (reduced ? 1 : .12);
    apply(shown, t);
    renderer.render(scene, camera);
  }

  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
  const io = new IntersectionObserver(([e]) => {
    const was = running; running = e.isIntersecting;
    if (running && !was) requestAnimationFrame(frame);
  });
  io.observe(canvas);
  requestAnimationFrame(frame);

  return {
    setProgress(p) { progress = clamp(p); },
    stages: STAGES,
  };
}
