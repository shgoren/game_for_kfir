// שרת המשחק "עין יהב אונליין"
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const MAP = require('./public/map.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const BAN_MINUTES = parseFloat(process.env.BAN_MINUTES || '3');
const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, 'world.json');
const START_COINS = parseInt(process.env.START_COINS || '3000', 10);
const QR_BONUS = parseInt(process.env.QR_BONUS || '200', 10);
const SAVE_VERSION = 2;
const MAX_HOUSES_PER_PLAYER = 12;
const MAX_CONTAINERS_PER_PLAYER = 3;
const MAX_OWNED_VEHICLES = 12;
const MAX_PEPPERS = 90;
const SCHOOL_COOLDOWN = 60 * 1000;

// ---------- כתובת להצטרפות (בשביל ה-QR) ----------
function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
function joinUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/?$/, '/');
  const host = (req && req.headers.host) || '';
  if (!host || /^(localhost|127\.|\[::1\])/.test(host)) return `http://${lanIp()}:${PORT}/`;
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${host}/`;
}

// ---------- מצב העולם ----------
let nextId = 1;
const newId = (p) => p + (nextId++);

const players = new Map();
const vehicles = new Map();
let houses = [];
let containers = [];
const peppers = new Map();
let accounts = {};      // token -> חשבון
let mazor = { stage: 0, progress: {}, helpers: [] };
let boards = {};        // raceId -> [{name, ms}]
const bans = new Map();
let dirty = false;

function addVehicle(type, x, y, a, owner, extra) {
  const v = Object.assign({ id: newId('v'), type, x, y, a, owner: owner ? owner.name : null, ownerAid: owner ? owner.aid : null, color: owner ? owner.color : null, driver: null, pass: [] }, extra || {});
  vehicles.set(v.id, v);
  return v;
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    if (data.version !== SAVE_VERSION) throw new Error('old');
    houses = data.houses || [];
    containers = data.containers || [];
    accounts = data.accounts || {};
    mazor = data.mazor || mazor;
    boards = data.boards || {};
    for (const v of data.vehicles || []) vehicles.set(v.id, { ...v, driver: null, pass: [] });
    for (const o of [...houses, ...containers, ...(data.vehicles || [])]) {
      const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
      if (n >= nextId) nextId = n + 1;
    }
    console.log(`נטען עולם שמור: ${houses.length} בתים, ${containers.length} מכולות, בית מזור בשלב ${mazor.stage}`);
  } catch (e) {
    console.log('מתחילים עולם חדש');
  }
  for (const pv of MAP.publicVehicles) addVehicle(pv.type, pv.x, pv.y, pv.a, null);
}

function save(sync) {
  if (!dirty) return;
  dirty = false;
  const data = {
    version: SAVE_VERSION, houses, containers, accounts, mazor, boards,
    vehicles: [...vehicles.values()].filter((v) => v.ownerAid && !v.temp).map(({ driver, pass, ...v }) => v),
  };
  if (sync) fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
  else fs.writeFile(SAVE_FILE, JSON.stringify(data), () => {});
}
setInterval(save, 10000);

const extraSolids = () => houses.concat(containers);
const vehicleView = (v) => ({ id: v.id, type: v.type, x: Math.round(v.x), y: Math.round(v.y), a: +v.a.toFixed(2), owner: v.owner, ownerAid: v.ownerAid, color: v.color, temp: !!v.temp, driver: v.driver, pass: v.pass });
const publicObj = ({ ownerToken, ...o }) => o;

// ---------- פלפלים ----------
function spawnPepper() {
  if (peppers.size >= MAX_PEPPERS) return;
  const g = MAP.greenhouses[Math.floor(Math.random() * MAP.greenhouses.length)];
  const p = { id: newId('p'), x: Math.round(g.x + 15 + Math.random() * (g.w - 30)), y: Math.round(g.y + 15 + Math.random() * (g.h - 30)), town: g.town };
  peppers.set(p.id, p);
  broadcast({ t: 'pepper+', p });
}
for (let i = 0; i < 60; i++) spawnPepper();
setInterval(spawnPepper, 1500);

// ---------- רשת ----------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
const announce = (text) => broadcast({ t: 'msg', text });
const err = (p, text) => send(p.ws, { t: 'err', text });

function acctView(a) {
  return { aid: a.aid, coins: a.coins, inv: a.inv, quests: a.quests, visited: a.visited, best: a.best, hat: a.hat, hats: a.hats };
}
function pushAcct(p) { dirty = true; send(p.ws, { t: 'acct', acct: acctView(p.acct) }); }
function addCoins(p, n) { p.acct.coins = Math.max(0, p.acct.coins + n); pushAcct(p); }

function completeQuest(p, id) {
  if (p.acct.quests[id]) return;
  const q = MAP.QUESTS.find((q) => q.id === id);
  if (!q) return;
  p.acct.quests[id] = Date.now();
  p.acct.coins += q.reward;
  pushAcct(p);
  send(p.ws, { t: 'quest', id, reward: q.reward });
}

function near(p, x, y, d) { return Math.hypot(p.x - x, p.y - y) <= d; }
function nearInteract(p, id, extra) {
  const it = MAP.interacts.find((i) => i.id === id);
  return it && near(p, it.x, it.y, it.r + (extra || 120));
}

function removeVehicle(v) {
  for (const id of [v.driver, ...v.pass]) {
    const pl = id && players.get(id);
    if (pl) pl.vid = null;
  }
  vehicles.delete(v.id);
  broadcast({ t: 'vremove', id: v.id });
}

function leaveVehicle(p) {
  if (!p.vid) return;
  const v = vehicles.get(p.vid);
  p.vid = null;
  if (!v) return;
  if (v.driver === p.id) {
    v.driver = null;
    if (v.temp) { removeVehicle(v); return; }
    if (v.pass.length) {
      // נוסע שיכול לנהוג (רכב ציבורי או של אותו בעלים) הופך לנהג
      const idx = v.pass.findIndex((id) => { const q = players.get(id); return q && (!v.ownerAid || q.acct.aid === v.ownerAid); });
      if (idx >= 0) {
        v.driver = v.pass.splice(idx, 1)[0];
        const np = players.get(v.driver);
        if (np) send(np.ws, { t: 'role', vid: v.id, role: 'driver' });
      }
    }
  } else {
    v.pass = v.pass.filter((id) => id !== p.id);
  }
  if (v.ownerAid) dirty = true;
}

function putInVehicle(p, v) {
  leaveVehicle(p);
  v.driver = p.id;
  p.vid = v.id;
  p.x = v.x; p.y = v.y;
  send(p.ws, { t: 'entered', vid: v.id, role: 'driver', x: v.x, y: v.y });
}

// מוצא מקום פנוי ליד נקודה
function freeSpot(x, y, r) {
  for (let ring = 0; ring < 12; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2 + ring;
      const px = x + Math.cos(a) * ring * 45, py = y + Math.sin(a) * ring * 45;
      if (MAP.collides(px, py, r, extraSolids())) continue;
      let busy = false;
      for (const v of vehicles.values()) if (Math.hypot(v.x - px, v.y - py) < 50) { busy = true; break; }
      if (!busy) return { x: px, y: py };
    }
  }
  return { x, y };
}

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const clampX = (x) => Math.max(0, Math.min(MAP.W, x));
const clampY = (y) => Math.max(0, Math.min(MAP.H, y));

function kickForHitting(p) {
  if (p.kicked) return;
  p.kicked = true;
  const until = Date.now() + BAN_MINUTES * 60000;
  bans.set(p.token, until);
  broadcast({ t: 'punch', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
  announce(`👊 ${p.name} הרביץ — וגורש מהמשחק! 🚫`);
  setTimeout(() => {
    send(p.ws, { t: 'kicked', until });
    try { p.ws.close(); } catch (e) {}
  }, 900);
}

function hasMaterials(inv, need) {
  for (const k in need) if ((inv[k] || 0) < need[k]) return false;
  return true;
}

function handle(p, m) {
  const A = p.acct;
  switch (m.t) {
    case 'state': {
      if (p.vid) {
        const v = vehicles.get(p.vid);
        if (v && v.driver === p.id) {
          v.x = clampX(num(m.x, v.x)); v.y = clampY(num(m.y, v.y)); v.a = num(m.a, v.a);
          if (v.ownerAid) dirty = true;
        }
        if (v) { p.x = v.x; p.y = v.y; p.a = v.a; }
      } else {
        p.x = clampX(num(m.x, p.x)); p.y = clampY(num(m.y, p.y)); p.a = num(m.a, p.a);
      }
      p.mv = !!m.mv;
      p.swim = !!m.sw;
      break;
    }
    case 'enter': {
      const v = vehicles.get(m.vid);
      if (!v || p.vid || p.race) return;
      if (!near(p, v.x, v.y, 120)) return;
      const spec = MAP.VEHICLES[v.type];
      const mine = !v.ownerAid || v.ownerAid === A.aid;
      let role;
      if (!v.driver && mine) { v.driver = p.id; role = 'driver'; }
      else if (!v.driver && !mine) return err(p, `זה ה${spec.name} של ${v.owner}. אפשר לעלות כנוסע כשהוא נוהג 😉`);
      else if (v.temp) return err(p, 'זה רכב של תחרות');
      else if (v.pass.length < spec.seats - 1) { v.pass.push(p.id); role = 'pass'; }
      else return err(p, spec.seats === 1 ? 'יש מקום רק לרוכב אחד' : 'אין מקום, הרכב מלא!');
      p.vid = v.id;
      send(p.ws, { t: 'entered', vid: v.id, role });
      break;
    }
    case 'exit': {
      leaveVehicle(p);
      p.x = clampX(num(m.x, p.x)); p.y = clampY(num(m.y, p.y));
      break;
    }
    case 'found': {
      if (!near(p, MAP.EY.x, MAP.EY.y, 400)) return;
      completeQuest(p, 'found');
      if (!A.foundedAnnounced) { A.foundedAnnounced = true; announce(`🚩 ${p.name} מצא את המקום והקים את עין יהב!`); }
      break;
    }
    case 'visit': {
      const t = MAP.towns.find((t) => t.id === m.town);
      if (!t || t.id === 'ey' || A.visited[t.id] || !near(p, t.x, t.y, t.r + 150)) return;
      A.visited[t.id] = true;
      A.coins += 50;
      pushAcct(p);
      send(p.ws, { t: 'msg', text: `🗺️ ביקרת ב${t.name}! +50 🪙` });
      if (Object.keys(A.visited).length >= 3) completeQuest(p, 'trip');
      break;
    }
    case 'shop': {
      const shop = MAP.SHOPS[m.shop];
      if (!shop || !nearInteract(p, m.shop)) return err(p, 'צריך להיות ליד החנות');
      const item = shop.items.find((i) => i.id === m.item);
      if (!item) return;
      const qty = Math.max(1, Math.min(10, Math.floor(num(m.qty, 1))));
      if (item.container) return; // נקנה עם מיקום (buyContainer)
      if (item.hat && A.hats.includes(item.hat)) { A.hat = item.hat; pushAcct(p); return; }
      const cost = item.price * (item.material ? qty : 1);
      if (A.coins < cost) return err(p, `חסרים לך ${cost - A.coins} מטבעות. אפשר להרוויח בתחרויות, בבית הספר ובקטיף פלפלים!`);
      if (item.vehicle && [...vehicles.values()].filter((v) => v.ownerAid === A.aid && !v.temp).length >= MAX_OWNED_VEHICLES)
        return err(p, 'יש לך כבר המון כלי רכב!');
      A.coins -= cost;
      if (item.material) {
        A.inv[item.id] = (A.inv[item.id] || 0) + qty;
        completeQuest(p, 'materials');
        send(p.ws, { t: 'bought', text: `${item.emoji} קנית ${qty} ${item.name}` });
      } else if (item.boost) {
        send(p.ws, { t: 'boost', secs: item.boost, text: `${item.emoji} יאמי! ${item.name} — אתה רץ מהר יותר` });
      } else if (item.hat) {
        A.hats.push(item.hat); A.hat = item.hat;
        send(p.ws, { t: 'bought', text: `${item.emoji} ${item.name} חדש!` });
      } else if (item.vehicle) {
        const it = MAP.interacts.find((i) => i.id === 'dealer');
        const spot = freeSpot(it.x, it.y + 70, 26);
        const v = addVehicle(item.vehicle, spot.x, spot.y, -Math.PI / 2, A);
        broadcast({ t: 'vadd', v: vehicleView(v) });
        send(p.ws, { t: 'bought', text: `🎉 קנית ${item.name}! הוא מחכה לך בחוץ`, vid: v.id });
        announce(`🚗 ${p.name} קנה ${item.name} חדש!`);
      }
      pushAcct(p);
      break;
    }
    case 'buyContainer': {
      const kind = m.kind === 'cars' ? 'cars' : 'motos';
      const item = MAP.SHOPS.dealer.items.find((i) => i.container === kind);
      if (A.coins < item.price) return err(p, `צריך ${item.price} מטבעות בשביל המכולה הזאת`);
      if (containers.filter((c) => c.ownerToken === p.token).length >= MAX_CONTAINERS_PER_PLAYER) return err(p, 'יש לך כבר 3 מכולות!');
      const S = MAP.CONTAINER_SIZE;
      const r = { x: Math.round(num(m.x, 0)), y: Math.round(num(m.y, 0)), w: S.w, h: S.h };
      if (!near(p, r.x + r.w / 2, r.y + r.h / 2, 260)) return;
      if (!MAP.canPlace({ x: r.x, y: r.y, w: r.w, h: r.h + 75 }, extraSolids())) return err(p, 'אין מספיק מקום למכולה כאן');
      const c = { id: newId('c'), ...r, kind, color: p.color, owner: p.name, ownerToken: p.token, t: Date.now() };
      containers.push(c);
      const vy = r.y + r.h + 38;
      const made = kind === 'motos'
        ? [0, 1, 2].map((k) => addVehicle('moto', r.x + 25 + k * 45, vy, -Math.PI / 2, A))
        : [addVehicle('jeep', r.x + 40, vy + 4, 0, A), addVehicle('atv', r.x + 112, vy, -Math.PI / 2, A)];
      A.coins -= item.price;
      pushAcct(p);
      broadcast({ t: 'container', c: publicObj(c), vehicles: made.map(vehicleView) });
      announce(`📦 ${p.name} קנה מכולה עם ${kind === 'motos' ? 'אופנועים' : "ג'יפ וטרקטורון"}!`);
      break;
    }
    case 'build': {
      const type = MAP.HOUSE_TYPES[m.type];
      if (!type) return;
      if (!hasMaterials(A.inv, type.need)) return err(p, 'חסרים חומרי בניין — קנה אותם במרכז הקניות');
      if (houses.filter((h) => h.ownerToken === p.token).length >= MAX_HOUSES_PER_PLAYER) return err(p, 'בנית כבר המון בתים! 🏘️');
      const r = { x: Math.round(num(m.x, 0)), y: Math.round(num(m.y, 0)), w: type.w, h: type.h };
      if (!near(p, r.x + r.w / 2, r.y + r.h / 2, 260)) return;
      if (!MAP.canPlace(r, extraSolids())) return err(p, 'אי אפשר לבנות כאן');
      for (const k in type.need) A.inv[k] -= type.need[k];
      const h = { id: newId('h'), ...r, type: m.type, color: p.color, owner: p.name, ownerToken: p.token, t: Date.now() };
      houses.push(h);
      pushAcct(p);
      broadcast({ t: 'house', h: publicObj(h) });
      announce(`🏠 ${p.name} בנה ${type.name}!`);
      completeQuest(p, 'house');
      break;
    }
    case 'mazor': {
      if (!nearInteract(p, 'mazor')) return;
      if (mazor.stage >= MAP.MAZOR_STAGES.length) return;
      const st = MAP.MAZOR_STAGES[mazor.stage];
      let gave = 0;
      for (const k in st.need) {
        const missing = st.need[k] - (mazor.progress[k] || 0);
        if (missing <= 0) continue;
        if (k === 'coins') {
          const c = Math.min(missing, A.coins);
          A.coins -= c; mazor.progress.coins = (mazor.progress.coins || 0) + c; gave += c ? 1 : 0;
        } else {
          const c = Math.min(missing, A.inv[k] || 0);
          A.inv[k] = (A.inv[k] || 0) - c; mazor.progress[k] = (mazor.progress[k] || 0) + c; gave += c;
        }
      }
      if (!gave) return err(p, 'אין לך את החומרים שחסרים לשלב הזה. קנה אותם בחנות חומרי הבניין!');
      if (!mazor.helpers.includes(p.name)) mazor.helpers.push(p.name);
      let done = true;
      for (const k in st.need) if ((mazor.progress[k] || 0) < st.need[k]) done = false;
      if (done) {
        mazor.stage++;
        mazor.progress = {};
        mazor.t = Date.now();
        announce(mazor.stage >= MAP.MAZOR_STAGES.length
          ? '🏡🎉 בית משפחת מזור גמור! כל הכבוד לכל מי שעזר!'
          : `🏗️ בית משפחת מזור: שלב "${st.name}" הושלם!`);
        for (const q of players.values()) if (mazor.helpers.includes(q.name)) addCoins(q, 150);
      }
      dirty = true;
      pushAcct(p);
      broadcast({ t: 'mazor', mazor });
      completeQuest(p, 'mazor');
      break;
    }
    case 'school': {
      if (!nearInteract(p, 'school')) return;
      const now = Date.now();
      if (now - (A.lastSchool || 0) < SCHOOL_COOLDOWN) return err(p, 'השיעור הבא מתחיל עוד מעט 📚');
      A.lastSchool = now;
      const ans = Array.isArray(m.answers) ? m.answers.slice(0, 5) : [];
      let correct = 0;
      for (const a of ans) {
        const q = MAP.SCHOOL_QUESTIONS[a && a.q];
        if (q && a.a === q.a[0]) correct++;
      }
      const reward = correct * 60;
      A.coins += reward;
      pushAcct(p);
      send(p.ws, { t: 'schoolResult', correct, total: ans.length, reward });
      completeQuest(p, 'school');
      break;
    }
    case 'raceStart': {
      const race = MAP.RACES.find((r) => r.id === m.id);
      if (!race || p.race) return;
      if (!near(p, race.start.x, race.start.y, 160)) return err(p, 'צריך לעמוד בקו הזינוק');
      p.race = { id: race.id, t0: Date.now() + 3000 };
      const first = race.cps[0].m || race.vehicle;
      if (first && first !== 'foot' && first !== 'swim') {
        const v = addVehicle(first, race.start.x, race.start.y, Math.atan2(race.cps[0].y - race.start.y, race.cps[0].x - race.start.x), A, { temp: true });
        broadcast({ t: 'vadd', v: vehicleView(v) });
        putInVehicle(p, v);
      } else leaveVehicle(p);
      send(p.ws, { t: 'raceGo', id: race.id });
      break;
    }
    case 'raceMode': {
      if (!p.race) return;
      if (m.mode === 'bike') {
        const v = addVehicle('bike', p.x, p.y, num(m.a, 0), A, { temp: true });
        broadcast({ t: 'vadd', v: vehicleView(v) });
        putInVehicle(p, v);
      } else {
        leaveVehicle(p);
      }
      break;
    }
    case 'raceQuit': {
      const v = p.vid && vehicles.get(p.vid);
      if (v && v.temp) leaveVehicle(p);
      p.race = null;
      break;
    }
    case 'raceFinish': {
      if (!p.race || p.race.id !== m.id) return;
      const race = MAP.RACES.find((r) => r.id === m.id);
      const ms = Date.now() - p.race.t0;
      p.race = null;
      const v = p.vid && vehicles.get(p.vid);
      if (v && v.temp) leaveVehicle(p);
      const last = race.cps[race.cps.length - 1];
      if (ms < race.minTime || !near(p, last.x, last.y, 250)) return send(p.ws, { t: 'raceFail', text: 'משהו לא הסתדר בתחרות, נסה שוב' });
      const medal = ms <= race.gold ? 0 : ms <= race.silver ? 1 : 2;
      const reward = race.rewards[medal];
      A.coins += reward;
      const best = !A.best[race.id] || ms < A.best[race.id];
      if (best) A.best[race.id] = ms;
      const b = boards[race.id] || (boards[race.id] = []);
      const mine = b.find((e) => e.aid === A.aid);
      if (!mine) b.push({ aid: A.aid, name: p.name, ms });
      else if (ms < mine.ms) { mine.ms = ms; mine.name = p.name; }
      b.sort((x, y) => x.ms - y.ms);
      if (b.length > 10) b.length = 10;
      dirty = true;
      pushAcct(p);
      send(p.ws, { t: 'raceResult', id: race.id, ms, medal, reward, best, board: b.map(({ aid, ...e }) => e) });
      broadcast({ t: 'boards', boards: boardsView() });
      const medalTxt = ['🥇', '🥈', '🥉'][medal];
      announce(`${medalTxt} ${p.name} סיים את ה${race.name} ב-${(ms / 1000).toFixed(1)} שניות!`);
      completeQuest(p, race.id);
      break;
    }
    case 'pick': {
      const pp = peppers.get(m.id);
      if (!pp || !near(p, pp.x, pp.y, 120)) return;
      peppers.delete(pp.id);
      broadcast({ t: 'pepper-', id: pp.id, by: p.id });
      addCoins(p, 10);
      break;
    }
    case 'chat': {
      const text = String(m.text || '').trim().slice(0, 80);
      if (!text) return;
      const now = Date.now();
      if (now - (p.lastChat || 0) < 800) return;
      p.lastChat = now;
      broadcast({ t: 'chat', id: p.id, name: p.name, text });
      break;
    }
    case 'hit': kickForHitting(p); break;
  }
}

function boardsView() {
  const o = {};
  for (const k in boards) o[k] = boards[k].map(({ aid, ...e }) => e);
  return o;
}

// ---------- שרת HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const PUB = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ joinUrl: joinUrl(req), online: players.size, qrBonus: QR_BONUS }));
  }
  if (url.pathname === '/qr.svg') {
    const svg = await QRCode.toString(joinUrl(req) + '?qr=1', { type: 'svg', margin: 1, color: { dark: '#3b2412', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(svg);
  }
  let file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  file = path.normalize(path.join(PUB, file));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('לא נמצא'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let p = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!p) {
      if (m.t !== 'join') return;
      const token = String(m.token || '').slice(0, 64) || crypto.randomBytes(8).toString('hex');
      const until = bans.get(token);
      if (until && until > Date.now()) { send(ws, { t: 'kicked', until }); return ws.close(); }
      for (const q of players.values()) if (q.token === token) { try { q.ws.close(); } catch (e) {} }

      const name = String(m.name || '').trim().slice(0, 14) || 'שחקן';
      const color = /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#e74c3c';
      let A = accounts[token];
      const isNew = !A;
      if (!A) A = accounts[token] = { aid: crypto.randomBytes(5).toString('hex'), coins: START_COINS, inv: {}, quests: {}, visited: {}, best: {}, hats: [], hat: null, starters: {} };
      A.name = name; A.color = color;
      let qrGift = 0;
      if (m.qr && !A.qr) { A.qr = true; A.coins += QR_BONUS; qrGift = QR_BONUS; }

      p = {
        id: newId('u'), ws, token, acct: A, name, color,
        x: MAP.SPAWN.x + (Math.random() - 0.5) * 260, y: MAP.SPAWN.y + (Math.random() - 0.5) * 260, a: 0,
        vid: null, mv: false, race: null,
      };
      players.set(p.id, p);
      dirty = true;

      // הרכב ההתחלתי שבחרת
      const type = MAP.STARTER_TYPES.includes(m.vehicle) ? m.vehicle : 'moto';
      let v = vehicles.get(A.starters[type]);
      if (!v || v.driver || v.pass.length) {
        v = addVehicle(type, p.x, p.y, 0, A, { starter: true });
        A.starters[type] = v.id;
        broadcast({ t: 'vadd', v: vehicleView(v) });
      } else {
        Object.assign(v, { x: p.x, y: p.y, a: 0, color, owner: name });
        broadcast({ t: 'vmove', id: v.id, x: v.x, y: v.y, a: 0, color, owner: name });
      }
      v.driver = p.id; p.vid = v.id;

      send(ws, {
        t: 'welcome', id: p.id, x: p.x, y: p.y, vid: v.id, now: Date.now(), isNew, qrGift,
        acct: acctView(A), mazor, boards: boardsView(),
        houses: houses.map(publicObj), containers: containers.map(publicObj),
        vehicles: [...vehicles.values()].map(vehicleView), peppers: [...peppers.values()],
      });
      announce(`👋 ${p.name} הצטרף למשחק`);
      return;
    }
    if (p.kicked) return;
    handle(p, m);
  });

  ws.on('close', () => {
    if (!p || players.get(p.id) !== p) return;
    leaveVehicle(p);
    players.delete(p.id);
    if (!p.kicked) announce(`${p.name} יצא מהמשחק`);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 15000);

// קצת מטבעות על זמן משחק
setInterval(() => { for (const p of players.values()) if (!p.kicked) addCoins(p, 5); }, 30000);

// תמונת מצב 15 פעמים בשנייה
setInterval(() => {
  if (!players.size) return;
  broadcast({
    t: 'snap',
    players: [...players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.acct.hat, x: Math.round(p.x), y: Math.round(p.y), a: +p.a.toFixed(2), vid: p.vid, mv: p.mv, sw: p.swim, r: p.race ? 1 : 0 })),
    vehicles: [...vehicles.values()].map((v) => [v.id, Math.round(v.x), Math.round(v.y), +v.a.toFixed(2), v.driver, v.pass]),
  });
}, 66);

load();
server.listen(PORT, () => {
  console.log('\n🏍️  עין יהב אונליין רץ!');
  console.log(`   במחשב הזה:   http://localhost:${PORT}`);
  console.log(`   מהטלפון (אותו WiFi): http://${lanIp()}:${PORT}  (או סרקו את ה-QR במשחק)\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { dirty = true; save(true); process.exit(0); });
