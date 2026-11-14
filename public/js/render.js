// ציור העולם — שטח, מושבים, רכבים, דמויות ואנימציות
(function () {
  'use strict';
  const M = window.MAP;
  const EY = M.EY;
  let ctx = null, G = null, cam = null;

  // ---------- עזרים ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeOutBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return v / 0.9375; }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (s) => clamp(((n >> s) & 255) + amt, 0, 255);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  const FONT = 'Rubik, "Segoe UI", Arial, sans-serif';
  function text(t, x, y, size, color, stroke, weight) {
    ctx.font = `${weight || 700} ${size}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 4.5); ctx.strokeStyle = stroke || 'rgba(255,255,255,.92)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color || '#3b2412'; ctx.fillText(t, x, y);
  }
  const vis = (x, y, w, h, m) => { m = m == null ? 80 : m; return x + w > cam.x - m && x < cam.x + cam.w + m && y + h > cam.y - m && y < cam.y + cam.h + m; };

  // ---------- הופעת עין יהב (אנימציית ההקמה) ----------
  function eyProg(o) {
    if (o.town !== 'ey') return 1;
    if (!G.founded) return 0;
    if (G.foundT == null) return 1;
    const cx = o.x + (o.w || 0) / 2, cy = o.y + (o.h || 0) / 2;
    const d = Math.hypot(cx - EY.x, cy - EY.y);
    return clamp((G.now - G.foundT - 1800 - d * 3.2) / 650, 0, 1);
  }
  function withPop(o, fn) {
    const p = eyProg(o);
    if (p <= 0) return;
    if (p >= 1) return fn();
    const cx = o.x + (o.w || 0) / 2, cy = o.y + (o.h || 0) / 2;
    const s = Math.max(0.01, easeOutBack(p));
    ctx.save(); ctx.globalAlpha *= Math.min(1, p * 2);
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  // ---------- מטמונים: צבעי קרקע ומרקם ----------
  const TS = 40;
  let tmap = null, grain = null, grainPat = null;
  const wadiStones = [];
  const mountains = [];
  const acaciaBlobs = new Map();

  function buildCaches() {
    // מפת צבעים רכה של המדבר
    tmap = document.createElement('canvas');
    tmap.width = Math.ceil(M.W / TS); tmap.height = Math.ceil(M.H / TS);
    const tc = tmap.getContext('2d');
    const img = tc.createImageData(tmap.width, tmap.height);
    const sand = [233, 206, 154], gravel = [198, 172, 132], red = [223, 168, 120], pale = [242, 224, 184], mtn = [196, 132, 92];
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    for (let j = 0; j < tmap.height; j++) for (let i = 0; i < tmap.width; i++) {
      const x = i * TS, y = j * TS;
      let c = mix(sand, gravel, smooth(0.42, 0.72, fbm(x / 1500, y / 1500)));
      c = mix(c, red, smooth(0.55, 0.8, fbm(x / 800 + 40, y / 800 + 40)) * 0.55);
      c = mix(c, pale, smooth(0.58, 0.85, fbm(x / 350 + 9, y / 350 + 9)) * 0.45);
      c = mix(c, mtn, smooth(M.MOUNTAIN_X - 260, M.MOUNTAIN_X + 60, x));
      const k = (j * tmap.width + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    tc.putImageData(img, 0, 0);

    // מרקם חול וחצץ
    grain = document.createElement('canvas');
    grain.width = grain.height = 384;
    const g = grain.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      const r = Math.random();
      g.fillStyle = r < 0.55 ? `rgba(120,82,45,${0.08 + Math.random() * 0.14})` : `rgba(255,250,230,${0.12 + Math.random() * 0.2})`;
      const s = 1 + Math.random() * 1.8;
      g.fillRect(Math.random() * 384, Math.random() * 384, s, s);
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 384, y = Math.random() * 384, s = 1.5 + Math.random() * 2.5;
      g.fillStyle = 'rgba(90,60,35,.22)'; g.beginPath(); g.ellipse(x + 1, y + 1, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(${150 + Math.random() * 60},${120 + Math.random() * 50},${90 + Math.random() * 40},.75)`;
      g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(140,100,60,.12)'; g.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      let x = Math.random() * 384, y = Math.random() * 384;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    grainPat = ctx.createPattern(grain, 'repeat');

    // אבנים בוואדיות
    for (const w of M.wadis) {
      for (let i = 0; i < w.pts.length - 1; i++) {
        const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        for (let k = 0; k < L / 9; k++) {
          const t = Math.random(), off = (Math.random() - 0.5) * w.w * 0.9;
          const nx = -(by - ay) / L, ny = (bx - ax) / L;
          wadiStones.push({ x: ax + (bx - ax) * t + nx * off, y: ay + (by - ay) * t + ny * off, r: 1.5 + Math.random() * 4, c: Math.random() });
        }
      }
    }

    // הרי אדום
    for (let k = -1; k < M.H / 150 + 1; k++) {
      const y = k * 150 + hash(k, 1) * 70;
      const span = 140 + hash(k, 2) * 160;
      mountains.push({
        fx: M.MOUNTAIN_X - 40 + hash(k, 3) * 120, fy: y + (hash(k, 4) - 0.5) * 60,
        px: M.MOUNTAIN_X + 180 + hash(k, 5) * 550, py: y,
        ny: y - span, sy: y + span, ex: M.W + 50,
        tone: hash(k, 6),
      });
    }
  }

  // ---------- קרקע ----------
  function drawGround() {
    ctx.imageSmoothingEnabled = true;
    const sx = cam.x / TS, sy = cam.y / TS, sw = cam.w / TS, sh = cam.h / TS;
    ctx.drawImage(tmap, sx - 1, sy - 1, sw + 2, sh + 2, cam.x - TS, cam.y - TS, cam.w + 2 * TS, cam.h + 2 * TS);
    ctx.fillStyle = grainPat;
    ctx.fillRect(cam.x - 10, cam.y - 10, cam.w + 20, cam.h + 20);
  }

  function drawWadis() {
    for (const w of M.wadis) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); w.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = 'rgba(170,135,95,.35)'; ctx.lineWidth = w.w + 30; ctx.stroke();
      ctx.strokeStyle = '#ddd0b2'; ctx.lineWidth = w.w; ctx.stroke();
      ctx.strokeStyle = 'rgba(236,228,210,.8)'; ctx.lineWidth = w.w * 0.45; ctx.stroke();
    }
    for (const s of wadiStones) {
      if (s.x < cam.x - 20 || s.x > cam.x + cam.w + 20 || s.y < cam.y - 20 || s.y > cam.y + cam.h + 20) continue;
      ctx.fillStyle = s.c < 0.5 ? '#a8977d' : '#c4b495';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.7, s.c * 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMountains() {
    if (cam.x + cam.w < M.MOUNTAIN_X - 100) return;
    for (const m of mountains) {
      if (m.sy < cam.y - 100 || m.ny > cam.y + cam.h + 100) continue;
      const lit = m.tone < 0.5 ? '#d9a171' : '#cf9563';
      const dark = m.tone < 0.5 ? '#9a5a39' : '#8f5233';
      const mid = m.tone < 0.5 ? '#b8774d' : '#ad6c44';
      ctx.fillStyle = lit;
      ctx.beginPath(); ctx.moveTo(m.fx, m.fy); ctx.lineTo(m.px, m.py); ctx.lineTo(m.px + 40, m.ny); ctx.lineTo(m.fx + 60, m.ny + 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(m.fx, m.fy); ctx.lineTo(m.px, m.py); ctx.lineTo(m.px + 30, m.sy); ctx.lineTo(m.fx + 50, m.sy - 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = mid;
      ctx.beginPath(); ctx.moveTo(m.px, m.py); ctx.lineTo(m.px + 40, m.ny); ctx.lineTo(m.ex, m.ny + 30); ctx.lineTo(m.ex, m.sy - 30); ctx.lineTo(m.px + 30, m.sy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,190,.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(m.fx, m.fy); ctx.lineTo(m.px, m.py); ctx.stroke();
      ctx.strokeStyle = 'rgba(80,40,20,.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.px, m.py); ctx.lineTo(m.ex, m.py + (m.tone - 0.5) * 80); ctx.stroke();
    }
  }

  function drawDune(d) {
    const R = Math.max(d.rx, d.ry);
    if (!vis(d.x - R, d.y - R, 2 * R, 2 * R)) return;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = 'rgba(176,128,72,.45)';
    ctx.beginPath(); ctx.ellipse(d.rx * 0.22, d.ry * 0.25, d.rx * 0.95, d.ry * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(-d.rx * 0.35, -d.ry * 0.4, 4, 0, 0, R * 1.05);
    gr.addColorStop(0, '#f8e7bd'); gr.addColorStop(0.6, '#e9cd92'); gr.addColorStop(1, '#d7b173');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(0, 0, d.rx, d.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,105,55,.22)'; ctx.lineWidth = 2;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath(); ctx.ellipse(d.rx * 0.08 * k, d.ry * 0.1 * k, d.rx * (1 - k * 0.22), d.ry * (1 - k * 0.22), 0, -0.4, Math.PI * 0.9); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,248,225,.55)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, d.rx * 0.97, d.ry * 0.95, 0, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }

  function drawRock(r) {
    if (r.x < cam.x - 30 || r.x > cam.x + cam.w + 30 || r.y < cam.y - 30 || r.y > cam.y + cam.h + 30) return;
    if (r.s > 0.8) { // שיח
      ctx.fillStyle = 'rgba(80,60,30,.18)'; circle(r.x + 4, r.y + 4, r.r * 0.9); ctx.fill();
      ctx.fillStyle = '#8a9a4c'; circle(r.x, r.y, r.r * 0.9); ctx.fill();
      ctx.fillStyle = '#a7b663'; circle(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.5); ctx.fill();
      ctx.fillStyle = '#6f7f3a'; circle(r.x + r.r * 0.35, r.y + r.r * 0.2, r.r * 0.35); ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(70,45,25,.25)'; ctx.beginPath(); ctx.ellipse(r.x + 4, r.y + 4, r.r, r.r * 0.75, r.s * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r.s < 0.4 ? '#9c8468' : '#b39678'; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.75, r.s * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,215,.35)'; ctx.beginPath(); ctx.ellipse(r.x - r.r * 0.3, r.y - r.r * 0.25, r.r * 0.5, r.r * 0.3, r.s * 6, 0, Math.PI * 2); ctx.fill();
  }

  function drawAcacia(a) {
    if (!vis(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2)) return;
    let blobs = acaciaBlobs.get(a);
    if (!blobs) {
      blobs = [];
      const n = a.big ? 14 : 7;
      for (let i = 0; i < n; i++) {
        const ang = hash(Math.round(a.x) + i, Math.round(a.y)) * Math.PI * 2, d = hash(Math.round(a.y) + i, i) * a.r * 0.55;
        blobs.push([Math.cos(ang) * d, Math.sin(ang) * d * 0.8, a.r * (0.38 + hash(i, Math.round(a.x)) * 0.25)]);
      }
      acaciaBlobs.set(a, blobs);
    }
    ctx.fillStyle = 'rgba(60,45,20,.22)';
    ctx.beginPath(); ctx.ellipse(a.x + a.r * 0.35, a.y + a.r * 0.3, a.r * 1.05, a.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#556f29';
    for (const [dx, dy, r] of blobs) { circle(a.x + dx, a.y + dy, r); ctx.fill(); }
    ctx.fillStyle = '#6d8a34';
    for (const [dx, dy, r] of blobs) { circle(a.x + dx - r * 0.18, a.y + dy - r * 0.2, r * 0.75); ctx.fill(); }
    ctx.fillStyle = 'rgba(170,200,100,.55)';
    for (const [dx, dy, r] of blobs) { circle(a.x + dx - r * 0.35, a.y + dy - r * 0.4, r * 0.28); ctx.fill(); }
  }

  function drawPalm(p) {
    if (!vis(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)) return;
    withPop(p, () => {
      const sway = Math.sin(G.now / 900 + p.x * 0.01) * 0.06;
      ctx.fillStyle = 'rgba(40,40,10,.2)'; ctx.beginPath(); ctx.ellipse(p.x + 12, p.y + 10, p.r * 0.95, p.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + p.x * 0.1 + sway;
        const L = p.r * (0.95 + (i % 3) * 0.08);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.fillStyle = i % 2 ? '#3f7d2c' : '#559a3a';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.22, L, 0); ctx.quadraticCurveTo(L * 0.5, L * 0.22, 0, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(30,60,20,.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(L * 0.95, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#e39b2a';
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + p.y; circle(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5, 2.5); ctx.fill(); }
      ctx.fillStyle = '#7a5a2a'; circle(p.x, p.y, 4); ctx.fill();
    });
  }

  // ---------- כבישים ושבילים ----------
  function drawTrails() {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const t of M.trails) {
      ctx.beginPath(); t.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (t.kind === 'track') {
        ctx.strokeStyle = '#8a5d34'; ctx.lineWidth = t.w + 10; ctx.stroke();
        ctx.strokeStyle = '#b07a46'; ctx.lineWidth = t.w; ctx.stroke();
        ctx.setLineDash([3, 9]); ctx.strokeStyle = 'rgba(70,40,20,.35)'; ctx.lineWidth = t.w * 0.7; ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(150,110,65,.55)'; ctx.lineWidth = t.w + 6; ctx.stroke();
        ctx.strokeStyle = '#d2ac74'; ctx.lineWidth = t.w; ctx.stroke();
        ctx.strokeStyle = 'rgba(150,110,65,.3)'; ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  function drawRoad(r) {
    if (!vis(r.x, r.y, r.w, r.h)) return;
    withPop(r, () => {
      if (r.kind === 'dirt') { ctx.fillStyle = '#c9a46a'; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      const hw = r.kind === 'highway';
      ctx.fillStyle = hw ? '#d8c39a' : '#cbb79a';
      ctx.fillRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
      ctx.fillStyle = hw ? '#454545' : '#5f5f62';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    });
  }
  function drawRoadMarks() {
    const hw = M.roads[0];
    if (vis(hw.x, cam.y, hw.w, cam.h)) {
      ctx.fillStyle = '#f4d03f';
      for (let y = Math.floor(cam.y / 70) * 70; y < cam.y + cam.h + 70; y += 70) { ctx.fillRect(hw.x + hw.w / 2 - 4, y, 3, 40); ctx.fillRect(hw.x + hw.w / 2 + 1, y, 3, 40); }
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(hw.x + 6, cam.y - 10, 3, cam.h + 20); ctx.fillRect(hw.x + hw.w - 9, cam.y - 10, 3, cam.h + 20);
    }
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (const r of M.roads) {
      if (r.kind !== 'road' || !vis(r.x, r.y, r.w, r.h) || eyProg(r) < 1) continue;
      if (r.w > r.h) { for (let x = Math.max(r.x + 10, Math.floor(cam.x / 50) * 50); x < Math.min(r.x + r.w - 20, cam.x + cam.w); x += 50) ctx.fillRect(x, r.y + r.h / 2 - 2, 24, 4); }
      else { for (let y = Math.max(r.y + 10, Math.floor(cam.y / 50) * 50); y < Math.min(r.y + r.h - 20, cam.y + cam.h); y += 50) ctx.fillRect(r.x + r.w / 2 - 2, y, 4, 24); }
    }
  }

  // ---------- אזורים ----------
  function drawDecor(d) {
    if (!vis(d.x, d.y, d.w, d.h)) return;
    withPop(d, () => {
      switch (d.kind) {
        case 'plaza': {
          ctx.fillStyle = '#d9c7a6'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = 'rgba(150,120,90,.25)'; ctx.lineWidth = 1;
          for (let x = d.x; x < d.x + d.w; x += 20) { ctx.beginPath(); ctx.moveTo(x, d.y); ctx.lineTo(x, d.y + d.h); ctx.stroke(); }
          for (let y = d.y; y < d.y + d.h; y += 20) { ctx.beginPath(); ctx.moveTo(d.x, y); ctx.lineTo(d.x + d.w, y); ctx.stroke(); }
          break;
        }
        case 'yard': ctx.fillStyle = '#dccdb0'; ctx.fillRect(d.x, d.y, d.w, d.h); break;
        case 'grass': {
          ctx.fillStyle = '#86b955'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.fillStyle = 'rgba(255,255,255,.06)';
          for (let x = d.x; x < d.x + d.w; x += 24) ctx.fillRect(x, d.y, 12, d.h);
          break;
        }
        case 'garden': {
          ctx.fillStyle = '#93c463'; rrect(d.x, d.y, d.w, d.h, 10); ctx.fill();
          ctx.strokeStyle = '#d8cdb5'; ctx.lineWidth = 4; ctx.stroke();
          ctx.fillStyle = '#e74c3c'; circle(d.x + 12, d.y + d.h - 12, 3); ctx.fill();
          ctx.fillStyle = '#f1c40f'; circle(d.x + 20, d.y + d.h - 10, 3); ctx.fill();
          ctx.fillStyle = '#ff6fb5'; circle(d.x + d.w - 14, d.y + 12, 3); ctx.fill();
          break;
        }
        case 'lot': {
          ctx.fillStyle = '#cdb184'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = '#8b6a3e'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
          ctx.strokeRect(d.x + 6, d.y + 6, d.w - 12, d.h - 12); ctx.setLineDash([]);
          break;
        }
        case 'court': {
          ctx.fillStyle = '#c0392b'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(d.x + 4, d.y + 4, d.w - 8, d.h - 8);
          ctx.beginPath(); ctx.moveTo(d.x + d.w / 2, d.y + 4); ctx.lineTo(d.x + d.w / 2, d.y + d.h - 4); ctx.stroke();
          circle(d.x + d.w / 2, d.y + d.h / 2, 9); ctx.stroke();
          break;
        }
        case 'pool': {
          ctx.fillStyle = '#f2efe6'; rrect(d.x - 10, d.y - 10, d.w + 20, d.h + 20, 12); ctx.fill();
          const gr = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
          gr.addColorStop(0, '#5dd3f5'); gr.addColorStop(1, '#1f9ad6');
          ctx.fillStyle = gr; rrect(d.x, d.y, d.w, d.h, 6); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
          const t = G.now / 600;
          for (let k = 0; k < 6; k++) {
            ctx.beginPath();
            const yy = d.y + 12 + k * (d.h - 24) / 5;
            for (let x = d.x + 8; x <= d.x + d.w - 8; x += 10) { const y = yy + Math.sin(x * 0.08 + t + k) * 2; x === d.x + 8 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(255,80,80,.6)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
          for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(d.x + 6, d.y + k * d.h / 4); ctx.lineTo(d.x + d.w - 6, d.y + k * d.h / 4); ctx.stroke(); }
          ctx.setLineDash([]);
          text(d.label, d.x + d.w / 2, d.y + d.h / 2, 18, '#fff', '#1f7fae');
          break;
        }
        case 'playground': {
          ctx.fillStyle = '#f3d9a4'; rrect(d.x, d.y, d.w, d.h, 10); ctx.fill();
          ctx.fillStyle = '#e74c3c'; rrect(d.x + 8, d.y + 10, 14, 50, 4); ctx.fill();
          ctx.fillStyle = '#3498db'; ctx.fillRect(d.x + 30, d.y + 18, 30, 6); ctx.fillRect(d.x + 30, d.y + 44, 30, 6);
          ctx.fillStyle = '#f1c40f'; circle(d.x + d.w / 2, d.y + 85, 12); ctx.fill();
          break;
        }
        case 'campfire': {
          ctx.fillStyle = '#8b8378';
          for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; circle(d.x + Math.cos(a) * 16, d.y + Math.sin(a) * 16, 5); ctx.fill(); }
          const f = 1 + Math.sin(G.now / 90) * 0.15;
          ctx.fillStyle = '#e67e22'; circle(d.x, d.y, 10 * f); ctx.fill();
          ctx.fillStyle = '#f9e79f'; circle(d.x, d.y, 5 * f); ctx.fill();
          ctx.fillStyle = '#7b5230';
          for (let k = 0; k < 4; k++) { const a = k * 1.7; ctx.fillRect(d.x + Math.cos(a) * 34 - 10, d.y + Math.sin(a) * 34 - 4, 20, 8); }
          break;
        }
        case 'lookout': {
          const gr = ctx.createRadialGradient(d.x + 80, d.y + 80, 10, d.x + 100, d.y + 100, 120);
          gr.addColorStop(0, '#d9b98a'); gr.addColorStop(1, 'rgba(190,150,100,0)');
          ctx.fillStyle = gr; circle(d.x + 100, d.y + 100, 120); ctx.fill();
          ctx.fillStyle = '#8b6a3e'; ctx.fillRect(d.x + 90, d.y + 90, 22, 22);
          ctx.fillStyle = '#c0392b'; ctx.fillRect(d.x + 100, d.y + 60, 3, 32);
          break;
        }
      }
    });
  }

  // ---------- חממות ----------
  function drawGreenhouseFloor(g) {
    if (!vis(g.x, g.y, g.w, g.h)) return;
    withPop(g, () => {
      ctx.fillStyle = '#b39466'; ctx.fillRect(g.x, g.y, g.w, g.h);
      for (let y = g.y + 12; y < g.y + g.h - 6; y += 19) {
        ctx.fillStyle = '#3f7f31'; ctx.fillRect(g.x + 8, y, g.w - 16, 9);
        ctx.fillStyle = '#5ea548';
        for (let x = g.x + 10; x < g.x + g.w - 10; x += 9) { circle(x, y + 4, 3); ctx.fill(); }
      }
    });
  }
  function drawGreenhouseRoof(g, meInside) {
    if (!vis(g.x, g.y, g.w, g.h)) return;
    withPop(g, () => {
      ctx.fillStyle = meInside ? 'rgba(240,248,255,.12)' : 'rgba(236,244,250,.55)';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.strokeRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      for (let x = g.x + 17; x < g.x + g.w; x += 17) { ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(g.x, g.y + g.h * 0.3, g.w, 4);
    });
  }
  function drawPepper(p) {
    if (p.x < cam.x - 20 || p.x > cam.x + cam.w + 20 || p.y < cam.y - 20 || p.y > cam.y + cam.h + 20) return;
    if (p.town === 'ey' && !G.founded) return;
    const bob = Math.sin(G.now / 300 + p.x) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 9, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(p.x - 3, p.y - 4 + bob, 1, p.x, p.y + bob, 12);
    gr.addColorStop(0, '#ff6b5b'); gr.addColorStop(1, '#c0150c');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(p.x, p.y + bob, 7.5, 10, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(p.x - 2.5, p.y - 3 + bob, 1.8, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e7d32'; rrect(p.x - 1, p.y - 14 + bob, 4, 7, 2); ctx.fill();
    ctx.globalAlpha = 0.5 + Math.sin(G.now / 200 + p.y) * 0.3;
    ctx.fillStyle = '#fff'; circle(p.x + 7, p.y - 9 + bob, 1.5); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------- בניינים (מבט על עם קצת עומק) ----------
  function shadowBox(x, y, w, h, d) {
    ctx.fillStyle = 'rgba(40,25,10,.22)';
    ctx.beginPath(); ctx.moveTo(x + w, y + 4); ctx.lineTo(x + w + d, y + 4 + d * 0.8); ctx.lineTo(x + w + d, y + h + d * 0.8); ctx.lineTo(x + d, y + h + d * 0.8); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  }
  function solarHeater(x, y) {
    ctx.fillStyle = '#2c3e66'; ctx.fillRect(x, y, 16, 11);
    ctx.strokeStyle = 'rgba(160,190,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 8, y + 11); ctx.stroke();
    ctx.fillStyle = '#f2f2f2'; rrect(x + 1, y - 6, 14, 5, 2); ctx.fill();
  }
  function houseShape(x, y, w, h, roof, opts) {
    opts = opts || {};
    const fh = Math.min(16, h * 0.22);
    shadowBox(x, y, w, h, 12);
    // קיר קדמי
    ctx.fillStyle = opts.wall || '#efe2c4'; ctx.fillRect(x, y + h - fh, w, fh);
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x, y + h - 3, w, 3);
    ctx.fillStyle = '#5d4030'; ctx.fillRect(x + w / 2 - 6, y + h - fh + 3, 12, fh - 3);
    ctx.fillStyle = '#7fb6d9';
    ctx.fillRect(x + 8, y + h - fh + 4, 12, fh - 9); ctx.fillRect(x + w - 20, y + h - fh + 4, 12, fh - 9);
    // גג רעפים
    const rh = h - fh;
    ctx.fillStyle = shade(roof, 18); ctx.fillRect(x - 3, y - 2, w + 6, rh / 2 + 2);
    ctx.fillStyle = shade(roof, -22); ctx.fillRect(x - 3, y + rh / 2, w + 6, rh / 2 + 1);
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
    for (let yy = y + 6; yy < y + rh; yy += 6) { ctx.beginPath(); ctx.moveTo(x - 3, yy); ctx.lineTo(x + w + 3, yy); ctx.stroke(); }
    ctx.strokeStyle = shade(roof, -55); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 3, y + rh / 2); ctx.lineTo(x + w + 3, y + rh / 2); ctx.stroke();
    if (opts.solar) solarHeater(x + w - 26, y + 8);
  }
  function flatBuilding(s) {
    const { x, y, w, h } = s;
    const fh = Math.min(20, h * 0.26);
    shadowBox(x, y, w, h, 14);
    ctx.fillStyle = shade(s.color, -15); ctx.fillRect(x, y + h - fh, w, fh);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    for (let wx = x + 8; wx < x + w - 14; wx += 18) ctx.fillRect(wx, y + h - fh + 5, 10, fh - 10);
    ctx.fillStyle = '#3d2b1f'; ctx.fillRect(x + w / 2 - 8, y + h - fh + 3, 16, fh - 3);
    ctx.fillStyle = '#ece3cf'; ctx.fillRect(x, y, w, h - fh);
    ctx.strokeStyle = s.color; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, w - 6, h - fh - 6);
    ctx.fillStyle = '#b7b2a6';
    ctx.fillRect(x + 14, y + 12, 12, 10); ctx.fillRect(x + w - 30, y + h - fh - 22, 12, 10);
    if (w > 100) solarHeater(x + w / 2 - 8, y + 14);
    if (s.label) text(s.label, x + w / 2, y + (h - fh) / 2 + 4, Math.min(17, w / (s.label.length * 0.62)), '#fff', shade(s.color, -60));
  }
  function waterTower(s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.fillStyle = 'rgba(40,25,10,.25)'; ctx.beginPath(); ctx.ellipse(cx + 30, cy + 26, s.w / 2, s.w / 2.6, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 4;
    for (const [dx, dy] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) { ctx.beginPath(); ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx + dx * 0.5, cy + dy * 0.5); ctx.stroke(); }
    const gr = ctx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, s.w / 2);
    gr.addColorStop(0, '#f4f6f7'); gr.addColorStop(1, '#a6b1b8');
    ctx.fillStyle = gr; circle(cx, cy, s.w / 2 - 4); ctx.fill();
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 2; ctx.stroke();
    text('עין יהב', cx, cy, 11, '#2c3e50', 'rgba(255,255,255,.5)');
    text(s.label, cx, s.y - 14, 14);
  }
  function drawSolid(s) {
    if (!vis(s.x, s.y, s.w, s.h)) return;
    withPop(s, () => {
      if (s.kind === 'house') return houseShape(s.x, s.y, s.w, s.h, s.color, { solar: s.solar });
      if (s.kind === 'tower') return waterTower(s);
      flatBuilding(s);
    });
  }

  // בתים של שחקנים — עם אנימציית בנייה
  function drawPlayerHouse(h) {
    if (!vis(h.x, h.y, h.w, h.h + 30)) return;
    const age = G.serverNow() - (h.t || 0);
    const roof = h.color === '#ffffff' ? '#cfcfcf' : h.color;
    if (age < 4500) {
      const p = clamp(age / 4500, 0, 1);
      ctx.fillStyle = '#9a9a96'; ctx.fillRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);
      ctx.fillStyle = '#efe2c4';
      const wallH = h.h * Math.min(1, p * 1.6);
      ctx.fillRect(h.x, h.y + h.h - wallH, h.w, wallH);
      ctx.strokeStyle = '#8e6b3e'; ctx.lineWidth = 3;
      for (let x = h.x - 6; x <= h.x + h.w + 6; x += 22) { ctx.beginPath(); ctx.moveTo(x, h.y - 6); ctx.lineTo(x, h.y + h.h + 6); ctx.stroke(); }
      if (p > 0.6) { ctx.globalAlpha = (p - 0.6) / 0.4; houseShape(h.x, h.y, h.w, h.h, roof, { solar: true }); ctx.globalAlpha = 1; }
      text('🔨 בונים...', h.x + h.w / 2, h.y - 14, 14);
      return;
    }
    if (h.type === 'villa') {
      ctx.fillStyle = '#93c463'; rrect(h.x - 14, h.y - 10, h.w + 28, h.h + 50, 12); ctx.fill();
      ctx.fillStyle = '#38b6e8'; rrect(h.x + 10, h.y + h.h + 10, h.w - 20, 28, 6); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    } else {
      ctx.fillStyle = '#9cc96b'; rrect(h.x - 8, h.y - 6, h.w + 16, h.h + 22, 10); ctx.fill();
    }
    houseShape(h.x, h.y, h.w, h.h, roof, { solar: true, wall: h.type === 'big' ? '#f6ead0' : undefined });
    text('הבית של ' + h.owner, h.x + h.w / 2, h.y + h.h + (h.type === 'villa' ? 52 : 26), 13);
  }

  function drawContainer(c) {
    if (!vis(c.x, c.y, c.w, c.h + 80)) return;
    ctx.fillStyle = 'rgba(120,90,60,.22)'; ctx.fillRect(c.x - 6, c.y + c.h, c.w + 12, 78);
    shadowBox(c.x, c.y, c.w, c.h, 8);
    const col = c.color === '#ffffff' ? '#d5d5d5' : c.color;
    ctx.fillStyle = col; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = shade(col, -45); ctx.lineWidth = 2;
    for (let x = c.x + 7; x < c.x + c.w; x += 8) { ctx.beginPath(); ctx.moveTo(x, c.y + 3); ctx.lineTo(x, c.y + c.h - 3); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.strokeRect(c.x, c.y, c.w, c.h);
    text('📦 המכולה של ' + c.owner, c.x + c.w / 2, c.y - 12, 13);
  }

  // ---------- בית משפחת מזור ----------
  function drawMazor() {
    const lot = M.MAZOR_LOT, H = M.MAZOR;
    if (!G.founded || !vis(lot.x, lot.y, lot.w, lot.h)) return;
    withPop({ x: lot.x, y: lot.y, w: lot.w, h: lot.h, town: 'ey' }, () => {
      const st = G.mazor.stage;
      const since = G.serverNow() - (G.mazor.t || 0);
      const bounce = since < 1500 ? 1 + Math.sin(since / 1500 * Math.PI) * 0.06 : 1;
      ctx.save();
      ctx.translate(H.x + H.w / 2, H.y + H.h / 2); ctx.scale(bounce, bounce); ctx.translate(-(H.x + H.w / 2), -(H.y + H.h / 2));
      if (st === 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.strokeRect(H.x, H.y, H.w, H.h);
        ctx.fillStyle = '#8b5a2b';
        for (const [x, y] of [[H.x, H.y], [H.x + H.w, H.y], [H.x, H.y + H.h], [H.x + H.w, H.y + H.h]]) ctx.fillRect(x - 3, y - 3, 6, 6);
      }
      if (st >= 1) {
        shadowBox(H.x - 6, H.y - 6, H.w + 12, H.h + 12, 5);
        ctx.fillStyle = '#a7a7a2'; ctx.fillRect(H.x - 6, H.y - 6, H.w + 12, H.h + 12);
        ctx.fillStyle = '#8f8f8a';
        for (let x = H.x; x < H.x + H.w; x += 14) for (let y = H.y; y < H.y + H.h; y += 14) ctx.fillRect(x, y, 2, 2);
      }
      if (st >= 2 && st < 4) {
        ctx.fillStyle = '#efe2c4';
        ctx.fillRect(H.x, H.y, H.w, 10); ctx.fillRect(H.x, H.y + H.h - 10, H.w, 10);
        ctx.fillRect(H.x, H.y, 10, H.h); ctx.fillRect(H.x + H.w - 10, H.y, 10, H.h);
        ctx.fillRect(H.x + H.w / 2 - 5, H.y, 10, H.h * 0.6);
        ctx.strokeStyle = '#8e6b3e'; ctx.lineWidth = 3;
        for (let x = H.x - 10; x <= H.x + H.w + 10; x += 25) { ctx.beginPath(); ctx.moveTo(x, H.y - 12); ctx.lineTo(x, H.y + H.h + 12); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(H.x - 12, H.y - 10); ctx.lineTo(H.x + H.w + 12, H.y - 10); ctx.stroke();
        if (st >= 3) {
          ctx.fillStyle = '#7fb6d9';
          for (let k = 0; k < 4; k++) ctx.fillRect(H.x + 18 + k * 32, H.y + H.h - 9, 18, 7);
          ctx.fillStyle = '#5d4030'; ctx.fillRect(H.x + H.w / 2 - 9, H.y + H.h - 10, 18, 10);
        }
      }
      if (st >= 4) {
        if (st >= 5) {
          ctx.fillStyle = '#86c35a'; rrect(M.MAZOR_LOT.x + 6, M.MAZOR_LOT.y + 6, M.MAZOR_LOT.w - 12, M.MAZOR_LOT.h - 12, 14); ctx.fill();
          ctx.fillStyle = '#d9c7a6'; ctx.fillRect(H.x + H.w / 2 - 14, H.y + H.h, 28, 80);
          const fl = ['#e74c3c', '#f1c40f', '#ff6fb5', '#fff', '#9b59b6'];
          for (let k = 0; k < 26; k++) { ctx.fillStyle = fl[k % 5]; circle(lot0(k).x, lot0(k).y, 3.5); ctx.fill(); }
        }
        houseShape(H.x - 8, H.y - 8, H.w + 16, H.h + 16, '#b03a2e', { solar: true, wall: '#f8eed8' });
        solarHeater(H.x + 20, H.y + 4);
        ctx.fillStyle = 'rgba(255,255,255,.9)'; rrect(H.x + H.w / 2 - 50, H.y + H.h - 2, 100, 18, 5); ctx.fill();
        text('משפחת מזור', H.x + H.w / 2, H.y + H.h + 7, 13, '#7a1f0e', 'rgba(255,255,255,0)');
        if (st >= 5) {
          ctx.fillStyle = '#7b5230'; ctx.fillRect(H.x + H.w + 8, H.y - 50, 3, 70);
          const wv = Math.sin(G.now / 200) * 3;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(H.x + H.w + 11, H.y - 50); ctx.quadraticCurveTo(H.x + H.w + 25, H.y - 50 + wv, H.x + H.w + 40, H.y - 48); ctx.lineTo(H.x + H.w + 40, H.y - 26); ctx.quadraticCurveTo(H.x + H.w + 25, H.y - 28 + wv, H.x + H.w + 11, H.y - 28); ctx.fill();
          ctx.fillStyle = '#2f6fd1'; ctx.fillRect(H.x + H.w + 11, H.y - 47, 29, 3); ctx.fillRect(H.x + H.w + 11, H.y - 32, 29, 3);
        }
      }
      ctx.restore();
      // שלט
      const stName = st >= M.MAZOR_STAGES.length ? '🏡 בית משפחת מזור' : `🏗️ בית משפחת מזור — שלב ${st + 1}/5: ${M.MAZOR_STAGES[st].name}`;
      text(stName, H.x + H.w / 2, lot.y - 14, 15, '#7a1f0e');
    });
  }
  function lot0(k) {
    const L = M.MAZOR_LOT;
    const side = k % 4, t = hash(k, 7);
    if (side === 0) return { x: L.x + 14 + t * (L.w - 28), y: L.y + 14 };
    if (side === 1) return { x: L.x + 14, y: L.y + 14 + t * (L.h - 28) };
    if (side === 2) return { x: L.x + L.w - 14, y: L.y + 14 + t * (L.h - 28) };
    return { x: L.x + 14 + t * 30, y: L.y + L.h - 14 };
  }

  // דגל ההקמה (לפני שמצאו את המקום)
  function drawFoundingFlag() {
    if (G.founded) return;
    const x = EY.x, y = EY.y;
    if (!vis(x - 200, y - 200, 400, 400)) return;
    const pulse = (G.now / 1200) % 1;
    ctx.strokeStyle = `rgba(255,215,0,${1 - pulse})`; ctx.lineWidth = 6;
    circle(x, y, 60 + pulse * 140); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 30, y + 8, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 3, y - 110, 6, 115);
    const wv = Math.sin(G.now / 180) * 5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x + 3, y - 108); ctx.quadraticCurveTo(x + 35, y - 108 + wv, x + 70, y - 104); ctx.lineTo(x + 70, y - 64); ctx.quadraticCurveTo(x + 35, y - 68 + wv, x + 3, y - 68); ctx.fill();
    ctx.fillStyle = '#2f6fd1'; ctx.fillRect(x + 3, y - 102, 67, 5); ctx.fillRect(x + 3, y - 78, 67, 5);
    text('כאן נקים את עין יהב!', x, y - 130, 22, '#7a1f0e');
  }

  // ---------- רכבים ----------
  const DEFAULT_COLOR = { bike: '#16a085', moto: '#e67e22', atv: '#c0392b', jeep: '#2e7d32', tractor: '#27ae60' };
  function wheel(x, y, w, h, spin) {
    ctx.fillStyle = '#1d1d1d'; rrect(x, y, w, h, 3); ctx.fill();
    ctx.fillStyle = '#444';
    const off = ((spin || 0) % 6 + 6) % 6;
    for (let xx = x + off - 6; xx < x + w; xx += 6) if (xx > x) ctx.fillRect(xx, y + 1, 2, h - 2);
  }
  function vehicleBody(type, col, spin) {
    const S = M.VEHICLES[type], L = S.len, Wd = S.wid;
    if (type === 'bike') {
      wheel(-L / 2, -2.5, 11, 5, spin); wheel(L / 2 - 11, -2.5, 11, 5, spin);
      ctx.fillStyle = col; ctx.fillRect(-L / 2 + 6, -2, L - 12, 4);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(L / 2 - 10, -9); ctx.lineTo(L / 2 - 10, 9); ctx.stroke();
      ctx.fillStyle = '#222'; ctx.fillRect(-6, -3, 9, 6);
    } else if (type === 'moto') {
      wheel(-L / 2, -4.5, 14, 9, spin); wheel(L / 2 - 14, -4.5, 14, 9, spin);
      ctx.fillStyle = shade(col, -35); rrect(-L / 2 + 8, -7, L - 16, 14, 6); ctx.fill();
      ctx.fillStyle = col; rrect(-L / 2 + 9, -6, L - 18, 9, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-2, -5, 12, 2);
      ctx.fillStyle = '#2b2b2b'; rrect(-12, -5, 15, 10, 3); ctx.fill();
      ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L / 2 - 15, -11); ctx.lineTo(L / 2 - 15, 11); ctx.stroke();
      ctx.fillStyle = '#ffe680'; circle(L / 2 - 4, 0, 3); ctx.fill();
      ctx.fillStyle = '#999'; ctx.fillRect(-L / 2 + 4, 5, 14, 3);
    } else if (type === 'atv') {
      for (const [x, y] of [[-L / 2, -Wd / 2], [L / 2 - 13, -Wd / 2], [-L / 2, Wd / 2 - 9], [L / 2 - 13, Wd / 2 - 9]]) wheel(x, y, 13, 9, spin);
      ctx.fillStyle = shade(col, -35); rrect(-L / 2 + 5, -Wd / 2 + 6, L - 10, Wd - 12, 7); ctx.fill();
      ctx.fillStyle = col; rrect(-L / 2 + 7, -Wd / 2 + 7, L - 14, Wd - 16, 6); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.strokeRect(-L / 2 + 3, -Wd / 2 + 9, 8, Wd - 18); ctx.strokeRect(L / 2 - 11, -Wd / 2 + 9, 8, Wd - 18);
      ctx.fillStyle = '#2b2b2b'; rrect(-8, -5, 15, 10, 3); ctx.fill();
      ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L / 2 - 13, -11); ctx.lineTo(L / 2 - 13, 11); ctx.stroke();
      ctx.fillStyle = '#ffe680'; ctx.fillRect(L / 2 - 4, -6, 3, 4); ctx.fillRect(L / 2 - 4, 2, 3, 4);
    } else if (type === 'jeep') {
      for (const [x, y] of [[-L / 2 + 6, -Wd / 2 - 3], [L / 2 - 23, -Wd / 2 - 3], [-L / 2 + 6, Wd / 2 - 6], [L / 2 - 23, Wd / 2 - 6]]) wheel(x, y, 17, 9, spin);
      ctx.fillStyle = shade(col, -40); rrect(-L / 2, -Wd / 2, L, Wd, 8); ctx.fill();
      ctx.fillStyle = col; rrect(-L / 2 + 2, -Wd / 2 + 2, L - 4, Wd - 6, 7); ctx.fill();
      ctx.fillStyle = '#1b1b1b'; rrect(-L / 2 - 2, -9, 6, 18, 3); ctx.fill();
      ctx.strokeStyle = shade(col, -50); ctx.lineWidth = 2; ctx.strokeRect(-L / 2 + 8, -Wd / 2 + 6, L - 36, Wd - 14);
      ctx.fillStyle = 'rgba(160,215,240,.9)'; rrect(L / 2 - 28, -Wd / 2 + 5, 9, Wd - 12, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(L / 2 - 17, -Wd / 2 + 6, 13, Wd - 14);
      ctx.fillStyle = '#ffe680'; ctx.fillRect(L / 2 - 3, -Wd / 2 + 4, 3, 7); ctx.fillRect(L / 2 - 3, Wd / 2 - 11, 3, 7);
    } else if (type === 'tractor') {
      wheel(-L / 2, -Wd / 2 - 5, 24, 13, spin); wheel(-L / 2, Wd / 2 - 8, 24, 13, spin);
      wheel(L / 2 - 15, -Wd / 2 + 1, 13, 8, spin); wheel(L / 2 - 15, Wd / 2 - 9, 13, 8, spin);
      ctx.fillStyle = col; rrect(-L / 2 + 4, -Wd / 2 + 8, L - 6, Wd - 16, 5); ctx.fill();
      ctx.fillStyle = shade(col, 30); ctx.fillRect(4, -Wd / 2 + 10, L / 2 - 6, 4);
      ctx.fillStyle = '#f1c40f'; rrect(-L / 2 + 6, -11, 20, 22, 3); ctx.fill();
      ctx.fillStyle = '#555'; circle(L / 2 - 16, -5, 3.5); ctx.fill();
    }
  }
  function drawVehicle(v) {
    if (!vis(v.x - 45, v.y - 45, 90, 90)) return;
    const col = v.color && v.color !== '#ffffff' ? v.color : (v.color ? '#d9d9d9' : DEFAULT_COLOR[v.type]);
    const air = v.air || 0;
    const sc = 1 + air * 0.28;
    const S = M.VEHICLES[v.type];
    ctx.save(); ctx.translate(v.x + 4 + air * 22, v.y + 5 + air * 18); ctx.rotate(v.a);
    ctx.fillStyle = `rgba(0,0,0,${0.22 - air * 0.08})`; rrect(-S.len / 2, -S.wid / 2 - 2, S.len, S.wid + 4, 7); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(v.x, v.y - air * 10); ctx.rotate(v.a + (v.wob || 0)); ctx.scale(sc, sc);
    vehicleBody(v.type, col, v.odo || 0);
    // רוכבים
    const riders = [v.driver, ...(v.pass || [])].filter(Boolean);
    riders.forEach((id, i) => {
      const p = id === G.myId ? G.meView() : G.others.get(id);
      if (!p) return;
      let ox, oy;
      if (v.type === 'jeep') { ox = i < 2 ? 4 : -16; oy = (i % 2 ? -1 : 1) * 9; }
      else if (v.type === 'tractor') { ox = -10 - i * 12; oy = 0; }
      else { ox = -4 - i * 12; oy = 0; }
      rider(ox, oy, p, v.type);
    });
    ctx.restore();
    if (v.driver) {
      const d = v.driver === G.myId ? G.meView() : G.others.get(v.driver);
      if (d) {
        const names = [d.name, ...(v.pass || []).map((id) => (id === G.myId ? G.myName : (G.others.get(id) || {}).name)).filter(Boolean)];
        text(names.join(' + '), v.x, v.y - 36 - air * 14, 14, v.driver === G.myId ? '#c0392b' : '#3b2412');
      }
    } else if (v.owner && !v.temp) {
      text(v.owner === G.myName && v.ownerAid === G.acct.aid ? 'שלך' : v.owner, v.x, v.y - 30, 11, '#6b4a2a');
    }
  }
  function rider(ox, oy, p, type) {
    ctx.fillStyle = p.color === '#ffffff' ? '#ddd' : p.color;
    ctx.beginPath(); ctx.ellipse(ox - 1, oy, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c29b';
    circle(ox + 9, oy - 7, 3); ctx.fill(); circle(ox + 9, oy + 7, 3); ctx.fill();
    if (type === 'jeep' || type === 'tractor') {
      ctx.fillStyle = '#f2c29b'; circle(ox + 1, oy, 6.5); ctx.fill();
      ctx.fillStyle = '#4a2c17'; ctx.beginPath(); ctx.arc(ox, oy, 6.5, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
      drawHat(p.hat, ox + 1, oy, 0.85);
    } else {
      const gr = ctx.createRadialGradient(ox - 1, oy - 2, 1, ox + 1, oy, 8);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, p.color === '#ffffff' ? '#ccc' : p.color); gr.addColorStop(1, shade(p.color === '#ffffff' ? '#cccccc' : p.color, -50));
      ctx.fillStyle = gr; circle(ox + 1, oy, 7.5); ctx.fill();
      ctx.fillStyle = '#1d2a36'; ctx.beginPath(); ctx.arc(ox + 1, oy, 7.5, -0.9, 0.9); ctx.lineTo(ox + 1, oy); ctx.fill();
    }
  }

  // ---------- דמויות ----------
  function drawHat(hat, x, y, s) {
    if (!hat) return;
    s = s || 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (hat === 'cap') {
      ctx.fillStyle = '#c0392b'; circle(0, 0, 7.5); ctx.fill();
      ctx.fillStyle = '#922b21'; ctx.beginPath(); ctx.ellipse(8, 0, 6, 6.5, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillStyle = '#fff'; circle(0, 0, 1.5); ctx.fill();
    } else if (hat === 'sun') {
      ctx.fillStyle = '#c9b27c'; circle(0, 0, 12); ctx.fill();
      ctx.fillStyle = '#b39a62'; circle(0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; circle(0, 0, 9.5); ctx.stroke();
    } else if (hat === 'cowboy') {
      ctx.fillStyle = '#8b5a2b'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6e4420'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3d2412'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (hat === 'crown') {
      ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#b7950b'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, r = k % 2 ? 6 : 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e74c3c'; circle(0, 0, 2.5); ctx.fill();
    }
    ctx.restore();
  }
  function drawWalker(p, isMe) {
    if (!vis(p.x - 30, p.y - 30, 60, 60)) return;
    const col = p.color === '#ffffff' ? '#e6e6e6' : p.color;
    const swing = p.mv ? Math.sin(p.walkT || 0) * 6 : 0;
    if (p.sw) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      const t = G.now / 300;
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) { const r = 12 + ((t + k * 0.5) % 1) * 14; ctx.globalAlpha = 1 - ((t + k * 0.5) % 1); circle(0, 0, r); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f2c29b';
      circle(4 + Math.sin(t * 6) * 6, -12, 3.5); ctx.fill(); circle(4 - Math.sin(t * 6) * 6, 12, 3.5); ctx.fill();
      ctx.fillStyle = col; circle(0, 0, 8); ctx.fill();
      ctx.fillStyle = '#1d2a36'; ctx.fillRect(1, -7, 4, 14);
      ctx.restore();
      text(p.name, p.x, p.y - 26, isMe ? 15 : 14, isMe ? '#c0392b' : '#3b2412');
      return;
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(4, 5, 14, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34495e';
    ctx.beginPath(); ctx.ellipse(swing, -6, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-swing, 6, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createLinearGradient(0, -14, 0, 14);
    gr.addColorStop(0, shade(col.length === 7 ? col : '#e6e6e6', 30)); gr.addColorStop(1, shade(col.length === 7 ? col : '#e6e6e6', -30));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, 9, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f2c29b';
    circle(4 - swing * 0.6, -14, 4); ctx.fill(); circle(4 + swing * 0.6, 14, 4); ctx.fill();
    ctx.fillStyle = '#f2c29b'; circle(1, 0, 8); ctx.fill();
    ctx.fillStyle = '#4a2c17'; ctx.beginPath(); ctx.arc(-0.5, 0, 7.8, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    drawHat(p.hat, 1, 0, 1);
    ctx.restore();
    if (p.boost) { ctx.fillStyle = 'rgba(255,215,0,.6)'; text('⚡', p.x + 16, p.y - 16, 14); }
    text(p.name, p.x, p.y - 30, isMe ? 15 : 14, isMe ? '#c0392b' : '#3b2412');
  }

  // ---------- צבאים וציפורים ----------
  function drawGazelle(g) {
    if (!vis(g.x - 30, g.y - 30, 60, 60)) return;
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.a);
    const run = g.sp > 20 ? Math.sin(g.t * 18) * 5 : Math.sin(g.t * 5) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(3, 4, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2;
    for (const [x, y, s] of [[7, -4, 1], [7, 4, -1], [-7, -4, -1], [-7, 4, 1]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + run * s, y * 2); ctx.stroke(); }
    ctx.fillStyle = '#c8955a'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3e3cc'; ctx.beginPath(); ctx.ellipse(-1, 2, 10, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b07d48'; ctx.beginPath(); ctx.ellipse(15, 0, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3d2a16'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(14, -2); ctx.quadraticCurveTo(10, -6, 7, -5); ctx.moveTo(14, 2); ctx.quadraticCurveTo(10, 6, 7, 5); ctx.stroke();
    ctx.fillStyle = '#3d2a16'; ctx.fillRect(-15, -1, 3, 2);
    ctx.restore();
  }
  function drawBirds() {
    const t = G.now / 1000;
    for (let i = 0; i < 7; i++) {
      const sp = 60 + i * 9, dir = i % 2 ? 1 : -1;
      let x = ((t * sp * dir + i * 1777) % (M.W + 400) + M.W + 400) % (M.W + 400) - 200;
      const y = 600 + i * 1050 + Math.sin(t * 0.3 + i) * 120;
      for (let k = 0; k < 3; k++) {
        const bx = x - dir * k * 26, by = y + (k ? (k % 2 ? 18 : -18) : 0);
        if (!vis(bx - 20, by - 20, 40, 40)) continue;
        const f = Math.sin(t * 10 + i + k) * 5;
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(bx + 40 - 8, by + 60 - f); ctx.lineTo(bx + 40, by + 60); ctx.lineTo(bx + 40 + 8, by + 60 - f); ctx.stroke();
        ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(bx - 9, by - f); ctx.quadraticCurveTo(bx - 4, by - 3, bx, by); ctx.quadraticCurveTo(bx + 4, by - 3, bx + 9, by - f); ctx.stroke();
      }
    }
  }

  // ---------- קפיצות, עקבות ואבק ----------
  function drawJump(j) {
    if (!vis(j.x - 40, j.y - 40, 80, 80)) return;
    ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(j.a);
    ctx.fillStyle = 'rgba(60,35,15,.3)'; rrect(-j.w / 2 + 5, -j.h / 2 + 5, j.w, j.h, 6); ctx.fill();
    const gr = ctx.createLinearGradient(-j.w / 2, 0, j.w / 2, 0);
    gr.addColorStop(0, '#8b5a2b'); gr.addColorStop(1, '#c4935e');
    ctx.fillStyle = gr; rrect(-j.w / 2, -j.h / 2, j.w, j.h, 6); ctx.fill();
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(j.w / 2 - 5, -j.h / 2 + 2, 3, j.h - 4);
    ctx.restore();
  }
  function drawTracks() {
    const now = G.now;
    ctx.lineCap = 'round';
    for (const s of G.tracks) {
      const age = (now - s.t) / 25000;
      if (age >= 1) continue;
      if (s.x1 < cam.x - 20 || s.x1 > cam.x + cam.w + 20 || s.y1 < cam.y - 20 || s.y1 > cam.y + cam.h + 20) continue;
      ctx.strokeStyle = `rgba(120,85,50,${0.28 * (1 - age)})`; ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
  }
  function drawParticles() {
    for (const p of G.particles) {
      const k = p.life / p.max;
      if (p.kind === 'confetti') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        ctx.fillStyle = p.c; ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = (1 - k) * (p.a || 0.45);
      ctx.fillStyle = p.c || '#d9b98a';
      circle(p.x, p.y, p.r * (0.6 + k * 1.4)); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- תחרויות ונקודות ----------
  function drawRaceCheckpoints() {
    const R = G.race;
    if (!R || !R.cps) return;
    for (let k = R.idx + 1; k >= R.idx; k--) {
      const c = R.cps[k];
      if (!c) continue;
      const isNext = k === R.idx, isLast = k === R.cps.length - 1;
      ctx.globalAlpha = isNext ? 1 : 0.35;
      if (R.def.id === 'youth' && !isLast) {
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(c.x + 10, c.y + 4, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(c.x - 2, c.y - 50, 4, 52);
        const wv = Math.sin(G.now / 150) * 3;
        ctx.fillStyle = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'][k % 5];
        ctx.beginPath(); ctx.moveTo(c.x + 2, c.y - 50); ctx.quadraticCurveTo(c.x + 14, c.y - 48 + wv, c.x + 28, c.y - 44); ctx.lineTo(c.x + 2, c.y - 34); ctx.fill();
      } else {
        const pulse = 1 + Math.sin(G.now / 180) * 0.08;
        const r = (R.mode === 'foot' || R.mode === 'swim' ? 40 : 58) * pulse;
        if (isLast) {
          for (let a = 0; a < 16; a++) { ctx.fillStyle = a % 2 ? '#111' : '#fff'; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, r, a / 16 * Math.PI * 2, (a + 1) / 16 * Math.PI * 2); ctx.fill(); }
          ctx.globalAlpha *= 0.6;
        }
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 12; circle(c.x + 3, c.y + 4, r); ctx.stroke();
        ctx.strokeStyle = isNext ? '#ffd23f' : '#fff'; ctx.lineWidth = 9; circle(c.x, c.y, r); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; circle(c.x, c.y, r - 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (isNext) text(isLast ? '🏁 סיום' : String(k + 1), c.x, c.y - (R.def.id === 'youth' ? 64 : 0), 22, '#3b2412');
    }
  }

  function drawInteractMarkers() {
    for (const it of M.interacts) {
      if (it.town === 'ey' && !G.founded) continue;
      if (!vis(it.x - 100, it.y - 100, 200, 200)) continue;
      if (Math.hypot(it.x - G.me.x, it.y - G.me.y) > 700) continue;
      const near = G.nearInteract === it;
      const bob = Math.sin(G.now / 300 + it.x) * 4;
      ctx.globalAlpha = near ? 1 : 0.85;
      ctx.font = `700 ${near ? 15 : 13}px ${FONT}`;
      const w = ctx.measureText(it.label).width + 20;
      const y = it.y - 4 + bob * 0.6;
      ctx.fillStyle = near ? '#ffd23f' : 'rgba(255,248,234,.95)';
      rrect(it.x - w / 2, y - 14, w, 28, 14); ctx.fill();
      ctx.strokeStyle = '#d9a35b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(it.x - 6, y + 14); ctx.lineTo(it.x, y + 21); ctx.lineTo(it.x + 6, y + 14); ctx.fillStyle = near ? '#ffd23f' : 'rgba(255,248,234,.95)'; ctx.fill();
      ctx.fillStyle = '#3b2412'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.label, it.x, y + 1);
      ctx.globalAlpha = 1;
    }
  }

  function drawQuestTarget() {
    const t = G.questTarget;
    if (!t || G.race) return;
    if (!vis(t.x - 50, t.y - 50, 100, 100, 0)) return;
    const bob = Math.abs(Math.sin(G.now / 250)) * 14;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 3;
    const y = t.y - 70 - bob;
    ctx.beginPath(); ctx.moveTo(t.x - 16, y); ctx.lineTo(t.x + 16, y); ctx.lineTo(t.x + 16, y + 14); ctx.lineTo(t.x + 26, y + 14); ctx.lineTo(t.x, y + 40); ctx.lineTo(t.x - 26, y + 14); ctx.lineTo(t.x - 16, y + 14); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  function drawBubble(id, x, y) {
    const b = G.bubbles.get(id);
    if (!b) return;
    if (G.now > b.until) { G.bubbles.delete(id); return; }
    ctx.font = `700 15px ${FONT}`;
    const w = Math.min(260, ctx.measureText(b.text).width + 22);
    const bx = x - w / 2, by = y - 82;
    ctx.fillStyle = '#fff'; rrect(bx, by, w, 30, 13); ctx.fill();
    ctx.strokeStyle = '#d9a35b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, by + 30); ctx.lineTo(x, by + 38); ctx.lineTo(x + 6, by + 30); ctx.fill();
    ctx.fillStyle = '#3b2412'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, x, by + 15, w - 12);
  }

  function drawLabel(l) {
    if (!vis(l.x - 300, l.y - 60, 600, 120)) return;
    if (l.town === 'ey' && eyProg(l) <= 0) return;
    if (l.vertical) {
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(-Math.PI / 2);
      text(l.text, 0, 0, l.size, '#fff', 'rgba(0,0,0,.6)');
      ctx.restore();
      return;
    }
    ctx.globalAlpha = l.town === 'ey' ? eyProg(l) : 1;
    text(l.text, l.x, l.y, l.size, l.color || '#5a3410');
    ctx.globalAlpha = 1;
  }

  function drawPlacing() {
    const P = G.placing;
    if (!P) return;
    ctx.globalAlpha = 0.65;
    if (P.kind === 'house') houseShape(P.x, P.y, P.w, P.h, G.myColor === '#ffffff' ? '#cccccc' : G.myColor, { solar: true });
    else { ctx.fillStyle = G.myColor; ctx.fillRect(P.x, P.y, P.w, P.h); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.ok ? '#27ae60' : '#e74c3c'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
    ctx.strokeRect(P.x - 4, P.y - 4, P.w + 8, P.h + 8 + (P.kind === 'house' ? 0 : 75));
    ctx.setLineDash([]);
    text(P.ok ? '✔ אפשר לבנות כאן' : '✖ לא כאן', P.x + P.w / 2, P.y - 16, 15, P.ok ? '#1e8449' : '#c0392b');
  }

  function drawEffects() {
    for (const e of G.effects) {
      if (e.delay && e.t < 0) continue;
      const p = e.t / e.dur;
      ctx.globalAlpha = 1 - p * p;
      if (e.kind === 'puff') {
        ctx.fillStyle = '#e8d6b0';
        for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; circle(e.x + Math.cos(a) * (10 + p * 50), e.y + Math.sin(a) * (10 + p * 40), 14 + p * 16); ctx.fill(); }
      } else text(e.text, e.x, e.y - 30 - p * 40, e.big ? 40 + p * 40 : 18, e.color || (e.big ? '#c0392b' : '#b7950b'));
      ctx.globalAlpha = 1;
    }
  }

  // ---------- ציור עולם ----------
  function drawWorld(c, game, camera) {
    ctx = c; G = game; cam = camera;
    if (!tmap) buildCaches();
    drawGround();
    drawWadis();
    drawMountains();
    for (const d of M.dunes) drawDune(d);
    drawTracks();
    drawTrails();
    for (const r of M.roads) drawRoad(r);
    for (const d of M.decor) drawDecor(d);
    drawRoadMarks();
    for (const j of M.jumps) drawJump(j);
    const meIn = M.greenhouses.find((g) => G.me.x > g.x && G.me.x < g.x + g.w && G.me.y > g.y && G.me.y < g.y + g.h);
    for (const g of M.greenhouses) drawGreenhouseFloor(g);
    G.peppers.forEach(drawPepper);
    for (const r of M.rocks) drawRock(r);
    drawRaceCheckpoints();
    G.containers.forEach(drawContainer);
    for (const s of M.solids) drawSolid(s);
    drawMazor();
    G.houses.forEach(drawPlayerHouse);
    drawFoundingFlag();
    drawPlacing();

    // ישויות ממוינות לפי גובה
    const ents = [];
    G.vehicles.forEach((v) => ents.push([v.y, 0, v]));
    G.others.forEach((o) => { if (!o.vid) ents.push([o.y, 1, o]); });
    if (!G.me.vid && G.playing) ents.push([G.me.y, 2, G.meView()]);
    for (const g of G.gazelles) ents.push([g.y, 3, g]);
    ents.sort((a, b) => a[0] - b[0]);
    for (const [, k, e] of ents) {
      if (k === 0) drawVehicle(e);
      else if (k === 3) drawGazelle(e);
      else drawWalker(e, k === 2);
    }
    drawParticles();

    for (const g of M.greenhouses) drawGreenhouseRoof(g, g === meIn);
    for (const a of M.acacias) drawAcacia(a);
    for (const p of M.palms) drawPalm(p);
    drawBirds();
    for (const l of M.labels) drawLabel(l);
    drawInteractMarkers();
    drawQuestTarget();
    G.others.forEach((o) => drawBubble(o.id, o.x, o.y));
    if (G.myId) drawBubble(G.myId, G.me.x, G.me.y);
    drawEffects();
  }

  // ---------- מפה קטנה ----------
  function buildMinimap(w, h, founded) {
    if (!tmap) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const m = c.getContext('2d');
    const sx = w / M.W, sy = h / M.H;
    m.imageSmoothingEnabled = true;
    m.drawImage(tmap, 0, 0, w, h);
    m.strokeStyle = '#e2d6bb';
    for (const wd of M.wadis) { m.lineWidth = Math.max(2, wd.w * sx); m.beginPath(); wd.pts.forEach((p, i) => (i ? m.lineTo(p[0] * sx, p[1] * sy) : m.moveTo(p[0] * sx, p[1] * sy))); m.stroke(); }
    m.fillStyle = 'rgba(245,225,175,.8)';
    for (const d of M.dunes) { m.beginPath(); m.ellipse(d.x * sx, d.y * sy, d.rx * sx, d.ry * sy, d.rot, 0, Math.PI * 2); m.fill(); }
    m.strokeStyle = '#c8a06a'; m.lineWidth = 1.5;
    for (const t of M.trails) { m.beginPath(); t.pts.forEach((p, i) => (i ? m.lineTo(p[0] * sx, p[1] * sy) : m.moveTo(p[0] * sx, p[1] * sy))); m.stroke(); }
    const show = (o) => o.town !== 'ey' || founded;
    m.fillStyle = '#86b955';
    for (const p of M.palms) if (show(p)) m.fillRect(p.x * sx - 1, p.y * sy - 1, 2, 2);
    m.fillStyle = '#f5f8fa';
    for (const g of M.greenhouses) if (show(g)) m.fillRect(g.x * sx, g.y * sy, Math.max(1, g.w * sx), Math.max(1, g.h * sy));
    for (const r of M.roads) if (show(r)) { m.fillStyle = r.kind === 'dirt' ? '#c9a46a' : '#555'; m.fillRect(r.x * sx, r.y * sy, Math.max(1.5, r.w * sx), Math.max(1.5, r.h * sy)); }
    m.fillStyle = '#b5452f';
    for (const s of M.solids) if (show(s)) m.fillRect(s.x * sx, s.y * sy, Math.max(1.5, s.w * sx), Math.max(1.5, s.h * sy));
    return c;
  }

  // אייקון של רכב לחנות / לבחירה
  function vehicleIcon(type, color, size) {
    size = size || 96;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const old = ctx;
    ctx = c.getContext('2d');
    const S = M.VEHICLES[type];
    const sc = size * 0.8 / Math.max(S.len, S.wid * 1.6);
    ctx.translate(size / 2, size / 2); ctx.scale(sc, sc); ctx.rotate(-Math.PI / 2);
    vehicleBody(type, color || DEFAULT_COLOR[type], 0);
    const url = c.toDataURL();
    ctx = old;
    return url;
  }

  window.R = { drawWorld, buildMinimap, vehicleIcon, text: (...a) => text(...a), setCtx: (c) => { ctx = c; }, DEFAULT_COLOR, hash, shade };
})();
