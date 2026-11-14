// מודלים תלת־ממדיים: אנשים, כלי רכב, חיות, בתים, עצים וסלעים
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const lam = new Map();
export function mat(color, opts) {
  const key = color + JSON.stringify(opts || {});
  if (!lam.has(key)) lam.set(key, new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {})));
  return lam.get(key);
}
export const VC = new THREE.MeshLambertMaterial({ vertexColors: true });
export const VC_GLASS = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });

// ---------- אוסף גיאומטריות למיזוג (פחות קריאות ציור = משחק מהיר) ----------
export class Batch {
  constructor() { this.parts = []; }
  add(geo, color, x, y, z, rx, ry, rz, sx, sy, sz) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x || 0, y || 0, z || 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')),
      new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return g;
  }
  addMatrix(geo, color, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
  }
  build(material, shadows) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material || VC);
    m.castShadow = shadows !== false; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }
}

// ---------- גיאומטריות בסיס ----------
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sph: new THREE.SphereGeometry(1, 16, 12),
  sphLo: new THREE.SphereGeometry(1, 9, 7),
  ico: new THREE.IcosahedronGeometry(1, 1),
  ico0: new THREE.IcosahedronGeometry(1, 0),
  cap: new THREE.CapsuleGeometry(1, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.28, 8, 18),
  halfCyl: new THREE.CylinderGeometry(1, 1, 1, 14, 1, true, 0, Math.PI),
};
// מנסרה משולשת לגג רעפים (ציר ארוך לאורך X)
export function prismGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
}
G.prism = prismGeo();

