// Five small 3D line drawings, one per frame on the page (the hero and the four projects), drawn by a
// single WebGL canvas that renders each scene into its frame's box. Ink lines on paper, one orange accent.
import * as THREE from 'three';

const INK = new THREE.Color('#0b0b0b');
const ACCENT = new THREE.Color('#ff4d1a');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('gl');

function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }


// ---------- helpers
const lineMat = (o = 1) => new THREE.LineBasicMaterial({ color: INK, transparent: o < 1, opacity: o });
const edges = (geo, o = 1) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), lineMat(o));
const dot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function packets(n, size = 7) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, map: dot, vertexColors: true, transparent: true, alphaTest: 0.4 }));
  p.set = (i, v, col) => { g.attributes.position.setXYZ(i, v.x, v.y, v.z); g.attributes.color.setXYZ(i, col.r, col.g, col.b); };
  p.done = () => { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; };
  return p;
}
const curve = (a, b, lift = 0.8) => { const m = a.clone().add(b).multiplyScalar(.5); m.z += lift; m.y += lift * .4; return new THREE.QuadraticBezierCurve3(a.clone(), m, b.clone()); };
const curveLine = (c, o = .35) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(32)), lineMat(o));
const ring = (r, from = 0, to = Math.PI * 2, o = 1) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, r, r, from, to).getPoints(96).map(p => new THREE.Vector3(p.x, p.y, 0))), lineMat(o));
const v = new THREE.Vector3(), tmpC = new THREE.Color();

