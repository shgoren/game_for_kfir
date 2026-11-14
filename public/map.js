// מפת מושב עין יהב — קובץ משותף לשרת וללקוח (אותה מפה בדיוק לכולם)
(function (root) {
  'use strict';

  const W = 4000, H = 3000;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(5091);

  const roads = [];       // מלבנים {x,y,w,h,kind}
  const trails = [];      // שבילי עפר {pts:[[x,y]...], w}
  const solids = [];      // מבנים שאי אפשר לעבור דרכם
  const greenhouses = []; // חממות פלפלים
  const palms = [];       // דקלים
  const decor = [];       // אזורים לא חוסמים (גינות, בריכה, דיונות...)
  const labels = [];      // שלטים על המפה

  // ---- כביש 90 ----
  roads.push({ x: 3500, y: 0, w: 120, h: H, kind: 'highway' });
  labels.push({ x: 3560, y: 260, text: 'כביש 90', size: 26 });

  // ---- הרי אדום ----
  decor.push({ x: 3720, y: 0, w: 280, h: H, kind: 'mountains' });
  labels.push({ x: 3860, y: 1500, text: 'הרי אדום', size: 30 });

  // ---- המושב: רשת רחובות ----
  const XS = [1300, 1600, 1900, 2200, 2500];
  const YS = [900, 1200, 1500, 1800, 2100];
  const SW = 60;
  for (const x of XS) roads.push({ x, y: YS[0], w: SW, h: YS[YS.length - 1] - YS[0] + SW, kind: 'road' });
  for (const y of YS) roads.push({ x: XS[0], y, w: XS[XS.length - 1] - XS[0] + SW, h: SW, kind: 'road' });

  // כביש הכניסה מכביש 90
  roads.push({ x: 2560, y: 1500, w: 940, h: 60, kind: 'road' });
  labels.push({ x: 3000, y: 1480, text: '← עין יהב', size: 22 });

  // שער / שלט גדול
  labels.push({ x: 1930, y: 850, text: 'מושב עין יהב', size: 48 });

  // תחנת דלק ליד הכניסה
  solids.push({ x: 3360, y: 1395, w: 120, h: 85, kind: 'building', color: '#e05a3a', label: 'תחנת דלק' });

  const CX = 1930, CY = 1530; // כיכר המושב

  function house(x, y, w, h) {
    const colors = ['#c0533a', '#b5452f', '#d27a3e', '#9e3b2b', '#c86b4a', '#8b5a3c'];
    solids.push({ x, y, w, h, kind: 'house', color: colors[Math.floor(rnd() * colors.length)] });
  }

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const bx = XS[i] + SW, by = YS[j] + SW, bw = 240, bh = 240;
      const key = i + ',' + j;
      if (key === '1,1') {
        // מרכז המושב: מכולת, מועדון וחניית אופנועים
        decor.push({ x: bx, y: by, w: bw, h: bh, kind: 'plaza' });
        solids.push({ x: bx + 15, y: by + 15, w: 100, h: 70, kind: 'building', color: '#3a7bd5', label: 'המכולת' });
        solids.push({ x: bx + 130, y: by + 15, w: 95, h: 70, kind: 'building', color: '#8e44ad', label: 'מועדון' });
        labels.push({ x: bx + 120, y: by + 120, text: 'חנייה', size: 16 });
      } else if (key === '2,1') {
        decor.push({ x: bx, y: by, w: bw, h: bh, kind: 'yard' });
        solids.push({ x: bx + 20, y: by + 20, w: 200, h: 110, kind: 'building', color: '#e2b13c', label: 'בית הספר' });
      } else if (key === '1,2') {
        decor.push({ x: bx, y: by, w: bw, h: bh, kind: 'grass' });
        decor.push({ x: bx + 30, y: by + 70, w: 180, h: 110, kind: 'pool', label: 'בריכה' });
        solids.push({ x: bx + 70, y: by + 10, w: 100, h: 45, kind: 'building', color: '#16a085', label: 'מלתחות' });
      } else if (key === '2,2') {
        decor.push({ x: bx, y: by, w: bw, h: bh, kind: 'grass' });
        decor.push({ x: bx + 120, y: by + 110, w: 110, h: 120, kind: 'playground', label: 'גן שעשועים' });
        solids.push({ x: bx + 15, y: by + 15, w: 95, h: 85, kind: 'building', color: '#f5f0e1', label: 'בית כנסת' });
      } else {
        // שכונת מגורים: 4 מגרשים, חלקם ריקים (אפשר לבנות שם!)
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            const lx = bx + a * 120, ly = by + b * 120;
            decor.push({ x: lx + 6, y: ly + 6, w: 108, h: 108, kind: 'garden' });
            if (rnd() < 0.78) house(lx + 18, ly + 22, 78, 64);
          }
        }
      }
    }
  }

  // מגדל המים
  solids.push({ x: 1150, y: 960, w: 70, h: 70, kind: 'tower', color: '#bfc7cf', label: 'מגדל המים' });

  // ---- חממות פלפלים במערב ----
  roads.push({ x: 0, y: 1500, w: 1300, h: 60, kind: 'dirt' });
  for (let gx = 100; gx <= 880; gx += 195) {
    for (let gy = 300; gy <= 2750; gy += 115) {
      if (gy + 90 > 1480 && gy < 1580) continue;
      greenhouses.push({ x: gx, y: gy, w: 170, h: 88 });
    }
  }
  labels.push({ x: 600, y: 270, text: 'חממות פלפלים', size: 30 });

  // ---- חממות בדרום ----
  roads.push({ x: 1300, y: 2190, w: 2200, h: 50, kind: 'dirt' });
  for (let gx = 1320; gx <= 3150; gx += 200) {
    for (let gy = 2300; gy <= 2830; gy += 115) {
      greenhouses.push({ x: gx, y: gy, w: 175, h: 88 });
    }
  }

  // ---- מטע תמרים בצפון ----
  for (let px = 1340; px <= 2560; px += 75) {
    for (let py = 300; py <= 760; py += 75) {
      palms.push({ x: px + (rnd() - 0.5) * 18, y: py + (rnd() - 0.5) * 18, r: 26 + rnd() * 8 });
    }
  }
  labels.push({ x: 1950, y: 270, text: 'מטע תמרים', size: 28 });

  // ---- דיונות ומסלול מוטוקרוס ----
  for (let k = 0; k < 14; k++) {
    decor.push({ x: 2700 + rnd() * 650, y: 150 + rnd() * 1100, w: 120 + rnd() * 160, h: 60 + rnd() * 80, kind: 'dune' });
  }
  labels.push({ x: 3050, y: 120, text: 'דיונות', size: 26 });

  const track = [];
  for (let k = 0; k <= 40; k++) {
    const t = (k / 40) * Math.PI * 2;
    track.push([3050 + Math.cos(t) * 320 + Math.sin(t * 3) * 40, 1880 + Math.sin(t) * 190]);
  }
  trails.push({ pts: track, w: 46 });
  labels.push({ x: 3050, y: 1885, text: 'מסלול מוטוקרוס', size: 24 });
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * Math.PI * 2 + 0.3;
    decor.push({ x: 3050 + Math.cos(t) * 320 - 20, y: 1880 + Math.sin(t) * 190 - 12, w: 40, h: 24, kind: 'jump' });
  }

  // שבילי מדבר לאופנועים
  trails.push({ pts: [[3500, 380], [3150, 420], [2850, 620], [2600, 900]], w: 34 });
  trails.push({ pts: [[2560, 1700], [2750, 1760], [2800, 1880]], w: 34 });
  trails.push({ pts: [[1300, 880], [1000, 600], [600, 230], [80, 120]], w: 34 });
  trails.push({ pts: [[1300, 2240], [1100, 2600], [800, 2930], [200, 2960]], w: 34 });
  trails.push({ pts: [[3500, 2600], [3380, 2250]], w: 34 });

  // ---- כלי רכב ציבוריים (חינם לכולם) ----
  const publicVehicles = [];
  for (let k = 0; k < 6; k++) publicVehicles.push({ type: 'moto', x: XS[1] + SW + 25 + k * 38, y: YS[1] + SW + 150, a: -Math.PI / 2 });
  publicVehicles.push({ type: 'atv', x: XS[1] + SW + 60, y: YS[1] + SW + 210, a: 0 });
  publicVehicles.push({ type: 'atv', x: XS[1] + SW + 160, y: YS[1] + SW + 210, a: 0 });
  for (let k = 0; k < 4; k++) publicVehicles.push({ type: 'moto', x: 3330 + k * 40, y: 1610, a: -Math.PI / 2 });
  publicVehicles.push({ type: 'jeep', x: 3440, y: 1640, a: Math.PI });
  publicVehicles.push({ type: 'moto', x: 2730, y: 1930, a: 0 });
  publicVehicles.push({ type: 'moto', x: 2730, y: 1980, a: 0 });
  publicVehicles.push({ type: 'tractor', x: 1060, y: 1530, a: Math.PI });

  // ---- סוגי רכבים ----
  const VEHICLES = {
    moto:    { name: 'אופנוע',      max: 430, acc: 520, turn: 4.4, seats: 2, r: 16, len: 46, wid: 16, offroad: 0.9 },
    atv:     { name: 'טרקטורון',    max: 350, acc: 440, turn: 3.8, seats: 2, r: 18, len: 42, wid: 30, offroad: 0.95 },
    jeep:    { name: "ג'יפ",        max: 370, acc: 360, turn: 2.9, seats: 4, r: 24, len: 72, wid: 38, offroad: 0.85 },
    tractor: { name: 'טרקטור',      max: 200, acc: 260, turn: 2.4, seats: 2, r: 22, len: 56, wid: 36, offroad: 1 },
  };

  const PRICES = { house: 50, motos: 120, cars: 200 };
  const HOUSE_SIZE = { w: 90, h: 80 };
  const CONTAINER_SIZE = { w: 140, h: 52 };

  // ---- עזרים ----
  function rectHit(r, x, y, pad) {
    return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  }
  function rectsOverlap(a, b, pad) {
    pad = pad || 0;
    return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  }
  function collides(x, y, r, extra) {
    if (x < r || y < r || x > W - r || y > H - r) return true;
    for (const s of solids) if (rectHit(s, x, y, r)) return true;
    if (extra) for (const s of extra) if (rectHit(s, x, y, r)) return true;
    return false;
  }
  function onRoad(x, y) {
    for (const rd of roads) if (rectHit(rd, x, y, 0)) return true;
    for (const t of trails) {
      for (let i = 0; i < t.pts.length - 1; i++) {
        if (distToSeg(x, y, t.pts[i], t.pts[i + 1]) < t.w / 2) return true;
      }
    }
    return false;
  }
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * dx, cy = a[1] + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
  // האם מותר לבנות במלבן הזה?
  function canPlace(rect, extra) {
    if (rect.x < 20 || rect.y < 20 || rect.x + rect.w > W - 300 || rect.y + rect.h > H - 20) return false;
    for (const rd of roads) if (rectsOverlap(rect, rd, 4)) return false;
    for (const s of solids) if (rectsOverlap(rect, s, 6)) return false;
    if (extra) for (const s of extra) if (rectsOverlap(rect, s, 6)) return false;
    return true;
  }

  const api = {
    W, H, roads, trails, solids, greenhouses, palms, decor, labels,
    spawn: { x: CX, y: CY }, publicVehicles, VEHICLES, PRICES, HOUSE_SIZE, CONTAINER_SIZE,
    collides, onRoad, canPlace, rectsOverlap,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MAP = api;
})(this);
