// העולם התלת־ממדי: שטח, שמיים, מושבים, ישויות ואפקטים
import * as THREE from 'three';
import {
  Batch, VC, VC_GLASS, G as GEO, mat, makePerson, posePerson, setHat, makeVehicle, makeAnimal, poseAnimal,
  addPalm, addAcacia, addRock, addShrub, addHouse, makeLabel, makeSignBoard, shade,
} from './models.js';

const M = window.MAP;
const SC = M.SC;
const PAD = 1600;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// גובה גם מחוץ לגבולות המפה (גבעות הנגב במערב, הרים במזרח)
export function ground(x, y) {
  let h = M.heightAt(x, y);
  if (x < -150) h += smooth(-150, -PAD, x) * 55 * (0.6 + 0.4 * M.fbm(x / 400, y / 400, 3));
  if (y < 0) h += smooth(0, -PAD, y) * 25;
  if (y > M.H) h += smooth(M.H, M.H + PAD, y) * 25;
  return h;
}

export function createWorld(canvas, G, lowEnd) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HAZE = new THREE.Color('#ead7b5');
  scene.fog = new THREE.Fog(HAZE, 140, lowEnd ? 520 : 760);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);

  // ---------- שמיים ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#3f7fc9') }, mid: { value: new THREE.Color('#9cc7ea') }, bot: { value: HAZE }, sunDir: { value: new THREE.Vector3(0.45, 0.62, -0.35).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = mix(bot, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
      float s = max(dot(normalize(vP), sunDir), 0.0); c += vec3(1.0,0.9,0.7) * pow(s, 400.0) * 2.0 + vec3(1.0,0.85,0.6) * pow(s, 12.0) * 0.25;
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#cfe6ff', '#c9a27a', 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  const SUN_DIR = new THREE.Vector3(0.45, 0.62, -0.35).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  const SR = lowEnd ? 38 : 55;
  Object.assign(sun.shadow.camera, { left: -SR, right: SR, top: SR, bottom: -SR, near: 1, far: 400 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---------- קרקע: ציור הטקסטורה ----------
  const CW = 2048, CH = Math.round(2048 * M.H / M.W);
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = CW; groundCanvas.height = CH;
  const gctx = groundCanvas.getContext('2d');
  const KX = CW / M.W, KY = CH / M.H;
  const biome = document.createElement('canvas');
  (function () {
    const bw = 180, bh = 200;
    biome.width = bw; biome.height = bh;
    const bc = biome.getContext('2d'), img = bc.createImageData(bw, bh);
    const sand = [232, 204, 152], gravel = [196, 170, 130], red = [214, 160, 112], pale = [242, 226, 188], mtn = [178, 112, 74];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const x = (i + 0.5) / bw * M.W, y = (j + 0.5) / bh * M.H;
      let c = mix(sand, gravel, smooth(0.42, 0.72, M.fbm(x / 1500, y / 1500)));
      c = mix(c, red, smooth(0.55, 0.8, M.fbm(x / 800 + 40, y / 800 + 40)) * 0.5);
      c = mix(c, pale, smooth(0.58, 0.85, M.fbm(x / 350 + 9, y / 350 + 9)) * 0.45);
      c = mix(c, mtn, smooth(M.MOUNTAIN_X - 300, M.MOUNTAIN_X + 200, x));
      const k = (j * bw + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    bc.putImageData(img, 0, 0);
  })();
  const showTown = (o) => o.town !== 'ey' || G.founded;
  function strokePath(pts, w, color, dash) {
    gctx.beginPath();
    pts.forEach((p, i) => (i ? gctx.lineTo(p[0] * KX, p[1] * KY) : gctx.moveTo(p[0] * KX, p[1] * KY)));
    gctx.strokeStyle = color; gctx.lineWidth = w * KX;
    gctx.setLineDash(dash || []);
    gctx.stroke();
    gctx.setLineDash([]);
  }
  function paintGround() {
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(biome, 0, 0, CW, CH);
    gctx.lineCap = 'round'; gctx.lineJoin = 'round';
    // נחלים
    for (const w of M.wadis) {
      strokePath(w.pts, w.w * 1.25, 'rgba(170,140,100,.35)');
      strokePath(w.pts, w.w * 0.85, 'rgba(225,212,185,.85)');
      strokePath(w.pts, w.w * 0.35, 'rgba(240,232,215,.8)');
    }
    // דיונות
    for (const d of M.dunes) {
      gctx.save(); gctx.translate(d.x * KX, d.y * KY); gctx.rotate(d.rot);
      const gr = gctx.createRadialGradient(-d.rx * KX * 0.3, 0, 2, 0, 0, d.rx * KX);
      gr.addColorStop(0, 'rgba(248,230,185,.95)'); gr.addColorStop(1, 'rgba(235,210,160,0)');
      gctx.fillStyle = gr; gctx.beginPath(); gctx.ellipse(0, 0, d.rx * KX, d.ry * KY, 0, 0, Math.PI * 2); gctx.fill();
      gctx.restore();
    }
    // מקפצות
    for (const r of M.ramps) {
      gctx.save(); gctx.translate(r.x * KX, r.y * KY); gctx.rotate(r.a);
      gctx.fillStyle = '#9a6b3e'; gctx.fillRect(-r.len * KX, -r.w / 2 * KY, (r.len + 12) * KX, r.w * KY);
      gctx.fillStyle = '#f1c40f'; gctx.fillRect(4, -r.w / 2 * KY, 2, r.w * KY);
      gctx.restore();
    }
    // אזורי יישוב
    for (const t of M.towns) {
      if (!showTown(t)) continue;
      const gr = gctx.createRadialGradient(t.x * KX, t.y * KY, 5, t.x * KX, t.y * KY, (t.rx || t.r) * KX * 1.1);
      gr.addColorStop(0, 'rgba(205,190,160,.75)'); gr.addColorStop(1, 'rgba(205,190,160,0)');
      gctx.fillStyle = gr;
      gctx.beginPath(); gctx.ellipse(t.x * KX, t.y * KY, (t.rx || t.r) * KX * 1.1, (t.ry || t.r) * KY * 1.1, 0, 0, Math.PI * 2); gctx.fill();
    }
    if (G.founded) {
      for (const p of M.planned) { gctx.fillStyle = 'rgba(160,190,110,.55)'; gctx.fillRect((p.x - 20) * KX, (p.y - 20) * KY, (p.w + 40) * KX, (p.h + 40) * KY); }
    }
    for (const d of M.decor) {
      if (!showTown(d)) continue;
      const col = { plaza: '#d9c7a6', grass: '#86b955', lot: '#c9ad80', court: '#c0392b', yard: '#dccdb0' }[d.kind];
      if (!col) continue;
      gctx.fillStyle = col;
      if (d.round) { gctx.beginPath(); gctx.arc((d.x + d.w / 2) * KX, (d.y + d.h / 2) * KY, d.w / 2 * KX, 0, Math.PI * 2); gctx.fill(); }
      else gctx.fillRect(d.x * KX, d.y * KY, d.w * KX, d.h * KY);
    }
    for (const g of M.greenhouses) {
      if (!showTown(g)) continue;
      gctx.fillStyle = '#8a6e4a'; gctx.fillRect((g.x - 6) * KX, (g.y - 6) * KY, (g.w + 12) * KX, (g.h + 12) * KY);
    }
    // דרכים
    for (const r of M.roads) {
      if (r.town && !showTown(r)) continue;
      if (r.kind === 'trail') { strokePath(r.pts, r.w + 8, 'rgba(160,120,75,.45)'); strokePath(r.pts, r.w, '#d0aa72'); }
      else if (r.kind === 'track') { strokePath(r.pts, r.w + 12, '#7d5330'); strokePath(r.pts, r.w, '#a9743f'); }
      else if (r.kind === 'dirt') strokePath(r.pts, r.w, '#c9a46a');
    }
    for (const r of M.roads) {
      if ((r.kind !== 'road' && r.kind !== 'highway') || (r.town && !showTown(r))) continue;
      strokePath(r.pts, r.w + 14, '#cfc0a0');
      strokePath(r.pts, r.w, r.kind === 'highway' ? '#4a4a4c' : '#5c5c60');
    }
    for (const r of M.roads) {
      if ((r.kind !== 'road' && r.kind !== 'highway') || (r.town && !showTown(r))) continue;
      if (r.kind === 'highway') strokePath(r.pts, 3.5, '#f4d03f', [30 * KX, 22 * KX]);
      else strokePath(r.pts, 2.5, 'rgba(255,255,255,.85)', [20 * KX, 22 * KX]);
    }
    if (groundTex) groundTex.needsUpdate = true;
  }
  let groundTex = null;
  paintGround();
  groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  groundTex.flipY = false;

  // מרקם פרטים (גרגרי חול)
  const det = document.createElement('canvas');
  det.width = det.height = 256;
  (function () {
    const d = det.getContext('2d'), img = d.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const k = (j * 256 + i) * 4;
      const n = Math.random();
      const big = M.fbm(i / 18, j / 18, 3);
      img.data[k] = 128 + (n - 0.5) * 120; img.data[k + 1] = big * 255; img.data[k + 2] = 128; img.data[k + 3] = 255;
    }
    d.putImageData(img, 0, 0);
  })();
  const detTex = new THREE.CanvasTexture(det);
  detTex.wrapS = detTex.wrapT = THREE.RepeatWrapping;

  // ---------- קרקע: רשת גבהים ----------
  const STEP = lowEnd ? 44 : 32;
  const X0 = -PAD, Y0 = -PAD, X1 = M.W + PAD, Y1 = M.H + PAD;
  const NX = Math.ceil((X1 - X0) / STEP), NY = Math.ceil((Y1 - Y0) / STEP);
  const pos = new Float32Array((NX + 1) * (NY + 1) * 3);
  const uv = new Float32Array((NX + 1) * (NY + 1) * 2);
  const col = new Float32Array((NX + 1) * (NY + 1) * 3);
  const hgrid = new Float32Array((NX + 1) * (NY + 1));
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const x = X0 + i * STEP, y = Y0 + j * STEP, k = j * (NX + 1) + i;
    const h = ground(x, y);
    hgrid[k] = h;
    pos[k * 3] = x * SC; pos[k * 3 + 1] = h; pos[k * 3 + 2] = y * SC;
    uv[k * 2] = x / M.W; uv[k * 2 + 1] = y / M.H;
  }
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const k = j * (NX + 1) + i;
    const hx = hgrid[j * (NX + 1) + Math.min(NX, i + 1)] - hgrid[j * (NX + 1) + Math.max(0, i - 1)];
    const hy = hgrid[Math.min(NY, j + 1) * (NX + 1) + i] - hgrid[Math.max(0, j - 1) * (NX + 1) + i];
    const slope = Math.hypot(hx, hy) / (2 * STEP * SC);
    const x = X0 + i * STEP;
    const rock = Math.max(smooth(0.35, 0.9, slope), x < 0 || x > M.MOUNTAIN_X ? smooth(0.2, 0.5, slope) : 0);
    const out = x < 0 || x > M.W ? 1 : 0;
    // סלע אדמדם במדרונות
    let r = 1, g = 1, b = 1;
    r = r + (0.78 - r) * rock; g = g + (0.55 - g) * rock; b = b + (0.42 - b) * rock;
    if (out) { r *= 0.95; g *= 0.9; b *= 0.85; }
    const shadeK = 0.92 + 0.08 * clamp(1 - slope, 0, 1);
    col[k * 3] = r * shadeK; col[k * 3 + 1] = g * shadeK; col[k * 3 + 2] = b * shadeK;
  }
  const idx = new Uint32Array(NX * NY * 6);
  let q = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tgeo.setIndex(new THREE.BufferAttribute(idx, 1));
  tgeo.computeVertexNormals();
  const tmat = new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true });
  tmat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detTex };
    sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec4 dA = texture2D(detailMap, vMapUv * vec2(900.0, 1000.0));
      vec4 dB = texture2D(detailMap, vMapUv * vec2(160.0, 178.0));
      diffuseColor.rgb *= (0.86 + 0.28 * dA.r) * (0.9 + 0.2 * dB.g);`);
  };
  const terrain = new THREE.Mesh(tgeo, tmat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- אובייקטים סטטיים בחלוקה לאזורים ----------
  const CELL = 1200;
  const batches = new Map();
  const getB = (key) => { if (!batches.has(key)) batches.set(key, { o: new Batch(), g: new Batch() }); return batches.get(key); };
  const cellKey = (x, y) => Math.floor(x / CELL) + ',' + Math.floor(y / CELL);
  const eyRing = (x, y) => Math.min(6, Math.floor(Math.hypot(x - M.EY.x, y - M.EY.y) / 300));
  const bucket = (o, x, y) => (o.town === 'ey' ? 'ey' + eyRing(x, y) : 'n' + cellKey(x, y));
  const W3 = (x, y) => [x * SC, ground(x, y), y * SC];

  // טבע
  M.rocks.forEach((r) => { const [x, y, z] = W3(r.x, r.y); const b = getB(bucket({}, r.x, r.y)).o; if (r.k > 0.82 && r.s < 1.2) addShrub(b, x, y, z, 1 + r.s, r.k); else addRock(b, x, y - 0.2, z, r.s, r.k); });
  M.acacias.forEach((a) => { const [x, y, z] = W3(a.x, a.y); addAcacia(getB(bucket({}, a.x, a.y)).o, x, y, z, a.s, M.hash2(Math.round(a.x), Math.round(a.y))); });
  M.palms.forEach((p) => { const [x, y, z] = W3(p.x, p.y); addPalm(getB(bucket(p, p.x, p.y)).o, x, y, z, p.s || 1, M.hash2(Math.round(p.x), Math.round(p.y))); });
  // מוטות צבעוניים ליד מקפצות
  for (const r of M.ramps) {
    for (const s of [-1, 1]) {
      const px = r.x + Math.cos(r.a + Math.PI / 2) * s * (r.w / 2 + 6), py = r.y + Math.sin(r.a + Math.PI / 2) * s * (r.w / 2 + 6);
      const [x, y, z] = W3(px, py);
      const b = getB(bucket({}, px, py)).o;
      b.add(GEO.cyl8, '#f1c40f', x, y + 0.6, z, 0, 0, 0, 0.07, 1.2, 0.07);
      b.add(GEO.cyl8, '#222', x, y + 1.3, z, 0, 0, 0, 0.075, 0.25, 0.075);
    }
  }

  // מבנים
  function nearestRoadDir(cx, cy) {
    let best = 1e9, bx = cx, by = cy + 1;
    for (const r of M.roads) {
      if (r.kind === 'trail' || r.kind === 'track') continue;
      if (cx < r.bb[0] - 300 || cx > r.bb[2] + 300 || cy < r.bb[1] - 300 || cy > r.bb[3] + 300) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        let t = l2 ? ((cx - a[0]) * dx + (cy - a[1]) * dy) / l2 : 0; t = clamp(t, 0, 1);
        const px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(cx - px, cy - py);
        if (d < best) { best = d; bx = px; by = py; }
      }
    }
    return Math.atan2(-(by - cy), bx - cx);
  }
  const signs = [];
  for (const s of M.solids) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const [x, gy, z] = W3(cx, cy);
    const B = getB(bucket(s, cx, cy));
    const w = s.w * SC, d = s.h * SC;
    if (s.kind === 'house') { addHouse(B.o, B.g, x, gy, z, w, d, s.color, s.flat, nearestRoadDir(cx, cy)); continue; }
    if (s.kind === 'tower') {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.o.add(GEO.cyl8, '#8d99a3', x + dx * 2.6, gy + 8, z + dz * 2.6, dz * 0.12, 0, -dx * 0.12, 0.22, 16.5, 0.22);
      B.o.add(GEO.cyl, '#d5dde3', x, gy + 19, z, 0, 0, 0, 4.4, 5.5, 4.4);
      B.o.add(GEO.cone, '#aab4bd', x, gy + 22.6, z, 0, 0, 0, 4.6, 1.8, 4.6);
      B.o.add(GEO.cyl, '#2e86de', x, gy + 19, z, 0, 0, 0, 4.45, 1.2, 4.45);
      continue;
    }
    const floors = s.floors || 1;
    const H = floors * 3.6 + 0.6;
    const wall = s.dark ? '#ece4d2' : '#efe6d4';
    B.o.add(GEO.box, wall, x, gy + H / 2, z, 0, 0, 0, w, H, d);
    B.o.add(GEO.box, s.color, x, gy + H - 0.35, z, 0, 0, 0, w + 0.25, 0.7, d + 0.25);
    B.o.add(GEO.box, '#cfc6b4', x, gy + 0.15, z, 0, 0, 0, w + 0.6, 0.3, d + 0.6);
    for (let f = 0; f < floors; f++) for (let k = -2; k <= 2; k++) {
      const wx = x + k * w / 5.5;
      if (k === 0 && f === 0) continue;
      B.o.add(GEO.box, '#5d8aa8', wx, gy + 1.8 + f * 3.6, z + d / 2 + 0.04, 0, 0, 0, w / 9, 1.3, 0.08);
      B.o.add(GEO.box, '#5d8aa8', wx, gy + 1.8 + f * 3.6, z - d / 2 - 0.04, 0, 0, 0, w / 9, 1.3, 0.08);
    }
    B.o.add(GEO.box, '#4a3526', x, gy + 1.2, z + d / 2 + 0.05, 0, 0, 0, 1.6, 2.4, 0.1);
    B.o.add(GEO.box, s.color, x, gy + 2.75, z + d / 2 + 0.9, 0.25, 0, 0, w * 0.5, 0.12, 1.9);
    if (s.kind === 'packing') B.o.add(GEO.halfCyl, '#b8c2c8', x, gy + H, z, Math.PI / 2, 0, Math.PI / 2, d / 2, w, d * 0.18);
    else {
      B.o.add(GEO.box, '#b7b2a6', x - w * 0.3, gy + H + 0.4, z - d * 0.2, 0, 0, 0, 1.2, 0.8, 1.2);
      B.o.add(GEO.cyl, '#f4f4f4', x + w * 0.2, gy + H + 0.6, z, Math.PI / 2, 0, 0, 0.3, 1.6, 0.3);
      B.o.add(GEO.box, '#25386b', x + w * 0.2 + 0.9, gy + H + 0.5, z, 0, 0, 0.6, 1.4, 0.06, 1.8);
    }
    if (s.label) {
      const sign = makeLabel(s.label, { size: 72, color: '#fff', bg: s.color === '#f5f0e1' ? '#7a5a3a' : shade(s.color, -30), border: '#fff', height: 1.0, fog: true });
      sign.position.set(x, gy + H - 1.5, z + d / 2 + 0.2);
      sign.center.set(0.5, 0.5);
      sign.userData.town = s.town;
      signs.push(sign);
    }
  }
  // חממות ובתי רשת
  for (const g of M.greenhouses) {
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    const [x, gy, z] = W3(cx, cy);
    const B = getB(bucket(g, cx, cy));
    const w = g.w * SC, d = g.h * SC;
    for (let rz = -d / 2 + 0.9; rz < d / 2 - 0.5; rz += 1.6) B.o.add(GEO.box, '#3f7f31', x, gy + 0.35, z + rz, 0, 0, 0, w - 1.2, 0.7, 0.55);
    if (g.kind === 'tunnel') {
      const n = Math.max(1, Math.round(d / 7.5)), tw = d / n;
      for (let k = 0; k < n; k++) {
        const tz = z - d / 2 + tw * (k + 0.5);
        B.g.add(GEO.halfCyl, '#f2f6f8', x, gy, tz, Math.PI / 2, 0, Math.PI / 2, tw * 0.5, w, 2.9);
        B.o.add(GEO.box, '#dfe6e9', x - w / 2, gy + 1.4, tz, 0, 0, 0, 0.12, 2.8, tw * 0.95);
      }
    } else {
      const HH = 4.2;
      for (let px = -w / 2; px <= w / 2 + 0.1; px += w / 4) for (const pz of [-d / 2, 0, d / 2]) B.o.add(GEO.cyl8, '#9aa3a8', x + px, gy + HH / 2, z + pz, 0, 0, 0, 0.07, HH, 0.07);
      B.g.add(GEO.box, '#eef3f4', x, gy + HH, z, 0, 0, 0, w, 0.06, d);
      B.g.add(GEO.box, '#e6ecee', x, gy + HH / 2, z + d / 2, 0, 0, 0, w, HH, 0.05);
      B.g.add(GEO.box, '#e6ecee', x, gy + HH / 2, z - d / 2, 0, 0, 0, w, HH, 0.05);
      B.g.add(GEO.box, '#e6ecee', x - w / 2, gy + HH / 2, z, 0, 0, 0, 0.05, HH, d);
    }
  }
  // מחנה המשפחות בשטח (נקודת ההתחלה)
  {
    const [x, y, z] = W3(M.SPAWN.x - 120, M.SPAWN.y - 90);
    const b = getB(bucket({}, M.SPAWN.x, M.SPAWN.y)).o;
    b.add(GEO.prism, '#3d2b20', x, y, z, 0, 0.3, 0, 8, 3.2, 6);
    b.add(GEO.prism, '#e8dcc0', x + 9, y, z + 6, 0, 1.2, 0, 4, 2.2, 3);
    b.add(GEO.prism, '#c0392b', x - 5, y, z + 9, 0, -0.4, 0, 3.6, 2, 2.8);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; b.add(GEO.cyl8, '#5b3a1e', x + 6 + Math.cos(a) * 0.5, y + 0.2, z + 3 + Math.sin(a) * 0.5, Math.PI / 2, a, 0, 0.1, 1.2, 0.1); }
    for (let k = 0; k < 3; k++) b.add(GEO.box, '#2e7d32', x - 3 + k * 0.6, y + 0.35, z - 4, 0, 0.2, 0, 0.45, 0.7, 0.3);
  }
  // מצפור חופירה — פרגולה ומעקה על הגבעה
  {
    const [x, y, z] = W3(700, 4300);
    const b = getB(bucket({}, 700, 4300)).o;
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.add(GEO.cyl8, '#6b4a2a', x + dx, y + 1.5, z + dz, 0, 0, 0, 0.12, 3, 0.12);
    b.add(GEO.box, '#8b6a46', x, y + 3, z, 0, 0, 0, 7, 0.15, 7);
    for (let k = -3; k <= 3; k++) b.add(GEO.box, '#8b6a46', x + k, y + 3.15, z, 0, 0, 0, 0.12, 0.1, 7);
    b.add(GEO.box, '#7f8c8d', x + 4, y + 0.6, z, 0, 0, 0, 0.1, 1.2, 8);
  }
  // בריכה ומעיין
  const eyExtra = [];
  const waterMat = new THREE.MeshLambertMaterial({ color: '#2fb3e6', emissive: '#0b4a6e', transparent: true, opacity: 0.88 });
  {
    const P = M.POOL;
    const [x, y, z] = W3(P.x + P.w / 2, P.y + P.h / 2);
    const pool = new THREE.Mesh(new THREE.BoxGeometry(P.w * SC, 0.3, P.h * SC), waterMat);
    pool.position.set(x, y + 0.08, z); pool.userData.town = 'ey'; scene.add(pool); eyExtra.push(pool);
    const rim = getB('ey0').o;
    rim.add(GEO.box, '#f2efe6', x, y + 0.05, z - P.h * SC / 2 - 0.6, 0, 0, 0, P.w * SC + 2.4, 0.25, 1.2);
    rim.add(GEO.box, '#f2efe6', x, y + 0.05, z + P.h * SC / 2 + 0.6, 0, 0, 0, P.w * SC + 2.4, 0.25, 1.2);
    rim.add(GEO.box, '#f2efe6', x - P.w * SC / 2 - 0.6, y + 0.05, z, 0, 0, 0, 1.2, 0.25, P.h * SC);
    rim.add(GEO.box, '#f2efe6', x + P.w * SC / 2 + 0.6, y + 0.05, z, 0, 0, 0, 1.2, 0.25, P.h * SC);
    for (let k = 1; k < 4; k++) rim.add(GEO.cyl8, '#e74c3c', x, y + 0.25, z - P.h * SC / 2 + k * P.h * SC / 4, 0, 0, Math.PI / 2, 0.05, P.w * SC, 0.05);
  }
  for (const s of M.springs) {
    if (s.town) continue;
    const [x, y, z] = W3(s.x, s.y);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(s.r * SC * 1.4, 24), waterMat);
    pond.rotation.x = -Math.PI / 2; pond.scale.set(1, 0.75, 1); pond.position.set(x, y + 0.15, z);
    scene.add(pond);
    const b = getB(bucket({}, s.x, s.y)).o;
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; addRock(b, x + Math.cos(a) * s.r * SC * 1.5, y, z + Math.sin(a) * s.r * SC * 1.1, 0.6 + (k % 3) * 0.3, k / 10); }
  }
  // ברז המים במושב
  for (const s of M.springs) {
    if (!s.town) continue;
    const [x, y, z] = W3(s.x, s.y);
    const b = getB(bucket({ town: s.town }, s.x, s.y)).o;
    b.add(GEO.cyl8, '#7f8c8d', x, y + 0.5, z, 0, 0, 0, 0.08, 1, 0.08);
    b.add(GEO.box, '#2e86de', x, y + 1.0, z + 0.15, 0, 0, 0, 0.25, 0.12, 0.35);
  }

  // בניית המיזוגים
  const staticGroups = new Map(); // key -> [meshes]
  for (const [key, B] of batches) {
    const meshes = [];
    const o = B.o.build(VC, true); if (o) meshes.push(o);
    const g = B.g.build(VC_GLASS, false); if (g) { g.renderOrder = 2; meshes.push(g); }
    meshes.forEach((m) => scene.add(m));
    staticGroups.set(key, meshes);
  }
  signs.forEach((s) => scene.add(s));
  const eyGroups = [...staticGroups.keys()].filter((k) => k.startsWith('ey'));

  // ---------- תוויות ושלטים ----------
  const labelObjs = [];
  for (const l of M.labels) {
    let obj;
    const [x, gy, z] = W3(l.x, l.y);
    if (l.sign) { obj = makeSignBoard(l.text, { height: l.size * 0.5 }); obj.position.set(x, gy, z); obj.rotation.y = 0; }
    else { obj = makeLabel(l.text, { size: 80, color: l.color || '#5a3410', stroke: 'rgba(255,248,230,.95)', height: l.size, fog: false }); obj.position.set(x, gy + (l.high ? 60 : 6), z); }
    obj.userData.town = l.town;
    scene.add(obj);
    labelObjs.push(obj);
  }
  // שלט כניסה "עין יהב"
  {
    const gate = makeSignBoard('ברוכים הבאים למושב עין יהב', { height: 2.2, post: 2.2, bg: '#1f5f8b' });
    const [x, y, z] = W3(4380, M.EY.y + 90);
    gate.position.set(x, y, z); gate.rotation.y = Math.PI / 2; gate.userData.town = 'ey';
    scene.add(gate); labelObjs.push(gate);
  }

  // ---------- משק מזור ----------
  const mazorGroup = new THREE.Group(); scene.add(mazorGroup);
  let mazorStage = -1;
  function buildMazor(stage) {
    mazorGroup.clear();
    const L = M.MAZOR_LOT, H = M.MAZOR;
    const cx = H.x + H.w / 2, cy = H.y + H.h / 2;
    const [x, gy, z] = W3(cx, cy);
    const w = H.w * SC, d = H.h * SC;
    const b = new Batch(), g = new Batch();
    // שער "משק מזור"
    const [gx, gyy, gz] = W3(L.x + L.w / 2, L.y + L.h - 5);
    for (const s of [-1, 1]) b.add(GEO.box, '#6b4a2a', gx + s * 5, gyy + 2.5, gz, 0, 0, 0, 0.35, 5, 0.35);
    // גדר
    const lw = L.w * SC, ld = L.h * SC, [lx, , lz] = W3(L.x + L.w / 2, L.y + L.h / 2);
    for (const [dx, dz, sx, sz] of [[0, -ld / 2, lw, 0.1], [-lw / 2, 0, 0.1, ld], [lw / 2, 0, 0.1, ld], [-lw / 2 + (lw / 2 - 5) / 2, ld / 2, lw / 2 - 5, 0.1], [lw / 2 - (lw / 2 - 5) / 2, ld / 2, lw / 2 - 5, 0.1]]) b.add(GEO.box, '#8b6a46', lx + dx, gy + 0.6, lz + dz, 0, 0, 0, sx, 1.2, sz);
    if (stage === 0) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(GEO.cyl8, '#c0392b', x + dx * w / 2, gy + 0.5, z + dz * d / 2, 0, 0, 0, 0.06, 1, 0.06);
      b.add(GEO.box, '#e6c07b', x + 4, gy + 0.4, z + 3, 0, 0.3, 0, 1.6, 0.8, 1.2);
    }
    if (stage >= 1) b.add(GEO.box, '#a7a7a2', x, gy + 0.25, z, 0, 0, 0, w + 0.8, 0.5, d + 0.8);
    const WH = 3.4;
    if (stage >= 2 && stage < 4) {
      const t = 0.3;
      b.add(GEO.box, '#efe2c4', x, gy + 0.5 + WH / 2, z - d / 2, 0, 0, 0, w, WH, t);
      b.add(GEO.box, '#efe2c4', x - w / 2, gy + 0.5 + WH / 2, z, 0, 0, 0, t, WH, d);
      b.add(GEO.box, '#efe2c4', x + w / 2, gy + 0.5 + WH / 2, z, 0, 0, 0, t, WH, d);
      b.add(GEO.box, '#efe2c4', x - w / 4 - 0.6, gy + 0.5 + WH / 2, z + d / 2, 0, 0, 0, w / 2 - 1.2, WH, t);
      b.add(GEO.box, '#efe2c4', x + w / 4 + 0.6, gy + 0.5 + WH / 2, z + d / 2, 0, 0, 0, w / 2 - 1.2, WH, t);
      for (let k = -2; k <= 2; k++) { b.add(GEO.cyl8, '#8e6b3e', x + k * w / 4, gy + 2.5, z + d / 2 + 1, 0, 0, 0, 0.06, 5, 0.06); }
      b.add(GEO.box, '#8e6b3e', x, gy + 2.2, z + d / 2 + 1, 0, 0, 0, w, 0.08, 0.8);
      if (stage >= 3) for (let k = -1; k <= 1; k += 2) { b.add(GEO.box, '#5d8aa8', x + k * w / 4, gy + 2.2, z + d / 2 + 0.17, 0, 0, 0, 1.6, 1.2, 0.05); b.add(GEO.box, '#5d8aa8', x - w / 2 - 0.17, gy + 2.2, z + k * d / 4, 0, 0, 0, 0.05, 1.2, 1.6); }
    }
    if (stage >= 4) {
      addHouse(b, g, x, gy + 0.5, z, w, d, '#b03a2e', false, -Math.PI / 2, { floors: 2, wall: '#f8eed8', pergola: true });
    }
    if (stage >= 5) {
      b.add(GEO.box, '#86c35a', lx, gy + 0.03, lz, 0, 0, 0, lw - 1, 0.06, ld - 1);
      for (let k = 0; k < 18; k++) { const a = k / 18 * 6.28; b.add(GEO.sphLo, ['#e74c3c', '#f1c40f', '#ff6fb5', '#fff', '#9b59b6'][k % 5], lx + Math.cos(a) * (lw / 2 - 1.5), gy + 0.3, lz + Math.sin(a) * (ld / 2 - 1.5), 0, 0, 0, 0.35, 0.35, 0.35); }
      addPalm(b, lx - lw / 2 + 3, gy, lz - ld / 2 + 3, 1, 0.3); addPalm(b, lx + lw / 2 - 3, gy, lz - ld / 2 + 3, 1, 0.7);
      b.add(GEO.cyl8, '#ddd', x + w / 2 + 3, gy + 4, z + d / 2, 0, 0, 0, 0.06, 8, 0.06);
      b.add(new THREE.BoxGeometry(1, 1, 1), '#e74c3c', x + 3.5, gy + 1, z + d / 2 + 4, 0, 0, 0, 0.5, 0.6, 0.35);
    }
    const mo = b.build(VC, true); if (mo) mazorGroup.add(mo);
    const mg = g.build(VC_GLASS, false); if (mg) mazorGroup.add(mg);
    const sign = makeSignBoard('משק מזור', { height: 1.6, post: 3.6, bg: '#7a1f0e', border: '#f1c40f' });
    sign.position.set(gx, gyy, gz + 0.1);
    mazorGroup.add(sign);
    if (stage >= 5) {
      const fl = makeFlag(); fl.position.set(x + w / 2 + 3, gy + 6.5, z + d / 2); mazorGroup.add(fl);
    }
    mazorGroup.visible = G.founded;
  }

  // ---------- דגל ----------
  const flags = [];
  function makeFlag() {
    const c = document.createElement('canvas'); c.width = 220; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 220, 160);
    x.fillStyle = '#0038b8'; x.fillRect(0, 18, 220, 22); x.fillRect(0, 120, 220, 22);
    x.strokeStyle = '#0038b8'; x.lineWidth = 7;
    const tri = (dy) => { x.beginPath(); x.moveTo(110, 80 + dy * 34); x.lineTo(80, 80 - dy * 17); x.lineTo(140, 80 - dy * 17); x.closePath(); x.stroke(); };
    tri(1); tri(-1);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(2.6, 1.9, 12, 4);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.x = 1.3;
    m.castShadow = true;
    const grp = new THREE.Group(); grp.add(m);
    flags.push(m);
    return grp;
  }
  // דגל ההקמה
  const foundFlag = new THREE.Group();
  {
    const [x, y, z] = W3(M.EY.x, M.EY.y);
    const pole = new THREE.Mesh(GEO.cyl8, mat('#ddd')); pole.scale.set(0.08, 12, 0.08); pole.position.y = 6; pole.castShadow = true;
    foundFlag.add(pole);
    const f = makeFlag(); f.position.y = 10.8; foundFlag.add(f);
    foundFlag.position.set(x, y, z);
    scene.add(foundFlag);
  }

  // ---------- בתים דינמיים: משפחות שמגיעות + בתים של שחקנים ----------
  const plannedMeshes = new Map();
  function makeHouseMesh(cx, cy, wU, hU, color, flat, rot, opts) {
    const [x, gy, z] = W3(cx, cy);
    const b = new Batch(), g = new Batch();
    const w = wU * SC, d = hU * SC;
    b.add(GEO.box, '#93c463', x, gy + 0.03, z, 0, rot, 0, w + 6, 0.06, d + 6);
    addHouse(b, g, x, gy, z, w, d, color, flat, rot, opts);
    if (opts && opts.villa) b.add(GEO.box, '#38b6e8', x + Math.cos(rot) * (w / 2 + 3.5), gy + 0.1, z - Math.sin(rot) * (w / 2 + 3.5), 0, rot, 0, 3, 0.2, d * 0.8);
    const grp = new THREE.Group();
    const mo = b.build(VC, true); if (mo) grp.add(mo);
    const mg = g.build(VC_GLASS, false); if (mg) grp.add(mg);
    grp.userData.base = gy;
    scene.add(grp);
    return grp;
  }
  function syncPlanned() {
    const n = G.founded ? Math.min(G.moshav.families || 0, M.planned.length) : 0;
    for (let i = 0; i < M.planned.length; i++) {
      const p = M.planned[i];
      let m = plannedMeshes.get(i);
      if (i < n && !m) {
        m = makeHouseMesh(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, p.color, p.flat, nearestRoadDir(p.x + p.w / 2, p.y + p.h / 2));
        m.userData.born = i >= (G.moshav.prevFamilies == null ? n : G.moshav.prevFamilies) ? performance.now() + (G.foundT ? 0 : 0) : 0;
        plannedMeshes.set(i, m);
      } else if (i >= n && m) { scene.remove(m); plannedMeshes.delete(i); }
    }
  }
  const playerHouses = new Map();
  function syncPlayerHouses() {
    for (const h of G.houses) {
      if (playerHouses.has(h.id)) continue;
      const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
      const m = makeHouseMesh(cx, cy, h.w, h.h, h.color === '#ffffff' ? '#cccccc' : h.color, h.type === 'small', nearestRoadDir(cx, cy), { floors: h.type === 'villa' ? 2 : 1, villa: h.type === 'villa' });
      m.userData.born = G.serverNow() - (h.t || 0) < 5000 ? performance.now() : 0;
      const lab = makeLabel('הבית של ' + h.owner, { size: 56, color: '#fff', bg: 'rgba(59,36,18,.75)', height: 0.7 });
      lab.position.set(cx * SC, ground(cx, cy) + (h.type === 'villa' ? 9.5 : 6.5), cy * SC);
      m.add(lab);
      playerHouses.set(h.id, m);
    }
  }

  // ---------- פלפלים ----------
  const pepperMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: '#e3241b', emissive: '#5a0500' }), 200);
  pepperMesh.castShadow = true;
  pepperMesh.count = 0;
  scene.add(pepperMesh);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1.35, 1), tmpV = new THREE.Vector3();

  // ---------- ארגזי כלים ----------
  const boxMeshes = new Map();
  for (const tb of M.toolboxes) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(GEO.box, mat('#c0392b')); b.scale.set(1.0, 0.5, 0.55); b.position.y = 0.25; b.castShadow = true;
    const h = new THREE.Mesh(GEO.box, mat('#333')); h.scale.set(0.5, 0.08, 0.1); h.position.y = 0.6;
    g.add(b, h);
    const lab = makeLabel('🧰', { size: 80, height: 1.2 }); lab.position.y = 1.2; g.add(lab);
    const [x, y, z] = W3(tb.x, tb.y); g.position.set(x, y, z);
    scene.add(g);
    boxMeshes.set(tb.id, g);
  }

  // ---------- סמנים ----------
  const interactLabels = new Map();
  for (const it of M.interacts) {
    const s = makeLabel(it.label, { size: 60, color: '#3b2412', bg: 'rgba(255,248,234,.95)', border: '#d9a35b', height: 0.85 });
    const [x, y, z] = W3(it.x, it.y);
    s.position.set(x, y + 2.6, z);
    s.userData = { base: y + 2.6, it };
    scene.add(s);
    interactLabels.set(it.id, s);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.18, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.6, 16), new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#7a5a00' }));
  arrow.rotation.x = Math.PI;
  scene.add(beam, arrow);
  const rings = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 10, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', fog: false }));
    scene.add(m);
    return m;
  });
  const flagCps = [0, 1].map(() => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(GEO.cyl8, mat('#5b3a1e')); pole.scale.set(0.06, 4, 0.06); pole.position.y = 2; g.add(pole);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshLambertMaterial({ color: '#e74c3c', side: THREE.DoubleSide })); cl.position.set(0.8, 3.4, 0); g.add(cl);
    g.userData.cloth = cl;
    scene.add(g);
    return g;
  });

  // ---------- ישויות ----------
  const vMeshes = new Map();
  const people = new Map();      // key -> person mesh
  const nameTags = new Map();
  function personFor(key, o) {
    let p = people.get(key);
    if (!p) { p = makePerson(o); scene.add(p); people.set(key, p); }
    if (o.hat !== undefined) setHat(p, o.hat);
    p.userData.seen = frameNo;
    return p;
  }
  function tagFor(key, text, color) {
    let t = nameTags.get(key);
    if (!t || t.userData.text !== text) {
      if (t) scene.remove(t);
      t = makeLabel(text, { size: 60, color: color || '#fff', stroke: 'rgba(40,20,5,.8)', height: 0.55, renderOrder: 8 });
      t.userData.text = text;
      scene.add(t); nameTags.set(key, t);
    }
    t.userData.seen = frameNo;
    return t;
  }
  let frameNo = 0;

  // חיות
  const animals = [];
  for (const h of M.ANIMALS) {
    for (let k = 0; k < h.n; k++) {
      const m = makeAnimal(h.kind);
      scene.add(m);
      animals.push({ m, kind: h.kind, hx: h.x, hy: h.y, x: h.x + (Math.random() - 0.5) * 200, y: h.y + (Math.random() - 0.5) * 200, a: Math.random() * 6, sp: 0, t: Math.random() * 9, tx: h.x, ty: h.y, wait: Math.random() * 3, town: h.town, ringT: Math.random() * 6.28 });
    }
  }
  // ציפורים
  const birds = [];
  const wingGeo = new THREE.PlaneGeometry(0.9, 0.3);
  for (let f = 0; f < 4; f++) for (let k = 0; k < 5; k++) {
    const b = new THREE.Group();
    for (const s of [-1, 1]) { const w = new THREE.Mesh(wingGeo, mat('#2b2b2b', { side: THREE.DoubleSide })); w.position.z = s * 0.45; w.rotation.x = Math.PI / 2; b.add(w); }
    scene.add(b);
    birds.push({ b, f, k, cx: 800 + f * 1500, cy: 1500 + f * 1600, r: 700 + f * 150 });
  }
  // תושבי המושב
  const villagers = [];
  for (let i = 0; i < 40; i++) {
    const kid = i % 3 === 0, female = i % 2 === 1;
    const m = makePerson({ color: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#ecf0f1', '#16a085'][i % 8], kid, female, hair: ['#2b1b10', '#4a2c17', '#7a5230', '#111'][i % 4], skin: ['#f2c29b', '#e0ac69', '#c68642', '#f5d0b0'][i % 4] });
    m.visible = false; scene.add(m);
    const ring = i % 3 === 0 ? M.IN : M.OUT;
    villagers.push({ m, ring, t: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1, sp: 0.6 + Math.random() * 0.6, off: (Math.random() < 0.5 ? -1 : 1) * 38, pause: 0, wt: Math.random() * 9 });
  }

  // ---------- חלקיקי אבק ----------
  const PN = 700;
  const pPos = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN), pCol = new Float32Array(PN * 3);
  const pData = Array.from({ length: PN }, () => ({ life: 0, max: 0 }));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
      void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (420.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, r)); }`,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;
  function spawn(x, y, z, vx, vy, vz, size, life, color, alpha) {
    const i = pNext; pNext = (pNext + 1) % PN;
    const d = pData[i];
    Object.assign(d, { x, y, z, vx, vy, vz, size, life: 0, max: life, a: alpha == null ? 0.55 : alpha, grav: false });
    const c = new THREE.Color(color || '#d9bd8e');
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
  }
  function updateParticles(dt) {
    for (let i = 0; i < PN; i++) {
      const d = pData[i];
      if (d.life >= d.max) { pAlpha[i] = 0; continue; }
      d.life += dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.vx *= 0.96; d.vz *= 0.96; d.vy = d.vy * 0.96 + (d.grav ? -9 * dt : 0.3 * dt);
      const k = d.life / d.max;
      pPos[i * 3] = d.x; pPos[i * 3 + 1] = d.y; pPos[i * 3 + 2] = d.z;
      pSize[i] = d.size * (0.5 + k * 1.6);
      pAlpha[i] = d.a * (1 - k);
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.size.needsUpdate = true; pGeo.attributes.alpha.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  function puff(x, y, n, color, size) {
    const [X, Y, Z] = W3(x, y);
    for (let k = 0; k < (n || 20); k++) {
      const a = Math.random() * 6.28, s = 2 + Math.random() * 5;
      spawn(X, Y + 0.5 + Math.random() * 2, Z, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, size || 3, 1.4 + Math.random(), color || '#e8d6b0', 0.6);
    }
  }
  function confetti(x, y, n) {
    const [X, Y, Z] = W3(x, y);
    const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ff6fb5'];
    for (let k = 0; k < (n || 60); k++) {
      const a = Math.random() * 6.28, s = 2 + Math.random() * 6;
      spawn(X, Y + 2, Z, Math.cos(a) * s, 6 + Math.random() * 6, Math.sin(a) * s, 0.35, 2 + Math.random(), cols[k % 6], 1);
      pData[(pNext + PN - 1) % PN].grav = true;
    }
  }

  // ---------- מצלמה ----------
  const cam = { yaw: 0, pitch: 0.32, dist: 7, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, fov: 62, shake: 0 };

  function vehicleY(v) {
    if (v.Y != null) return v.Y;
    return ground(v.x, v.y) + (v.h || 0);
  }

  function setFoundedVisual() {
    paintGround();
    syncPlanned();
    buildMazor(G.mazor.stage);
    mazorStage = G.mazor.stage;
  }

  // ---------- עדכון ----------
  function update(dt, now) {
    frameNo++;
    const founded = G.founded;
    const fT = G.foundT;
    // הופעת עין יהב
    for (const k of eyGroups) {
      const ring = +k.slice(2);
      let s = founded ? 1 : 0;
      if (founded && fT != null) s = clamp((now - fT - 2200 - ring * 700) / 900, 0, 1);
      for (const m of staticGroups.get(k)) {
        m.visible = s > 0;
        if (s > 0 && s < 1) { m.scale.set(1, Math.max(0.01, easeOutBack(s)), 1); m.updateMatrix(); }
        else if (s >= 1 && m.scale.y !== 1) { m.scale.set(1, 1, 1); m.updateMatrix(); }
      }
    }
    for (const s of signs) if (s.userData.town === 'ey') s.visible = founded && (fT == null || now - fT > 5500);
    for (const l of labelObjs) if (l.userData.town === 'ey') l.visible = founded && (fT == null || now - fT > 5000);
    foundFlag.visible = !founded;
    for (const m of eyExtra) m.visible = founded && (fT == null || now - fT > 3000);
    if (mazorStage !== G.mazor.stage) { buildMazor(G.mazor.stage); if (mazorStage >= 0) { puff(M.MAZOR.x + 80, M.MAZOR.y + 60, 40); } mazorStage = G.mazor.stage; }
    mazorGroup.visible = founded && (fT == null || now - fT > 4000);
    // בתים
    syncPlanned();
    syncPlayerHouses();
    for (const m of [...plannedMeshes.values(), ...playerHouses.values()]) {
      if (!m.userData.born) continue;
      const k = clamp((now - m.userData.born) / 2500, 0, 1);
      m.scale.set(1, Math.max(0.02, easeOutBack(k)), 1);
      m.position.y = m.userData.base * (1 - m.scale.y);
      if (k >= 1) { m.userData.born = 0; m.scale.set(1, 1, 1); m.position.y = 0; }
    }
    // פלפלים
    let pi = 0;
    for (const p of G.peppers.values()) {
      if (p.town === 'ey' && !founded) continue;
      if (pi >= 200) break;
      const bob = Math.sin(now / 300 + p.x) * 0.12;
      tmpV.set(p.x * SC, ground(p.x, p.y) + 0.95 + bob, p.y * SC);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), now / 600 + p.x);
      tmpM.compose(tmpV, tmpQ, tmpS);
      pepperMesh.setMatrixAt(pi++, tmpM);
    }
    pepperMesh.count = pi;
    pepperMesh.instanceMatrix.needsUpdate = true;
    // ארגזים
    for (const [id, g] of boxMeshes) { g.visible = !(G.acct.boxes || {})[id]; g.rotation.y = now / 1500; }
    // סמני מקומות
    for (const s of interactLabels.values()) {
      const it = s.userData.it;
      const vis = (it.town !== 'ey' || founded) && Math.hypot(it.x - G.me.x, it.y - G.me.y) < 900 && !G.race;
      s.visible = vis;
      if (!vis) continue;
      const near = G.nearInteract === it;
      s.position.y = s.userData.base + Math.sin(now / 350 + it.x) * 0.15;
      const k = near ? 1.25 : 1;
      s.material.opacity = near ? 1 : 0.9;
      s.scale.set(s.userData.w0 = s.userData.w0 || s.scale.x, 0.85, 1);
      s.scale.x = s.userData.w0 * k; s.scale.y = 0.85 * k;
    }
    // יעד המשימה
    const tgt = G.race ? null : G.questTarget;
    beam.visible = arrow.visible = !!tgt;
    if (tgt) {
      const [x, y, z] = W3(tgt.x, tgt.y);
      beam.position.set(x, y + 60, z);
      arrow.position.set(x, y + 7 + Math.abs(Math.sin(now / 300)) * 1.6, z);
      arrow.rotation.y = now / 600;
    }
    // נקודות מרוץ
    const R = G.race;
    rings.forEach((r) => (r.visible = false)); flagCps.forEach((f) => (f.visible = false));
    if (R && R.cps) {
      for (let k = 0; k < 2; k++) {
        const c = R.cps[R.idx + k];
        if (!c) continue;
        const prev = R.cps[R.idx + k - 1] || R.def.start;
        const ang = Math.atan2(c.y - prev.y, c.x - prev.x);
        const [x, y, z] = W3(c.x, c.y);
        if (R.def.id === 'youth' && R.idx + k < R.cps.length - 1) {
          const f = flagCps[k]; f.visible = true; f.position.set(x, y, z);
          f.userData.cloth.material.color.set(['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'][(R.idx + k) % 5]);
          f.userData.cloth.rotation.y = Math.sin(now / 200) * 0.3;
          f.scale.setScalar(k ? 0.8 : 1);
        } else {
          const r = rings[k]; r.visible = true;
          const big = R.mode === 'foot' || R.mode === 'swim' ? 0.55 : 1;
          r.scale.setScalar(big * (k ? 0.85 : 1 + Math.sin(now / 160) * 0.05));
          r.position.set(x, y + 5 * big, z);
          r.rotation.set(0, -ang + Math.PI / 2, 0);
          r.material.color.set(R.idx + k === R.cps.length - 1 ? '#ffffff' : k ? '#ffffff' : '#ffd23f');
          r.material.opacity = k ? 0.5 : 1; r.material.transparent = !!k;
        }
      }
    }
    // דגלים מתנופפים
    for (const f of flags) {
      const p = f.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 2.5 + now / 180) * 0.15 * (x + 1.3)); }
      p.needsUpdate = true;
    }

    // ---------- כלי רכב ----------
    const seenV = new Set();
    for (const v of G.vehicles.values()) {
      seenV.add(v.id);
      let m = vMeshes.get(v.id);
      if (!m || m.userData.color !== v.color) {
        if (m) scene.remove(m);
        m = makeVehicle(v.type, v.color);
        m.userData.color = v.color;
        scene.add(m); vMeshes.set(v.id, m);
      }
      const near = Math.abs(v.x - G.me.x) < 4000 && Math.abs(v.y - G.me.y) < 4000;
      m.visible = near;
      if (!near) continue;
      const Y = vehicleY(v);
      m.position.set(v.x * SC, Y, v.y * SC);
      // הטיה לפי השטח
      if (v.pitch == null || v.id !== G.me.vid) {
        const S = M.VEHICLES[v.type];
        const L = S.len / SC / 2, Wd = Math.max(S.wid, 0.8) / SC / 2;
        const ca = Math.cos(v.a), sa = Math.sin(v.a);
        const hf = ground(v.x + ca * L, v.y + sa * L), hb = ground(v.x - ca * L, v.y - sa * L);
        const hl = ground(v.x - sa * Wd, v.y + ca * Wd), hr = ground(v.x + sa * Wd, v.y - ca * Wd);
        const tp = (v.h || 0) > 0.3 ? 0.15 : Math.atan2(hf - hb, S.len);
        v._pitch = (v._pitch || 0) + (tp - (v._pitch || 0)) * 0.2;
        v._roll = (v._roll || 0) + (Math.atan2(hl - hr, Math.max(S.wid, 0.8)) - (v._roll || 0)) * 0.2;
      } else { v._pitch = v.pitch; v._roll = v.roll; }
      m.rotation.set(0, 0, 0);
      m.rotateY(-v.a);
      m.rotateZ(v._pitch || 0);
      m.rotateX((v._roll || 0) + (v.lean || 0));
      const spin = (v.odo || 0) * SC;
      for (const w of m.userData.wheels) w.rotation.z = -spin / 0.4;
      // רוכבים
      const riders = [v.driver, ...(v.pass || [])];
      riders.forEach((id, i) => {
        if (!id) return;
        const info = id === G.myId ? { color: G.myColor, hat: G.acct.hat } : G.others.get(id);
        if (!info) return;
        const p = personFor('p:' + id, { color: info.color, hat: (v.type !== 'jeep' && v.type !== 'tractor' && !info.hat) ? 'helmet' : info.hat });
        const seat = m.userData.seats[i] || m.userData.seats[m.userData.seats.length - 1];
        if (p.parent !== m.userData.body) m.userData.body.add(p);
        p.position.set(seat[0] - 0.05, seat[1] - 0.45, seat[2] || 0);
        p.rotation.set(0, 0, 0);
        posePerson(p, 'sit', now / 1000, 0);
      });
      // משפחה בג'יפ
      if (v.type === 'jeep') {
        for (const [pid, fam] of G.families) {
          if (!fam.inVehicle || fam.inVehicle !== v.id) continue;
          fam.members.forEach((f, i) => {
            const seatIdx = 1 + i + (v.pass || []).length;
            const seat = m.userData.seats[seatIdx];
            const p = personFor('f:' + pid + ':' + i, f.look);
            if (!seat) { p.visible = false; return; }
            p.visible = true;
            if (p.parent !== m.userData.body) m.userData.body.add(p);
            p.position.set(seat[0] - 0.05, seat[1] - 0.45, seat[2] || 0);
            p.rotation.set(0, 0, 0);
            posePerson(p, 'sit', now / 1000, 0);
          });
        }
      }
      // שם הנהג
      if (v.driver) {
        const nm = v.driver === G.myId ? G.myName : (G.others.get(v.driver) || {}).name;
        if (nm) { const t = tagFor('v:' + v.id, nm + ((v.pass || []).length ? ' +' + v.pass.length : ''), v.driver === G.myId ? '#ffd23f' : '#fff'); t.position.set(v.x * SC, Y + 3.2, v.y * SC); }
      } else if (v.owner && !v.temp && Math.hypot(v.x - G.me.x, v.y - G.me.y) < 300) {
        const t = tagFor('v:' + v.id, v.ownerAid === G.acct.aid ? 'שלך' : v.owner, '#f5e6c8'); t.position.set(v.x * SC, Y + 2.4, v.y * SC);
      }
    }
    for (const [id, m] of vMeshes) if (!seenV.has(id)) { scene.remove(m); vMeshes.delete(id); }

    // ---------- הולכי רגל ----------
    const walkers = [];
    if (G.playing && !G.me.vid) walkers.push({ key: 'p:' + G.myId, o: G.me, look: { color: G.myColor, hat: G.acct.hat }, name: G.myName, me: true });
    for (const o of G.others.values()) if (!o.vid) walkers.push({ key: 'p:' + o.id, o, look: { color: o.color, hat: o.hat }, name: o.name });
    for (const w of walkers) {
      const p = personFor(w.key, w.look);
      if (p.parent !== scene) scene.add(p);
      p.visible = true;
      const o = w.o;
      const gy = ground(o.x, o.y);
      p.position.set(o.x * SC, gy, o.y * SC);
      p.rotation.set(0, -o.a, 0);
      posePerson(p, o.sw ? 'swim' : o.mv ? 'walk' : 'idle', now / 1000, o.mv ? 1 : 0);
      const t = tagFor('n:' + w.key, w.name, w.me ? '#ffd23f' : '#fff');
      t.position.set(o.x * SC, gy + 2.15, o.y * SC);
    }
    // משפחות (אישה וילדים) — הולכים אחרי השחקן
    for (const [pid, fam] of G.families) {
      fam.members.forEach((f, i) => {
        const key = 'f:' + pid + ':' + i;
        if (fam.inVehicle || f.hidden) return;
        const p = personFor(key, f.look);
        if (p.parent !== scene) scene.add(p);
        p.visible = true;
        const gy = ground(f.x, f.y);
        p.position.set(f.x * SC, gy, f.y * SC);
        p.rotation.set(0, -f.a, 0);
        posePerson(p, f.sw ? 'swim' : f.mv ? 'walk' : f.wave ? 'wave' : 'idle', now / 1000 + i, f.mv ? 1 : 0);
      });
    }
    for (const [k, p] of people) if (p.userData.seen !== frameNo) { if (p.parent) p.parent.remove(p); people.delete(k); }
    for (const [k, t] of nameTags) if (t.userData.seen !== frameNo) { scene.remove(t); nameTags.delete(k); }

    updateAnimals(dt, now);
    updateParticles(dt);
  }

  function updateAnimals(dt, now) {
    const threats = [G.me, ...G.others.values()];
    for (const A of animals) {
      const far = Math.abs(A.x - G.me.x) > 3500 || Math.abs(A.y - G.me.y) > 3500;
      A.m.visible = !far && (A.town !== 'ey' || G.founded);
      if (far) continue;
      A.t += dt;
      let fx = 0, fy = 0, flee = false, want = 0, ta = A.a;
      if (A.kind === 'dog') {
        A.ringT += dt * 0.05 * (A.m.id % 2 ? 1 : -1);
        A.tx = M.EY.x + Math.cos(A.ringT) * (M.IN.rx + 40); A.ty = M.EY.y + Math.sin(A.ringT) * (M.IN.ry + 40);
        const d = Math.hypot(A.tx - A.x, A.ty - A.y);
        if (d > 8) { ta = Math.atan2(A.ty - A.y, A.tx - A.x); want = 22; }
      } else {
        for (const p of threats) {
          const d = Math.hypot(A.x - p.x, A.y - p.y);
          const fear = A.kind === 'camel' ? 90 : 260;
          if (d < fear && d > 0.1) { fx += (A.x - p.x) / d; fy += (A.y - p.y) / d; flee = true; }
        }
        if (flee) { ta = Math.atan2(fy, fx); want = A.kind === 'camel' ? 50 : 150; A.wait = 2; }
        else {
          A.wait -= dt;
          if (A.wait <= 0) { A.tx = A.hx + (Math.random() - 0.5) * 600; A.ty = A.hy + (Math.random() - 0.5) * 600; A.wait = 4 + Math.random() * 7; }
          if (Math.hypot(A.tx - A.x, A.ty - A.y) > 15) { ta = Math.atan2(A.ty - A.y, A.tx - A.x); want = A.kind === 'camel' ? 12 : 22; }
        }
      }
      let d = ta - A.a; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
      A.a += d * Math.min(1, dt * 4);
      A.sp += (want - A.sp) * Math.min(1, dt * 3);
      const nx = A.x + Math.cos(A.a) * A.sp * dt, ny = A.y + Math.sin(A.a) * A.sp * dt;
      if (!M.collides(nx, ny, 8, null, null) && (A.kind === 'dog' || !M.townAt(nx, ny))) { A.x = nx; A.y = ny; } else { A.a += 1.5; }
      if (Math.hypot(A.x - A.hx, A.y - A.hy) > 1000 && A.kind !== 'dog') { A.tx = A.hx; A.ty = A.hy; }
      A.m.position.set(A.x * SC, ground(A.x, A.y), A.y * SC);
      A.m.rotation.y = -A.a;
      poseAnimal(A.m, A.t, A.sp * SC);
    }
    for (const b of birds) {
      const t = now / 1000 * 0.05 + b.f * 1.7;
      const bx = b.cx + Math.cos(t) * b.r - Math.sin(t) * b.k * 18, by = b.cy + Math.sin(t) * b.r + Math.cos(t) * (b.k % 2 ? 1 : -1) * b.k * 14;
      b.b.position.set(bx * SC, 38 + b.f * 6 + Math.sin(now / 700 + b.k) * 1.5, by * SC);
      b.b.rotation.set(0, -t - Math.PI / 2, 0);
      const fl = Math.sin(now / 90 + b.k) * 0.6;
      b.b.children[0].rotation.set(Math.PI / 2 + fl, 0, 0); b.b.children[1].rotation.set(Math.PI / 2 - fl, 0, 0);
    }
    // תושבים
    const n = G.founded ? Math.min(villagers.length, Math.round((G.moshav.families || 0) * 1.6) + 6) : 0;
    villagers.forEach((V, i) => {
      V.m.visible = i < n && Math.hypot(G.me.x - M.EY.x, G.me.y - M.EY.y) < 2600;
      if (!V.m.visible) return;
      V.wt += dt;
      if (V.pause > 0) { V.pause -= dt; posePerson(V.m, i % 5 === 0 ? 'wave' : 'idle', V.wt, 0); }
      else {
        V.t += V.dir * V.sp * dt / Math.max(V.ring.rx, V.ring.ry) * 6;
        if (Math.random() < dt * 0.05) V.pause = 2 + Math.random() * 4;
        posePerson(V.m, 'walk', V.wt, 0.6);
      }
      const rx = V.ring.rx + V.off, ry = V.ring.ry + V.off * V.ring.ry / V.ring.rx;
      const x = M.EY.x + Math.cos(V.t) * rx, y = M.EY.y + Math.sin(V.t) * ry;
      const tx = -Math.sin(V.t) * rx * V.dir, ty = Math.cos(V.t) * ry * V.dir;
      V.m.position.set(x * SC, ground(x, y), y * SC);
      V.m.rotation.y = -Math.atan2(ty, tx);
    });
  }

  // ---------- מצלמה ומסגור ----------
  const sunOff = SUN_DIR.clone().multiplyScalar(150);
  function updateCamera(dt, now, target) {
    // target: {x, y, Y, a, speed, inVehicle}
    const C = G.cine;
    let px = target.x * SC, pz = target.y * SC, py = target.Y;
    let wantYaw = -target.a, dist = target.inVehicle ? 8.5 + Math.min(4, target.speed / 25) : 5.2, height = target.inVehicle ? 2.9 : 2.2;
    let lookH = target.inVehicle ? 1.4 : 1.5;
    if (C && C.zoom) {
      const e = now - C.t0;
      const k = Math.min(1, e / 1800) * Math.min(1, (C.dur - e) / 1800);
      const ex = M.EY.x * SC, ez = M.EY.y * SC, ey = ground(M.EY.x, M.EY.y);
      px += (ex - px) * k; pz += (ez - pz) * k; py += (ey - py) * k;
      dist += 120 * k; height += 75 * k; lookH += 0 * k;
      wantYaw += (e / 1000) * 0.18 * k;
    }
    if (!cam.init) { cam.yaw = wantYaw; cam.init = true; }
    let d = wantYaw - cam.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
    const follow = target.inVehicle ? 3.2 : (target.moving ? 2.2 : 0.4);
    cam.yaw += d * Math.min(1, dt * follow);
    const fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw);
    const want = new THREE.Vector3(px - fx * dist, py + height, pz + fz * dist);
    const gh = ground(want.x / SC, want.z / SC) + 1.2;
    if (want.y < gh) want.y = gh;
    if (!cam.posInit) { cam.pos.copy(want); cam.posInit = true; }
    cam.pos.lerp(want, Math.min(1, dt * (C && C.zoom ? 2 : 6)));
    cam.look.lerp(new THREE.Vector3(px, py + lookH, pz), Math.min(1, dt * 10));
    camera.position.copy(cam.pos);
    if (cam.shake > 0) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake = Math.max(0, cam.shake - dt * 2); }
    camera.lookAt(cam.look);
    const fovWant = 62 + (target.inVehicle ? Math.min(14, target.speed / 4) : 0);
    cam.fov += (fovWant - cam.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    // שמש וצללים עוקבים
    sun.target.position.set(px, py, pz);
    sun.position.set(px + sunOff.x, py + sunOff.y, pz + sunOff.z);
    sky.position.copy(camera.position);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function render() { renderer.render(scene, camera); }
  const _v = new THREE.Vector3();
  function project(x, y, up) {
    _v.set(x * SC, ground(x, y) + (up || 0), y * SC).project(camera);
    return { x: (_v.x + 1) / 2, y: (1 - _v.y) / 2, behind: _v.z > 1 };
  }
  function camYaw() { return cam.yaw; }

  buildMazor(G.mazor.stage);
  mazorStage = G.mazor.stage;

  return {
    renderer, scene, camera, update, updateCamera, render, resize, project, camYaw, puff, confetti, spawn,
    groundCanvas, repaint: setFoundedVisual, shake: (s) => { cam.shake = Math.max(cam.shake, s); },
  };
}
