// שרת המשחק "עין יהב אונליין"
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const MAP = require('./public/map.js');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const BAN_MINUTES = parseFloat(process.env.BAN_MINUTES || '3');
const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, 'world.json');
const START_COINS = parseInt(process.env.START_COINS || '80', 10);
const MAX_HOUSES_PER_PLAYER = 10;
const MAX_CONTAINERS_PER_PLAYER = 3;
const MAX_PEPPERS = 60;

// ---------- כתובת להצטרפות (בשביל ה-QR) ----------
function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}
function joinUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const host = (req && req.headers.host) || '';
  if (!host || /^(localhost|127\.|\[::1\])/.test(host)) return `http://${lanIp()}:${PORT}/`;
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${host}/`;
}

// ---------- מצב העולם ----------
let nextId = 1;
const newId = (p) => p + (nextId++);

const players = new Map();   // id -> player
const vehicles = new Map();  // id -> vehicle
let houses = [];
let containers = [];
const peppers = new Map();
let accounts = {};           // token -> { coins, name }
const bans = new Map();      // token -> until (ms)
let dirty = false;

function addVehicle(type, x, y, a, owner, color) {
  const v = { id: newId('v'), type, x, y, a, owner: owner || null, color: color || null, driver: null, pass: [] };
  vehicles.set(v.id, v);
  return v;
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    houses = data.houses || [];
    containers = data.containers || [];
    accounts = data.accounts || {};
    for (const v of data.vehicles || []) {
      vehicles.set(v.id, { ...v, driver: null, pass: [] });
    }
    for (const list of [houses, containers, data.vehicles || []]) {
      for (const o of list) {
        const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
        if (n >= nextId) nextId = n + 1;
      }
    }
    console.log(`נטען עולם שמור: ${houses.length} בתים, ${containers.length} מכולות`);
  } catch (e) {
    console.log('מתחילים עולם חדש');
  }
  for (const pv of MAP.publicVehicles) addVehicle(pv.type, pv.x, pv.y, pv.a, null, null);
}

function save(sync) {
  if (!dirty) return;
  dirty = false;
  const data = {
    houses, containers, accounts,
    vehicles: [...vehicles.values()].filter(v => v.owner).map(({ driver, pass, ...v }) => v),
  };
  if (sync) fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
  else fs.writeFile(SAVE_FILE, JSON.stringify(data), () => {});
}
setInterval(save, 10000);

function extraSolids() { return houses.concat(containers); }

function vehicleView(v) {
  return { id: v.id, type: v.type, x: Math.round(v.x), y: Math.round(v.y), a: +v.a.toFixed(2), owner: v.owner, color: v.color, driver: v.driver, pass: v.pass };
}

// ---------- פלפלים ----------
function spawnPepper() {
  if (peppers.size >= MAX_PEPPERS) return;
  const g = MAP.greenhouses[Math.floor(Math.random() * MAP.greenhouses.length)];
  const p = { id: newId('p'), x: Math.round(g.x + 15 + Math.random() * (g.w - 30)), y: Math.round(g.y + 15 + Math.random() * (g.h - 30)) };
  peppers.set(p.id, p);
  broadcast({ t: 'pepper+', p });
}
for (let i = 0; i < 35; i++) spawnPepper();
setInterval(spawnPepper, 2500);

// ---------- רשת ----------
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
function announce(text) { broadcast({ t: 'msg', text }); }

function setCoins(p, c) {
  p.coins = c;
  accounts[p.token] = { coins: c, name: p.name };
  dirty = true;
  send(p.ws, { t: 'coins', coins: c });
}

function leaveVehicle(p) {
  if (!p.vid) return;
  const v = vehicles.get(p.vid);
  p.vid = null;
  if (!v) return;
  if (v.driver === p.id) {
    v.driver = null;
    if (v.pass.length) {
      v.driver = v.pass.shift();
      const np = players.get(v.driver);
      if (np) send(np.ws, { t: 'role', vid: v.id, role: 'driver' });
    }
  } else {
    v.pass = v.pass.filter(id => id !== p.id);
  }
  if (v.owner) dirty = true;
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

function handle(p, m) {
  switch (m.t) {
    case 'state': {
      if (p.vid) {
        const v = vehicles.get(p.vid);
        if (v && v.driver === p.id) {
          v.x = clampX(num(m.x, v.x)); v.y = clampY(num(m.y, v.y)); v.a = num(m.a, v.a);
          if (v.owner) dirty = true;
        }
        if (v) { p.x = v.x; p.y = v.y; p.a = v.a; }
      } else {
        p.x = clampX(num(m.x, p.x)); p.y = clampY(num(m.y, p.y)); p.a = num(m.a, p.a);
      }
      p.mv = !!m.mv;
      break;
    }
    case 'enter': {
      const v = vehicles.get(m.vid);
      if (!v || p.vid) return;
      if (Math.hypot(v.x - p.x, v.y - p.y) > 110) return;
      const spec = MAP.VEHICLES[v.type];
      let role;
      if (!v.driver) { v.driver = p.id; role = 'driver'; }
      else if (v.pass.length < spec.seats - 1) { v.pass.push(p.id); role = 'pass'; }
      else return send(p.ws, { t: 'err', text: 'אין מקום, הרכב מלא!' });
      p.vid = v.id;
      send(p.ws, { t: 'entered', vid: v.id, role });
      break;
    }
    case 'exit': {
      leaveVehicle(p);
      p.x = clampX(num(m.x, p.x)); p.y = clampY(num(m.y, p.y));
      break;
    }
    case 'build': {
      const cost = MAP.PRICES.house;
      if (p.coins < cost) return send(p.ws, { t: 'err', text: `צריך ${cost} מטבעות כדי לבנות בית` });
      if (houses.filter(h => h.ownerToken === p.token).length >= MAX_HOUSES_PER_PLAYER)
        return send(p.ws, { t: 'err', text: 'בנית כבר המון בתים! 🏘️' });
      const r = { x: Math.round(num(m.x, 0)), y: Math.round(num(m.y, 0)), w: MAP.HOUSE_SIZE.w, h: MAP.HOUSE_SIZE.h };
      if (Math.hypot(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.y) > 200) return;
      if (!MAP.canPlace(r, extraSolids())) return send(p.ws, { t: 'err', text: 'אי אפשר לבנות כאן' });
      const h = { id: newId('h'), ...r, color: p.color, owner: p.name, ownerToken: p.token };
      houses.push(h);
      dirty = true;
      setCoins(p, p.coins - cost);
      broadcast({ t: 'house', h: publicHouse(h) });
      announce(`🏠 ${p.name} בנה בית חדש!`);
      break;
    }
    case 'buy': {
      const kind = m.kind === 'cars' ? 'cars' : 'motos';
      const cost = MAP.PRICES[kind];
      if (p.coins < cost) return send(p.ws, { t: 'err', text: `צריך ${cost} מטבעות בשביל המכולה הזאת` });
      if (containers.filter(c => c.ownerToken === p.token).length >= MAX_CONTAINERS_PER_PLAYER)
        return send(p.ws, { t: 'err', text: 'יש לך כבר 3 מכולות!' });
      const S = MAP.CONTAINER_SIZE;
      const r = { x: Math.round(num(m.x, 0)), y: Math.round(num(m.y, 0)), w: S.w, h: S.h };
      if (Math.hypot(r.x + r.w / 2 - p.x, r.y + r.h / 2 - p.y) > 220) return;
      // מקום לרכבים מתחת למכולה
      const area = { x: r.x, y: r.y, w: r.w, h: r.h + 75 };
      if (!MAP.canPlace(area, extraSolids())) return send(p.ws, { t: 'err', text: 'אין מספיק מקום למכולה כאן' });
      const c = { id: newId('c'), ...r, kind, color: p.color, owner: p.name, ownerToken: p.token };
      containers.push(c);
      const vy = r.y + r.h + 38;
      const made = kind === 'motos'
        ? [addVehicle('moto', r.x + 25, vy, -Math.PI / 2, p.name, p.color), addVehicle('moto', r.x + 70, vy, -Math.PI / 2, p.name, p.color), addVehicle('moto', r.x + 115, vy, -Math.PI / 2, p.name, p.color)]
        : [addVehicle('jeep', r.x + 40, vy + 4, 0, p.name, p.color), addVehicle('atv', r.x + 112, vy, -Math.PI / 2, p.name, p.color)];
      dirty = true;
      setCoins(p, p.coins - cost);
      broadcast({ t: 'container', c: publicHouse(c), vehicles: made.map(vehicleView) });
      announce(`📦 ${p.name} קנה מכולה עם ${kind === 'motos' ? 'אופנועים' : "ג'יפ וטרקטורון"}!`);
      break;
    }
    case 'pick': {
      const pp = peppers.get(m.id);
      if (!pp) return;
      if (Math.hypot(pp.x - p.x, pp.y - p.y) > 110) return;
      peppers.delete(pp.id);
      broadcast({ t: 'pepper-', id: pp.id, by: p.id });
      setCoins(p, p.coins + 5);
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
    case 'hit': {
      kickForHitting(p);
      break;
    }
  }
}

function publicHouse({ ownerToken, ...h }) { return h; }

// ---------- שרת HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ joinUrl: joinUrl(req), online: players.size }));
  }
  if (url.pathname === '/qr.svg') {
    const svg = await QRCode.toString(joinUrl(req), { type: 'svg', margin: 1, color: { dark: '#3b2412', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(svg);
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(path.join(PUB, file));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('לא נמצא'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
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
      const token = String(m.token || '').slice(0, 64) || Math.random().toString(36).slice(2);
      const until = bans.get(token);
      if (until && until > Date.now()) {
        send(ws, { t: 'kicked', until });
        return ws.close();
      }
      const acc = accounts[token];
      p = {
        id: newId('u'), ws, token,
        name: String(m.name || '').trim().slice(0, 14) || 'שחקן',
        color: /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#e74c3c',
        x: MAP.spawn.x + (Math.random() - 0.5) * 40, y: MAP.spawn.y + (Math.random() - 0.5) * 40, a: 0,
        vid: null, coins: acc ? acc.coins : START_COINS, mv: false,
      };
      players.set(p.id, p);
      accounts[token] = { coins: p.coins, name: p.name };
      dirty = true;
      send(ws, {
        t: 'welcome', id: p.id, x: p.x, y: p.y, coins: p.coins,
        houses: houses.map(publicHouse), containers: containers.map(publicHouse),
        vehicles: [...vehicles.values()].map(vehicleView), peppers: [...peppers.values()],
      });
      announce(`👋 ${p.name} הצטרף למשחק`);
      return;
    }
    if (p.kicked) return;
    handle(p, m);
  });

  ws.on('close', () => {
    if (!p) return;
    leaveVehicle(p);
    players.delete(p.id);
    if (!p.kicked) announce(`${p.name} יצא מהמשחק`);
  });
});

// פינג לשמירה על חיבורים
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 15000);

// מטבעות על זמן משחק
setInterval(() => { for (const p of players.values()) if (!p.kicked) setCoins(p, p.coins + 2); }, 10000);

// תמונת מצב 15 פעמים בשנייה
setInterval(() => {
  if (!players.size) return;
  const snap = {
    t: 'snap',
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, x: Math.round(p.x), y: Math.round(p.y), a: +p.a.toFixed(2), vid: p.vid, mv: p.mv })),
    vehicles: [...vehicles.values()].map(v => [v.id, Math.round(v.x), Math.round(v.y), +v.a.toFixed(2), v.driver, v.pass]),
  };
  broadcast(snap);
}, 66);

load();
server.listen(PORT, () => {
  console.log(`\n🏍️  עין יהב אונליין רץ!`);
  console.log(`   במחשב הזה:   http://localhost:${PORT}`);
  console.log(`   מהטלפון (אותו WiFi): http://${lanIp()}:${PORT}  (או סרקו את ה-QR במשחק)\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { dirty = true; save(true); process.exit(0); });