// ---------- scene builders: each returns { scene, camera, update(t, dt, hover, mouse) }
const build = {
  hero() {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .1, 100); camera.position.set(0, 1, 36);
    const g = new THREE.Group(); scene.add(g);
    const N = {
      users: [0, 6.5, 0, 'c'], android: [6.5, 6, -1.5, 'c'], devices: [-6.5, 6, -1.5, 'c'],
      gateway: [-1.8, 3.4, .5, 'e'], lb: [4, 3.4, .5, 'e'],
      lambda: [-4.8, .4, 1.5, 's'], node: [-1.2, .4, 0, 's'], go: [2.2, .4, -1, 's'], spring: [5.8, .4, 1, 's'], py: [-7.6, .4, -1.5, 's'],
      kafka: [-6.2, -3, 0, 'q'], sqs: [-2.8, -3, 1.5, 'q'], redis: [1.6, -3, 1, 'q'],
      dynamo: [-4.2, -6, .5, 'd'], postgres: [0, -6, 0, 'd'], mongo: [4, -6, -.5, 'd'],
    };
    const shape = { c: () => new THREE.OctahedronGeometry(.6), e: () => new THREE.BoxGeometry(1.6, .35, 1), s: () => new THREE.IcosahedronGeometry(.65, 0), q: () => new THREE.CylinderGeometry(.25, .25, 1.6, 10, 1, true).rotateZ(Math.PI / 2), d: () => new THREE.CylinderGeometry(.65, .65, .9, 18, 2) };
    const nodes = {};
    for (const [id, [x, y, z, k]] of Object.entries(N)) { const m = edges(shape[k]()); m.position.set(x, y, z); m.userData.spin = (Math.random() - .5) * .5; g.add(m); nodes[id] = m; }
    const E = [['users','gateway'],['users','lb'],['android','lb'],['android','gateway'],['devices','py'],['devices','kafka'],['gateway','lambda'],['gateway','node'],['gateway','go'],['lb','go'],['lb','spring'],['lambda','sqs'],['lambda','dynamo'],['node','sqs'],['node','redis'],['node','postgres'],['go','redis'],['go','postgres'],['go','mongo'],['sqs','go'],['spring','postgres'],['py','kafka'],['kafka','lambda'],['node','mongo']];
    const links = E.map(([a, b]) => { const c = curve(nodes[a].position, nodes[b].position, 1); g.add(curveLine(c, .28)); return { c, s: .15 + Math.random() * .15, o: Math.random() }; });
    const P = packets(links.length * 2, 7); g.add(P);
    return { scene, camera, update(t, dt, hover, m) {
      g.rotation.y = Math.sin(t * .15) * .35 + m.x * .25; g.rotation.x = m.y * .12;
      for (const n of Object.values(nodes)) { n.rotation.y += n.userData.spin * dt; }
      let i = 0; for (const l of links) for (let j = 0; j < 2; j++) { l.c.getPoint((l.o + j / 2 + t * l.s) % 1, v); P.set(i++, v, j ? INK : ACCENT); }
      P.done();
    } };
  },

  // layers of defence: a core inside rotating rings; some requests are stopped at the outer ring
  security() {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 100); camera.position.set(0, 0, 17);
    const g = new THREE.Group(); scene.add(g); g.rotation.x = -.35;
    const core = edges(new THREE.IcosahedronGeometry(1, 1)); g.add(core);
    const rings = [[1.9, .4], [2.7, -.25], [3.5, .15]].map(([r, sp], i) => {
      const gr = new THREE.Group(); gr.add(ring(r, 0, Math.PI * 1.7)); gr.add(ring(r + .12, Math.PI * .2, Math.PI * 1.2, .4));
      gr.rotation.x = i * .5; gr.rotation.y = i * .7; gr.userData.sp = sp; g.add(gr); return gr;
    });
    const n = 26, P = packets(n, 6); g.add(P);
    const ps = Array.from({ length: n }, () => ({ dir: new THREE.Vector3().randomDirection(), t: Math.random(), blocked: Math.random() < .4, sp: .18 + Math.random() * .15 }));
    return { scene, camera, update(t, dt, hover) {
      const k = hover ? 2.2 : 1;
      core.rotation.y += .3 * dt * k; core.rotation.x += .1 * dt * k;
      rings.forEach(r => { r.rotation.z += r.userData.sp * dt * k; });
      ps.forEach((p, i) => {
        p.t += p.sp * dt * k; if (p.t > 1) { p.t = 0; p.dir.randomDirection(); p.blocked = Math.random() < .4; }
        const stop = p.blocked ? .62 : 1, end = p.blocked ? 3.6 : 1.05;   // blocked ones halt at the outer ring
        v.copy(p.dir).multiplyScalar(THREE.MathUtils.lerp(7.5, end, Math.min(1, p.t / stop)));
        P.set(i, v, p.blocked && p.t > stop ? ACCENT : INK);
      });
      P.done(); g.rotation.y = Math.sin(t * .2) * .3;
    } };
  },

  // a load balancer spreading messages over three mail servers, round robin
  mail() {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 100); camera.position.set(6, 4, 17); camera.lookAt(0, 1.4, 0);
    const g = new THREE.Group(); scene.add(g);
    const lb = edges(new THREE.BoxGeometry(3.2, .5, 1.6)); lb.position.set(0, 3.2, 0); g.add(lb);
    const servers = [-3.2, 0, 3.2].map(x => {
      const s = new THREE.Group(); s.position.set(x, -1.6, 0);
      for (let k = 0; k < 4; k++) { const u = edges(new THREE.BoxGeometry(1.8, .55, 1.4)); u.position.y = k * .68; s.add(u); }
      const led = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 8), new THREE.MeshBasicMaterial({ color: INK.clone() })); led.position.set(.6, 2.15, .71); s.add(led); s.userData.led = led;
      g.add(s); return s;
    });
    const routes = servers.map(s => { const c = curve(lb.position, s.position.clone().add(new THREE.Vector3(0, 2.4, 0)), .9); g.add(curveLine(c, .3)); return c; });
    const inbound = new THREE.LineCurve3(new THREE.Vector3(0, 6, 0), lb.position.clone()); g.add(curveLine(new THREE.QuadraticBezierCurve3(inbound.v1, inbound.v1.clone().lerp(inbound.v2, .5), inbound.v2), .3));
    const n = 12, P = packets(n, 7); g.add(P);
    const ms = Array.from({ length: n }, (_, i) => ({ t: i / n }));
    const flash = [0, 0, 0];
    return { scene, camera, update(t, dt, hover) {
      const k = hover ? 2 : 1;
      ms.forEach((m, i) => {
        const prev = m.t; m.t = (m.t + dt * .22 * k) % 1;
        const srv = i % 3;
        if (m.t < .35) { inbound.getPoint(m.t / .35, v); P.set(i, v, INK); }
        else { routes[srv].getPoint((m.t - .35) / .65, v); P.set(i, v, ACCENT); }
        if (prev > m.t) flash[srv] = 1;
      });
      P.done();
      servers.forEach((s, i) => { flash[i] = Math.max(0, flash[i] - dt * 2.5); s.userData.led.material.color.copy(INK).lerp(ACCENT, flash[i]); });
      g.rotation.y = Math.sin(t * .18) * .25;
    } };
  },

  // a field of devices; readings rise to one hub
  iot() {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .1, 100); camera.position.set(0, 6.5, 17); camera.lookAt(0, 1.1, 0);
    const g = new THREE.Group(); scene.add(g);
    const cols = 15, rows = 9, sp = .9, base = [];
    const field = packets(cols * rows, 4); g.add(field);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) base.push(new THREE.Vector3((i - (cols - 1) / 2) * sp, -1.5, (j - (rows - 1) / 2) * sp));
    const hub = edges(new THREE.OctahedronGeometry(.8)); hub.position.set(0, 3.6, 0); g.add(hub);
    const halo = ring(1.4, 0, Math.PI * 2, .5); halo.position.copy(hub.position); halo.rotation.x = Math.PI / 2; g.add(halo);
    const n = 16, P = packets(n, 6); g.add(P);
    const up = Array.from({ length: n }, () => ({ from: Math.floor(Math.random() * base.length), t: Math.random(), sp: .3 + Math.random() * .3 }));
    const beams = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)), lineMat(.18)); g.add(beams);
    return { scene, camera, update(t, dt, hover) {
      const k = hover ? 2 : 1;
      base.forEach((b, i) => { v.set(b.x, b.y + Math.sin(b.x * .7 + t * 1.2) * .18 + Math.cos(b.z * .9 + t) * .12, b.z); field.set(i, v, INK); }); field.done();
      const bp = beams.geometry.attributes.position;
      up.forEach((u, i) => {
        u.t += dt * u.sp * k; if (u.t > 1) { u.t = 0; u.from = Math.floor(Math.random() * base.length); }
        const b = base[u.from]; v.copy(b).lerp(hub.position, u.t * u.t);
        P.set(i, v, u.t > .85 ? ACCENT : INK);
        bp.setXYZ(i * 2, b.x, b.y, b.z); bp.setXYZ(i * 2 + 1, hub.position.x, hub.position.y, hub.position.z);
      });
      bp.needsUpdate = true; P.done();
      hub.rotation.y += dt * .6 * k; halo.rotation.z -= dt * .4 * k; g.rotation.y = Math.sin(t * .15) * .4;
    } };
  },

  // a phone sends orders into a grid of stock
  commerce() {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 100); camera.position.set(-2, 3, 17); camera.lookAt(.5, 0, 0);
    const g = new THREE.Group(); scene.add(g);
    const phone = new THREE.Group(); phone.position.set(-4.2, 0, 1); phone.rotation.set(.1, .5, -.08); g.add(phone);
    phone.add(edges(new THREE.BoxGeometry(2.2, 4.4, .2)));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const tile = edges(new THREE.PlaneGeometry(.8, .9), .6); tile.position.set(-.48 + c * .96, 1.1 - r * 1.08, .11); phone.add(tile); }
    const cubes = [];
    for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 2; z++) {
      const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.8, .8, .8)), new THREE.LineBasicMaterial({ color: INK.clone() }));
      m.position.set(1.6 + x * 1, -1.6 + y * 1, -z * 1); g.add(m); cubes.push(m);
    }
    const n = 8, P = packets(n, 7); g.add(P);
    const orders = Array.from({ length: n }, (_, i) => ({ t: i / n, to: Math.floor(Math.random() * cubes.length) }));
    const glow = new Float32Array(cubes.length);
    const from = new THREE.Vector3();
    return { scene, camera, update(t, dt, hover) {
      const k = hover ? 2 : 1;
      phone.updateMatrixWorld(); from.set(0, 0, .2); phone.localToWorld(from); g.worldToLocal(from);
      orders.forEach((o, i) => {
        o.t += dt * .28 * k;
        if (o.t > 1) { glow[o.to] = 1; o.t = 0; o.to = Math.floor(Math.random() * cubes.length); o.c = null; }
        if (!o.c) o.c = curve(from, cubes[o.to].position, 1.6);   // one curve per order, not per frame
        o.c.getPoint(o.t, v); P.set(i, v, ACCENT);
      });
      P.done();
      cubes.forEach((c, i) => { glow[i] = Math.max(0, glow[i] - dt * 1.6); c.material.color.copy(INK).lerp(ACCENT, glow[i]); });
      phone.position.y = Math.sin(t * 1.2) * .15; g.rotation.y = Math.sin(t * .2) * .25 - .1;
    } };
  },
};