// ---------- אנשים ----------
const SKIN = ['#f2c29b', '#e0ac69', '#c68642', '#f5d0b0'];
export function makePerson(o) {
  o = o || {};
  const g = new THREE.Group();
  const s = o.kid ? 0.62 : 1;
  const shirt = mat(o.color || '#3498db');
  const pants = mat(o.pants || (o.female ? '#8e44ad' : '#34495e'));
  const skin = mat(o.skin || SKIN[0]);
  const hair = mat(o.hair || '#4a2c17');
  const body = new THREE.Group(); body.scale.setScalar(s); g.add(body);
  const mk = (geo, m, x, y, z, sx, sy, sz) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); me.castShadow = true; return me; };
  // רגליים
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0, 0.92, side * 0.11); body.add(hip);
    hip.add(mk(G.cap, pants, 0, -0.42, 0, 0.085, 0.36, 0.085));
    hip.add(mk(G.sphLo, mat('#2b2b2b'), 0.05, -0.86, 0, 0.13, 0.07, 0.09));
    legs.push(hip);
  }
  // גוף
  body.add(mk(G.cap, shirt, 0, 1.23, 0, 0.19, 0.25, 0.22));
  if (o.female) body.add(mk(G.cone, shirt, 0, 0.98, 0, 0.27, 0.35, 0.27));
  // ידיים
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0, 1.45, side * 0.26); body.add(sh);
    sh.add(mk(G.cap, shirt, 0, -0.14, 0, 0.065, 0.12, 0.065));
    sh.add(mk(G.cap, skin, 0, -0.42, 0, 0.055, 0.14, 0.055));
    arms.push(sh);
  }
  // ראש
  const head = new THREE.Group(); head.position.set(0, 1.68, 0); body.add(head);
  head.add(mk(G.sph, skin, 0, 0, 0, 0.14, 0.155, 0.14));
  head.add(mk(G.sph, hair, -0.02, 0.04, 0, 0.145, 0.13, 0.148));
  if (o.female) head.add(mk(G.cap, hair, -0.09, -0.16, 0, 0.09, 0.15, 0.11));
  head.add(mk(G.sphLo, mat('#222'), 0.13, 0.02, -0.05, 0.02, 0.025, 0.02));
  head.add(mk(G.sphLo, mat('#222'), 0.13, 0.02, 0.05, 0.02, 0.025, 0.02));
  const hatG = new THREE.Group(); head.add(hatG);
  g.userData = { legs, arms, body, head, hatG, hat: null, s };
  setHat(g, o.hat);
  return g;
}
export function setHat(p, hat) {
  const u = p.userData;
  if (u.hat === hat) return;
  u.hat = hat;
  u.hatG.clear();
  if (!hat) return;
  const add = (geo, color, x, y, z, sx, sy, sz, rz) => { const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (rz) m.rotation.z = rz; u.hatG.add(m); };
  if (hat === 'cap') { add(G.sph, '#c0392b', 0, 0.06, 0, 0.15, 0.1, 0.15); add(G.cyl, '#922b21', 0.12, 0.06, 0, 0.12, 0.012, 0.11); }
  else if (hat === 'sun') { add(G.cyl, '#d4bd85', 0, 0.09, 0, 0.27, 0.015, 0.27); add(G.sph, '#c4ab70', 0, 0.1, 0, 0.15, 0.11, 0.15); }
  else if (hat === 'cowboy') { add(G.cyl, '#8b5a2b', 0, 0.09, 0, 0.3, 0.02, 0.26); add(G.cyl, '#6e4420', 0, 0.17, 0, 0.13, 0.15, 0.13); add(G.cyl, '#3d2412', 0, 0.12, 0, 0.135, 0.03, 0.135); }
  else if (hat === 'helmet') { add(G.sph, '#e74c3c', 0, 0.03, 0, 0.19, 0.19, 0.19); add(G.box, '#222', 0.16, 0, 0, 0.06, 0.08, 0.22); add(G.box, '#f1c40f', 0.12, 0.1, 0, 0.18, 0.03, 0.1, -0.3); }
}
// תנוחות: הליכה, עמידה, ישיבה, שחייה
export function posePerson(p, mode, t, speed) {
  const u = p.userData;
  const sw = mode === 'walk' ? Math.sin(t * 9) * Math.min(1, speed) * 0.7 : 0;
  u.body.rotation.set(0, 0, 0); u.body.position.y = 0;
  if (mode === 'sit') {
    u.legs.forEach((l) => { l.rotation.z = 1.35; });
    u.arms.forEach((a) => { a.rotation.z = 1.0; });
    u.body.position.y = -0.55 * u.s;
  } else if (mode === 'swim') {
    u.body.rotation.z = -1.35; u.body.position.y = -1.25 * u.s;
    u.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 10 + i * 3) * 0.3; });
    u.arms.forEach((a, i) => { a.rotation.z = (t * 5 + i * Math.PI) % (Math.PI * 2); });
  } else {
    u.legs[0].rotation.z = sw; u.legs[1].rotation.z = -sw;
    u.arms[0].rotation.z = -sw * 0.8; u.arms[1].rotation.z = sw * 0.8;
    if (mode === 'walk') u.body.position.y = Math.abs(Math.sin(t * 9)) * 0.05 * Math.min(1, speed);
    if (mode === 'wave') { u.arms[1].rotation.x = -2.6 + Math.sin(t * 8) * 0.3; }
    else u.arms[1].rotation.x = 0;
  }
}

