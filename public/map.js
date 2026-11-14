// עולם המשחק — קובץ משותף לשרת וללקוח (אותו עולם בדיוק לכולם)
(function (root) {
  'use strict';

  const W = 7200, H = 8000;
  const HWX = 5400;          // כביש 90
  const MOUNTAIN_X = 6350;   // הרי אדום

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(777);

  const roads = [], trails = [], solids = [], greenhouses = [], palms = [], decor = [], labels = [];
  const acacias = [], rocks = [], wadis = [], dunes = [], jumps = [], towns = [], interacts = [];

  // ================= כביש 90 =================
  roads.push({ x: HWX, y: 0, w: 120, h: H, kind: 'highway' });
  [500, 2600, 5000, 7300].forEach((y) => labels.push({ x: HWX + 60, y, text: 'כביש 90', size: 28, vertical: true }));
  labels.push({ x: 6800, y: 2000, text: 'הרי אדום', size: 40, color: '#5a2a14' });
  labels.push({ x: 6800, y: 5600, text: 'הרי אדום', size: 40, color: '#5a2a14' });

  // ================= עין יהב =================
  const EY = { id: 'ey', name: 'עין יהב', sub: 'מושב בערבה התיכונה', x: 3600, y: 3800, r: 950 };
  towns.push(EY);
  const XS = [2820, 3120, 3420, 3720, 4020, 4320];
  const YS = [3020, 3320, 3620, 3920, 4220, 4520];
  const SW = 60, BS = 240;
  const T = 'ey';
  for (const x of XS) roads.push({ x, y: YS[0], w: SW, h: YS[5] - YS[0] + SW, kind: 'road', town: T });
  for (const y of YS) roads.push({ x: XS[0], y, w: XS[5] - XS[0] + SW, h: SW, kind: 'road', town: T });
  roads.push({ x: XS[5] + SW, y: YS[2], w: HWX - XS[5] - SW, h: SW, kind: 'road', town: T });
  roads.push({ x: 1650, y: YS[3], w: XS[0] - 1650, h: SW, kind: 'dirt', town: T });
  labels.push({ x: 4900, y: YS[2] - 24, text: '← עין יהב', size: 24, town: T });
  labels.push({ x: 3600, y: 2975, text: 'מושב עין יהב', size: 56, town: T, color: '#7a1f0e' });

  const blk = (i, j) => ({ x: XS[i] + SW, y: YS[j] + SW, w: BS, h: BS });
  const HOUSE_COLORS = ['#c0533a', '#b5452f', '#d27a3e', '#9e3b2b', '#c86b4a', '#a0522d', '#cd6155'];
  function addHouse(x, y, w, h, town) {
    solids.push({ x, y, w, h, kind: 'house', color: HOUSE_COLORS[Math.floor(rnd() * HOUSE_COLORS.length)], town, solar: rnd() < 0.8 });
  }
  function building(x, y, w, h, color, label, town, extra) {
    const b = Object.assign({ x, y, w, h, kind: 'building', color, label, town }, extra || {});
    solids.push(b);
    return b;
  }

  // בית משפחת מזור — מגרש במרכז המושב
  const MAZOR_LOT = blk(2, 2);
  const MAZOR = { x: 3525, y: 3705, w: 150, h: 120 };
  decor.push(Object.assign({ kind: 'lot', town: T, noBuild: true }, MAZOR_LOT));
  interacts.push({ id: 'mazor', type: 'mazor', x: 3600, y: 3878, r: 95, label: '🏡 בית משפחת מזור', town: T });

  // מרכז קניות
  {
    const b = blk(1, 2);
    decor.push(Object.assign({ kind: 'plaza', town: T, noBuild: true }, b));
    building(3192, 3690, 105, 62, '#2e86de', 'סופר', T, { kind: 'shop' });
    building(3305, 3690, 105, 62, '#e67e22', 'חומרי בניין', T, { kind: 'shop' });
    building(3192, 3812, 105, 62, '#c0392b', 'סוכנות רכב', T, { kind: 'shop' });
    building(3305, 3812, 105, 62, '#8e44ad', 'כובעים', T, { kind: 'shop' });
    interacts.push({ id: 'super', type: 'shop', shop: 'super', x: 3245, y: 3778, r: 55, label: '🛒 סופר', town: T });
    interacts.push({ id: 'materials', type: 'shop', shop: 'materials', x: 3357, y: 3778, r: 55, label: '🧱 חומרי בניין', town: T });
    interacts.push({ id: 'dealer', type: 'shop', shop: 'dealer', x: 3245, y: 3897, r: 55, label: '🏍️ סוכנות רכב', town: T });
    interacts.push({ id: 'hats', type: 'shop', shop: 'hats', x: 3357, y: 3897, r: 55, label: '🧢 חנות כובעים', town: T });
    labels.push({ x: 3300, y: 3664, text: 'מרכז קניות', size: 18, town: T });
  }
  // בית הספר
  {
    const b = blk(3, 2);
    decor.push(Object.assign({ kind: 'yard', town: T, noBuild: true }, b));
    decor.push({ kind: 'court', x: 3800, y: 3845, w: 90, h: 60, town: T });
    building(3795, 3695, 210, 105, '#f1c40f', 'בית הספר', T, { kind: 'school' });
    interacts.push({ id: 'school', type: 'school', x: 3950, y: 3870, r: 70, label: '📚 בית הספר', town: T });
  }
  // בריכה
  const POOL = { x: 3500, y: 3440, w: 200, h: 120 };
  {
    const b = blk(2, 1);
    decor.push(Object.assign({ kind: 'grass', town: T, noBuild: true }, b));
    decor.push(Object.assign({ kind: 'pool', town: T, label: 'בריכה' }, POOL));
    building(3545, 3390, 110, 38, '#16a085', 'מלתחות', T);
  }
  // מרכז ספורט וחוגים
  {
    const b = blk(3, 1);
    decor.push(Object.assign({ kind: 'yard', town: T, noBuild: true }, b));
    building(3800, 3395, 200, 80, '#1abc9c', 'מרכז ספורט וחוגים', T, { kind: 'sports' });
    interacts.push({ id: 'sports', type: 'chugim', x: 3900, y: 3515, r: 70, label: '🏅 לוח החוגים', town: T });
  }
  // מועדון הנוער
  {
    const b = blk(2, 3);
    decor.push(Object.assign({ kind: 'grass', town: T, noBuild: true }, b));
    building(3495, 3995, 135, 78, '#e84393', 'מועדון הנוער', T, { kind: 'youth' });
    decor.push({ kind: 'playground', x: 3642, y: 3995, w: 68, h: 110, town: T });
    decor.push({ kind: 'campfire', x: 3600, y: 4170, w: 1, h: 1, town: T });
  }
  // בית כנסת ופארק
  {
    const b = blk(1, 1);
    decor.push(Object.assign({ kind: 'grass', town: T, noBuild: true }, b));
    building(3200, 3400, 100, 85, '#f5f0e1', 'בית כנסת', T, { dark: true });
    for (let k = 0; k < 4; k++) palms.push({ x: 3340 + (k % 2) * 50, y: 3450 + Math.floor(k / 2) * 90, r: 26, town: T });
  }
  // מגדל המים
  {
    const b = blk(3, 3);
    decor.push(Object.assign({ kind: 'grass', town: T, noBuild: true }, b));
    solids.push({ x: 3860, y: 4060, w: 70, h: 70, kind: 'tower', color: '#bfc7cf', label: 'מגדל המים', town: T });
  }
  // שכונות מגורים — חלק מהמגרשים ריקים, אפשר לבנות שם!
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const key = i + ',' + j;
      if (['2,2', '1,2', '3,2', '2,1', '3,1', '2,3', '1,1', '3,3'].includes(key)) continue;
      const b = blk(i, j);
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        const lx = b.x + a * 120, ly = b.y + c * 120;
        decor.push({ x: lx + 6, y: ly + 6, w: 108, h: 108, kind: 'garden', town: T });
        if (rnd() < 0.72) addHouse(lx + 18, ly + 22, 78, 64, T);
      }
    }
  }
  // חממות פלפלים של עין יהב
  for (let gx = 1720; gx <= 2500; gx += 195) {
    for (let gy = 2900; gy <= 4700; gy += 115) {
      if (gy + 88 > 3905 && gy < 3995) continue;
      greenhouses.push({ x: gx, y: gy, w: 170, h: 88, town: T });
    }
  }
  for (let gx = 2900; gx <= 4100; gx += 200) {
    for (let gy = 4645; gy <= 5100; gy += 115) greenhouses.push({ x: gx, y: gy, w: 175, h: 88, town: T });
  }
  labels.push({ x: 2200, y: 2860, text: 'חממות פלפלים 🌶️', size: 30, town: T });
  // מטע תמרים
  for (let px = 2880; px <= 4330; px += 75) {
    for (let py = 2380; py <= 2930; py += 75) {
      palms.push({ x: px + (rnd() - 0.5) * 18, y: py + (rnd() - 0.5) * 18, r: 25 + rnd() * 8, town: T });
    }
  }
  labels.push({ x: 3600, y: 2340, text: 'מטע תמרים', size: 28, town: T });

  // ================= מושבים שכנים =================
  const NEIGHBORS = [
    { id: 'hatzeva', name: 'חצבה', sub: 'המושב הצפוני', x: 3300, y: 1000, feature: 'מועדון' },
    { id: 'idan', name: 'עידן', sub: 'מושב בערבה', x: 4650, y: 1650, feature: 'מועדון' },
    { id: 'sapir', name: 'ספיר', sub: 'מרכז ספיר', x: 2200, y: 5900, feature: 'מרכז ספיר' },
    { id: 'tzofar', name: 'צופר', sub: 'מושב בערבה', x: 4300, y: 6400, feature: 'מועדון' },
    { id: 'paran', name: 'פארן', sub: 'מושב בערבה', x: 3000, y: 7000, feature: 'מועדון' },
    { id: 'tzukim', name: 'צוקים', sub: 'כפר הצימרים', x: 5000, y: 7600, feature: 'צימרים' },
  ];
  for (const n of NEIGHBORS) {
    const t = { id: n.id, name: n.name, sub: n.sub, x: n.x, y: n.y, r: 380 };
    towns.push(t);
    const RW = 560, RH = 460, RS = 50;
    const x0 = n.x - RW / 2, y0 = n.y - RH / 2;
    roads.push({ x: x0, y: y0, w: RW, h: RS, kind: 'road', town: n.id });
    roads.push({ x: x0, y: y0 + RH - RS, w: RW, h: RS, kind: 'road', town: n.id });
    roads.push({ x: x0, y: y0, w: RS, h: RH, kind: 'road', town: n.id });
    roads.push({ x: x0 + RW - RS, y: y0, w: RS, h: RH, kind: 'road', town: n.id });
    roads.push({ x: x0 + RW, y: n.y - 25, w: HWX - x0 - RW, h: 50, kind: 'road', town: n.id });
    decor.push({ kind: 'grass', x: x0 + RS, y: y0 + RS, w: RW - 2 * RS, h: RH - 2 * RS, town: n.id });
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cx = n.x + a * 150, cy = n.y + b * 112;
      if (a === 0 && b === 0) {
        building(cx - 60, cy - 40, 120, 80, '#d35400', n.feature, n.id);
      } else {
        decor.push({ x: cx - 62, y: cy - 50, w: 124, h: 100, kind: 'garden', town: n.id });
        addHouse(cx - 40, cy - 32, 80, 64, n.id);
      }
    }
    labels.push({ x: n.x, y: y0 - 40, text: n.name, size: 44, color: '#7a1f0e' });
    for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) {
      greenhouses.push({ x: x0 - 420 + a * 195, y: n.y - 160 + b * 115, w: 170, h: 88, town: n.id });
    }
  }

  // ================= השטח =================
  const SPAWN = { x: 1350, y: 2000 };

  // נחלים / ואדיות
  wadis.push({ name: 'נחל צין', w: 150, pts: [[0, 520], [700, 600], [1500, 450], [2300, 640], [3000, 520], [3800, 650], [4600, 520], [5400, 600]] });
  wadis.push({ name: 'ואדי', w: 110, pts: [[0, 4300], [600, 4500], [1200, 4950], [1700, 5250], [2200, 5150], [2700, 5450], [3400, 5600], [4000, 5500]] });
  wadis.push({ name: 'ואדי', w: 120, pts: [[400, 6900], [1300, 6700], [2100, 6550], [2500, 6800], [2400, 7400], [2600, 8000]] });
  labels.push({ x: 1500, y: 400, text: 'נחל צין', size: 30, color: '#6b4a2a' });

  function nearTown(x, y, pad) {
    for (const t of towns) if (Math.hypot(x - t.x, y - t.y) < t.r + pad) return true;
    return false;
  }
  function inEYFields(x, y) { return x > 1600 && x < 4450 && y > 2250 && y < 5250; }

  // דיונות
  function duneField(x0, y0, x1, y1, n) {
    for (let k = 0; k < n; k++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 220) continue;
      if (nearTown(x, y, 60) || inEYFields(x, y)) continue;
      dunes.push({ x, y, rx: 90 + rnd() * 120, ry: 50 + rnd() * 60, rot: (rnd() - 0.5) * 0.6 });
    }
  }
  duneField(400, 1200, 2500, 2800, 34);
  duneField(4500, 3800, 5300, 5150, 18);
  duneField(400, 5500, 1700, 7700, 22);
  duneField(5600, 300, 6300, 7700, 30);
  labels.push({ x: 1300, y: 1250, text: 'הדיונות הגדולות', size: 28, color: '#6b4a2a' });

  // שיטים, סלעים ושיחים
  for (let k = 0; k < 420; k++) {
    const x = 60 + rnd() * (MOUNTAIN_X - 120), y = 60 + rnd() * (H - 120);
    if (nearTown(x, y, 80) || inEYFields(x, y) || Math.abs(x - HWX - 60) < 140) continue;
    acacias.push({ x, y, r: 22 + rnd() * 18 });
  }
  acacias.push({ x: 2450, y: 1900, r: 75, big: true });
  labels.push({ x: 2450, y: 1800, text: 'השיטה הגדולה', size: 22, color: '#3d5a1e' });
  for (let k = 0; k < 650; k++) {
    const x = 40 + rnd() * (MOUNTAIN_X - 80), y = 40 + rnd() * (H - 80);
    if (nearTown(x, y, 40) || inEYFields(x, y) || Math.abs(x - HWX - 60) < 100) continue;
    rocks.push({ x, y, r: 5 + rnd() * 14, s: rnd() });
  }

  // מצפה
  decor.push({ kind: 'lookout', x: 1000, y: 5150, w: 200, h: 200 });
  labels.push({ x: 1100, y: 5110, text: 'מצפה הערבה', size: 24, color: '#6b4a2a' });

  // ================= מסלולים ותחרויות =================
  const MX = 4900, MY = 3050;
  const ovalPt = (t) => [MX + Math.cos(t) * 300 + Math.sin(t * 3) * 30, MY + Math.sin(t) * 185];
  const oval = [];
  for (let k = 0; k <= 60; k++) oval.push(ovalPt(k / 60 * Math.PI * 2));
  trails.push({ pts: oval, w: 54, kind: 'track' });
  trails.push({ pts: [[MX, YS[2] + 5], [MX, MY + 185]], w: 40 });
  labels.push({ x: MX, y: MY, text: 'מסלול המוטוקרוס', size: 26, color: '#6b4a2a' });
  for (let k = 0; k < 5; k++) {
    const t = Math.PI / 2 + (k + 0.5) * (Math.PI * 2 / 5);
    const [x, y] = ovalPt(t);
    jumps.push({ x, y, a: t + Math.PI / 2, w: 40, h: 26 });
  }

  // שבילי טיולים בשטח
  trails.push({ pts: [[SPAWN.x, SPAWN.y], [1800, 2300], [2300, 2650], [2700, 3000], [2820, 3200]], w: 36 });
  trails.push({ pts: [[2820, 3950], [2300, 4100]], w: 30 });
  trails.push({ pts: [[2900, 4580], [2600, 5100], [2300, 5650]], w: 36 });
  trails.push({ pts: [[3300, 1230], [3150, 1800], [3000, 2400], [2880, 3020]], w: 36 });
  trails.push({ pts: [[4380, 3020], [4500, 2500], [4650, 1880]], w: 36 });
  trails.push({ pts: [[4380, 4550], [4300, 5300], [4300, 6170]], w: 36 });
  trails.push({ pts: [[3000, 7230], [3400, 6800], [4020, 6500]], w: 36 });
  trails.push({ pts: [[SPAWN.x, SPAWN.y], [1000, 1700], [400, 1500], [200, 900]], w: 32 });
  trails.push({ pts: [[1200, 5300], [1600, 5700], [1920, 5900]], w: 32 });

  // מסלול טרקטורונים בדיונות
  const ATV_START = { x: 4750, y: 4350 };

  const RACES = [
    {
      id: 'moto', name: 'תחרות אופנועים', emoji: '🏍️', vehicle: 'moto', laps: 2,
      desc: 'שני סיבובים במסלול המוטוקרוס, עם קפיצות!',
      start: { x: MX, y: MY + 185 },
      cps: Array.from({ length: 8 }, (_, k) => { const p = ovalPt(Math.PI / 2 + (k + 1) * Math.PI * 2 / 8); return { x: p[0], y: p[1] }; }),
      rewards: [700, 450, 250],
    },
    {
      id: 'atv', name: 'מרוץ טרקטורונים בדיונות', emoji: '🏁', vehicle: 'atv', laps: 1,
      desc: 'דוהרים בין הדיונות מזרחית למושב',
      start: ATV_START,
      cps: [{ x: 5100, y: 4050 }, { x: 5220, y: 4600 }, { x: 4900, y: 4980 }, { x: 4520, y: 4750 }, { x: 4560, y: 4150 }, { x: ATV_START.x, y: ATV_START.y }],
      rewards: [600, 400, 220],
    },
    {
      id: 'bike', name: 'חוג אופניים', emoji: '🚲', vehicle: 'bike', laps: 1,
      desc: 'סיבוב אופניים מסביב לכל המושב',
      start: { x: 3900, y: 3560 },
      cps: [{ x: 3750, y: 3650 }, { x: 4350, y: 3650 }, { x: 4350, y: 4550 }, { x: 2850, y: 4550 }, { x: 2850, y: 3050 }, { x: 4350, y: 3050 }, { x: 4350, y: 3500 }, { x: 3900, y: 3560 }],
      rewards: [500, 330, 200],
    },
    {
      id: 'tri', name: 'טריאתלון', emoji: '🏊', vehicle: null, laps: 1,
      desc: 'שוחים בבריכה, רוכבים על אופניים ורצים — הכי ספורטיבי במושב!',
      start: { x: 3600, y: 3590 },
      cps: [
        { x: 3520, y: 3500, m: 'swim' }, { x: 3680, y: 3500, m: 'swim' }, { x: 3600, y: 3590, m: 'foot' },
        { x: 3750, y: 3650, m: 'bike' }, { x: 4350, y: 3650, m: 'bike' }, { x: 4350, y: 4250, m: 'bike' }, { x: 2850, y: 4250, m: 'bike' }, { x: 2850, y: 3650, m: 'bike' }, { x: 3450, y: 3650, m: 'bike' },
        { x: 3450, y: 3350, m: 'foot' }, { x: 3750, y: 3350, m: 'foot' }, { x: 3900, y: 3560, m: 'foot' },
      ],
      rewards: [800, 500, 300],
    },
    {
      id: 'youth', name: 'פעולה בנוער: מרוץ דגלים', emoji: '🚩', vehicle: null, laps: 1,
      desc: 'הפעולה של היום: אוספים את כל הדגלים במושב ברגל!',
      start: { x: 3562, y: 4105 },
      cps: [{ x: 3750, y: 3950 }, { x: 4050, y: 4250 }, { x: 3450, y: 4550 }, { x: 3150, y: 4250 }, { x: 3450, y: 3950 }, { x: 3562, y: 4105 }],
      rewards: [400, 280, 180],
    },
  ];
  const MODE_SPEED = { foot: 175, swim: 95, bike: 260, moto: 430, atv: 330, jeep: 330, tractor: 190 };
  for (const r of RACES) {
    let L = 0, tGold = 0;
    let px = r.start.x, py = r.start.y;
    for (let lap = 0; lap < r.laps; lap++) {
      for (const c of r.cps) {
        const d = Math.hypot(c.x - px, c.y - py);
        L += d;
        tGold += d / MODE_SPEED[c.m || r.vehicle || 'foot'];
        px = c.x; py = c.y;
      }
    }
    r.length = L;
    r.gold = Math.round(tGold / 0.72 * 1000);
    r.silver = Math.round(tGold / 0.5 * 1000);
    r.minTime = Math.round(tGold / 1.4 * 1000);
    interacts.push({ id: 'race_' + r.id, type: 'race', race: r.id, x: r.start.x, y: r.start.y, r: 60, label: r.emoji + ' ' + r.name, town: r.id === 'moto' || r.id === 'atv' ? null : T });
  }
  RACES.find((r) => r.id === 'atv').cps.forEach((c, i) => { if (i % 2 === 0) jumps.push({ x: c.x - 120, y: c.y + 40, a: 0.5, w: 46, h: 28 }); });

  // ================= כלי רכב =================
  const VEHICLES = {
    bike:    { name: 'אופניים',   max: 260, acc: 380, turn: 4.8, seats: 1, r: 13, len: 34, wid: 12, offroad: 0.62, price: 200 },
    moto:    { name: 'אופנוע',    max: 430, acc: 520, turn: 4.4, seats: 2, r: 16, len: 46, wid: 16, offroad: 0.8, price: 800 },
    atv:     { name: 'טרקטורון',  max: 350, acc: 460, turn: 3.9, seats: 2, r: 18, len: 42, wid: 30, offroad: 0.95, price: 1000 },
    jeep:    { name: "ג'יפ",      max: 380, acc: 370, turn: 2.9, seats: 4, r: 24, len: 72, wid: 38, offroad: 0.9, price: 1800 },
    tractor: { name: 'טרקטור',    max: 200, acc: 260, turn: 2.4, seats: 2, r: 22, len: 56, wid: 36, offroad: 0.95, price: 1200 },
  };
  const STARTER_TYPES = ['moto', 'atv', 'jeep'];

  const publicVehicles = [];
  for (let k = 0; k < 4; k++) publicVehicles.push({ type: 'moto', x: MX - 90 + k * 40, y: MY + 250, a: -Math.PI / 2 });
  for (let k = 0; k < 3; k++) publicVehicles.push({ type: 'atv', x: ATV_START.x - 70 + k * 55, y: ATV_START.y + 70, a: -Math.PI / 2 });
  publicVehicles.push({ type: 'jeep', x: SPAWN.x + 160, y: SPAWN.y + 120, a: 0 });
  publicVehicles.push({ type: 'tractor', x: 2650, y: YS[3] + 30, a: Math.PI });
  for (const n of NEIGHBORS) publicVehicles.push({ type: rnd() < 0.5 ? 'atv' : 'moto', x: n.x + 280 + 60, y: n.y + 55, a: 0 });

  // ================= חנויות =================
  const MATERIALS = {
    blocks:  { name: 'בלוקים', emoji: '🧱', price: 100 },
    cement:  { name: 'מלט',    emoji: '🪣', price: 80 },
    roof:    { name: 'רעפים',  emoji: '🟥', price: 120 },
    windows: { name: 'חלונות', emoji: '🪟', price: 90 },
  };
  const SHOPS = {
    super: { title: '🛒 הסופר של המושב', sub: 'אוכל נותן כוח — רצים מהר יותר!', items: [
      { id: 'water', name: 'בקבוק מים', emoji: '💧', price: 5, boost: 8 },
      { id: 'popsicle', name: 'ארטיק', emoji: '🍦', price: 15, boost: 20 },
      { id: 'bourekas', name: 'בורקס', emoji: '🥐', price: 20, boost: 30 },
      { id: 'pizza', name: 'פיצה', emoji: '🍕', price: 35, boost: 60 },
    ] },
    materials: { title: '🧱 חומרי בניין', sub: 'כל מה שצריך כדי לבנות בית', items: Object.keys(MATERIALS).map((id) => ({ id, name: MATERIALS[id].name, emoji: MATERIALS[id].emoji, price: MATERIALS[id].price, material: true })) },
    dealer: { title: '🏍️ סוכנות הרכב', sub: 'הרכב החדש יחכה לך בחוץ', items: [
      ...Object.keys(VEHICLES).map((t) => ({ id: t, name: VEHICLES[t].name, price: VEHICLES[t].price, vehicle: t })),
      { id: 'cont_motos', name: 'מכולה עם 3 אופנועים', emoji: '📦', price: 2000, container: 'motos' },
      { id: 'cont_cars', name: "מכולה עם ג'יפ וטרקטורון", emoji: '📦', price: 2500, container: 'cars' },
    ] },
    hats: { title: '🧢 חנות הכובעים', sub: 'כובע מגניב לטיולים בשטח', items: [
      { id: 'cap', name: 'כובע מצחייה', emoji: '🧢', price: 150, hat: 'cap' },
      { id: 'sun', name: 'כובע טמבל', emoji: '👒', price: 120, hat: 'sun' },
      { id: 'cowboy', name: 'כובע בוקרים', emoji: '🤠', price: 350, hat: 'cowboy' },
      { id: 'crown', name: 'כתר', emoji: '👑', price: 900, hat: 'crown' },
    ] },
  };

  const HOUSE_TYPES = {
    small: { name: 'בית קטן', w: 90, h: 80, need: { blocks: 2, cement: 1, roof: 1, windows: 1 } },
    big:   { name: 'בית גדול', w: 120, h: 95, need: { blocks: 4, cement: 2, roof: 2, windows: 2 } },
    villa: { name: 'וילה עם בריכה', w: 150, h: 110, need: { blocks: 6, cement: 3, roof: 3, windows: 4 } },
  };
  const CONTAINER_SIZE = { w: 140, h: 52 };

  const MAZOR_STAGES = [
    { name: 'יסודות', need: { cement: 4, blocks: 2 } },
    { name: 'קירות', need: { blocks: 8, cement: 2 } },
    { name: 'חלונות ודלת', need: { windows: 6 } },
    { name: 'גג רעפים', need: { roof: 6 } },
    { name: 'גינה ושלט', need: { coins: 500 } },
  ];

  const QUESTS = [
    { id: 'found', title: 'מצא את המקום להקים את עין יהב', desc: 'סע בשטח עד הדגל הגדול', target: { x: EY.x, y: EY.y }, reward: 300 },
    { id: 'materials', title: 'קנה חומרי בניין', desc: 'במרכז הקניות, בחנות חומרי הבניין', target: { x: 3357, y: 3778 }, reward: 100 },
    { id: 'mazor', title: 'עזור לבנות את בית משפחת מזור', desc: 'הבא חומרי בניין למגרש במרכז המושב', target: { x: 3600, y: 3878 }, reward: 400 },
    { id: 'school', title: 'לך לבית הספר', desc: 'שיעור קצר — כל תשובה נכונה שווה כסף', target: { x: 3950, y: 3870 }, reward: 200 },
    { id: 'youth', title: 'לך לפעולה בנוער', desc: 'מרוץ דגלים ליד מועדון הנוער', target: { x: 3562, y: 4105 }, reward: 200 },
    { id: 'moto', title: 'התחרה בתחרות אופנועים', desc: 'במסלול המוטוקרוס ליד הכניסה', target: RACES[0].start, reward: 300 },
    { id: 'bike', title: 'חוג אופניים', desc: 'מתחילים ליד מרכז הספורט', target: RACES[2].start, reward: 200 },
    { id: 'tri', title: 'חוג טריאתלון', desc: 'מתחילים בבריכה', target: RACES[3].start, reward: 300 },
    { id: 'trip', title: "טיול ג'יפים וטרקטורונים", desc: 'בקר ב-3 מושבים שכנים', target: null, reward: 400 },
    { id: 'house', title: 'בנה בית משלך', desc: 'לחץ "בנה" כשיש לך חומרי בניין', target: null, reward: 300 },
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
    { q: 'איזה צבע יש לפלפל בשל?', a: ['אדום', 'כחול', 'סגול'] },
  ];

  const GAZELLE_HERDS = [{ x: 2000, y: 2350 }, { x: 900, y: 6500 }, { x: 5950, y: 3000 }, { x: 1100, y: 3800 }, { x: 5950, y: 6200 }];

  // ================= עזרים =================
  function rectHit(r, x, y, pad) {
    return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  }
  function rectsOverlap(a, b, pad) {
    pad = pad || 0;
    return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  }
  function collides(x, y, r, extra, skipTown) {
    if (x < r || y < r || x > W - r || y > H - r) return true;
    for (const s of solids) if ((!skipTown || s.town !== skipTown) && rectHit(s, x, y, r)) return true;
    if (extra) for (const s of extra) if (rectHit(s, x, y, r)) return true;
    return false;
  }
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function onRoad(x, y, skipTown) {
    for (const rd of roads) if ((!skipTown || rd.town !== skipTown) && rectHit(rd, x, y, 0)) return true;
    for (const t of trails) {
      for (let i = 0; i < t.pts.length - 1; i++) if (distToSeg(x, y, t.pts[i], t.pts[i + 1]) < t.w / 2) return true;
    }
    return false;
  }
  function inPool(x, y) { return rectHit(POOL, x, y, 0); }
  function canPlace(rect, extra) {
    if (rect.x < 20 || rect.y < 20 || rect.x + rect.w > MOUNTAIN_X - 20 || rect.y + rect.h > H - 20) return false;
    for (const rd of roads) if (rectsOverlap(rect, rd, 4)) return false;
    for (const s of solids) if (rectsOverlap(rect, s, 6)) return false;
    for (const g of greenhouses) if (rectsOverlap(rect, g, 4)) return false;
    for (const d of decor) if (d.noBuild && rectsOverlap(rect, d, 0)) return false;
    if (rectsOverlap(rect, POOL, 10)) return false;
    if (extra) for (const s of extra) if (rectsOverlap(rect, s, 6)) return false;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, rad = Math.hypot(rect.w, rect.h) / 2;
    for (const t of trails) for (let i = 0; i < t.pts.length - 1; i++) if (distToSeg(cx, cy, t.pts[i], t.pts[i + 1]) < t.w / 2 + rad) return false;
    for (const r of RACES) for (const c of r.cps) if (Math.hypot(c.x - cx, c.y - cy) < rad + 50) return false;
    return true;
  }
  function townAt(x, y) {
    for (const t of towns) if (Math.hypot(x - t.x, y - t.y) < t.r) return t;
    return null;
  }

  const api = {
    W, H, HWX, MOUNTAIN_X, roads, trails, solids, greenhouses, palms, decor, labels, acacias, rocks, wadis, dunes, jumps,
    towns, interacts, EY, MAZOR, MAZOR_LOT, POOL, SPAWN, RACES, VEHICLES, STARTER_TYPES, publicVehicles,
    MATERIALS, SHOPS, HOUSE_TYPES, CONTAINER_SIZE, MAZOR_STAGES, QUESTS, SCHOOL_QUESTIONS, GAZELLE_HERDS,
    collides, onRoad, canPlace, rectsOverlap, distToSeg, inPool, townAt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MAP = api;
})(this);
