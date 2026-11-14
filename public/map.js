// עולם המשחק — קובץ משותף לשרת וללקוח.
// יחידות העולם: 1 יחידה = 0.12 מטר (SC). הגבהים (heightAt) במטרים.
(function (root) {
  'use strict';

  const W = 7200, H = 8000, SC = 0.12;
  const HWX = 5400;          // כביש 90
  const MOUNTAIN_X = 6450;   // הרי אדום
  const PEACE_X = 6150;      // דרך השלום

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(9157);

  // ---------- רעש ----------
  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < (o || 4); i++) { v += a * vnoise(x * f, y * f); n += a; f *= 2; a *= 0.5; } return v / n; }
  const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  const roads = [];        // {pts, w, kind: 'highway'|'road'|'dirt'|'trail'|'track', town}
  const solids = [];       // מבנים — מלבנים {x,y,w,h,kind,...}
  const greenhouses = [];  // חממות ובתי רשת
  const palms = [], decor = [], labels = [], acacias = [], rocks = [], wadis = [], dunes = [], hills = [], ramps = [];
  const towns = [], interacts = [], landmarks = [], toolboxes = [], springs = [];

  const rect = (x, y, w, h) => ({ x, y, w, h });
  const line = (pts, w, kind, town) => roads.push({ pts, w, kind, town });
  function ellipsePts(cx, cy, rx, ry, n, a0) {
    const p = [];
    for (let k = 0; k <= n; k++) { const t = (a0 || 0) + k / n * Math.PI * 2; p.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); }
    return p;
  }

  // ================= כביש 90 ודרך השלום =================
  line([[HWX + 60, 0], [HWX + 60, H]], 110, 'highway');
  line([[PEACE_X, 0], [PEACE_X - 40, 2500], [PEACE_X + 30, 5200], [PEACE_X, H]], 60, 'road');
  labels.push({ x: PEACE_X, y: 3000, text: 'דרך השלום', size: 2.2 });

  // ================= עין יהב =================
  const EY = { id: 'ey', name: 'עין יהב', sub: 'המושב הראשון והגדול בערבה', x: 3400, y: 3900, rx: 1350, ry: 1000, r: 1250 };
  towns.push(EY);
  const T = 'ey';
  const IN = { rx: 560, ry: 400 }, OUT = { rx: 1050, ry: 760 };
  line(ellipsePts(EY.x, EY.y, IN.rx, IN.ry, 56), 54, 'road', T);
  line(ellipsePts(EY.x, EY.y, OUT.rx, OUT.ry, 72), 58, 'road', T);
  // השדרה הראשית — מכביש 90 דרך החממות עד כיכר המושב
  line([[EY.x + 95, EY.y], [EY.x + IN.rx, EY.y], [EY.x + OUT.rx, EY.y], [4300, EY.y], [HWX + 10, EY.y]], 70, 'road', T);
  // רחובות רדיאליים
  const RADIAL = [Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75];
  for (const a of RADIAL) {
    line([[EY.x + Math.cos(a) * IN.rx, EY.y + Math.sin(a) * IN.ry], [EY.x + Math.cos(a) * OUT.rx, EY.y + Math.sin(a) * OUT.ry]], 48, 'road', T);
  }
  // שכונת ההרחבה במערב
  const HX0 = 1650, HX1 = 2330;
  line([[EY.x - OUT.rx, EY.y], [HX0, EY.y]], 50, 'road', T);
  line([[HX0 + 40, EY.y - 420], [HX0 + 40, EY.y + 420]], 46, 'road', T);
  line([[HX1 - 60, EY.y - 380], [HX1 - 60, EY.y + 380]], 46, 'road', T);
  line([[HX0 + 40, EY.y - 420], [HX1 - 60, EY.y - 380]], 46, 'road', T);
  line([[HX0 + 40, EY.y + 420], [HX1 - 60, EY.y + 380]], 46, 'road', T);
  labels.push({ x: 2000, y: EY.y - 470, text: 'שכונת ההרחבה', size: 2.4, town: T });

  // כיכר המושב
  decor.push({ kind: 'plaza', x: EY.x - 95, y: EY.y - 95, w: 190, h: 190, town: T, round: true, noBuild: true });
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; palms.push({ x: EY.x + Math.cos(a) * 70, y: EY.y + Math.sin(a) * 70, s: 1, town: T }); }

  function building(x, y, w, h, color, label, extra) {
    const b = Object.assign({ x, y, w, h, kind: 'building', color, label, town: T, floors: 1 }, extra || {});
    solids.push(b);
    return b;
  }

  // משק מזור — במרכז המושב
  const MAZOR_LOT = rect(3250, 3560, 300, 220);
  const MAZOR = rect(3320, 3590, 160, 120);
  decor.push(Object.assign({ kind: 'lot', town: T, noBuild: true }, MAZOR_LOT));
  interacts.push({ id: 'mazor', type: 'mazor', x: 3400, y: 3800, r: 70, label: '🏡 משק מזור', town: T });

  // בית הספר
  building(2950, 3760, 220, 110, '#f1c40f', 'בית הספר', { kind: 'school', floors: 2 });
  decor.push({ kind: 'court', x: 2985, y: 3900, w: 130, h: 80, town: T });
  interacts.push({ id: 'school', type: 'school', x: 3060, y: 3893, r: 60, label: '📚 בית הספר', town: T });

  // בריכה
  const POOL = rect(3620, 3745, 200, 105);
  decor.push({ kind: 'grass', x: 3600, y: 3690, w: 240, h: 185, town: T, noBuild: true });
  decor.push(Object.assign({ kind: 'pool', town: T }, POOL));
  building(3655, 3700, 130, 34, '#16a085', 'מלתחות');

  // מרכז מסחרי
  building(2960, 4020, 110, 62, '#2e86de', 'סופר', { kind: 'shop' });
  building(3080, 4020, 110, 62, '#e67e22', 'חומרי בניין', { kind: 'shop' });
  building(3200, 4020, 110, 62, '#7f8c8d', 'חנות כלים', { kind: 'shop' });
  decor.push({ kind: 'plaza', x: 2950, y: 3995, w: 370, h: 120, town: T, noBuild: true });
  interacts.push({ id: 'super', type: 'shop', shop: 'super', x: 3015, y: 4100, r: 45, label: '🛒 סופר', town: T });
  interacts.push({ id: 'materials', type: 'shop', shop: 'materials', x: 3135, y: 4100, r: 45, label: '🧱 חומרי בניין', town: T });
  interacts.push({ id: 'tools', type: 'shop', shop: 'tools', x: 3255, y: 4100, r: 45, label: '🔨 חנות כלים', town: T });

  // מועדון הנוער ומרכז הספורט
  building(3540, 4030, 130, 72, '#e84393', 'מועדון הנוער', { kind: 'youth' });
  building(3700, 3955, 140, 70, '#1abc9c', 'מרכז ספורט', { kind: 'sports' });
  decor.push({ kind: 'campfire', x: 3600, y: 4150, w: 1, h: 1, town: T });
  interacts.push({ id: 'sports', type: 'chugim', x: 3770, y: 4045, r: 50, label: '🏅 לוח החוגים', town: T });

  // בית כנסת ומזכירות המושב
  building(3230, 4150, 110, 80, '#f5f0e1', 'בית כנסת', { dark: true });
  building(3380, 4150, 120, 70, '#c0392b', 'מזכירות המושב', { kind: 'office' });
  interacts.push({ id: 'office', type: 'office', x: 3440, y: 4240, r: 55, label: '👨‍👩‍👧 מזכירות: הבא משפחות', town: T });

  // מגדל המים וברז
  solids.push({ x: 2800, y: 3050, w: 70, h: 70, kind: 'tower', color: '#bfc7cf', label: 'מגדל המים', town: T });
  springs.push({ x: 2835, y: 3160, r: 50, name: 'ברז המים', town: T });

  // מוסך וסוכנות רכב, בית אריזה
  building(4520, 3960, 160, 85, '#c0392b', 'מוסך וסוכנות רכב', { kind: 'garage' });
  interacts.push({ id: 'dealer', type: 'shop', shop: 'dealer', x: 4600, y: 4070, r: 55, label: '🏍️ סוכנות רכב', town: T });
  building(4500, 3700, 230, 120, '#95a5a6', 'בית אריזה', { kind: 'packing', floors: 2 });
  interacts.push({ id: 'packing', type: 'deliver', x: 4615, y: 3845, r: 60, label: '📦 בית האריזה', town: T });

  // משבצות לבתים של משפחות שמגיעות למושב (נבנות בהדרגה)
  const PLANNED = [];
  function slotsAlong(rx, ry, side, step) {
    const per = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
    const n = Math.floor(per / step);
    for (let k = 0; k < n; k++) {
      const t = k / n * Math.PI * 2 + 0.07;
      const cx = EY.x + Math.cos(t) * (rx + side), cy = EY.y + Math.sin(t) * (ry + side * ry / rx);
      PLANNED.push({ cx, cy, a: t, w: 80, h: 66 });
    }
  }
  slotsAlong(OUT.rx, OUT.ry, 105, 120);
  slotsAlong(OUT.rx, OUT.ry, 215, 125);
  slotsAlong(OUT.rx, OUT.ry, -100, 125);
  slotsAlong(IN.rx, IN.ry, 100, 130);
  for (let gx = HX0 + 130; gx < HX1 - 120; gx += 125) for (const gy of [EY.y - 300, EY.y - 140, EY.y + 140, EY.y + 300]) PLANNED.push({ cx: gx, cy: gy, a: 0, w: 80, h: 66 });
  // מסננים משבצות שמתנגשות בכבישים או במבנים
  const planned = [];
  for (const p of PLANNED) {
    const r = { x: p.cx - p.w / 2, y: p.cy - p.h / 2, w: p.w, h: p.h };
    let bad = false;
    for (const rd of roads) for (let i = 0; i < rd.pts.length - 1 && !bad; i++) if (distToSeg(p.cx, p.cy, rd.pts[i], rd.pts[i + 1]) < rd.w / 2 + 48) bad = true;
    for (const s of solids) if (rectsOverlap(r, s, 20)) bad = true;
    for (const d of decor) if (d.noBuild && rectsOverlap(r, d, 10)) bad = true;
    if (rectsOverlap(r, POOL, 20)) bad = true;
    for (const q of planned) if (Math.hypot(q.x + q.w / 2 - p.cx, q.y + q.h / 2 - p.cy) < 96) bad = true;
    if (!bad) planned.push(Object.assign(r, { id: planned.length, color: ['#c0533a', '#b5452f', '#d27a3e', '#9e3b2b', '#c86b4a', '#a0522d'][Math.floor(rnd() * 6)], flat: rnd() < 0.35, face: p.a }));
  }
  planned.sort((a, b) => Math.hypot(a.x - EY.x, a.y - EY.y) - Math.hypot(b.x - EY.x, b.y - EY.y));
  planned.forEach((p, i) => (p.id = i));

  // חממות ובתי רשת — לאורך כביש הכניסה, בצפון ובדרום
  function field(x0, y0, x1, y1, w, h, gap, town, kind) {
    for (let x = x0; x + w <= x1; x += w + gap) for (let y = y0; y + h <= y1; y += h + gap) greenhouses.push({ x, y, w, h, town, kind: kind || (rnd() < 0.5 ? 'net' : 'tunnel') });
  }
  field(4320, 3150, 5320, 3830, 230, 120, 30, T);
  field(4320, 4000 + 90, 5320, 4700, 230, 120, 30, T);
  field(2600, 2380, 4300, 2950, 260, 130, 30, T);
  field(2500, 4880, 4300, 5420, 260, 130, 30, T);
  labels.push({ x: 4800, y: 3110, text: 'בתי רשת — פלפלים 🌶️', size: 2.4, town: T });
  // חממות משק מזור
  for (const g of greenhouses) if (g.y < 2700 && g.x > 3200 && g.x < 3700) g.mazor = true;
  labels.push({ x: 3450, y: 2340, text: 'החממות של משק מזור', size: 2.4, town: T });

  // מטע תמרים
  for (let px = 1850; px <= 2700; px += 70) for (let py = 4650; py <= 5300; py += 70) palms.push({ x: px + (rnd() - 0.5) * 12, y: py + (rnd() - 0.5) * 12, s: 0.9 + rnd() * 0.25, town: T });
  labels.push({ x: 2280, y: 4610, text: 'מטע תמרים', size: 2.6, town: T });
  // דקלים בשדרה
  for (let x = 3600; x < 4250; x += 90) { palms.push({ x, y: EY.y - 55, s: 1.1, town: T }); palms.push({ x, y: EY.y + 55, s: 1.1, town: T }); }

  // ================= מושבים שכנים =================
  const NEIGHBORS = [
    { id: 'hatzeva', name: 'חצבה', sub: 'המושב הצפוני', x: 3300, y: 950, feature: 'מועדון' },
    { id: 'idan', name: 'עידן', sub: 'מושב בערבה', x: 4700, y: 1650, feature: 'מועדון' },
    { id: 'sapir', name: 'ספיר', sub: 'מרכז ספיר', x: 2200, y: 6250, feature: 'מרכז ספיר' },
    { id: 'tzofar', name: 'צופר', sub: 'מושב בערבה', x: 4300, y: 6650, feature: 'מועדון' },
    { id: 'paran', name: 'פארן', sub: 'מושב בערבה', x: 3000, y: 7150, feature: 'מועדון' },
    { id: 'tzukim', name: 'צוקים', sub: 'כפר הצימרים', x: 5000, y: 7550, feature: 'צימרים' },
  ];
  for (const n of NEIGHBORS) {
    towns.push({ id: n.id, name: n.name, sub: n.sub, x: n.x, y: n.y, r: 420, rx: 480, ry: 420 });
    line(ellipsePts(n.x, n.y, 260, 200, 36), 46, 'road', n.id);
    line([[n.x + 260, n.y], [HWX + 10, n.y]], 46, 'road', n.id);
    building(n.x - 55, n.y - 35, 110, 70, '#d35400', n.feature, { town: n.id });
    for (let k = 0; k < 12; k++) {
      const t = k / 12 * Math.PI * 2 + 0.2;
      const cx = n.x + Math.cos(t) * 375, cy = n.y + Math.sin(t) * 290;
      if (Math.abs(Math.sin(t)) < 0.2 && Math.cos(t) > 0) continue;
      solids.push({ x: cx - 40, y: cy - 32, w: 80, h: 64, kind: 'house', color: ['#c0533a', '#b5452f', '#d27a3e', '#9e3b2b'][k % 4], town: n.id, flat: k % 3 === 0, face: t });
    }
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; palms.push({ x: n.x + Math.cos(t) * 150, y: n.y + Math.sin(t) * 110, s: 1, town: n.id }); }
    labels.push({ x: n.x, y: n.y - 360, text: n.name, size: 5, color: '#7a1f0e', town: n.id, sign: true });
    field(n.x - 900, n.y - 200, n.x - 470, n.y + 200, 200, 110, 25, n.id);
  }

  // ================= השטח =================
  const SPAWN = { x: 1250, y: 2050 };

  // נחלים
  wadis.push({ name: 'נחל יהב', w: 170, d: 2.6, pts: [[0, 2900], [600, 2950], [1300, 2780], [2000, 2700], [2550, 2300], [3200, 2150], [4000, 2250], [4700, 2150], [5400, 2250]] });
  wadis.push({ name: 'נחל נקרות', w: 160, d: 2.4, pts: [[0, 5600], [700, 5750], [1400, 5650], [2100, 5800], [2900, 5700], [3700, 5850], [4500, 5750], [5400, 5900]] });
  wadis.push({ name: 'נחל צין', w: 200, d: 3, pts: [[0, 450], [800, 520], [1600, 420], [2400, 560], [3200, 470], [4100, 560], [5400, 480]] });
  labels.push({ x: 1300, y: 2700, text: 'נחל יהב', size: 3, color: '#6b4a2a' });
  labels.push({ x: 1400, y: 5560, text: 'נחל נקרות', size: 3, color: '#6b4a2a' });
  labels.push({ x: 1600, y: 330, text: 'נחל צין', size: 3, color: '#6b4a2a' });

  // גבעות והרים
  hills.push({ x: 700, y: 4300, r: 520, h: 42, name: 'מצפור חופירה' });
  hills.push({ x: 600, y: 1300, r: 420, h: 26 });
  hills.push({ x: 2000, y: 1300, r: 330, h: 18 });
  hills.push({ x: 1300, y: 7000, r: 500, h: 34 });
  hills.push({ x: 3600, y: 6100, r: 300, h: 15 });
  hills.push({ x: 5000, y: 5400, r: 260, h: 12 });
  hills.push({ x: 2700, y: 1800, r: 250, h: 14 });
  hills.push({ x: 5850, y: 4200, r: 300, h: 20 });
  hills.push({ x: 5900, y: 6900, r: 330, h: 24 });

  function nearTown(x, y, pad) {
    for (const t of towns) {
      const rx = (t.rx || t.r) + pad, ry = (t.ry || t.r) + pad;
      if (((x - t.x) / rx) ** 2 + ((y - t.y) / ry) ** 2 < 1) return true;
    }
    return false;
  }
  function inFields(x, y, pad) {
    for (const g of greenhouses) if (x > g.x - pad && x < g.x + g.w + pad && y > g.y - pad && y < g.y + g.h + pad) return true;
    return false;
  }
  function nearRoad(x, y, pad) {
    for (const rd of roads) for (let i = 0; i < rd.pts.length - 1; i++) if (distToSeg(x, y, rd.pts[i], rd.pts[i + 1]) < rd.w / 2 + pad) return true;
    return false;
  }

  // דיונות
  function duneField(x0, y0, x1, y1, n, hmin, hmax) {
    let tries = 0;
    while (n > 0 && tries++ < n * 8) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 260) continue;
      if (nearTown(x, y, 150) || inFields(x, y, 120) || nearRoad(x, y, 120)) continue;
      dunes.push({ x, y, rx: 110 + rnd() * 140, ry: 70 + rnd() * 80, rot: (rnd() - 0.5) * 0.7, h: hmin + rnd() * (hmax - hmin) });
      n--;
    }
  }
  duneField(250, 1100, 2400, 2650, 32, 2.5, 7);
  duneField(4500, 4800, 5300, 5600, 18, 2.5, 6);
  duneField(300, 5900, 1800, 7800, 22, 3, 8);
  duneField(5600, 300, 6300, 7700, 26, 2, 6);
  duneField(3300, 1100, 5200, 1500, 8, 2, 5);
  labels.push({ x: 1200, y: 1180, text: 'הדיונות הגדולות', size: 3, color: '#6b4a2a' });

  // שיטים, סלעים ושיחים
  for (let k = 0; k < 520; k++) {
    const x = 60 + rnd() * (MOUNTAIN_X - 100), y = 60 + rnd() * (H - 120);
    if (nearTown(x, y, 60) || inFields(x, y, 40)) continue;
    if (Math.abs(x - HWX - 60) < 120 || Math.abs(x - PEACE_X) < 60) continue;
    acacias.push({ x, y, s: 0.7 + rnd() * 0.7 });
  }
  acacias.push({ x: 2450, y: 1650, s: 2.4, big: true });
  landmarks.push({ id: 'acacia', x: 2450, y: 1650, r: 140, name: 'השיטה הגדולה', reward: 100 });
  for (let k = 0; k < 1300; k++) {
    let x = 40 + rnd() * (W - 80), y = 40 + rnd() * (H - 80);
    if (x < MOUNTAIN_X && (nearTown(x, y, 30) || inFields(x, y, 20))) continue;
    if (Math.abs(x - HWX - 60) < 90) continue;
    rocks.push({ x, y, s: x > MOUNTAIN_X ? 1 + rnd() * 3.2 : 0.25 + rnd() * rnd() * 2.2, k: rnd() });
  }
  // סלעים גדולים בגבעות
  for (const h of hills) for (let k = 0; k < 10; k++) { const a = rnd() * 6.28, d = rnd() * h.r; rocks.push({ x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d, s: 1.4 + rnd() * 2, k: rnd() }); }

  // המעיין עין יהב — המקום המקורי של המושב
  springs.push({ x: 1850, y: 2350, r: 70, name: 'המעיין עין יהב' });
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; palms.push({ x: 1850 + Math.cos(a) * 95, y: 2350 + Math.sin(a) * 75, s: 0.9 + rnd() * 0.3 }); }
  landmarks.push({ id: 'spring', x: 1850, y: 2350, r: 140, name: 'המעיין עין יהב', reward: 150 });
  landmarks.push({ id: 'hofira', x: 700, y: 4300, r: 160, name: 'מצפור חופירה', reward: 200 });
  landmarks.push({ id: 'peace', x: PEACE_X, y: 4000, r: 160, name: 'דרך השלום', reward: 100 });
  landmarks.push({ id: 'edom', x: 6700, y: 3000, r: 220, name: 'מרגלות הרי אדום', reward: 250 });
  labels.push({ x: 700, y: 4300 - 60, text: 'מצפור חופירה', size: 3.2, color: '#5a2a14', sign: true });
  labels.push({ x: 1850, y: 2230, text: 'המעיין עין יהב', size: 2.6, color: '#1f6f8b', sign: true });
  labels.push({ x: 6900, y: 2200, text: 'הרי אדום', size: 9, color: '#5a2a14', high: true });
  labels.push({ x: 6900, y: 5800, text: 'הרי אדום', size: 9, color: '#5a2a14', high: true });

  // ארגזי כלים נטושים בשטח — מי שמוצא מקבל כלי
  [[900, 1500], [2900, 1650], [600, 3500], [1200, 5000], [5000, 2400], [5800, 5300], [2500, 7100], [4000, 7300], [1500, 6400], [5950, 1200]].forEach(([x, y], i) => toolboxes.push({ id: 'tb' + i, x, y }));

  // ================= מסלולים, קפיצות ותחרויות =================
  const MX = 4850, MY = 2700;
  const ovalPt = (t) => [MX + Math.cos(t) * 360 + Math.sin(t * 3) * 35, MY + Math.sin(t) * 210];
  const oval = [];
  for (let k = 0; k <= 72; k++) oval.push(ovalPt(k / 72 * Math.PI * 2));
  line(oval, 60, 'track');
  line([[MX, MY + 210], [MX, 3150], [4300, 3150], [4300, EY.y - 40]], 40, 'trail');
  labels.push({ x: MX, y: MY, text: 'מסלול המוטוקרוס', size: 3.4, color: '#6b4a2a', sign: true });
  for (let k = 0; k < 6; k++) {
    const t = Math.PI / 2 + (k + 0.5) * (Math.PI * 2 / 6);
    const [x, y] = ovalPt(t);
    const [x2, y2] = ovalPt(t + 0.01);
    ramps.push({ x, y, a: Math.atan2(y2 - y, x2 - x), len: 70, w: 70, h: 2.6 });
  }
  // פארק קפיצות לאופנועי שטח
  const JUMP_PARK = { x: 1500, y: 3300, name: 'פארק הקפיצות' };
  for (let k = 0; k < 5; k++) ramps.push({ x: 1150 + k * 170, y: 3300 + (k % 2) * 60, a: 0, len: 80, w: 90, h: 3 + k * 0.6 });
  line([[1050, 3300], [2050, 3330]], 50, 'trail');
  labels.push({ x: 1500, y: 3190, text: 'פארק הקפיצות 🏍️', size: 3, color: '#6b4a2a', sign: true });

  // שבילי שטח
  line([[SPAWN.x, SPAWN.y], [1600, 2250], [1850, 2350], [2200, 2650], [2600, 3050], [EY.x - OUT.rx + 30, EY.y - 250]], 34, 'trail');
  line([[1850, 2350], [2450, 1650], [3300, 1180]], 32, 'trail');
  line([[SPAWN.x, SPAWN.y], [900, 1500], [600, 1300], [300, 800]], 30, 'trail');
  line([[HX0, EY.y], [1100, 4100], [700, 4300]], 32, 'trail');
  line([[2400, 4580], [2300, 5300], [2200, 6100]], 32, 'trail');
  line([[3400, 4660], [3800, 5500], [4300, 6400]], 32, 'trail');
  line([[2740, 7150], [2400, 7000], [1300, 7000]], 30, 'trail');
  line([[4700, 1900], [4800, 2490]], 30, 'trail');
  line([[HWX, 3000], [PEACE_X, 3000]], 30, 'trail');
  line([[HWX, 5200], [5600, 5300], [PEACE_X, 5200]], 30, 'trail');

  const ATV_START = { x: 4900, y: 4850 };
  const outerPt = (t) => ({ x: EY.x + Math.cos(t) * OUT.rx, y: EY.y + Math.sin(t) * OUT.ry });
  const innerPt = (t) => ({ x: EY.x + Math.cos(t) * IN.rx, y: EY.y + Math.sin(t) * IN.ry });

  const RACES = [
    {
      id: 'moto', name: 'תחרות אופנועי שטח', emoji: '🏍️', vehicle: 'dirtbike', laps: 2,
      desc: 'שני סיבובים במסלול המוטוקרוס — עם קפיצות ענקיות!',
      start: { x: MX, y: MY + 210 },
      cps: Array.from({ length: 8 }, (_, k) => { const p = ovalPt(Math.PI / 2 + (k + 1) * Math.PI * 2 / 8); return { x: p[0], y: p[1] }; }),
      rewards: [700, 450, 250],
    },
    {
      id: 'atv', name: 'מרוץ טרקטורונים בדיונות', emoji: '🏁', vehicle: 'atv', laps: 1,
      desc: 'דוהרים בין הדיונות בדרום־מזרח',
      start: ATV_START,
      cps: [{ x: 5150, y: 4950 }, { x: 5230, y: 5350 }, { x: 4900, y: 5550 }, { x: 4580, y: 5300 }, { x: 4620, y: 4950 }, { x: ATV_START.x, y: ATV_START.y }],
      rewards: [600, 400, 220],
    },
    {
      id: 'bike', name: 'חוג אופניים', emoji: '🚲', vehicle: 'bike', laps: 1,
      desc: 'סיבוב אופניים על הטבעת החיצונית של המושב',
      start: { x: 3770, y: 4090 },
      cps: [{ x: EY.x + IN.rx * 0.98, y: EY.y + 120 }, ...[0.35, 0.75, 1.15, 1.55, 1.95, 2.35, 2.75, 3.15, 3.55, 3.95, 4.35, 4.75, 5.15, 5.55, 5.95, 6.25].map(outerPt), { x: EY.x + IN.rx, y: EY.y + 40 }, { x: 3770, y: 4090 }],
      rewards: [500, 330, 200],
    },
    {
      id: 'tri', name: 'טריאתלון', emoji: '🏊', vehicle: null, laps: 1,
      desc: 'שוחים בבריכה, רוכבים על אופניים ורצים — הכי ספורטיבי במושב!',
      start: { x: 3720, y: 3880 },
      cps: [
        { x: 3650, y: 3800, m: 'swim' }, { x: 3790, y: 3800, m: 'swim' }, { x: 3720, y: 3880, m: 'foot' },
        { x: EY.x + IN.rx, y: EY.y - 20, m: 'bike' }, ...[0.2, 0.9, 1.6, 2.3, 3.0, 3.7, 4.4, 5.1, 5.8].map((t) => Object.assign(outerPt(t), { m: 'bike' })), { x: EY.x + IN.rx, y: EY.y + 30, m: 'bike' },
        Object.assign(innerPt(0.6), { m: 'foot' }), { x: 3770, y: 4090, m: 'foot' },
      ],
      rewards: [800, 500, 300],
    },
    {
      id: 'youth', name: 'פעולה בנוער: מרוץ דגלים', emoji: '🚩', vehicle: null, laps: 1,
      desc: 'הפעולה של היום: אוספים את כל הדגלים במושב ברגל!',
      start: { x: 3605, y: 4120 },
      cps: [innerPt(0.9), innerPt(1.7), innerPt(2.6), { x: EY.x - 80, y: EY.y + 110 }, innerPt(4.6), { x: 3605, y: 4120 }],
      rewards: [400, 280, 180],
    },
  ];
  const MODE_SPEED = { foot: 70, swim: 26, bike: 200, dirtbike: 340, moto: 360, atv: 290, jeep: 300, tractor: 170 };
  for (const r of RACES) {
    let L = 0, tGold = 0, px = r.start.x, py = r.start.y;
    for (let lap = 0; lap < r.laps; lap++) {
      for (const c of r.cps) {
        const d = Math.hypot(c.x - px, c.y - py);
        L += d; tGold += d / MODE_SPEED[c.m || r.vehicle || 'foot'];
        px = c.x; py = c.y;
      }
    }
    r.length = L;
    r.gold = Math.round(tGold / 0.7 * 1000);
    r.silver = Math.round(tGold / 0.5 * 1000);
    r.minTime = Math.round(tGold / 1.5 * 1000);
    interacts.push({ id: 'race_' + r.id, type: 'race', race: r.id, x: r.start.x, y: r.start.y, r: 50, label: r.emoji + ' ' + r.name, town: r.id === 'moto' || r.id === 'atv' ? null : T });
  }
  RACES.find((r) => r.id === 'atv').cps.forEach((c, i) => { if (i % 2 === 0 && i < 5) ramps.push({ x: c.x - 120, y: c.y + 30, a: 0.4, len: 70, w: 70, h: 2.4 }); });

  // עבודות: הובלת ארגזי פלפלים מהחממות לבית האריזה
  const JOB_PICKUPS = [
    { id: 'p1', x: 4440, y: 3880, name: 'בתי הרשת ליד הכניסה' },
    { id: 'p2', x: 3450, y: 2990, name: 'החממות של משק מזור' },
    { id: 'p3', x: 3000, y: 4840, name: 'החממות הדרומיות' },
    { id: 'p4', x: 5100, y: 4060, name: 'בתי הרשת המזרחיים' },
  ];
  for (const j of JOB_PICKUPS) interacts.push({ id: 'job_' + j.id, type: 'job', job: j.id, x: j.x, y: j.y, r: 55, label: '🌶️ עבודה: הובלת פלפלים', town: T });

  // ================= כלי רכב =================
  const VEHICLES = {
    bike:     { name: 'אופניים',      max: 200, acc: 300, turn: 3.6, seats: 1, r: 8,  len: 1.8, wid: 0.6, offroad: 0.65, price: 200,  grip: 0.9 },
    dirtbike: { name: 'אופנוע שטח',   max: 340, acc: 470, turn: 3.4, seats: 2, r: 10, len: 2.2, wid: 0.8, offroad: 0.97, price: 900,  grip: 0.85 },
    moto:     { name: 'אופנוע כביש',  max: 380, acc: 480, turn: 3.0, seats: 2, r: 10, len: 2.2, wid: 0.8, offroad: 0.7,  price: 800,  grip: 0.95 },
    atv:      { name: 'טרקטורון',     max: 290, acc: 420, turn: 2.9, seats: 2, r: 13, len: 2.1, wid: 1.25, offroad: 0.97, price: 1000, grip: 0.9 },
    jeep:     { name: "ג'יפ",         max: 310, acc: 330, turn: 2.2, seats: 4, r: 18, len: 4.2, wid: 1.9, offroad: 0.92, price: 1800, grip: 0.8 },
    tractor:  { name: 'טרקטור',       max: 170, acc: 230, turn: 2.0, seats: 2, r: 16, len: 3.6, wid: 2.0, offroad: 0.95, price: 1200, grip: 1 },
  };
  const STARTER_TYPES = ['dirtbike', 'atv', 'jeep'];

  const publicVehicles = [];
  for (let k = 0; k < 4; k++) publicVehicles.push({ type: 'dirtbike', x: MX - 90 + k * 45, y: MY + 280, a: -Math.PI / 2 });
  for (let k = 0; k < 3; k++) publicVehicles.push({ type: 'atv', x: ATV_START.x - 80 + k * 60, y: ATV_START.y - 90, a: -Math.PI / 2 });
  publicVehicles.push({ type: 'dirtbike', x: 1100, y: 3420, a: 0 });
  publicVehicles.push({ type: 'dirtbike', x: 1160, y: 3430, a: 0 });
  publicVehicles.push({ type: 'tractor', x: 4400, y: 3880, a: Math.PI });
  for (const n of NEIGHBORS) publicVehicles.push({ type: rnd() < 0.5 ? 'atv' : 'dirtbike', x: n.x + 320, y: n.y + 60, a: 0 });

  // ================= חנויות =================
  const MATERIALS = {
    blocks:  { name: 'בלוקים', emoji: '🧱', price: 100 },
    cement:  { name: 'מלט',    emoji: '🪣', price: 80 },
    roof:    { name: 'רעפים',  emoji: '🟥', price: 120 },
    windows: { name: 'חלונות', emoji: '🪟', price: 90 },
  };
  const TOOLS = {
    hammer: { name: 'פטיש', emoji: '🔨', price: 120 },
    saw:    { name: 'מסור', emoji: '🪚', price: 150 },
    shovel: { name: 'את חפירה', emoji: '⛏️', price: 130 },
    drill:  { name: 'מקדחה', emoji: '🪛', price: 250 },
    barrow: { name: 'מריצה', emoji: '🛒', price: 200 },
  };
  const SHOPS = {
    super: { title: '🛒 הסופר של המושב', sub: 'אוכל ושתייה למשפחה — ועוד כמה דברים', items: [
      { id: 'water', name: 'שישיית מים', emoji: '💧', price: 10, water: 40 },
      { id: 'bread', name: 'לחם ופיתות', emoji: '🍞', price: 20, food: 30 },
      { id: 'popsicle', name: 'ארטיקים לכולם', emoji: '🍦', price: 25, food: 15, boost: 30 },
      { id: 'pizza', name: 'מגש פיצה משפחתי', emoji: '🍕', price: 60, food: 60, boost: 60 },
      { id: 'cap', name: 'כובע מצחייה', emoji: '🧢', price: 150, hat: 'cap' },
      { id: 'sun', name: 'כובע טמבל', emoji: '👒', price: 120, hat: 'sun' },
      { id: 'cowboy', name: 'כובע בוקרים', emoji: '🤠', price: 350, hat: 'cowboy' },
      { id: 'helmet', name: 'קסדת מוטוקרוס', emoji: '⛑️', price: 400, hat: 'helmet' },
    ] },
    materials: { title: '🧱 חומרי בניין', sub: 'כל מה שצריך כדי לבנות בית', items: Object.keys(MATERIALS).map((id) => ({ id, name: MATERIALS[id].name, emoji: MATERIALS[id].emoji, price: MATERIALS[id].price, material: true })) },
    tools: { title: '🔨 חנות הכלים', sub: 'בלי כלים אי אפשר לבנות!', items: Object.keys(TOOLS).map((id) => ({ id, name: TOOLS[id].name, emoji: TOOLS[id].emoji, price: TOOLS[id].price, tool: true })) },
    dealer: { title: '🏍️ מוסך וסוכנות רכב', sub: 'הרכב החדש יחכה לך בחוץ', items: [
      ...Object.keys(VEHICLES).map((t) => ({ id: t, name: VEHICLES[t].name, price: VEHICLES[t].price, vehicle: t })),
    ] },
  };

  const HOUSE_TYPES = {
    small: { name: 'בית קטן', w: 80, h: 70, need: { blocks: 2, cement: 1, roof: 1, windows: 1 }, tools: ['hammer', 'saw'] },
    big:   { name: 'בית גדול', w: 110, h: 90, need: { blocks: 4, cement: 2, roof: 2, windows: 2 }, tools: ['hammer', 'saw', 'shovel'] },
    villa: { name: 'וילה עם בריכה', w: 140, h: 105, need: { blocks: 6, cement: 3, roof: 3, windows: 4 }, tools: ['hammer', 'saw', 'shovel', 'drill'] },
  };
  const FAMILY_COST = { coins: 400, need: { blocks: 2, cement: 1 } };

  const MAZOR_STAGES = [
    { name: 'יסודות', need: { cement: 4, blocks: 2 }, tools: ['shovel'] },
    { name: 'קירות', need: { blocks: 8, cement: 2 }, tools: ['hammer'] },
    { name: 'חלונות ודלת', need: { windows: 6 }, tools: ['drill'] },
    { name: 'גג רעפים', need: { roof: 6 }, tools: ['saw'] },
    { name: 'גינה, חממה ושלט', need: { coins: 500 }, tools: ['barrow'] },
  ];

  const QUESTS = [
    { id: 'found', title: 'מצא מקום להקים את המושב', desc: 'נוסעים עם המשפחה בשטח עד הדגל', target: { x: EY.x, y: EY.y }, reward: 300 },
    { id: 'tools', title: 'השג כלים', desc: 'קנה פטיש בחנות הכלים — או מצא ארגז כלים בשטח', target: { x: 3255, y: 4100 }, reward: 100 },
    { id: 'materials', title: 'קנה חומרי בניין', desc: 'בחנות חומרי הבניין במרכז המסחרי', target: { x: 3135, y: 4100 }, reward: 100 },
    { id: 'mazor', title: 'עזור לבנות את משק מזור', desc: 'מביאים חומרים וכלים למשק במרכז המושב', target: { x: 3400, y: 3800 }, reward: 400 },
    { id: 'family', title: 'הבא משפחה חדשה למושב', desc: 'במזכירות המושב — כל משפחה מגדילה את עין יהב', target: { x: 3440, y: 4240 }, reward: 300 },
    { id: 'job', title: 'עבודה: הובל ארגזי פלפלים', desc: 'מהחממות לבית האריזה', target: JOB_PICKUPS[0], reward: 150 },
    { id: 'school', title: 'לך לבית הספר', desc: 'שיעור קצר — כל תשובה נכונה שווה כסף', target: { x: 3060, y: 3893 }, reward: 200 },
    { id: 'youth', title: 'לך לפעולה בנוער', desc: 'מרוץ דגלים ליד מועדון הנוער', target: { x: 3605, y: 4120 }, reward: 200 },
    { id: 'moto', title: 'תחרות אופנועי שטח', desc: 'במסלול המוטוקרוס צפונית לכניסה', target: RACES[0].start, reward: 300 },
    { id: 'jump', title: 'קפיצה ענקית!', desc: 'קפוץ עם אופנוע שטח בפארק הקפיצות', target: JUMP_PARK, reward: 200 },
    { id: 'trip', title: "טיול ג'יפים וטרקטורונים", desc: 'בקר ב-3 מושבים שכנים', target: null, reward: 400 },
    { id: 'explore', title: 'מטיילים בשטח', desc: 'גלה 3 מקומות: המעיין, מצפור חופירה, השיטה הגדולה...', target: null, reward: 400 },
    { id: 'house', title: 'בנה בית למשפחה שלך', desc: 'צריך חומרי בניין וכלים', target: null, reward: 300 },
    { id: 'bike', title: 'חוג אופניים', desc: 'מתחילים ליד מרכז הספורט', target: RACES[2].start, reward: 200 },
    { id: 'tri', title: 'חוג טריאתלון', desc: 'מתחילים בבריכה', target: RACES[3].start, reward: 300 },
  ];

  const SCHOOL_QUESTIONS = [
    { q: 'מה מגדלים הכי הרבה בחממות של עין יהב?', a: ['פלפלים', 'תפוחים', 'בננות'] },
    { q: 'באיזה אזור בארץ נמצא עין יהב?', a: ['בערבה', 'בגליל', 'בשרון'] },
    { q: 'כמה זה 7 × 8?', a: ['56', '54', '64'] },
    { q: 'איזה כביש עובר ליד עין יהב?', a: ['כביש 90', 'כביש 6', 'כביש 1'] },
    { q: 'מה בירת ישראל?', a: ['ירושלים', 'תל אביב', 'אילת'] },
    { q: 'איזה בעל חיים חי במדבר?', a: ['צבי', 'פינגווין', 'דולפין'] },
    { q: 'כמה זה 15 + 27?', a: ['42', '32', '52'] },
    { q: 'אילו הרים רואים ממזרח לערבה?', a: ['הרי אדום', 'האלפים', 'הכרמל'] },
    { q: 'מה חובה לשים על הראש כשרוכבים על אופנוע?', a: ['קסדה', 'כובע גרב', 'כלום'] },
    { q: 'איזה עץ נותן תמרים?', a: ['דקל', 'אורן', 'אלון'] },
    { q: 'כמה זה 100 − 37?', a: ['63', '73', '67'] },
    { q: 'מה שותים הרבה כשמטיילים במדבר?', a: ['מים', 'כלום', 'מיץ מלח'] },
    { q: 'כמה גלגלים יש לטרקטורון?', a: ['4', '2', '3'] },
    { q: 'איך קוראים לנחל שעובר ליד עין יהב?', a: ['נחל יהב', 'נחל הירקון', 'נחל קישון'] },
    { q: 'איזה בעל חיים עם קרניים מטפס על הרים?', a: ['יעל', 'סוס', 'חתול'] },
  ];

  const ANIMALS = [
    ...[[1900, 2000], [800, 6500], [5900, 3000], [1000, 3900], [5900, 6300], [3900, 1300]].map(([x, y]) => ({ kind: 'gazelle', x, y, n: 5 })),
    ...[[6750, 2600], [6800, 4800], [6650, 6600]].map(([x, y]) => ({ kind: 'ibex', x, y, n: 4 })),
    ...[[1500, 4800], [4600, 1000]].map(([x, y]) => ({ kind: 'camel', x, y, n: 3 })),
    { kind: 'dog', x: EY.x, y: EY.y, n: 4, town: T },
  ];

  // ================= גובה הקרקע (מטרים) =================
  const flatAreas = [];
  for (const t of towns) flatAreas.push({ x: t.x, y: t.y, rx: (t.rx || t.r), ry: (t.ry || t.r) });
  const fieldBoxes = [];
  (function () {
    const groups = {};
    for (const g of greenhouses) {
      const key = Math.floor(g.x / 900) + ',' + Math.floor(g.y / 900);
      const b = groups[key] || (groups[key] = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
      b.x0 = Math.min(b.x0, g.x); b.y0 = Math.min(b.y0, g.y); b.x1 = Math.max(b.x1, g.x + g.w); b.y1 = Math.max(b.y1, g.y + g.h);
    }
    for (const k in groups) fieldBoxes.push(groups[k]);
  })();
  const paved = roads.filter((r) => r.kind === 'highway' || r.kind === 'road');
  for (const r of roads) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    r.bb = [x0, y0, x1, y1];
  }
  for (const w of wadis) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of w.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    w.bb = [x0, y0, x1, y1];
  }

  function lowBase(x, y) { return 3.2 * fbm(x / 1300, y / 1300, 3) - 1.4; }
  function heightAt(x, y) {
    let h = lowBase(x, y) + 1.1 * fbm(x / 260 + 7, y / 260 + 7, 3) - 0.5;
    for (const hl of hills) {
      const dx = x - hl.x, dy = y - hl.y, d2 = (dx * dx + dy * dy) / (hl.r * hl.r);
      if (d2 < 4) h += hl.h * Math.exp(-d2 * 2.3) * (0.85 + 0.3 * vnoise(x / 120, y / 120));
    }
    if (x > MOUNTAIN_X - 400) {
      const t = smooth(MOUNTAIN_X - 400, MOUNTAIN_X + 500, x);
      const ridge = 1 - Math.abs(2 * fbm(x / 420 + 3, y / 420 + 3, 4) - 1);
      h += t * (25 + 110 * ridge * ridge + 40 * fbm(x / 160, y / 160, 3)) + smooth(MOUNTAIN_X + 300, W, x) * 60;
    }
    for (const d of dunes) {
      const dx = x - d.x, dy = y - d.y;
      if (Math.abs(dx) > d.rx * 1.2 || Math.abs(dy) > d.rx * 1.2) continue;
      const c = Math.cos(-d.rot), s = Math.sin(-d.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      const q = (lx * lx) / (d.rx * d.rx) + (ly * ly) / (d.ry * d.ry);
      if (q < 1) h += d.h * (lx > 0 ? Math.pow(1 - q, 0.7) : Math.pow(1 - q, 1.6));
    }
    for (const w of wadis) {
      if (x < w.bb[0] - w.w || x > w.bb[2] + w.w || y < w.bb[1] - w.w || y > w.bb[3] + w.w) continue;
      let dm = 1e9;
      for (let i = 0; i < w.pts.length - 1; i++) dm = Math.min(dm, distToSeg(x, y, w.pts[i], w.pts[i + 1]));
      if (dm < w.w) { const k = 1 - dm / w.w; h -= w.d * k * k * (3 - 2 * k); }
    }
    for (const r of ramps) {
      const dx = x - r.x, dy = y - r.y;
      if (Math.abs(dx) > r.len + r.w || Math.abs(dy) > r.len + r.w) continue;
      const c = Math.cos(-r.a), s = Math.sin(-r.a);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.abs(ly) < r.w / 2 && lx > -r.len && lx < 12) {
        const side = smooth(r.w / 2, r.w / 2 - 12, Math.abs(ly));
        h += (lx < 0 ? r.h * (1 + lx / r.len) : r.h * (1 - lx / 12)) * side;
      }
    }
    // יישור יישובים, שדות וכבישים
    let flat = 0;
    for (const f of flatAreas) {
      const q = ((x - f.x) / (f.rx + 250)) ** 2 + ((y - f.y) / (f.ry + 250)) ** 2;
      if (q < 1) flat = Math.max(flat, smooth(1, 0.72, q));
    }
    for (const b of fieldBoxes) {
      if (x > b.x0 - 150 && x < b.x1 + 150 && y > b.y0 - 150 && y < b.y1 + 150) {
        const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
        flat = Math.max(flat, smooth(150, 20, Math.hypot(dx, dy)));
      }
    }
    if (flat > 0) h = h + (0.25 + 0.15 * vnoise(x / 200, y / 200) - h) * flat;
    let rf = 0;
    for (const r of paved) {
      if (x < r.bb[0] - 120 || x > r.bb[2] + 120 || y < r.bb[1] - 120 || y > r.bb[3] + 120) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const d = distToSeg(x, y, r.pts[i], r.pts[i + 1]);
        if (d < r.w / 2 + 110) rf = Math.max(rf, smooth(r.w / 2 + 110, r.w / 2 + 12, d));
      }
    }
    if (rf > 0) {
      const target = flat > 0.5 ? 0.25 : Math.min(lowBase(x, y), 8) * 0.6;
      h = h + (target - h) * rf;
    }
    return h;
  }

  // ================= עזרים =================
  function rectHit(r, x, y, pad) { return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad; }
  function rectsOverlap(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y; }
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function collides(x, y, r, extra, skipTown) {
    if (x < r || y < r || x > W - r || y > H - r) return true;
    for (const s of solids) if ((!skipTown || s.town !== skipTown) && rectHit(s, x, y, r)) return true;
    if (extra) for (const s of extra) if (rectHit(s, x, y, r)) return true;
    return false;
  }
  function onRoad(x, y, skipTown) {
    for (const rd of roads) {
      if (skipTown && rd.town === skipTown) continue;
      if (x < rd.bb[0] - rd.w || x > rd.bb[2] + rd.w || y < rd.bb[1] - rd.w || y > rd.bb[3] + rd.w) continue;
      for (let i = 0; i < rd.pts.length - 1; i++) if (distToSeg(x, y, rd.pts[i], rd.pts[i + 1]) < rd.w / 2) return rd.kind;
    }
    return null;
  }
  function inPool(x, y) { return rectHit(POOL, x, y, 0); }
  function canPlace(r, extra) {
    if (r.x < 30 || r.y < 30 || r.x + r.w > MOUNTAIN_X - 300 || r.y + r.h > H - 30) return false;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.hypot(r.w, r.h) / 2;
    for (const rd of roads) {
      if (cx < rd.bb[0] - rd.w - rad || cx > rd.bb[2] + rd.w + rad || cy < rd.bb[1] - rd.w - rad || cy > rd.bb[3] + rd.w + rad) continue;
      for (let i = 0; i < rd.pts.length - 1; i++) if (distToSeg(cx, cy, rd.pts[i], rd.pts[i + 1]) < rd.w / 2 + rad * 0.8) return false;
    }
    for (const s of solids) if (rectsOverlap(r, s, 8)) return false;
    for (const g of greenhouses) if (rectsOverlap(r, g, 6)) return false;
    for (const d of decor) if (d.noBuild && rectsOverlap(r, d, 0)) return false;
    for (const p of planned) if (rectsOverlap(r, p, 8)) return false;
    if (rectsOverlap(r, POOL, 10)) return false;
    if (extra) for (const s of extra) if (rectsOverlap(r, s, 8)) return false;
    for (const rc of RACES) for (const c of rc.cps) if (Math.hypot(c.x - cx, c.y - cy) < rad + 50) return false;
    for (const rp of ramps) if (Math.hypot(rp.x - cx, rp.y - cy) < rad + rp.len) return false;
    return true;
  }
  function townAt(x, y) {
    for (const t of towns) {
      const rx = t.rx || t.r, ry = t.ry || t.r;
      if (((x - t.x) / rx) ** 2 + ((y - t.y) / ry) ** 2 < 1) return t;
    }
    return null;
  }

  // בתים של מושבים שכנים שיצאו על כביש — מורידים
  for (let i = solids.length - 1; i >= 0; i--) {
    const sd = solids[i];
    if (sd.kind !== 'house') continue;
    const cx = sd.x + sd.w / 2, cy = sd.y + sd.h / 2;
    if (roads.some((rd) => rd.pts.some((p, k) => k < rd.pts.length - 1 && distToSeg(cx, cy, p, rd.pts[k + 1]) < rd.w / 2 + 45))) solids.splice(i, 1);
  }

  const api = {
    W, H, SC, HWX, MOUNTAIN_X, PEACE_X, roads, solids, greenhouses, palms, decor, labels, acacias, rocks, wadis, dunes, hills, ramps,
    towns, interacts, landmarks, toolboxes, springs, EY, IN, OUT, MAZOR, MAZOR_LOT, POOL, SPAWN, JUMP_PARK, RACES, VEHICLES, STARTER_TYPES, publicVehicles,
    MATERIALS, TOOLS, SHOPS, HOUSE_TYPES, FAMILY_COST, MAZOR_STAGES, QUESTS, SCHOOL_QUESTIONS, ANIMALS, JOB_PICKUPS, planned,
    heightAt, fbm, vnoise, hash2, collides, onRoad, canPlace, rectsOverlap, distToSeg, inPool, townAt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MAP = api;
})(this);