// ---------- כלי רכב (פונים לכיוון X+) ----------
function wheel(group, r, w, x, z, y, color, knobby) {
  const wg = new THREE.Group(); wg.position.set(x, y == null ? r : y, z); group.add(wg);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), mat('#1d1d1d'));
  tire.rotation.x = Math.PI / 2; tire.castShadow = true; wg.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.04, 10), mat(color || '#bdc3c7'));
  rim.rotation.x = Math.PI / 2; wg.add(rim);
  if (knobby) {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      const kb = new THREE.Mesh(G.box, mat('#2a2a2a'));
      kb.scale.set(r * 0.18, r * 0.12, w * 1.05); kb.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); kb.rotation.z = a;
      wg.add(kb);
    }
  }
  const spoke = new THREE.Mesh(G.box, mat('#7f8c8d')); spoke.scale.set(r * 1.05, r * 0.12, w * 1.08); wg.add(spoke);
  return wg;
}
function part(group, geo, color, x, y, z, sx, sy, sz, rx, ry, rz) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx || 0, ry || 0, rz || 0);
  m.castShadow = true; group.add(m);
  return m;
}
const DEF = { bike: '#16a085', dirtbike: '#e67e22', moto: '#2980b9', atv: '#c0392b', jeep: '#3d7a3a', tractor: '#27ae60' };
export function makeVehicle(type, color) {
  const c = color && color !== '#ffffff' ? color : (color ? '#dfe6e9' : DEF[type]);
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const wheels = [], seats = [];
  if (type === 'dirtbike' || type === 'moto') {
    const dirt = type === 'dirtbike';
    const r = dirt ? 0.36 : 0.32;
    wheels.push(wheel(body, r, dirt ? 0.12 : 0.16, 0.72, 0, null, '#95a5a6', dirt), wheel(body, r, dirt ? 0.14 : 0.18, -0.68, 0, null, '#95a5a6', dirt));
    part(body, G.cyl8, '#7f8c8d', 0.62, r + 0.38, 0, 0.035, 0.85, 0.035, 0, 0, -0.38);
    part(body, G.cyl8, '#555', 0.5, r + 0.85, 0, 0.025, 0.6, 0.025, Math.PI / 2, 0, 0);
    if (dirt) {
      part(body, G.cap, c, 0.15, r + 0.55, 0, 0.17, 0.35, 0.16, 0, 0, Math.PI / 2 - 0.12);
      part(body, G.cap, '#222', -0.3, r + 0.58, 0, 0.11, 0.35, 0.13, 0, 0, Math.PI / 2 + 0.05);
      part(body, G.box, '#f5f5f5', 0.82, r + 0.28, 0, 0.36, 0.035, 0.14, 0, 0, -0.25);
      part(body, G.box, c, -0.82, r + 0.48, 0, 0.5, 0.04, 0.16, 0, 0, 0.35);
      part(body, G.box, '#f5f5f5', 0.66, r + 0.72, 0, 0.04, 0.22, 0.22, 0, 0, -0.3);
      part(body, G.cyl8, '#666', -0.25, r + 0.22, 0.13, 0.04, 0.6, 0.04, 0, 0, Math.PI / 2 - 0.3);
      part(body, G.box, '#2c3e50', -0.05, r + 0.25, 0, 0.42, 0.25, 0.16);
    } else {
      part(body, G.sph, c, 0.3, r + 0.5, 0, 0.6, 0.28, 0.22);
      part(body, G.cap, '#222', -0.35, r + 0.52, 0, 0.12, 0.3, 0.14, 0, 0, Math.PI / 2);
      part(body, G.box, '#9fd6ef', 0.62, r + 0.72, 0, 0.04, 0.2, 0.24, 0, 0, -0.5);
      part(body, G.box, '#2c3e50', 0, r + 0.2, 0, 0.6, 0.25, 0.2);
    }
    part(body, G.sphLo, '#fff6a0', 0.78, r + 0.62, 0, 0.06, 0.06, 0.06);
    seats.push([-0.15, r + 0.5], [-0.55, r + 0.55]);
  } else if (type === 'bike') {
    wheels.push(wheel(body, 0.33, 0.05, 0.55, 0, null, '#ccc'), wheel(body, 0.33, 0.05, -0.52, 0, null, '#ccc'));
    part(body, G.cyl8, c, 0, 0.62, 0, 0.03, 0.85, 0.03, 0, 0, Math.PI / 2 - 0.1);
    part(body, G.cyl8, c, 0.15, 0.48, 0, 0.03, 0.75, 0.03, 0, 0, 0.9);
    part(body, G.cyl8, c, -0.3, 0.5, 0, 0.03, 0.45, 0.03, 0, 0, -0.5);
    part(body, G.cyl8, '#444', 0.48, 0.95, 0, 0.022, 0.5, 0.022, Math.PI / 2, 0, 0);
    part(body, G.cap, '#222', -0.15, 0.9, 0, 0.06, 0.12, 0.08, 0, 0, Math.PI / 2);
    seats.push([-0.2, 0.62]);
  } else if (type === 'atv') {
    for (const [x, z] of [[0.62, 0.52], [0.62, -0.52], [-0.6, 0.55], [-0.6, -0.55]]) wheels.push(wheel(body, 0.3, 0.26, x, z, null, '#7f8c8d', true));
    part(body, G.cap, c, 0.05, 0.62, 0, 0.32, 0.6, 0.38, 0, 0, Math.PI / 2);
    part(body, G.box, c, 0.65, 0.68, 0, 0.45, 0.12, 1.1);
    part(body, G.box, c, -0.62, 0.7, 0, 0.45, 0.12, 1.1);
    part(body, G.box, '#2c3e50', -0.15, 0.85, 0, 0.6, 0.1, 0.32);
    part(body, G.cyl8, '#555', 0.45, 1.0, 0, 0.025, 0.7, 0.025, Math.PI / 2, 0, 0);
    for (const z of [-0.4, 0.4]) part(body, G.cyl8, '#333', 0.66, 0.82, z, 0.02, 0.6, 0.02, 0, 0, Math.PI / 2);
    part(body, G.sphLo, '#fff6a0', 0.9, 0.72, 0.25, 0.06, 0.06, 0.06); part(body, G.sphLo, '#fff6a0', 0.9, 0.72, -0.25, 0.06, 0.06, 0.06);
    seats.push([-0.1, 0.85], [-0.5, 0.88]);
  } else if (type === 'jeep') {
    for (const [x, z] of [[1.35, 0.85], [1.35, -0.85], [-1.3, 0.85], [-1.3, -0.85]]) wheels.push(wheel(body, 0.45, 0.32, x, z, null, '#636e72', true));
    part(body, G.box, '#2d3436', 0, 0.55, 0, 3.9, 0.25, 1.5);
    part(body, G.box, c, 0, 0.95, 0, 3.8, 0.6, 1.7);
    part(body, G.box, c, 1.35, 1.27, 0, 1.15, 0.08, 1.6);
    part(body, G.box, '#2d3436', 1.95, 0.9, 0, 0.12, 0.5, 1.4);
    for (const z of [-0.55, 0.55]) part(body, G.sphLo, '#fff6a0', 1.95, 1.0, z, 0.1, 0.1, 0.1);
    part(body, G.box, '#aee1f5', 0.72, 1.65, 0, 0.05, 0.55, 1.55, 0, 0, -0.25, true).material = new THREE.MeshLambertMaterial({ color: '#aee1f5', transparent: true, opacity: 0.5 });
    for (const z of [-0.8, 0.8]) { part(body, G.cyl8, '#2d3436', -0.45, 1.75, z, 0.04, 0.9, 0.04); part(body, G.cyl8, '#2d3436', 0.15, 2.18, z, 0.04, 1.25, 0.04, 0, 0, Math.PI / 2); }
    part(body, G.cyl8, '#2d3436', -0.45, 2.2, 0, 0.04, 1.6, 0.04, Math.PI / 2, 0, 0);
    const spare = wheel(body, 0.4, 0.25, -2.02, 0, 1.1, '#636e72', true); spare.rotation.y = Math.PI / 2;
    for (const [x, z] of [[0.15, 0.4], [0.15, -0.4], [-0.9, 0.4], [-0.9, -0.4]]) part(body, G.box, '#3b3b3b', x, 1.32, z, 0.5, 0.15, 0.55);
    seats.push([0.15, 1.35, 0.4], [0.15, 1.35, -0.4], [-0.9, 1.35, 0.4], [-0.9, 1.35, -0.4]);
  } else if (type === 'tractor') {
    wheels.push(wheel(body, 0.78, 0.45, -0.8, 0.9, null, '#f1c40f', true), wheel(body, 0.78, 0.45, -0.8, -0.9, null, '#f1c40f', true));
    wheels.push(wheel(body, 0.42, 0.3, 1.25, 0.7, null, '#f1c40f', true), wheel(body, 0.42, 0.3, 1.25, -0.7, null, '#f1c40f', true));
    part(body, G.box, c, 0.75, 1.0, 0, 1.6, 0.7, 0.8);
    part(body, G.box, c, -0.6, 1.0, 0, 1.0, 0.5, 1.1);
    part(body, G.cyl8, '#333', 1.1, 1.7, 0.25, 0.05, 0.7, 0.05);
    for (const [x, z] of [[-0.25, 0.55], [-0.25, -0.55], [-1.05, 0.55], [-1.05, -0.55]]) part(body, G.cyl8, '#333', x, 1.9, z, 0.04, 1.6, 0.04);
    part(body, G.box, c, -0.65, 2.7, 0, 1.0, 0.08, 1.3);
    part(body, G.box, '#3b3b3b', -0.65, 1.35, 0, 0.45, 0.15, 0.45);
    seats.push([-0.65, 1.42], [-0.3, 1.42, 0.45]);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData = { wheels, seats, body, type };
  return g;
}

// ---------- חיות ----------
export function makeAnimal(kind) {
  const g = new THREE.Group();
  const legs = [];
  const add = (geo, color, x, y, z, sx, sy, sz, rx, ry, rz, parent) => part(parent || g, geo, color, x, y, z, sx, sy, sz, rx, ry, rz);
  const leg = (x, z, len, th, color) => {
    const hip = new THREE.Group(); hip.position.set(x, len, z); g.add(hip);
    add(G.cyl8, color, 0, -len / 2, 0, th, len, th, 0, 0, 0, hip);
    legs.push(hip);
  };
  if (kind === 'gazelle') {
    add(G.sph, '#c8955a', 0, 0.8, 0, 0.5, 0.24, 0.2);
    add(G.sph, '#f3e3cc', 0, 0.68, 0, 0.42, 0.12, 0.16);
    add(G.cyl8, '#c8955a', 0.45, 1.02, 0, 0.07, 0.4, 0.07, 0, 0, -0.6);
    add(G.sph, '#b07d48', 0.62, 1.2, 0, 0.16, 0.09, 0.08);
    for (const z of [-0.04, 0.04]) add(G.cone, '#2d1f12', 0.55, 1.38, z, 0.02, 0.28, 0.02, 0, 0, 0.35);
    add(G.cone, '#3d2a16', -0.5, 0.82, 0, 0.04, 0.18, 0.04, 0, 0, 1.4);
    for (const [x, z] of [[0.3, 0.1], [0.3, -0.1], [-0.3, 0.1], [-0.3, -0.1]]) leg(x, z, 0.62, 0.035, '#a87b4b');
  } else if (kind === 'ibex') {
    add(G.sph, '#7a5a3a', 0, 0.85, 0, 0.55, 0.3, 0.26);
    add(G.cyl8, '#7a5a3a', 0.5, 1.05, 0, 0.1, 0.35, 0.1, 0, 0, -0.7);
    add(G.sph, '#5d4227', 0.66, 1.22, 0, 0.17, 0.11, 0.1);
    add(G.cone, '#3b2a1a', 0.7, 1.05, 0, 0.04, 0.16, 0.04, 0, 0, 3.0);
    for (const z of [-0.06, 0.06]) { const h = add(new THREE.TorusGeometry(0.32, 0.035, 6, 12, Math.PI * 0.9), '#4a3b2a', 0.45, 1.35, z, 1, 1, 1, 0, 0, 0.6); h.rotation.y = 0; }
    for (const [x, z] of [[0.32, 0.12], [0.32, -0.12], [-0.32, 0.12], [-0.32, -0.12]]) leg(x, z, 0.62, 0.05, '#5d4227');
  } else if (kind === 'camel') {
    add(G.sph, '#c49a6c', 0, 1.75, 0, 0.9, 0.45, 0.42);
    add(G.sph, '#b88a5a', -0.1, 2.15, 0, 0.42, 0.42, 0.34);
    add(G.cyl8, '#c49a6c', 0.95, 2.0, 0, 0.13, 0.9, 0.13, 0, 0, -0.9);
    add(G.cyl8, '#c49a6c', 1.35, 2.4, 0, 0.11, 0.45, 0.11, 0, 0, 0.3);
    add(G.sph, '#b88a5a', 1.5, 2.6, 0, 0.3, 0.15, 0.15);
    add(G.cyl8, '#8d6e4a', -0.95, 1.6, 0, 0.04, 0.6, 0.04, 0, 0, 0.3);
    for (const [x, z] of [[0.6, 0.22], [0.6, -0.22], [-0.6, 0.22], [-0.6, -0.22]]) leg(x, z, 1.4, 0.07, '#b88a5a');
  } else if (kind === 'dog') {
    add(G.sph, '#d4a373', 0, 0.42, 0, 0.32, 0.15, 0.14);
    add(G.sph, '#c08552', 0.35, 0.58, 0, 0.14, 0.12, 0.1);
    add(G.sph, '#8d5b3a', 0.33, 0.68, 0.07, 0.04, 0.07, 0.03); add(G.sph, '#8d5b3a', 0.33, 0.68, -0.07, 0.04, 0.07, 0.03);
    add(G.cyl8, '#d4a373', -0.38, 0.55, 0, 0.03, 0.28, 0.03, 0, 0, 0.8);
    for (const [x, z] of [[0.2, 0.08], [0.2, -0.08], [-0.2, 0.08], [-0.2, -0.08]]) leg(x, z, 0.32, 0.035, '#c08552');
  }
  g.userData = { legs, kind };
  return g;
}
export function poseAnimal(a, t, speed) {
  const k = Math.min(1, speed / 3);
  a.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * (6 + speed * 1.5) + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.5 * k; });
}