function start() {
  // a high-density screen already smooths lines, so MSAA only below 2x; phones render at 1.5x at most
  const touch = matchMedia('(pointer: coarse)').matches;
  const maxDpr = touch ? 1.5 : 2;
  let dpr = Math.min(devicePixelRatio, maxDpr);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const views = [...document.querySelectorAll('[data-scene]')].map(el => {
    const s = build[el.dataset.scene](); const project = el.closest('.project');
    const view = { el, project, ...s, hover: false, shownAt: project ? null : 0, near: false };
    (project || el).addEventListener('pointerenter', () => { view.hover = true; });
    (project || el).addEventListener('pointerleave', () => { view.hover = false; });
    return view;
  });

  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; }, { passive: true });

  let W = 0, H = 0;
  const resize = () => { W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); wake(); };
  addEventListener('resize', resize);

  // draw only while a frame is on screen and the tab is visible; otherwise the loop sleeps
  let running = false, drewLast = false;
  const anyNear = () => views.some(v => v.near);
  function wake() { if (!running && !document.hidden && anyNear()) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  const io = new IntersectionObserver(es => { es.forEach(e => { views.find(v => v.el === e.target).near = e.isIntersecting; }); wake(); }, { rootMargin: '80px 0px' });
  views.forEach(v => io.observe(v.el));
  document.addEventListener('visibilitychange', wake);
  // reveals start on a class change, which the observer does not see
  new MutationObserver(wake).observe(document.querySelector('.work'), { subtree: true, attributes: true, attributeFilter: ['class'] });

  // adaptive quality: if frames run slow for a second, drop the resolution one step
  let slow = 0;
  function adapt(dtMs) {
    slow = dtMs > 24 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - .5); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); slow = 0; }
  }

  const ease = x => 1 - Math.pow(1 - x, 3);
  let last = performance.now(), t = 0;
  function frame(now) {
    if (document.hidden || !anyNear()) {
      if (drewLast) { renderer.setScissorTest(false); renderer.clear(); drewLast = false; }
      running = false; return;
    }
    // phones: the drawings are slow, so 30 fps looks the same and halves the GPU and battery cost
    if (touch && now - last < 30) { requestAnimationFrame(frame); return; }
    const dtMs = now - last, dt = Math.min(.05, dtMs / 1000); last = now; if (!reduce) t += dt;
    if (!touch) adapt(dtMs); else if (dtMs > 60) adapt(99);
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    drewLast = true;
    for (const vw of views) {
      if (!vw.near) continue;
      const r = vw.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.width === 0) continue;
      // follow the frame's reveal: the drawing rises with the clip from the bottom
      let shown = 1;
      if (vw.project) {
        if (!vw.project.classList.contains('is-in')) continue;
        if (vw.shownAt === null) vw.shownAt = now;
        shown = reduce ? 1 : ease(Math.min(1, (now - vw.shownAt) / 1100));
      }
      vw.camera.aspect = r.width / r.height; vw.camera.updateProjectionMatrix();
      vw.update(t, reduce ? 0 : dt, vw.hover, mouse);
      const y = H - r.bottom;
      renderer.setViewport(r.left, y, r.width, r.height);
      renderer.setScissor(r.left, y, r.width, r.height * shown);
      renderer.render(vw.scene, vw.camera);
    }
    // under reduced motion nothing moves, so draw once per scroll instead of every frame
    if (reduce) { running = false; return; }
    requestAnimationFrame(frame);
  }
  if (reduce) addEventListener('scroll', wake, { passive: true });
  resize();
}

if (webglOK()) start();
