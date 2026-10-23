// Scroll-driven 3D build inside a framed room at sunset: frame -> hang -> tape -> mud -> Level 5.
// The build wall is 16 ft x 8 ft: four 4x8 sheets of 5/8" board on steel studs 16" on center. Units are feet.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';

export const STAGES = [0, 0.16, 0.42, 0.6, 0.8, 1];   // frame | hang | tape | mud | level 5
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);

export function mountHero(canvas, { onStage, onProgress, reduced } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  const small = matchMedia('(max-width: 820px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15110e);
  scene.fog = new THREE.Fog(0x1a1410, 30, 70);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), .04).texture;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);

  // ---------- procedural textures ----------
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (w, h, draw, repeat, srgb = true) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  };
  const speckle = (g, w, h, n, a, light) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = light ? `rgba(255,255,255,${rand() * a})` : `rgba(0,0,0,${rand() * a})`;
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
  };
  const boardTex = tex(512, 1024, (g, w, h) => {
    g.fillStyle = '#cfc8b9'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, .05); speckle(g, w, h, 9000, .05, true);
    for (const side of [0, 1]) {                       // tapered long edges read slightly darker
      const gr = g.createLinearGradient(side ? w : 0, 0, side ? w - 40 : 40, 0);
      gr.addColorStop(0, 'rgba(90,80,60,.18)'); gr.addColorStop(1, 'rgba(90,80,60,0)');
      g.fillStyle = gr; g.fillRect(side ? w - 40 : 0, 0, 40, h);
    }
  });
  const backTex = tex(512, 1024, (g, w, h) => {        // back paper with the blue print line
    g.fillStyle = '#9d9585'; g.fillRect(0, 0, w, h); speckle(g, w, h, 14000, .07);
    g.save(); g.translate(w * .5, h * .5); g.rotate(-Math.PI / 2);
    g.fillStyle = 'rgba(47,93,158,.85)'; g.font = '700 30px Arial'; g.textAlign = 'center';
    g.fillText('NEXT GEN DRYWALL  ·  5/8" TYPE X  ·  FIRE-RATED', 0, 10);
    g.restore();
  });
  const coreTex = tex(64, 64, (g, w, h) => { g.fillStyle = '#efece4'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, .12); });
  const skimTex = tex(1024, 512, (g, w, h) => {
    g.fillStyle = '#e4e0d8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 14000, .02); speckle(g, w, h, 6000, .035, true);
  });
  const featherTex = tex(256, 16, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(238,236,230,0)'); gr.addColorStop(.22, 'rgba(238,236,230,.95)');
    gr.addColorStop(.78, 'rgba(238,236,230,.95)'); gr.addColorStop(1, 'rgba(238,236,230,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const dabTex = tex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(238,236,230,1)'); gr.addColorStop(.6, 'rgba(238,236,230,.9)'); gr.addColorStop(1, 'rgba(238,236,230,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const floorTex = tex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#6e675d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rand() * w, y = rand() * h, r = 40 + rand() * 160, a = rand() * .1;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rand() > .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.3})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, 40000, .14); speckle(g, w, h, 12000, .08, true);
    g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h * .5); g.lineTo(w, h * .5); g.moveTo(w * .5, 0); g.lineTo(w * .5, h); g.stroke();
  }, [5, 5]);
  const woodTex = tex(256, 1024, (g, w, h) => {
    g.fillStyle = '#b48a5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(${90 + rand() * 40},${55 + rand() * 25},${25 + rand() * 15},${.15 + rand() * .25})`;
      g.lineWidth = .6 + rand() * 2.2; g.beginPath();
      let x = rand() * w; g.moveTo(x, 0);
      for (let y = 0; y < h; y += 30) { x += (rand() - .5) * 4; g.lineTo(x, y); }
      g.stroke();
    }
    speckle(g, w, h, 4000, .08);
  });
  const osbTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#8f7150'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.save(); g.translate(rand() * w, rand() * h); g.rotate(rand() * Math.PI);
      const l = 8 + rand() * 22, v = rand();
      g.fillStyle = `rgba(${120 + v * 50},${92 + v * 38},${60 + v * 26},.55)`;
      g.fillRect(-l / 2, -2, l, 3 + rand() * 3); g.restore();
    }
    speckle(g, w, h, 6000, .1);
  }, [3, 3]);
  const skyTex = tex(2048, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h * .72);
    gr.addColorStop(0, '#26304f'); gr.addColorStop(.45, '#a35a5a'); gr.addColorStop(.8, '#f08a3e'); gr.addColorStop(1, '#ffd38a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sx = w * .44, sy = h * .64;                              // the sun, low over the ridge
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 380);
    sg.addColorStop(0, 'rgba(255,246,214,1)'); sg.addColorStop(.08, 'rgba(255,226,160,.95)'); sg.addColorStop(.3, 'rgba(255,170,90,.35)'); sg.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    const ridge = (base, amp, col, seed) => {                      // desert ridgelines
      let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
      let y = base;
      for (let x = 0; x <= w; x += 16) { y += (r() - .5) * amp; y = Math.min(base + amp * 2, Math.max(base - amp * 3, y)); g.lineTo(x, y); }
      g.lineTo(w, h); g.fill();
    };
    ridge(h * .66, 26, '#7b4a55', 3); ridge(h * .72, 22, '#4f3040', 11); ridge(h * .8, 10, '#2c1e22', 29);
    g.fillStyle = '#21171a';                                        // a few saguaros
    for (const [x, s] of [[w * .2, 1], [w * .71, .8], [w * .86, 1.15]]) {
      const by = h * .82; g.fillRect(x - 5 * s, by - 120 * s, 10 * s, 120 * s);
      g.fillRect(x - 26 * s, by - 80 * s, 8 * s, 34 * s); g.fillRect(x - 26 * s, by - 52 * s, 26 * s, 8 * s);
      g.fillRect(x + 16 * s, by - 96 * s, 8 * s, 40 * s); g.fillRect(x + 4 * s, by - 62 * s, 20 * s, 8 * s);
    }
  });
  const beamTex = tex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,190,120,0)'); gr.addColorStop(.25, 'rgba(255,190,120,.55)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(.2, 'rgba(0,0,0,0)'); gx.addColorStop(.8, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  });
  // the logo strokes are thin and partly transparent; stack them so the mark reads as paint on the finished wall
  const logoCanvas = document.createElement('canvas'); logoCanvas.width = 1408; logoCanvas.height = 684;
  const logoTex = new THREE.CanvasTexture(logoCanvas);
  logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = aniso;
  const logoImg = new Image();
  logoImg.onload = () => { const g = logoCanvas.getContext('2d'); for (let i = 0; i < 4; i++) g.drawImage(logoImg, 0, 0, 1408, 684); logoTex.needsUpdate = true; };
  logoImg.src = 'assets/img/logo-white.png';

  // ---------- materials ----------
  const std = o => new THREE.MeshStandardMaterial({ envMapIntensity: .55, ...o });
  const M = {
    steel: std({ color: 0xb4b9be, metalness: .85, roughness: .38, envMapIntensity: .6 }),
    board: [std({ map: coreTex, roughness: .95 }), std({ map: coreTex, roughness: .95 }), std({ map: coreTex, roughness: .95 }),
      std({ map: coreTex, roughness: .95 }), std({ map: boardTex, roughness: .9 }), std({ map: backTex, roughness: .95 })],
    screw: std({ color: 0x3a3a3a, metalness: .7, roughness: .4 }),
    tape: std({ color: 0xe6cf95, roughness: .85 }),
    mud: std({ map: featherTex, transparent: true, roughness: .75, depthWrite: false }),
    dab: std({ map: dabTex, transparent: true, roughness: .75, depthWrite: false }),
    skim: std({ map: skimTex, transparent: true, roughness: .55, depthWrite: false }),
    floor: std({ map: floorTex, roughness: .82, envMapIntensity: .35 }),
    wood: std({ map: woodTex, roughness: .8 }),
    osb: std({ map: osbTex, roughness: .9 }),
    sky: new THREE.MeshBasicMaterial({ map: skyTex, fog: false }),
    beam: new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    laser: new THREE.MeshBasicMaterial({ color: 0x4dff6a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    logo: new THREE.MeshBasicMaterial({ map: logoTex, color: 0x141413, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    blade: std({ color: 0xd8dde2, metalness: 1, roughness: .18, envMapIntensity: 1.4 }),
    handle: std({ color: 0x1b1b1b, roughness: .5 }),
    hivis: std({ color: 0xd9f23c, roughness: .5, emissive: 0x3a4600 }),
    bucket: std({ color: 0xeeeeea, roughness: .45 }),
    blue: std({ color: 0x2f6fd0, roughness: .5 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x1b1712 }),
    black: std({ color: 0x1c1c1c, roughness: .6, metalness: .3 }),
    led: new THREE.MeshBasicMaterial({ color: 0xfff6e8 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    chalk: new THREE.MeshBasicMaterial({ color: 0x3f7fd6, transparent: true, opacity: .7 }),
  };
  const add = (m, o = scene) => { m.castShadow = m.receiveShadow = true; o.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, o) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), o); m.position.set(x, y, z); return m; };

  // ---------- room: slab, roof deck, joists ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(22, .03), M.chalk);
  chalk.rotation.x = -Math.PI / 2; chalk.position.set(0, .004, -.15); scene.add(chalk);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.osb);
  deck.rotation.x = Math.PI / 2; deck.position.set(4, 9.05, 6); deck.receiveShadow = true; scene.add(deck);
  for (let x = -8; x <= 16; x += 2) box(.13, .78, 26, M.wood, x, 8.6, 8);
  box(26, .78, .13, M.wood, 4, 8.6, -.4);

  // ---------- framing: steel C-studs 16" o.c. + track ----------
  const D = .30, F = .104, T = .006;
  const cStud = (len, horizontal) => {
    const g = new THREE.Group();
    const web = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : T, horizontal ? T : len, D), M.steel);
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : F, horizontal ? F : len, T), M.steel), f2 = f1.clone();
    if (horizontal) { f1.position.set(0, F / 2, D / 2); f2.position.set(0, F / 2, -D / 2); }
    else { f1.position.set(F / 2, 0, D / 2); f2.position.set(F / 2, 0, -D / 2); }
    for (const m of [web, f1, f2]) add(m, g);
    return g;
  };
  const framing = new THREE.Group(); framing.position.z = -D / 2; scene.add(framing);
  const studs = [];
  for (let i = 0; i <= 12; i++) {
    const s = cStud(8 - .04, false); s.userData.x = -8 + i * (16 / 12);
    s.position.set(s.userData.x - F / 2, 4, 0); framing.add(s); studs.push(s);
  }
  const trackB = cStud(16.2, true), trackT = cStud(16.2, true);
  trackB.position.set(0, .01, 0); trackT.position.set(0, 8 - .01, 0); trackT.rotation.x = Math.PI;
  framing.add(trackB, trackT);
  // exterior sheathing behind the studs, so the open frame reads against a wall, not a void
  const backSheath = add(new THREE.Mesh(new THREE.BoxGeometry(17, 8.2, .04), M.osb)); backSheath.position.set(0, 4.1, -.34);
  const boxes = [[2.667 + .12, 1.5], [-5.333 + .12, 4]].map(([x, y]) => box(.18, .3, .25, M.blue, x, y, -.08));

  // ---------- left wall: wood framing, exterior sheathing, rough window opening ----------
  const WX = -8.45, win = { z0: 4.2, z1: 8.6, y0: 3, y1: 7 };
  for (let z = .4; z < 15; z += 16 / 12) {
    if (z > win.z0 - .1 && z < win.z1 + .1) {
      box(.3, win.y0 - .15, .125, M.wood, WX, (win.y0 - .15) / 2, z); box(.3, 8 - win.y1 - .6, .125, M.wood, WX, (8 + win.y1 + .6) / 2, z);
    } else box(.3, 7.9, .125, M.wood, WX, 3.95, z);
  }
  box(.3, .12, 15, M.wood, WX, .06, 7.5); box(.3, .24, 15, M.wood, WX, 7.9, 7.5);
  box(.3, .55, win.z1 - win.z0 + .4, M.wood, WX, win.y1 + .28, (win.z0 + win.z1) / 2);
  box(.3, .12, win.z1 - win.z0, M.wood, WX, win.y0 - .06, (win.z0 + win.z1) / 2);
  const SX = WX - .2, sheath = [
    [15, win.y0, 7.5, win.y0 / 2], [15, 8.2 - win.y1, 7.5, (8.2 + win.y1) / 2],
    [win.z0, win.y1 - win.y0, win.z0 / 2, (win.y0 + win.y1) / 2], [15 - win.z1, win.y1 - win.y0, (15 + win.z1) / 2, (win.y0 + win.y1) / 2],
  ];
  for (const [w, h, z, y] of sheath) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(.04, h, w), M.osb)); m.position.set(SX, y, z); }
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), M.sky);
  sky.rotation.y = Math.PI / 2; sky.position.set(-48, 6, 6); scene.add(sky);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + i * .5, 14), M.beam);
    b.position.set(WX + 5.2, 4.4 - i * .3, (win.z0 + win.z1) / 2 + (i - 1) * 1.1);
    b.rotation.set(0, Math.PI / 2 + .1 * (i - 1), Math.PI / 2 - .38);
    scene.add(b);
  }

  // ---------- props: board cart, mud bucket, work light, hanging lamps ----------
  const cart = new THREE.Group(); cart.position.set(12.4, 0, 4.6); scene.add(cart);
  box(4.4, .12, 8.4, M.black, 0, .95, 0, cart);
  for (const [x, z] of [[-1.9, -3.9], [1.9, -3.9], [-1.9, 3.9], [1.9, 3.9]]) {
    box(.1, .7, .1, M.black, x, .55, z, cart);
    const w = add(new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .12, 18), M.black), cart); w.rotation.z = Math.PI / 2; w.position.set(x, .18, z);
  }
  box(.08, 2.2, 8.4, M.black, -2.15, 2, 0, cart);
  for (let i = 0; i < 3; i++) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(4, 8, .052), M.board)); b.rotation.set(-Math.PI / 2, 0, 0); b.position.set(12.4, 1.04 + i * .053, 4.6); }

  const bucket = new THREE.Group(); bucket.position.set(7.6, 0, 2.6); scene.add(bucket);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.6, .52, 1.25, 28), M.bucket), bucket).position.y = .625;
  add(new THREE.Mesh(new THREE.CylinderGeometry(.605, .6, .3, 28), M.hivis), bucket).position.y = .75;
  add(new THREE.Mesh(new THREE.CylinderGeometry(.63, .63, .05, 28), M.bucket), bucket).position.y = 1.27;
  const pan = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, .22, .4), M.steel), bucket); pan.position.set(0, 1.4, 0); pan.rotation.y = .4;

  const lamp = new THREE.Group(); lamp.position.set(9.6, 0, 10.5); scene.add(lamp);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, leg = add(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 4.4), M.black), lamp);
    leg.position.set(Math.cos(a) * .9, 2.1, Math.sin(a) * .9); leg.lookAt(0, 4.4, 0); leg.rotateX(Math.PI / 2);
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.6), M.black), lamp).position.y = 4.9;
  const head = new THREE.Group(); head.position.y = 5.7; lamp.add(head);
  box(1.3, .9, .3, M.hivis, 0, 0, 0, head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .7), M.led); face.position.z = .16; head.add(face);
  head.lookAt(-.5, 3.8, 0);

  const bulbs = [[-2.5, 6.6, 7], [4.5, 6.9, 9.5]].map(([x, y, z]) => {
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 9 - y), M.black); cord.position.y = (9 - y) / 2; g.add(cord);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 16), M.bulb));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true })));
    g.add(new THREE.PointLight(0xffc27a, 7, 16, 2));
    return g;
  });

  const laser = new THREE.Mesh(new THREE.PlaneGeometry(1, .02), M.laser); laser.position.set(0, 4, .01); scene.add(laser);

  // ---------- board: four sheets ----------
  const BT = .052, boards = [];
  const boardGeo = new THREE.BoxGeometry(4, 8, BT);
  for (let k = 0; k < 4; k++) {
    const b = add(new THREE.Mesh(boardGeo, M.board));
    b.userData.home = new THREE.Vector3(-6 + k * 4, 4, BT / 2);
    b.userData.stack = new THREE.Vector3(12.4, 1.04 + (3 + (3 - k)) * .053, 4.6);
    boards.push(b);
  }
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const qWall = new THREE.Quaternion();
  const cut = boxes.map(b => { const m = new THREE.Mesh(new THREE.PlaneGeometry(.2, .32), M.hole); m.position.set(b.position.x, b.position.y, BT + .002); m.visible = false; scene.add(m); return m; });

  // ---------- screws ----------
  const screwPos = [];
  boards.forEach((b, k) => {
    const x0 = -8 + k * 4;
    for (let i = 0; i <= 3; i++) {
      let x = x0 + i * (4 / 3); if (i === 0) x += .05; if (i === 3) x -= .05;
      for (let r = 0; r < 8; r++) screwPos.push({ k, x, y: .5 + r, seam: i === 0 || i === 3 });
    }
  });
  const screws = new THREE.InstancedMesh(new THREE.CylinderGeometry(.022, .022, .012, 10), M.screw, screwPos.length);
  const dabs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), M.dab, screwPos.length);
  dabs.renderOrder = 3; scene.add(screws, dabs);
  const dummy = new THREE.Object3D();

  // ---------- tape, mud, skim, logo ----------
  const seams = [-4, 0, 4];
  const bottomPivot = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const topPivot = new THREE.PlaneGeometry(1, 1).translate(0, -.5, 0);
  const tapes = seams.map(x => { const m = new THREE.Mesh(bottomPivot, M.tape); m.position.set(x, 0, BT + .002); m.receiveShadow = true; scene.add(m); return m; });
  const coats = [.55, .9, 1.25].map((w, c) => seams.map(x => {
    const m = new THREE.Mesh(topPivot, M.mud.clone()); m.position.set(x, 8, BT + .004 + c * .001);
    m.userData.w = w; m.renderOrder = 2 + c; m.receiveShadow = true; scene.add(m); return m;
  }));
  const skim = new THREE.Mesh(new THREE.PlaneGeometry(1, 8).translate(.5, 4, 0), M.skim);
  skim.position.set(-8, 0, BT + .016); skim.renderOrder = 6; skim.receiveShadow = true; scene.add(skim);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2 * 342 / 704), M.logo);
  logo.position.set(0, 4.4, BT + .03); logo.renderOrder = 7; scene.add(logo);

  // ---------- the taping knife ----------
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1, .34, .008), M.blade); blade.position.y = -.17; blade.castShadow = true;
  const ferrule = new THREE.Mesh(new THREE.BoxGeometry(.22, .06, .04), M.blade); ferrule.position.y = .02;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.05, .065, .55, 12), M.handle); handle.position.y = .32;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.068, .068, .14, 12), M.hivis); grip.position.y = .5;
  knife.add(blade, ferrule, handle, grip);
  const knifeHolder = new THREE.Group(); knifeHolder.add(knife);
  knife.rotation.x = -.95; knife.position.z = .22;
  scene.add(knifeHolder); knifeHolder.visible = false;

  // ---------- gypsum dust in the light ----------
  const N = 900, dustPos = new Float32Array(N * 3), dustSeed = new Float32Array(N);
  for (let i = 0; i < N; i++) { dustPos[i * 3] = -8 + rand() * 18; dustPos[i * 3 + 1] = rand() * 8.5; dustPos[i * 3 + 2] = rand() * 12; dustSeed[i] = rand() * 100; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xffe6c4, size: .03, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x3a2a1c, .35));
  const sun = new THREE.DirectionalLight(0xffa860, 2.4);
  sun.position.set(-40, 11, 4); sun.target.position.set(0, 0, 7);
  sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 10, far: 70 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target);
  const work = new THREE.SpotLight(0xfff3e2, 240, 50, .55, .6, 2);
  work.position.set(9.3, 5.8, 10.1); work.target.position.set(-.5, 3.8, 0);
  work.castShadow = true; work.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); work.shadow.bias = -.0004; work.shadow.normalBias = .02;
  scene.add(work, work.target);
  const rake = new THREE.SpotLight(0xffb070, 0, 40, .5, .7, 2);
  rake.position.set(-7.6, 4.2, 4); rake.target.position.set(4, 4, 0); scene.add(rake, rake.target);

  // ---------- post: bloom on the lamps, LED and sky ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .4, .5, .95));
  composer.addPass(new OutputPass());

  // ---------- camera path ----------
  const K = [
    [0.00, [9.5, 6.2, 18.5], [-1.6, 3.8, 2.6]],
    [0.16, [8, 5.6, 16.5], [-.8, 3.9, 1.2]],
    [0.32, [7.5, 5.2, 15], [0, 4, .4]],
    [0.46, [4, 5, 10.5], [-.2, 4.3, 0]],
    [0.62, [3.2, 4.9, 12.5], [0, 4.2, 0]],
    [0.80, [-3.2, 4.6, 14], [0, 4.1, 0]],
    [1.00, [1.2, 4.4, 17], [-.4, 4.1, 0]],
  ];
  const v3 = a => new THREE.Vector3(...a);
  const posCurve = new THREE.CatmullRomCurve3(K.map(k => v3(k[1])), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(K.map(k => v3(k[2])), false, 'centripetal');
  const curveU = p => {
    for (let i = 0; i < K.length - 1; i++) if (p <= K[i + 1][0]) return (i + ease(span(p, K[i][0], K[i + 1][0]))) / (K.length - 1);
    return 1;
  };

  // ---------- state ----------
  let progress = 0, shown = 0, intro = reduced ? STAGES[1] * .98 : 0;
  const introStart = performance.now();
  let mx = 0, my = 0, smx = 0, smy = 0, W = 1, H = 1, narrow = false, lastStage = -1, running = true;
  const tmpQ = new THREE.Quaternion();

  function resize() {
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    narrow = W / H < .95;
    renderer.setSize(W, H, false); composer.setSize(W, H);
    camera.aspect = W / H; camera.fov = narrow ? 54 : 42; camera.updateProjectionMatrix();
  }

  function apply(p, t) {
    trackB.scale.x = Math.max(.001, easeOut(span(p, 0, .035)));
    studs.forEach((s, i) => {
      const k = easeOut(span(p, .012 + i * .0075, .05 + i * .0075));
      s.position.y = 4 + (1 - k) * 9; s.visible = k > 0; s.rotation.z = (1 - k) * .25 * (i % 2 ? 1 : -1);
    });
    trackT.scale.x = Math.max(.001, easeOut(span(p, .105, .14))); trackT.visible = p > .105;
    boxes.forEach((b, i) => { const k = easeOut(span(p, .12 + i * .01, .15 + i * .01)); b.scale.setScalar(Math.max(.001, k)); });
    const ls = span(p, .08, .15), lf = 1 - span(p, .18, .22);
    M.laser.opacity = Math.min(1, ls * 4) * lf * .95;
    laser.scale.x = Math.max(.001, ease(ls) * 17); laser.position.x = -8.5 + ease(ls) * 8.5;

    boards.forEach((b, k) => {
      const a = .17 + k * .058, u = ease(span(p, a, a + .062));
      const s = b.userData.stack, h = b.userData.home;
      const lift = new THREE.Vector3(lerp(s.x, h.x, .55) + 1.5, 7, lerp(s.z, h.z, .4) + 3);
      const q1 = 1 - u, pos = s.clone().multiplyScalar(q1 * q1).add(lift.clone().multiplyScalar(2 * q1 * u)).add(h.clone().multiplyScalar(u * u));
      b.position.copy(pos);
      tmpQ.slerpQuaternions(qFlat, qWall, easeOut(span(u, .05, .8))); b.quaternion.copy(tmpQ);
      b.userData.landed = span(p, a + .058, a + .095);
    });
    cut[0].visible = boards[2].userData.landed > 0; cut[1].visible = boards[0].userData.landed > 0;

    const c1 = span(p, .62, .66), c2 = span(p, .67, .71), c3 = span(p, .72, .76);
    screwPos.forEach((s, i) => {
      const land = boards[s.k].userData.landed;
      const order = (i % 32) / 32, on = clamp((land - order * .85) * 8);
      dummy.position.set(s.x, s.y, BT + .004 + (1 - on) * .08); dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.setScalar(on > 0 ? 1 : .0001); dummy.updateMatrix(); screws.setMatrixAt(i, dummy.matrix);
      const r = s.seam ? 0 : (c1 * .16 + c2 * .07 + c3 * .07);
      dummy.position.set(s.x, s.y, BT + .013); dummy.rotation.set(0, 0, i);
      dummy.scale.set(r > 0 ? r * 1.6 : .0001, r > 0 ? r : .0001, 1); dummy.updateMatrix(); dabs.setMatrixAt(i, dummy.matrix);
    });
    screws.instanceMatrix.needsUpdate = true; dabs.instanceMatrix.needsUpdate = true;

    let knifeAt = null;
    tapes.forEach((m, i) => {
      const a = .43 + i * .052, u = span(p, a, a + .05);
      m.scale.set(.3, Math.max(.0001, u * 8), 1); m.visible = u > 0;
      if (u > 0 && u < 1) knifeAt = { x: seams[i], y: u * 8, w: .5 };
    });
    coats.forEach((row, c) => row.forEach((m, i) => {
      const a = [.61, .665, .72][c] + i * .016, u = ease(span(p, a, a + .028));
      m.scale.set(m.userData.w, Math.max(.0001, u * 8), 1); m.visible = u > 0;
      if (u > 0 && u < 1) knifeAt = { x: seams[i], y: 8 - u * 8, w: m.userData.w * .8 };
    }));
    const sk = span(p, .81, .92);
    skim.scale.x = Math.max(.0001, ease(sk) * 16); skim.visible = sk > 0; M.skim.opacity = .97;
    if (sk > 0 && sk < 1) knifeAt = { x: -8 + ease(sk) * 16, y: 4 + Math.sin(sk * 40) * 2.6, w: 1.1, sweep: true };
    if (knifeAt) {
      knifeHolder.visible = true; knifeHolder.position.set(knifeAt.x, knifeAt.y, BT);
      knife.scale.set(knifeAt.w, 1, 1); knifeHolder.rotation.z = knifeAt.sweep ? Math.PI / 2 : 0;
      knife.rotation.x = knifeAt.sweep || p > .6 ? -.95 : -1.1;
    } else knifeHolder.visible = false;

    const fin = span(p, .9, 1);
    rake.intensity = ease(fin) * 45; work.intensity = lerp(240, 120, ease(fin));
    M.logo.opacity = ease(span(p, .94, 1)) * .92;
    dustMat.opacity = .3 + .3 * span(p, .6, .9);

    const u = curveU(p), cp = posCurve.getPoint(u), ct = tgtCurve.getPoint(u);
    smx += (mx - smx) * .05; smy += (my - smy) * .05;
    const far = narrow ? 1.25 : 1;
    camera.position.set(ct.x + (cp.x - ct.x) * far + smx * .8, ct.y + (cp.y - ct.y) * far - smy * .4, ct.z + (cp.z - ct.z) * far);
    camera.lookAt(ct.x + smx * .2, ct.y, ct.z);

    const arr = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += Math.sin(t * .0004 + dustSeed[i]) * .002 + .001;
      arr[i * 3] += Math.cos(t * .0003 + dustSeed[i]) * .002;
      if (arr[i * 3 + 1] > 8.5) arr[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
    bulbs.forEach((b, i) => { b.rotation.z = Math.sin(t * .0007 + i) * .03; });

    let st = 0; for (let i = 0; i < 5; i++) if (p >= STAGES[i] - .001) st = i;
    if (st !== lastStage) { lastStage = st; onStage && onStage(st); }
    onProgress && onProgress(p);
  }

  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!reduced) intro = Math.min(STAGES[1] * .98, ease(clamp((t - introStart) / 2800)) * STAGES[1] * .98);
    const target = Math.max(progress, intro);
    shown += (target - shown) * (reduced ? 1 : .1);
    apply(shown, t);
    composer.render();
  }

  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
  new IntersectionObserver(([e]) => {
    const was = running; running = e.isIntersecting;
    if (running && !was) requestAnimationFrame(frame);
  }).observe(canvas);
  requestAnimationFrame(frame);

  return { setProgress(p) { progress = clamp(p); }, stages: STAGES };
}