// ---------- עצים, סלעים ושיחים (לאצוות סטטיות) ----------
export function addPalm(b, x, y, z, s, seed) {
  const h = (6 + seed * 3) * s;
  const lean = (seed - 0.5) * 0.15;
  for (let k = 0; k < 6; k++) b.add(G.cyl8, k % 2 ? '#7a5c3a' : '#6b4f31', x + lean * k * h / 6, y + (k + 0.5) * h / 6, z, 0, 0, 0, 0.22 * s - k * 0.01, h / 6 + 0.02, 0.22 * s - k * 0.01);
  const tx = x + lean * h, ty = y + h;
  for (let k = 0; k < 11; k++) {
    const a = k / 11 * Math.PI * 2 + seed * 3;
    const L = (2.6 + (k % 3) * 0.3) * s;
    b.add(G.cone, k % 2 ? '#3f7d2c' : '#4f9a38', tx + Math.cos(a) * L * 0.45, ty - 0.35 * s, z + Math.sin(a) * L * 0.45, 0, -a, -(Math.PI / 2 + 0.45), 0.32 * s, L, 0.06 * s);
  }
  b.add(G.sphLo, '#e39b2a', tx, ty - 0.5 * s, z, 0, 0, 0, 0.35 * s, 0.3 * s, 0.35 * s);
}
export function addAcacia(b, x, y, z, s, seed) {
  const h = 3.2 * s;
  b.add(G.cyl8, '#5d4a35', x, y + h * 0.35, z, 0, 0, 0.1, 0.16 * s, h * 0.7, 0.16 * s);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + seed * 5;
    b.add(G.cyl8, '#5d4a35', x + Math.cos(a) * 0.6 * s, y + h * 0.78, z + Math.sin(a) * 0.6 * s, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6, 0.09 * s, h * 0.5, 0.09 * s);
  }
  const blobs = 3 + Math.floor(seed * 3);
  for (let k = 0; k < blobs; k++) {
    const a = k / blobs * Math.PI * 2 + seed * 7, d = (0.6 + (k % 2) * 0.5) * s;
    b.add(G.ico, k % 2 ? '#5b7a2e' : '#6b8b35', x + Math.cos(a) * d, y + h + 0.1 * k * s, z + Math.sin(a) * d, 0, a, 0, 1.6 * s, 0.45 * s, 1.4 * s);
  }
}
const ROCK_COLORS = ['#b89c7e', '#c4a684', '#a8917a', '#cdb08f', '#b07e5f', '#9d8a7a'];
export function addRock(b, x, y, z, s, seed) {
  const g = G.ico0.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = 0.7 + ((Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.6;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.75, p.getZ(i) * f);
  }
  const gg = g; gg.computeVertexNormals();
  b.add(gg, ROCK_COLORS[Math.floor(seed * ROCK_COLORS.length)], x, y + s * 0.25, z, seed * 2, seed * 9, seed, s, s, s);
}
export function addShrub(b, x, y, z, s, seed) {
  b.add(G.ico0, seed < 0.5 ? '#8a9a4c' : '#7a8b40', x, y + 0.3 * s, z, 0, seed * 6, 0, 0.7 * s, 0.45 * s, 0.7 * s);
  b.add(G.ico0, '#a7b663', x + 0.2 * s, y + 0.45 * s, z - 0.1 * s, 0, seed * 3, 0, 0.4 * s, 0.3 * s, 0.4 * s);
}

