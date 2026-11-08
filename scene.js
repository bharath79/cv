// A live 3D map of the systems Bharath has built: services as glowing nodes, requests as packets
// flowing along the links. Scrolling flies the camera from one career chapter to the next and
// lights up the parts of the stack that chapter used.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CYAN = new THREE.Color('#22d3ee');
const GREEN = new THREE.Color('#3dff9a');
const DIM = new THREE.Color('#1c2a33');
const BG = 0x05070a;

// ---------- the system: [id, label, position, kind]
const NODES = [
  ['users',   'Clients',        [0, 6.5, 0],      'client'],
  ['android', 'Android app',    [6.5, 6, -1.5],   'client'],
  ['devices', 'IoT devices',    [-7, 6, -1.5],    'devices'],
  ['gateway', 'API Gateway',    [-1.5, 3.5, 0.5], 'edge'],
  ['lb',      'Load balancer',  [4.5, 3.5, 0.5],  'edge'],
  ['lambda',  'Lambda',         [-4.5, 0.5, 1.5], 'compute'],
  ['node',    'Node.js',        [-1, 0.5, 0],     'compute'],
  ['go',      'Go · Gin',       [2.2, 0.5, -1],   'compute'],
  ['spring',  'Spring Boot',    [6.5, 0.5, 1],    'compute'],
  ['py',      'Python',         [-7.5, 0.5, -1.5],'compute'],
  ['mail1',   null,             [10.6, 1.6, -2.2], 'mail'],
  ['mail2',   'mailcow ×3',     [10.6, 0.4, -2.2], 'mail'],
  ['mail3',   null,             [10.6, -0.8, -2.2],'mail'],
  ['kafka',   'Kafka',          [-6.5, -3, 0],    'queue'],
  ['sqs',     'SQS',            [-3, -3, 1.5],    'queue'],
  ['redis',   'Redis',          [1.5, -3, 1],     'queue'],
  ['dynamo',  'DynamoDB',       [-4.5, -6, 0.5],  'store'],
  ['postgres','Postgres',       [0, -6, 0],       'store'],
  ['mongo',   'MongoDB',        [4, -6, -0.5],    'store'],
];
const EDGES = [
  ['users','gateway'],['users','lb'],['android','lb'],['android','gateway'],
  ['devices','py'],['devices','kafka'],
  ['gateway','lambda'],['gateway','node'],['gateway','go'],
  ['lb','go'],['lb','spring'],['lb','mail1'],['lb','mail2'],['lb','mail3'],
  ['lambda','sqs'],['lambda','dynamo'],
  ['node','sqs'],['node','redis'],['node','mongo'],['node','postgres'],
  ['go','redis'],['go','postgres'],['go','mongo'],['sqs','go'],
  ['spring','postgres'],['py','kafka'],['kafka','lambda'],
];
// ---------- the chapters: where the camera goes and what lights up
const CHAPTERS = [
  { pos: [-1.8, 1.5, 33], look: [-1.8, -0.5, 0], focus: null },
  { pos: [-7, 1, 13],   look: [-1.5, -1.5, 0], focus: ['users','gateway','lambda','node','go','sqs','dynamo','postgres','mongo','redis','eks'] },
  { pos: [11, 0.5, 12], look: [5, -1.5, -0.5], focus: ['users','lb','go','mail1','mail2','mail3','postgres','redis','mongo'] },
  { pos: [-13, 2.5, 10],look: [-5.5, -0.5, -0.5], focus: ['devices','py','kafka','lambda','dynamo','go'] },
  { pos: [10, 5, 11],   look: [4.5, 2, -0.5], focus: ['users','android','gateway','lb','spring','node','postgres'] },
  { pos: [0, 11, 22],   look: [0, -1, 0], focus: null },
];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 760px)').matches;
if (phone) { CHAPTERS[0].pos = [0, 0.5, 46]; CHAPTERS[0].look = [0, 0.5, 0]; CHAPTERS[CHAPTERS.length - 1].pos = [0, 12, 40]; }
const canvas = document.getElementById('scene');
const labelLayer = document.getElementById('labels');
const root = document.documentElement;

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (!webglOK()) { root.classList.add('no-gl'); } else { start(); }

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2));
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.03);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const world = new THREE.Group();
  scene.add(world);

  // ---------- ambient dust and a floor grid that fades into the fog
  {
    const n = phone ? 350 : 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i*3] = (Math.random() - .5) * 70; p[i*3+1] = (Math.random() - .5) * 40; p[i*3+2] = (Math.random() - .5) * 50 - 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x2a5560, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false })));
    const grid = new THREE.GridHelper(80, 80, 0x0e3a44, 0x0a1a20);
    grid.position.y = -9; world.add(grid);
  }

  // soft round sprite for packets
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // ---------- nodes
  const shapes = {
    client:  () => new THREE.OctahedronGeometry(0.55, 0),
    edge:    () => new THREE.BoxGeometry(1.4, 0.32, 0.9),
    compute: () => new THREE.IcosahedronGeometry(0.6, 1),
    queue:   () => new THREE.CylinderGeometry(0.22, 0.22, 1.5, 12, 1, true).rotateZ(Math.PI / 2),
    store:   () => new THREE.CylinderGeometry(0.6, 0.6, 0.8, 20, 3),
    mail:    () => new THREE.BoxGeometry(0.9, 0.28, 0.6),
    devices: () => new THREE.TetrahedronGeometry(0.4, 0),
  };
  const nodes = new Map();
  for (const [id, label, pos, kind] of NODES) {
    const group = new THREE.Group(); group.position.set(...pos);
    const base = kind === 'store' ? GREEN : CYAN;
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(shapes[kind](), 1), new THREE.LineBasicMaterial({ color: base.clone(), transparent: true, opacity: 0.9 }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(kind === 'mail' || kind === 'devices' ? 0.08 : 0.14, 16, 16), new THREE.MeshBasicMaterial({ color: base.clone() }));
    group.add(wire, core);
    if (kind === 'devices') {       // a swarm of small sensors around the hub
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, s = wire.clone(); s.material = wire.material;
        s.scale.setScalar(0.45); s.position.set(Math.cos(a) * 1.3, Math.sin(a * 2) * 0.3, Math.sin(a) * 1.3); group.add(s);
      }
    }
    world.add(group);
    let el = null;
    if (label) { el = document.createElement('div'); el.className = 'lbl' + (kind === 'store' ? ' store' : ''); el.textContent = label; labelLayer.appendChild(el); }
    nodes.set(id, { id, group, wire, core, base, el, focus: 1, spin: (Math.random() - .5) * 0.6 });
  }
  // the EKS cluster around the Node.js and Go services
  {
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6.2, 2.6, 3.4)), new THREE.LineDashedMaterial({ color: CYAN, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.5 }));
    box.computeLineDistances(); box.position.set(0.6, 0.5, -0.5); world.add(box);
    const el = document.createElement('div'); el.className = 'lbl'; el.textContent = 'EKS cluster'; labelLayer.appendChild(el);
    nodes.set('eks', { id: 'eks', group: box, wire: box, core: null, base: CYAN, el, focus: 1, spin: 0, labelAt: new THREE.Vector3(-2.3, 1.95, 1.2), box: true });
  }

  // ---------- links and the packets running on them
  const PER = phone ? 2 : 3;
  const links = EDGES.map(([a, b]) => {
    const pa = nodes.get(a).group.position, pb = nodes.get(b).group.position;
    const mid = pa.clone().add(pb).multiplyScalar(.5); mid.z += 1.2; mid.y += 0.4;
    const curve = new THREE.QuadraticBezierCurve3(pa.clone(), mid, pb.clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0.35 }));
    world.add(line);
    return { a, b, curve, line, speed: 0.12 + Math.random() * 0.12, offset: Math.random(), focus: 1 };
  });
  const pCount = links.length * PER;
  const pPos = new Float32Array(pCount * 3), pCol = new Float32Array(pCount * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  world.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ size: phone ? 0.32 : 0.26, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  // ---------- post: bloom gives the neon glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), phone ? 0.55 : 0.95, phone ? 0.25 : 0.55, 0.18));
  composer.addPass(new OutputPass());

  // ---------- size; on a wide screen the system sits right of the text
  let W = 1, H = 1;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    if (composer) composer.setSize(W, H);
    camera.aspect = W / H;
    if (W > 900) camera.setViewOffset(W, H, -W * 0.17, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.31, W, H);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  // ---------- scroll: which chapter, and how far between two
  const sections = [...document.querySelectorAll('[data-chapter]')];
  let chapterF = 0, dim = 0;
  function readScroll() {
    const mid = innerHeight * 0.5;
    let f = 0;
    for (let i = 0; i < sections.length; i++) {
      const r = sections[i].getBoundingClientRect();
      const c = r.top + r.height / 2;              // the section's centre
      if (c <= mid) f = i; else { const prev = i > 0 ? sections[i-1].getBoundingClientRect() : null;
        if (prev) { const pc = prev.top + prev.height / 2; f = (i - 1) + THREE.MathUtils.clamp((mid - pc) / (c - pc), 0, 1); } break; }
    }
    const last = sections[sections.length - 1].getBoundingClientRect();
    const past = THREE.MathUtils.clamp((mid - (last.top + last.height / 2)) / innerHeight, 0, 1);   // 0..1 after the last chapter
    chapterF = Math.min(f, sections.length - 1) + past;
    dim = past;
    root.style.setProperty('--scene-dim', dim.toFixed(3));
    dirty = true;
  }

  // ---------- pointer: drag turns the system, the cursor tilts the camera a little
  let yaw = 0, yawV = 0, mx = 0, my = 0, dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; dragging = true; lastX = e.clientX; canvas.classList.add('dragging'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; yawV = dx * 0.005; yaw += yawV; dirty = true; });
  const endDrag = () => { dragging = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });

  const smooth = t => t * t * (3 - 2 * t);
  const camPos = new THREE.Vector3(...CHAPTERS[0].pos), camLook = new THREE.Vector3(...CHAPTERS[0].look);
  const tPos = new THREE.Vector3(), tLook = new THREE.Vector3(), v = new THREE.Vector3(), tmp = new THREE.Color();
  let dirty = true, last = performance.now(), clock = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduceMotion) clock += dt;

    // camera target between two chapters
    const i = Math.min(CHAPTERS.length - 2, Math.floor(chapterF)), f = smooth(THREE.MathUtils.clamp(chapterF - i, 0, 1));
    tPos.fromArray(CHAPTERS[i].pos).lerp(v.fromArray(CHAPTERS[i+1].pos), f);
    tLook.fromArray(CHAPTERS[i].look).lerp(v.fromArray(CHAPTERS[i+1].look), f);
    tPos.x += mx * 1.6; tPos.y -= my * 1.0;
    const k = reduceMotion ? 1 : 1 - Math.pow(0.0015, dt);
    camPos.lerp(tPos, k); camLook.lerp(tLook, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    scene.fog.density = Math.min(0.03, 0.75 / camPos.distanceTo(camLook));   // a far camera keeps the system clear

    // drag turn with inertia, and a slow idle sway
    if (!dragging) { yaw += yawV; yawV *= 0.94; }
    world.rotation.y = yaw + (reduceMotion ? 0 : Math.sin(clock * 0.12) * 0.12);

    // what this chapter lights up
    const ch = CHAPTERS[Math.min(CHAPTERS.length - 1, Math.round(chapterF))];
    const set = ch.focus ? new Set(ch.focus) : null;
    const fk = reduceMotion ? 1 : 1 - Math.pow(0.004, dt);
    for (const n of nodes.values()) {
      n.focus += ((set ? (set.has(n.id) ? 1 : 0) : 1) - n.focus) * fk;
      tmp.copy(DIM).lerp(n.base, 0.15 + 0.85 * n.focus);
      n.wire.material.color.copy(tmp);
      n.wire.material.opacity = n.box ? 0.15 + 0.45 * n.focus : 0.35 + 0.65 * n.focus;
      if (n.core) n.core.material.color.copy(tmp);
      if (!n.box) { n.wire.rotation.y += n.spin * dt; n.wire.rotation.x += n.spin * 0.4 * dt; n.group.scale.setScalar(0.85 + 0.25 * n.focus); }
    }
    let p = 0;
    for (const l of links) {
      const on = (!set || (set.has(l.a) && set.has(l.b))) ? 1 : 0;
      l.focus += (on - l.focus) * fk;
      l.line.material.opacity = 0.08 + 0.37 * l.focus;
      l.line.material.color.copy(DIM).lerp(CYAN, 0.3 + 0.7 * l.focus);
      for (let j = 0; j < PER; j++, p++) {
        const t = (l.offset + j / PER + clock * l.speed * (0.4 + 0.6 * l.focus)) % 1;
        l.curve.getPoint(t, v);
        pPos[p*3] = v.x; pPos[p*3+1] = v.y; pPos[p*3+2] = v.z;
        tmp.copy(CYAN).multiplyScalar(0.12 + 0.88 * l.focus);
        pCol[p*3] = tmp.r; pCol[p*3+1] = tmp.g; pCol[p*3+2] = tmp.b;
      }
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;

    if (composer) composer.render(); else renderer.render(scene, camera);
    placeLabels(set);
    dirty = false;
    if (!reduceMotion || dirty) requestAnimationFrame(frame);
  }

  // labels: HTML pinned to the projected node positions
  function placeLabels(set) {
    world.updateMatrixWorld();
    for (const n of nodes.values()) {
      if (!n.el) continue;
      if (n.box) { v.copy(n.labelAt).add(n.group.position); world.localToWorld(v); }
      else { v.set(0, 0.85, 0); n.group.localToWorld(v); }
      v.project(camera);
      const show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      const x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
      const o = show ? (phone ? (set && n.focus > .5 ? 1 : 0) : 0.25 + 0.75 * n.focus) : 0;
      n.el.style.opacity = o.toFixed(2);
      n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  addEventListener('resize', () => { resize(); readScroll(); if (reduceMotion) requestAnimationFrame(frame); });
  addEventListener('scroll', () => { readScroll(); if (reduceMotion) requestAnimationFrame(frame); }, { passive: true });
  resize(); readScroll();
  requestAnimationFrame(frame);
}