// ---------- בתים ----------
// בית ישראלי במושב: קירות בהירים, גג רעפים או גג שטוח עם דוד שמש
export function addHouse(b, glass, cx, gy, cz, w, d, color, flat, rotY, opts) {
  opts = opts || {};
  const wall = opts.wall || '#f1e7d0';
  const H = (opts.floors || 1) * 3.0;
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  const P = (lx, ly, lz) => [cx + lx * cos + lz * sin, gy + ly, cz - lx * sin + lz * cos];
  const box = (lx, ly, lz, sx, sy, sz, col, geo, rx, rz) => { const [x, y, z] = P(lx, ly, lz); b.add(geo || G.box, col, x, y, z, rx || 0, rotY, rz || 0, sx, sy, sz); };
  box(0, H / 2, 0, w, H, d, wall);
  box(0, 0.15, 0, w + 0.4, 0.3, d + 0.4, '#cfc6b4');
  // דלת וחלונות בחזית (צד +X)
  box(w / 2 + 0.03, 1.05, 0, 0.08, 2.1, 1.0, '#6d4c33');
  for (const z of [-d * 0.3, d * 0.3]) box(w / 2 + 0.03, 1.6, z, 0.08, 1.1, 1.2, '#5d8aa8');
  for (const x of [-w * 0.25, w * 0.25]) { box(x, 1.6, d / 2 + 0.03, 1.2, 1.1, 0.08, '#5d8aa8'); box(x, 1.6, -d / 2 - 0.03, 1.2, 1.1, 0.08, '#5d8aa8'); }
  if (opts.floors === 2) for (const z of [-d * 0.3, 0, d * 0.3]) box(w / 2 + 0.03, 4.5, z, 0.08, 1.0, 1.0, '#5d8aa8');
  if (flat) {
    box(0, H + 0.25, 0, w + 0.2, 0.5, d + 0.2, shade(wall, -12));
    box(0, H + 0.05, 0, w - 0.2, 0.1, d - 0.2, '#d8d0c0');
    solar(b, P, rotY, -w * 0.2, H + 0.1, d * 0.15);
  } else {
    const [x, y, z] = P(0, H, 0);
    b.add(G.prism, color, x, y, z, 0, rotY, 0, w + 0.8, Math.min(w, d) * 0.38, d + 0.8);
    solar(b, P, rotY, -w * 0.15, H + Math.min(w, d) * 0.2, -d * 0.2);
  }
  // פרגולה וגדר
  if (opts.pergola !== false) {
    for (const z of [-d * 0.45, d * 0.45]) box(w / 2 + 2.2, 1.25, z, 0.15, 2.5, 0.15, '#8b6a46');
    box(w / 2 + 1.2, 2.5, 0, 2.4, 0.12, d * 0.95, '#8b6a46');
  }
}
function solar(b, P, rotY, lx, ly, lz) {
  const [x, y, z] = P(lx, ly + 0.55, lz);
  b.add(G.cyl, '#f4f4f4', x, y + 0.4, z, Math.PI / 2, rotY, 0, 0.3, 1.6, 0.3);
  const [x2, y2, z2] = P(lx + 0.9, ly + 0.5, lz);
  b.add(G.box, '#25386b', x2, y2, z2, 0, rotY, 0.6, 1.4, 0.06, 1.8);
}
export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt / 255);
  return '#' + c.getHexString();
}

// ---------- טקסט ----------
export function textCanvas(text, o) {
  o = o || {};
  const size = o.size || 64;
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  const font = `${o.weight || 800} ${size}px Rubik, "Segoe UI", Arial, sans-serif`;
  x.font = font;
  const w = Math.ceil(x.measureText(text).width + size * 0.8);
  const h = Math.ceil(size * 1.45);
  c.width = w; c.height = h;
  x.font = font; x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.bg) {
    x.fillStyle = o.bg;
    const r = h * 0.3;
    x.beginPath(); x.roundRect ? x.roundRect(2, 2, w - 4, h - 4, r) : x.rect(2, 2, w - 4, h - 4); x.fill();
    if (o.border) { x.lineWidth = size * 0.08; x.strokeStyle = o.border; x.stroke(); }
  }
  if (o.stroke) { x.lineJoin = 'round'; x.lineWidth = size * 0.18; x.strokeStyle = o.stroke; x.strokeText(text, w / 2, h / 2 + size * 0.05); }
  x.fillStyle = o.color || '#3b2412';
  x.fillText(text, w / 2, h / 2 + size * 0.05);
  return c;
}
export function makeLabel(text, o) {
  o = o || {};
  const c = textCanvas(text, o);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sm = new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: o.depthTest !== false, fog: o.fog !== false, transparent: true });
  const s = new THREE.Sprite(sm);
  const hgt = o.height || 0.5;
  s.scale.set(hgt * c.width / c.height, hgt, 1);
  s.center.set(0.5, 0);
  s.renderOrder = o.renderOrder || 5;
  return s;
}
export function makeSignBoard(text, o) {
  o = o || {};
  const c = textCanvas(text, { size: 80, color: o.color || '#fff', bg: o.bg || '#2e6b3a', border: o.border || '#f5f0e1' });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const hgt = o.height || 1.2, wdt = hgt * c.width / c.height;
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), new THREE.MeshLambertMaterial({ map: tex }));
  front.position.y = (o.post || 1.4) + hgt / 2;
  const back = front.clone(); back.rotation.y = Math.PI; back.material = new THREE.MeshLambertMaterial({ map: tex });
  front.position.z = 0.03; back.position.z = -0.03;
  g.add(front, back);
  const board = new THREE.Mesh(G.box, mat('#6b4a2a')); board.scale.set(wdt + 0.15, hgt + 0.15, 0.04); board.position.y = front.position.y; g.add(board);
  for (const x of [-wdt * 0.4, wdt * 0.4]) { const p = new THREE.Mesh(G.cyl8, mat('#5b3a1e')); p.scale.set(0.07, (o.post || 1.4) + hgt, 0.07); p.position.set(x, ((o.post || 1.4) + hgt) / 2, -0.05); p.castShadow = true; g.add(p); }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}
