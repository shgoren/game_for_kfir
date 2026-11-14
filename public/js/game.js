// עין יהב אונליין — לוגיקת המשחק בצד הלקוח (תלת־ממד)
import { createWorld, ground } from './world3d.js';

const $ = (id) => document.getElementById(id);
const M = window.MAP, V = M.VEHICLES, SC = M.SC;
const SFX = window.SFX;
const lowEnd = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 700;

// ---------- זיכרון מקומי ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
let token = store.get('ey_token');
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('ey_token', token); }
const viaQR = new URLSearchParams(location.search).has('qr');

// ---------- מצב ----------
const G = {
  playing: false, kicked: false, myId: null, myName: '', myColor: '#3498db',
  me: { x: M.SPAWN.x, y: M.SPAWN.y, a: 0, vid: null, role: null, speed: 0, mv: false, sw: false },
  acct: { coins: 0, inv: {}, quests: {}, visited: {}, best: {}, hats: [], hat: null, aid: '', tools: [], food: 100, water: 100, boxes: {}, places: {} },
  others: new Map(), vehicles: new Map(), houses: [], containers: [], peppers: new Map(),
  mazor: { stage: 0, progress: {}, helpers: [] }, moshav: { families: 0 }, boards: {},
  founded: false, foundT: null, offset: 0,
  placing: null, race: null, job: null, bubbles: new Map(),
  nearInteract: null, questTarget: null, navTarget: null, cine: null, boostUntil: 0, curTown: null,
  families: new Map(),
  serverNow: () => Date.now() + G.offset,
};
window.G = G;

// ---------- כלים ----------
function toast(text, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
const fmt = (ms) => (ms / 1000).toFixed(1);
const extraSolids = () => {
  const ex = G.houses.slice();
  if (G.founded) {
    if (G.mazor.stage >= 2) ex.push(M.MAZOR);
    const n = Math.min(G.moshav.families || 0, M.planned.length);
    for (let i = 0; i < n; i++) ex.push(M.planned[i]);
  }
  return ex;
};
const skipTown = () => (G.founded ? null : 'ey');
const hasMat = (need) => Object.keys(need).every((k) => k === 'coins' || (G.acct.inv[k] || 0) >= need[k]);
const hasTools = (list) => (list || []).every((t) => G.acct.tools.includes(t));
const needHtml = (need, have) => Object.keys(need).map((k) => {
  if (k === 'coins') return `<span class="need">🪙 ${need[k]}</span>`;
  const h = have ? (have[k] || 0) : null;
  const cls = h == null ? '' : h >= need[k] ? 'ok' : 'miss';
  return `<span class="need ${cls}">${M.MATERIALS[k].emoji} ${h == null ? '' : h + '/'}${need[k]} ${M.MATERIALS[k].name}</span>`;
}).join('');
const toolsHtml = (list) => (list || []).map((t) => `<span class="need ${G.acct.tools.includes(t) ? 'ok' : 'miss'}">${M.TOOLS[t].emoji} ${M.TOOLS[t].name}</span>`).join('');

// ---------- עולם ----------
const cv = $('game'), ov = $('overlay'), octx = ov.getContext('2d');
let W = null;
setTimeout(() => {
  W = createWorld(cv, G, lowEnd);
  resize();
  $('loading').classList.add('hidden');
  $('lobby').classList.remove('hidden');
}, 50);

// ---------- מסך כניסה ----------
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff6fb5', '#34495e', '#ffffff'];
G.myColor = store.get('ey_color') || COLORS[Math.floor(Math.random() * COLORS.length)];
let starter = store.get('ey_starter3') || 'dirtbike';
const colorsEl = $('colors');
COLORS.forEach((c) => {
  const d = document.createElement('div');
  d.className = 'color' + (c === G.myColor ? ' sel' : '');
  d.style.background = c;
  d.onclick = () => { G.myColor = c; [...colorsEl.children].forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); };
  colorsEl.appendChild(d);
});
const STARTER_INFO = { dirtbike: ['🏍️', 'קפיצות ודיונות'], atv: ['🏁', 'יציב בשטח'], jeep: ['🚙', 'כל המשפחה בפנים'] };
function renderStarters() {
  $('starters').innerHTML = M.STARTER_TYPES.map((t) => `<div class="starter ${t === starter ? 'sel' : ''}" data-t="${t}"><span class="em">${STARTER_INFO[t][0]}</span>${V[t].name}<small>${STARTER_INFO[t][1]}</small></div>`).join('');
  $('starters').querySelectorAll('.starter').forEach((el) => { el.onclick = () => { starter = el.dataset.t; renderStarters(); SFX.init(); SFX.click(); }; });
}
renderStarters();
$('nameInput').value = store.get('ey_name') || '';
if (viaQR) $('qrGiftBanner').classList.remove('hidden');
fetch('info').then((r) => r.json()).then((i) => { document.querySelectorAll('.joinurl').forEach((e) => (e.textContent = i.joinUrl)); }).catch(() => {});

// ---------- התקנה כאפליקציה ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
let installEvt = null;
const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').classList.remove('hidden'); });
if (isIOS && !standalone) $('installBtn').classList.remove('hidden');
$('installBtn').onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('installBtn').classList.add('hidden'); return; }
  openModal('<div class="medal">📲</div><h2 style="text-align:center">מתקינים באייפון / אייפד</h2><p class="sub" style="font-size:18px">1. לוחצים על כפתור <b>השיתוף</b> ⬆️ בתחתית ספארי<br>2. בוחרים <b>"הוספה למסך הבית"</b><br>3. לוחצים <b>"הוסף"</b> — והמשחק מופיע כמו אפליקציה! 🎉</p>');
};
addEventListener('appinstalled', () => { $('installBtn').classList.add('hidden'); toast('📲 המשחק הותקן! אפשר לפתוח אותו מהמסך הראשי', 'good'); });

// ---------- רשת ----------
let ws = null;
let pendingCode = '';
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/`);
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', name: G.myName, color: G.myColor, token, vehicle: starter, qr: viaQR, code: pendingCode })); };
  ws.onmessage = (e) => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    if (G.kicked || !G.playing) return;
    toast('החיבור נותק... מתחבר מחדש', 'err');
    setTimeout(connect, 2000);
  };
}
const rawSend = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
function stateMsg() {
  const v = G.me.vid && G.vehicles.get(G.me.vid);
  const h = v && G.me.role === 'driver' && v.Y != null ? Math.max(0, v.Y - ground(v.x, v.y)) : 0;
  return { t: 'state', x: Math.round(G.me.x * 10) / 10, y: Math.round(G.me.y * 10) / 10, a: Math.round(G.me.a * 100) / 100, mv: G.me.mv, sw: G.me.sw, h: Math.round(h * 10) / 10 };
}
const send = (m) => { if (m.t !== 'state' && m.t !== 'join' && G.playing) rawSend(stateMsg()); rawSend(m); };
const addV = (v) => G.vehicles.set(v.id, { ...v, tx: v.x, ty: v.y, ta: v.a, th: v.h || 0, odo: 0 });

function setAcct(a) {
  const prevCoins = G.acct.coins;
  G.acct = a;
  if (a.code) G.code = a.code;
  $('coins').textContent = '🪙 ' + a.coins.toLocaleString();
  if (G.playing && a.coins > prevCoins) SFX.coin();
  $('inv').textContent = Object.keys(M.MATERIALS).filter((k) => a.inv[k] > 0).map((k) => M.MATERIALS[k].emoji + a.inv[k]).join(' ');
  $('tools').textContent = (a.tools || []).map((t) => M.TOOLS[t].emoji).join('');
  $('water').textContent = '💧 ' + a.water; $('water').classList.toggle('low', a.water <= 25);
  $('food').textContent = '🍞 ' + a.food; $('food').classList.toggle('low', a.food <= 25);
  updateQuest();
  if (!$('modal').classList.contains('hidden') && modalRefresh) modalRefresh();
}
function setMoshav(m) {
  G.moshav.prevFamilies = G.moshav.families;
  Object.assign(G.moshav, m);
  $('pop').textContent = '🏘️ ' + ((G.moshav.families || 0) * 4) + ' תושבים';
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome': {
      G.myId = m.id; G.offset = m.now - Date.now();
      if (m.token && m.token !== token) { token = m.token; store.set('ey_token', token); }
      pendingCode = '';
      G.code = m.code;
      if (m.restored) setTimeout(() => toast('🔑 ההתקדמות שלך חזרה! ברוך שובך', 'good'), 600);
      else if (m.isNew) setTimeout(() => toast(`🔑 קוד השחקן שלך: ${m.code} — שמור אותו! (כפתור 🔑 למעלה)`, 'good'), 6500);
      G.me.x = m.x; G.me.y = m.y; G.me.vid = m.vid; G.me.role = 'driver'; G.me.speed = 0; G.me.a = 0;
      G.vehicles.clear(); m.vehicles.forEach(addV);
      const mv = G.vehicles.get(m.vid); if (mv) mv.Y = ground(mv.x, mv.y);
      G.houses = m.houses; G.containers = m.containers;
      G.peppers.clear(); m.peppers.forEach((p) => G.peppers.set(p.id, p));
      G.others.clear(); pendingPick.clear(); G.families.clear();
      G.mazor = m.mazor; G.boards = m.boards;
      G.moshav = { families: 0 }; setMoshav(m.moshav); G.moshav.prevFamilies = G.moshav.families;
      setAcct(m.acct);
      const wasFounded = G.founded;
      G.founded = !!m.acct.quests.found; G.foundT = null;
      if (G.founded !== wasFounded) W.repaint();
      G.race = null; G.cine = null; G.job = null;
      startPlaying();
      if (m.qrGift) { toast(`🎁 קיבלת ${m.qrGift} מטבעות על סריקת ה-QR!`, 'good'); W.confetti(G.me.x, G.me.y, 50); }
      if (viaQR) history.replaceState(null, '', location.pathname);
      if (!G.founded) cinematic({ title: 'משפחה של חלוצים בערבה 🏜️', sub: 'מצאו את המקום להקים את מושב עין יהב — עקבו אחרי האור הצהוב', dur: 5500 });
      else cinematic({ title: 'ברוכים השבים לשטח!', sub: 'עין יהב מחכה לכם', dur: 3000 });
      break;
    }
    case 'snap': {
      const seen = new Set();
      for (const p of m.players) {
        if (p.id === G.myId) continue;
        seen.add(p.id);
        let o = G.others.get(p.id);
        if (!o) { o = { ...p, tx: p.x, ty: p.y, ta: p.a }; G.others.set(p.id, o); }
        Object.assign(o, { name: p.name, color: p.color, hat: p.hat, vid: p.vid, mv: p.mv, sw: p.sw, tx: p.x, ty: p.y, ta: p.a });
      }
      for (const id of G.others.keys()) if (!seen.has(id)) { G.others.delete(id); G.families.delete(id); }
      $('online').textContent = '👥 ' + m.players.length;
      for (const [id, x, y, a, driver, pass, h] of m.vehicles) {
        const v = G.vehicles.get(id);
        if (!v) continue;
        v.driver = driver; v.pass = pass;
        if (!(G.me.vid === id && G.me.role === 'driver')) { v.tx = x; v.ty = y; v.ta = a; v.th = h || 0; v.Y = null; }
      }
      break;
    }
    case 'acct': setAcct(m.acct); break;
    case 'moshav': {
      const prev = G.moshav.families;
      setMoshav(m.moshav);
      if (G.moshav.families > prev) { const p = M.planned[G.moshav.families - 1]; if (p) { W.puff(p.x + p.w / 2, p.y + p.h / 2, 40); if (Math.hypot(p.x - G.me.x, p.y - G.me.y) < 1500) SFX.build(); } }
      break;
    }
    case 'entered': {
      const old = G.me.vid && G.vehicles.get(G.me.vid);
      if (old && old.id !== m.vid && G.me.role === 'driver') old.driver = null;
      G.me.vid = m.vid; G.me.role = m.role; G.me.speed = 0;
      const v = G.vehicles.get(m.vid);
      if (v && m.x != null) { v.x = v.tx = m.x; v.y = v.ty = m.y; }
      if (v) { v.Y = ground(v.x, v.y); v.vy = 0; v.airT = 0; }
      if (v && m.role === 'driver') v.driver = G.myId;
      SFX.click(); updateRideBtn();
      break;
    }
    case 'role': if (G.me.vid === m.vid) { G.me.role = m.role; G.me.speed = 0; toast('עכשיו אתה הנהג! 🏍️'); } break;
    case 'vadd': addV(m.v); break;
    case 'vmove': { const v = G.vehicles.get(m.id); if (v) Object.assign(v, { x: m.x, y: m.y, tx: m.x, ty: m.y, a: m.a, ta: m.a, color: m.color, owner: m.owner, Y: null }); break; }
    case 'vremove': {
      const v = G.vehicles.get(m.id);
      if (G.me.vid === m.id && v) {
        const S = V[v.type];
        G.me.x = v.x + Math.cos(v.a + Math.PI / 2) * (S.wid / SC / 2 + 12); G.me.y = v.y + Math.sin(v.a + Math.PI / 2) * (S.wid / SC / 2 + 12);
        G.me.vid = null; G.me.role = null; G.me.speed = 0; updateRideBtn();
      }
      G.vehicles.delete(m.id);
      break;
    }
    case 'house':
      G.houses.push(m.h);
      W.puff(m.h.x + m.h.w / 2, m.h.y + m.h.h / 2, 40);
      if (Math.hypot(m.h.x - G.me.x, m.h.y - G.me.y) < 1200) SFX.build();
      break;
    case 'container': G.containers.push(m.c); m.vehicles.forEach(addV); break;
    case 'pepper+': G.peppers.set(m.p.id, m.p); break;
    case 'pepper-': {
      const p = G.peppers.get(m.id);
      if (p && m.by === G.myId) floatText('🌶️ +10 🪙');
      G.peppers.delete(m.id); pendingPick.delete(m.id);
      break;
    }
    case 'mazor': {
      const prev = G.mazor.stage;
      G.mazor = m.mazor;
      if (m.mazor.stage > prev && Math.hypot(M.MAZOR.x - G.me.x, M.MAZOR.y - G.me.y) < 1200) { SFX.build(); setTimeout(SFX.fanfare, 600); W.confetti(M.MAZOR.x + 80, M.MAZOR.y + 60, 80); }
      if (modalRefresh) modalRefresh();
      break;
    }
    case 'boards': G.boards = m.boards; break;
    case 'quest': {
      const q = M.QUESTS.find((q) => q.id === m.id);
      toast(`✅ משימה הושלמה: ${q.title}  +${m.reward} 🪙`, 'good');
      SFX.fanfare(); W.confetti(G.me.x, G.me.y, 70);
      break;
    }
    case 'bought': toast(m.text, 'good'); SFX.coin(); break;
    case 'found': toast(m.text, 'good'); SFX.medal(); W.confetti(G.me.x, G.me.y, 40); break;
    case 'boost': G.boostUntil = performance.now() + m.secs * 1000; toast(m.text, 'good'); SFX.coin(); break;
    case 'needs': toast('😟 המשפחה צמאה ורעבה! קנו אוכל בסופר ושתו מים במעיין או בברז', 'err'); SFX.error(); break;
    case 'jobGo': {
      const j = M.JOB_PICKUPS.find((q) => q.id === m.id);
      G.job = { id: m.id };
      G.navTarget = { x: 4615, y: 3845, label: 'הובל את הארגזים לבית האריזה 📦' };
      toast(`📦 העמסת ארגזי פלפלים ב${j.name}! סע לבית האריזה`, 'good');
      updateQuest();
      break;
    }
    case 'jumpPay': floatText(`🏍️ ${m.air.toFixed(1)} שנ' באוויר! +${m.pay} 🪙`); break;
    case 'schoolResult': schoolResult(m); break;
    case 'raceGo': raceGo(m.id); break;
    case 'raceResult': raceResult(m); break;
    case 'raceFail': endRaceUi(); toast(m.text, 'err'); SFX.error(); break;
    case 'chat':
      G.bubbles.set(m.id, { text: m.text, until: performance.now() + 5000 });
      toast(`💬 ${m.name}: ${m.text}`);
      break;
    case 'msg': toast(m.text); break;
    case 'err': toast(m.text, 'err'); SFX.error(); break;
    case 'punch': SFX.punch(); W.puff(m.x, m.y, 30, '#ffdddd'); break;
    case 'kicked': showKicked(m.until); break;
    case 'badCode':
      G.playing = false;
      $('playBtn').disabled = false; $('playBtn').textContent = 'יוצאים לדרך! 🚀';
      toast('🔑 הקוד לא נמצא — בדוק שהקלדת נכון', 'err'); SFX.error();
      break;
  }
}

let floatMsg = null;
function floatText(t) { floatMsg = { t, until: performance.now() + 1600 }; }

function startPlaying() {
  G.playing = true;
  ['lobby', 'kicked'].forEach((id) => $(id).classList.add('hidden'));
  ['hud', 'minimap', 'actions'].forEach((id) => $(id).classList.remove('hidden'));
  $('soundBtn').textContent = SFX.muted ? '🔇' : '🔊';
  updateRideBtn(); updateQuest();
}

let kickTimer = null;
function showKicked(until) {
  G.kicked = true; G.playing = false; G.race = null;
  cancelPlace(); closeModal();
  ['hud', 'minimap', 'actions', 'chatForm', 'lobby', 'raceHud', 'hint'].forEach((id) => $(id).classList.add('hidden'));
  $('kicked').classList.remove('hidden');
  SFX.engine(null);
  clearInterval(kickTimer);
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left > 0) { $('kickTimer').textContent = `אפשר לחזור בעוד ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; $('backBtn').disabled = true; }
    else { $('kickTimer').textContent = 'אפשר לחזור! והפעם — בלי מכות 😉'; $('backBtn').disabled = false; clearInterval(kickTimer); }
  };
  tick();
  kickTimer = setInterval(tick, 500);
}

$('playBtn').onclick = () => {
  SFX.init(); SFX.click();
  G.myName = $('nameInput').value.trim().slice(0, 14) || 'שחקן';
  pendingCode = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (pendingCode && pendingCode.length !== 6) { toast('🔑 הקוד צריך להיות 6 תווים', 'err'); return; }
  store.set('ey_name', G.myName); store.set('ey_color', G.myColor); store.set('ey_starter3', starter);
  $('playBtn').disabled = true; $('playBtn').textContent = 'מתחבר...';
  connect();
};
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('playBtn').click(); });
$('backBtn').onclick = () => { G.kicked = false; $('kicked').classList.add('hidden'); connect(); };
$('keyBtn').onclick = () => {
  SFX.click();
  openModal(`<div class="medal">🔑</div><h2 style="text-align:center">קוד השחקן שלך</h2><div class="bigcode">${G.code || '------'}</div>
    <p class="sub">כל מה שהשגת נשמר בענן. אם מחקת את המשחק, החלפת טלפון או שיחקת ממחשב אחר — במסך הכניסה לוחצים על <b>"🔑 כבר שיחקת?"</b> ומקלידים את הקוד.</p>
    <p class="sub">📸 כדאי לצלם את המסך או לרשום את הקוד במקום בטוח. אל תיתן אותו לאחרים — מי שיש לו את הקוד משחק בדמות שלך.</p>`);
};
$('soundBtn').onclick = () => { SFX.init(); $('soundBtn').textContent = SFX.toggle() ? '🔇' : '🔊'; };

// ---------- קלט ----------
const keys = new Set();
const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
const modalOpen = () => !$('modal').classList.contains('hidden');
addEventListener('keydown', (e) => {
  if (typing()) { if (e.key === 'Escape') closeChat(); return; }
  if (e.code === 'Escape') { if (modalOpen()) closeModal(); else cancelPlace(); return; }
  if (modalOpen()) return;
  keys.add(e.code);
  if (!G.playing) return;
  if (e.code === 'KeyE') { e.preventDefault(); toggleRide(); }
  if (e.code === 'KeyF') doInteract();
  if (e.code === 'Enter') { e.preventDefault(); if (G.placing) confirmPlace(); else openChat(); }
  if (e.code === 'KeyB') openBuildMenu();
  if (e.code === 'KeyM') openBigMap();
  if (e.code === 'KeyQ') openQuests();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const joy = { id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
const JOY_R = 60;
cv.addEventListener('pointerdown', (e) => {
  SFX.init();
  if (joy.id !== null || !G.playing) return;
  joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.dx = joy.dy = 0;
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.sx, dy = e.clientY - joy.sy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  joy.dx = dx; joy.dy = dy;
});
const joyEnd = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.dx = joy.dy = 0; } };
cv.addEventListener('pointerup', joyEnd);
cv.addEventListener('pointercancel', joyEnd);

function getInput() {
  let x = 0, y = 0;
  if (!typing() && !modalOpen()) {
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
  }
  if (joy.id !== null) { x += joy.dx / JOY_R; y += joy.dy / JOY_R; }
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  const locked = (G.cine && G.cine.lock) || (G.race && performance.now() < G.race.t0) || modalOpen();
  return locked ? { x: 0, y: 0, m: 0 } : { x, y, m: Math.min(1, m) };
}

// ---------- רכיבה ----------
let nearVehicle = null;
function findNearVehicle() {
  let best = null, bd = 60;
  for (const v of G.vehicles.values()) {
    if (v.temp) continue;
    const d = Math.hypot(v.x - G.me.x, v.y - G.me.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function exitVehicle() {
  const v = G.vehicles.get(G.me.vid);
  if (v) {
    const S = V[v.type];
    const sd = S.wid / SC / 2 + 12, fd = S.len / SC / 2 + 12;
    const cands = [[v.a + Math.PI / 2, sd], [v.a - Math.PI / 2, sd], [v.a + Math.PI, fd], [v.a, fd]];
    let pos = { x: v.x, y: v.y };
    for (const [ang, d] of cands) {
      const x = v.x + Math.cos(ang) * d, y = v.y + Math.sin(ang) * d;
      if (!M.collides(x, y, 6, extraSolids(), skipTown())) { pos = { x, y }; break; }
    }
    if (G.me.role === 'driver') { v.driver = null; v.tx = v.x; v.ty = v.y; v.ta = v.a; v.Y = null; v.th = 0; v.h = 0; }
    G.me.x = pos.x; G.me.y = pos.y;
  }
  G.me.vid = null; G.me.role = null; G.me.speed = 0;
  send({ t: 'exit', x: G.me.x, y: G.me.y });
  updateRideBtn();
}
function toggleRide() {
  if (!G.playing || (G.cine && G.cine.lock)) return;
  if (G.race) { toast('אי אפשר להחליף רכב באמצע תחרות 🏁', 'err'); return; }
  if (G.me.vid) { exitVehicle(); SFX.click(); return; }
  if (nearVehicle) send({ t: 'enter', vid: nearVehicle.id });
  else toast('אין כלי רכב קרוב 🏍️');
}
const vEmoji = (t) => ({ bike: '🚲', dirtbike: '🏍️', moto: '🏍️', atv: '🏁', jeep: '🚙', tractor: '🚜' }[t] || '🏍️');
function updateRideBtn() {
  const b = $('rideBtn');
  if (G.me.vid) { b.innerHTML = '🚶<span>רד</span>'; b.classList.add('on'); }
  else { b.innerHTML = (nearVehicle ? vEmoji(nearVehicle.type) : '🏍️') + '<span>עלה</span>'; b.classList.toggle('on', !!nearVehicle); }
}
$('rideBtn').onclick = () => { SFX.init(); toggleRide(); };

// ---------- חלון כללי ----------
let modalRefresh = null;
function openModal(html, refresh) {
  $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
  modalRefresh = refresh || null;
  keys.clear();
}
function closeModal() { $('modal').classList.add('hidden'); modalRefresh = null; }
$('modalX').onclick = () => { SFX.click(); closeModal(); };
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });

// ---------- פעולות במקומות ----------
function doInteract() {
  const it = G.nearInteract;
  if (!it || !G.playing) return;
  SFX.init(); SFX.click();
  if (it.type === 'shop') openShop(it.shop);
  else if (it.type === 'school') openSchool();
  else if (it.type === 'chugim') openChugim();
  else if (it.type === 'race') openRaceIntro(it.race);
  else if (it.type === 'mazor') openMazor();
  else if (it.type === 'office') openOffice();
  else if (it.type === 'job') {
    if (G.job) toast('כבר יש לך ארגזים — סע לבית האריזה 📦');
    else if (!G.me.vid) toast('צריך רכב כדי להוביל ארגזים — טרקטור, ג׳יפ או טרקטורון 🚜', 'err');
    else send({ t: 'jobStart', id: it.job });
  } else if (it.type === 'deliver') {
    if (G.job) { send({ t: 'jobDone' }); G.job = null; G.navTarget = null; updateQuest(); }
    else toast('כאן מביאים ארגזי פלפלים מהחממות — חפש את השלט "עבודה" בחממות 🌶️');
  }
}
$('actBtn').onclick = doInteract;

function openShop(id) {
  const shop = M.SHOPS[id];
  let qty = 1;
  const draw = () => {
    const rows = shop.items.map((it) => {
      const ic = `<div class="ic">${it.emoji || vEmoji(it.vehicle)}</div>`;
      let extra = '';
      if (it.material) extra = `<small>יש לך: ${G.acct.inv[it.id] || 0}</small>`;
      if (it.tool) extra = `<small>${G.acct.tools.includes(it.id) ? '✔ יש לך' : 'צריך לבנייה'}</small>`;
      if (it.food || it.water) extra = `<small>${it.water ? '💧 +' + it.water + ' ' : ''}${it.food ? '🍞 +' + it.food + ' ' : ''}${it.boost ? '⚡ ריצה מהירה' : ''}</small>`;
      if (it.vehicle) extra = `<small>${V[it.vehicle].seats > 1 ? `${V[it.vehicle].seats} מקומות` : 'רוכב אחד'} · ${Math.round(V[it.vehicle].max * SC * 3.6)} קמ"ש · שטח ${Math.round(V[it.vehicle].offroad * 100)}%</small>`;
      const owned = (it.hat && G.acct.hats.includes(it.hat)) || (it.tool && G.acct.tools.includes(it.id));
      const wearing = it.hat && G.acct.hat === it.hat;
      const price = it.material ? it.price * qty : it.price;
      const label = wearing ? 'חובש ✔' : it.tool && owned ? '✔' : owned ? 'לחבוש' : `${price.toLocaleString()} 🪙`;
      const dis = wearing || (it.tool && owned) || (!owned && G.acct.coins < price);
      return `<div class="row"><div>${ic}</div><div class="tx"><b>${it.name}${it.material && qty > 1 ? ` ×${qty}` : ''}</b>${extra}</div><div class="btns"><button class="mini" data-buy="${it.id}" ${dis ? 'disabled' : ''}>${label}</button></div></div>`;
    }).join('');
    const qtyBar = id === 'materials' ? `<div class="invline">כמות: <button class="mini ${qty === 1 ? '' : 'no'}" data-q="1">1</button> <button class="mini ${qty === 5 ? '' : 'no'}" data-q="5">5</button> <button class="mini ${qty === 10 ? '' : 'no'}" data-q="10">10</button></div>` : '';
    openModal(`<h2>${shop.title}</h2><p class="sub">${shop.sub}</p><div class="invline">🪙 ${G.acct.coins.toLocaleString()} · 💧${G.acct.water} 🍞${G.acct.food} ${$('inv').textContent ? ' · ' + $('inv').textContent : ''}</div>${qtyBar}${rows}`, draw);
    $('modalBody').querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { qty = +b.dataset.q; draw(); }; });
    $('modalBody').querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => { SFX.click(); send({ t: 'shop', shop: id, item: b.dataset.buy, qty }); }; });
  };
  draw();
}

function openBuildMenu() {
  if (!G.playing) return;
  const draw = () => {
    const rows = Object.keys(M.HOUSE_TYPES).map((k) => {
      const h = M.HOUSE_TYPES[k], ok = hasMat(h.need) && hasTools(h.tools);
      return `<div class="row"><div class="ic">${k === 'villa' ? '🏰' : k === 'big' ? '🏡' : '🏠'}</div><div class="tx"><b>${h.name}</b>${needHtml(h.need, G.acct.inv)}<br>${toolsHtml(h.tools)}</div><div class="btns"><button class="mini" data-h="${k}" ${ok ? '' : 'disabled'}>בנה</button></div></div>`;
    }).join('');
    openModal(`<h2>🏠 בונים בית למשפחה</h2><p class="sub">צריך חומרי בניין (בחנות חומרי הבניין) וכלים (בחנות הכלים, או בארגזים שמוסתרים בשטח 🧰). אפשר לבנות במושב או בשטח.</p>${rows}<button class="big gold" id="goMat">🧭 נווט לחנות חומרי הבניין</button><button class="big" id="goTools">🧭 נווט לחנות הכלים</button>`, draw);
    $('modalBody').querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => { closeModal(); startPlacing('house', b.dataset.h); }; });
    $('goMat').onclick = () => { G.navTarget = { x: 3135, y: 4100, label: 'חנות חומרי בניין' }; closeModal(); updateQuest(); };
    $('goTools').onclick = () => { G.navTarget = { x: 3255, y: 4100, label: 'חנות הכלים' }; closeModal(); updateQuest(); };
  };
  draw();
}
$('buildBtn').onclick = () => { SFX.init(); SFX.click(); openBuildMenu(); };

function openOffice() {
  const draw = () => {
    const F = M.FAMILY_COST;
    const n = G.moshav.families || 0;
    const ok = G.acct.coins >= F.coins && hasMat(F.need);
    openModal(`<div class="medal">👨‍👩‍👧‍👦</div><h2 style="text-align:center">מזכירות מושב עין יהב</h2>
      <p class="sub">עין יהב צריך עוד משפחות! כל משפחה חדשה מקבלת בית באחד המגרשים, והמושב גדל.</p>
      <div style="text-align:center;font-size:20px;font-weight:800">🏘️ ${n} משפחות · ${n * 4} תושבים</div>
      <div class="bar"><i style="width:${Math.round(n / M.planned.length * 100)}%"></i></div>
      <p class="sub">${M.planned.length - n} מגרשים פנויים</p>
      <h3>להביא משפחה עולה:</h3><div><span class="need">🪙 ${F.coins}</span>${needHtml(F.need, G.acct.inv)}</div>
      <button class="big" id="bring" ${ok ? '' : 'disabled'}>👨‍👩‍👧 הבא משפחה חדשה למושב</button>`, draw);
    $('bring').onclick = () => { SFX.click(); send({ t: 'family' }); };
  };
  draw();
}

function openMazor() {
  const draw = () => {
    const st = G.mazor.stage, S = M.MAZOR_STAGES;
    if (st >= S.length) {
      openModal(`<div class="medal">🏡</div><h2 style="text-align:center">משק מזור גמור!</h2><p class="sub">תודה לכל מי שעזר לבנות:</p><p style="text-align:center">${G.mazor.helpers.join(' · ')}</p>`, draw);
      return;
    }
    const cur = S[st];
    const prog = Object.keys(cur.need).map((k) => {
      const have = G.mazor.progress[k] || 0;
      const nm = k === 'coins' ? '🪙 מטבעות' : `${M.MATERIALS[k].emoji} ${M.MATERIALS[k].name}`;
      return `<div><b>${nm}</b>: ${have} / ${cur.need[k]}<div class="bar"><i style="width:${Math.round(have / cur.need[k] * 100)}%"></i></div></div>`;
    }).join('');
    const stages = S.map((s, i) => `<span class="need ${i < st ? 'ok' : i === st ? 'miss' : ''}">${i < st ? '✔' : i + 1} ${s.name}</span>`).join('');
    openModal(`<h2>🏗️ משק מזור</h2><p class="sub">המשק המרכזי של עין יהב — כולם בונים אותו ביחד! כל מי שעוזר מקבל 150 🪙 כשהשלב נגמר.</p>
      <div style="text-align:center;margin-bottom:8px">${stages}</div><h3>עכשיו בונים: ${cur.name}</h3>${prog}
      <div>כלי עבודה לשלב: ${toolsHtml(cur.tools)}</div>
      <div class="invline">בתיק שלך: ${$('inv').textContent || 'אין חומרים'} · 🪙 ${G.acct.coins.toLocaleString()}</div>
      <button class="big" id="give">🧱 תרום את מה שיש לי</button><button class="big gold" id="goMat">🧭 נווט לחנות חומרי הבניין</button>
      ${G.mazor.helpers.length ? `<p class="sub">עזרו לבנות: ${G.mazor.helpers.join(' · ')}</p>` : ''}`, draw);
    $('give').onclick = () => { SFX.click(); send({ t: 'mazor' }); };
    $('goMat').onclick = () => { G.navTarget = { x: 3135, y: 4100, label: 'חנות חומרי בניין' }; closeModal(); updateQuest(); };
  };
  draw();
}

// ---------- בית ספר ----------
function openSchool() {
  const pool = M.SCHOOL_QUESTIONS.map((q, i) => ({ ...q, i })).sort(() => Math.random() - 0.5).slice(0, 3);
  const answers = [];
  let k = 0;
  const ask = () => {
    const q = pool[k];
    const opts = q.a.slice().sort(() => Math.random() - 0.5);
    openModal(`<h2>📚 שיעור בבית הספר</h2><p class="sub">שאלה ${k + 1} מתוך 3 · כל תשובה נכונה = 60 🪙</p><h3 style="text-align:center;font-size:22px">${q.q}</h3>${opts.map((o) => `<button class="ans" data-a="${o}">${o}</button>`).join('')}`);
    $('modalBody').querySelectorAll('.ans').forEach((b) => {
      b.onclick = () => {
        const right = b.dataset.a === q.a[0];
        b.classList.add(right ? 'right' : 'wrong');
        if (!right) $('modalBody').querySelectorAll('.ans').forEach((x) => { if (x.dataset.a === q.a[0]) x.classList.add('right'); });
        right ? SFX.checkpoint() : SFX.error();
        answers.push({ q: q.i, a: b.dataset.a });
        $('modalBody').querySelectorAll('.ans').forEach((x) => (x.disabled = true));
        setTimeout(() => { k++; if (k < pool.length) ask(); else { send({ t: 'school', answers }); openModal('<h2>📚 בודקים...</h2>'); } }, 900);
      };
    });
  };
  ask();
}
function schoolResult(m) {
  openModal(`<div class="medal">${m.correct === m.total ? '🌟' : m.correct ? '👍' : '📖'}</div><h2 style="text-align:center">ענית נכון על ${m.correct} מתוך ${m.total}</h2><p class="sub">קיבלת ${m.reward} 🪙</p><button class="big" id="okb">יופי!</button>`);
  $('okb').onclick = closeModal;
  if (m.correct) { SFX.medal(); W.confetti(G.me.x, G.me.y, 30 * m.correct); }
}

// ---------- חוגים ותחרויות ----------
function boardHtml(id) {
  const b = G.boards[id] || [];
  if (!b.length) return '<p class="sub">עוד אין שיאים — תהיה הראשון!</p>';
  return `<table class="board">${b.slice(0, 5).map((e, i) => `<tr><td>${['🥇', '🥈', '🥉', '4', '5'][i]} ${e.name}</td><td>${fmt(e.ms)} שנ'</td></tr>`).join('')}</table>`;
}
function openChugim() {
  const rows = M.RACES.map((r) => `<div class="row" style="opacity:1"><div class="ic">${r.emoji}</div><div class="tx"><b>${r.name}</b><small>${r.desc}</small><br><small>🥇 עד ${fmt(r.gold)} שנ' · פרס עד ${r.rewards[0]} 🪙${G.acct.best[r.id] ? ` · השיא שלך: ${fmt(G.acct.best[r.id])}` : ''}</small></div><div class="btns"><button class="mini" data-nav="${r.id}">🧭 סע</button></div></div>`).join('');
  openModal(`<h2>🏅 לוח החוגים והתחרויות</h2><p class="sub">מתחרים, מרוויחים כסף ושוברים שיאים! וגם: בפארק הקפיצות מקבלים כסף על כל קפיצה באוויר 🏍️</p>${rows}<button class="big gold" id="goJump">🧭 סע לפארק הקפיצות</button>`);
  $('modalBody').querySelectorAll('[data-nav]').forEach((b) => {
    b.onclick = () => { const r = M.RACES.find((x) => x.id === b.dataset.nav); G.navTarget = { x: r.start.x, y: r.start.y, label: r.name }; closeModal(); updateQuest(); };
  });
  $('goJump').onclick = () => { G.navTarget = { x: M.JUMP_PARK.x, y: M.JUMP_PARK.y, label: 'פארק הקפיצות' }; closeModal(); updateQuest(); };
}
function openRaceIntro(id) {
  const r = M.RACES.find((x) => x.id === id);
  const veh = r.vehicle ? `החוג נותן לך ${V[r.vehicle].name} לתחרות.` : r.id === 'tri' ? 'שוחים, אחר כך מקבלים אופניים, ובסוף רצים!' : 'רצים ברגל!';
  openModal(`<div class="medal">${r.emoji}</div><h2 style="text-align:center">${r.name}</h2><p class="sub">${r.desc}<br>${veh}${r.laps > 1 ? `<br>${r.laps} סיבובים` : ''}</p>
    <div style="text-align:center"><span class="need">🥇 עד ${fmt(r.gold)} שנ' — ${r.rewards[0]} 🪙</span><span class="need">🥈 עד ${fmt(r.silver)} שנ' — ${r.rewards[1]} 🪙</span><span class="need">🥉 סיום — ${r.rewards[2]} 🪙</span></div>
    <h3>🏆 טבלת השיאים</h3>${boardHtml(id)}<button class="big gold" id="go">🏁 התחל!</button>`);
  $('go').onclick = () => {
    closeModal();
    if (G.me.vid && G.me.role !== 'driver') exitVehicle();
    const first = r.cps[0].m || r.vehicle;
    if (G.me.vid && (!first || first === 'foot' || first === 'swim')) exitVehicle();
    send({ t: 'raceStart', id });
  };
}
function raceGo(id) {
  const def = M.RACES.find((r) => r.id === id);
  const cps = [];
  for (let l = 0; l < def.laps; l++) cps.push(...def.cps);
  G.race = { def, cps, idx: 0, t0: performance.now() + 3000, mode: cps[0].m || def.vehicle || 'foot', lastBeep: 4 };
  $('raceHud').classList.remove('hidden');
  $('actions').classList.add('hidden');
}
function raceTick(now) {
  const R = G.race;
  if (!R) return;
  const left = (R.t0 - now) / 1000;
  if (left > 0) {
    const n = Math.ceil(left);
    if (n < R.lastBeep) { R.lastBeep = n; SFX.beep(); }
    $('raceHud').querySelector('.rtime').textContent = String(n);
  } else {
    if (R.lastBeep > 0) { R.lastBeep = 0; SFX.go(); }
    if (!R.finished) $('raceHud').querySelector('.rtime').textContent = fmt(now - R.t0);
  }
  const lapLen = R.def.cps.length;
  $('raceHud').querySelector('.rinfo').innerHTML = `${R.def.emoji} ${R.def.name}<br>נקודה ${Math.min(R.idx + 1, R.cps.length)}/${R.cps.length}${R.def.laps > 1 ? ` · סיבוב ${Math.min(R.def.laps, Math.floor(R.idx / lapLen) + 1)}/${R.def.laps}` : ''}`;
  if (R.finished || left > 0) return;
  const c = R.cps[R.idx];
  const rad = G.me.vid ? 60 : 40;
  if (Math.hypot(c.x - G.me.x, c.y - G.me.y) < rad) {
    R.idx++;
    if (R.idx >= R.cps.length) { R.finished = true; SFX.go(); send({ t: 'raceFinish', id: R.def.id }); return; }
    SFX.checkpoint();
    const next = R.cps[R.idx].m || R.def.vehicle || 'foot';
    if (next !== R.mode) {
      if (next === 'bike' && !G.me.vid) send({ t: 'raceMode', mode: 'bike', a: Math.atan2(R.cps[R.idx].y - G.me.y, R.cps[R.idx].x - G.me.x) });
      if ((next === 'foot' || next === 'swim') && G.me.vid) exitVehicle();
      R.mode = next;
      toast(next === 'bike' ? '🚲 עכשיו על האופניים!' : next === 'swim' ? '🏊 שוחים!' : '🏃 עכשיו רצים!', 'good');
    }
  }
}
function endRaceUi() {
  G.race = null;
  $('raceHud').classList.add('hidden');
  $('actions').classList.remove('hidden');
}
$('raceQuit').onclick = () => { send({ t: 'raceQuit' }); if (G.me.vid) { const v = G.vehicles.get(G.me.vid); if (v && v.temp) exitVehicle(); } endRaceUi(); toast('יצאת מהתחרות'); };
function raceResult(m) {
  endRaceUi();
  G.boards[m.id] = m.board;
  const r = M.RACES.find((x) => x.id === m.id);
  openModal(`<div class="medal">${['🥇', '🥈', '🥉'][m.medal]}</div><h2 style="text-align:center">${r.name}</h2><p class="sub" style="font-size:20px"><b>${fmt(m.ms)} שניות</b>${m.best ? ' — שיא אישי! 🎉' : ''}<br>קיבלת ${m.reward} 🪙</p><h3>🏆 טבלת השיאים</h3>${boardHtml(m.id)}<button class="big" id="again">🔁 עוד פעם</button><button class="big no" id="okb">סגור</button>`);
  $('okb').onclick = closeModal;
  $('again').onclick = () => { closeModal(); G.navTarget = { x: r.start.x, y: r.start.y, label: r.name }; updateQuest(); };
  SFX.medal(); W.confetti(G.me.x, G.me.y, 90);
}

// ---------- משימות ----------
function currentQuest() {
  for (const q of M.QUESTS) if (!G.acct.quests[q.id]) return q;
  return null;
}
function nearestOf(list, done) {
  let best = null, bd = 1e9;
  for (const t of list) {
    if (done(t)) continue;
    const d = Math.hypot(t.x - G.me.x, t.y - G.me.y);
    if (d < bd) { bd = d; best = { x: t.x, y: t.y, label: t.name }; }
  }
  return best;
}
function questTargetOf(q) {
  if (!q) return null;
  if (q.id === 'trip') return nearestOf(M.towns.filter((t) => t.id !== 'ey'), (t) => G.acct.visited[t.id]);
  if (q.id === 'explore') return nearestOf(M.landmarks, (t) => (G.acct.places || {})[t.id]);
  if (q.id === 'mazor' && !Object.keys(M.MATERIALS).some((k) => G.acct.inv[k] > 0) && G.mazor.stage < 4) return { x: 3135, y: 4100, label: 'חנות חומרי בניין' };
  if (q.id === 'family' && !hasMat(M.FAMILY_COST.need)) return { x: 3135, y: 4100, label: 'חנות חומרי בניין' };
  return q.target;
}
function updateQuest() {
  const q = currentQuest();
  if (G.navTarget) {
    G.questTarget = G.navTarget;
    $('questCard').querySelector('.qt').textContent = '🧭 ' + G.navTarget.label;
    $('questCard').querySelector('.qd').textContent = 'עקוב אחרי האור הצהוב';
    return;
  }
  G.questTarget = questTargetOf(q);
  if (!q) {
    $('questCard').querySelector('.qt').textContent = '🏆 סיימת את כל המשימות!';
    $('questCard').querySelector('.qd').textContent = 'עכשיו — עוד משפחות, תחרויות וטיולים עם חברים';
    return;
  }
  let d = q.desc;
  if (q.id === 'trip') d += ` (${Object.keys(G.acct.visited).length}/3)`;
  if (q.id === 'explore') d = `גלה מקומות בשטח (${Object.keys(G.acct.places || {}).length}/3) — הבא: ${G.questTarget ? G.questTarget.label : ''}`;
  if ((q.id === 'mazor' || q.id === 'family') && G.questTarget && G.questTarget.label) d = 'קודם קונים חומרים בחנות חומרי הבניין';
  $('questCard').querySelector('.qt').textContent = '🎯 ' + q.title;
  $('questCard').querySelector('.qd').textContent = d;
}
function openQuests() {
  const cur = currentQuest();
  const rows = M.QUESTS.map((q) => `<div class="row ${G.acct.quests[q.id] ? 'done' : ''} ${q === cur ? 'cur' : ''}"><div class="ic">${G.acct.quests[q.id] ? '✅' : q === cur ? '🎯' : '⬜'}</div><div class="tx"><b>${q.title}</b><small>${q.desc} · ${q.reward} 🪙</small></div></div>`).join('');
  const done = M.QUESTS.filter((q) => G.acct.quests[q.id]).length;
  openModal(`<h2>🎯 המשימות של המשפחה</h2><div class="bar"><i style="width:${done / M.QUESTS.length * 100}%"></i></div><p class="sub">${done} מתוך ${M.QUESTS.length}</p>${rows}`);
}
$('questCard').onclick = () => { SFX.init(); SFX.click(); if (G.navTarget) { G.navTarget = null; updateQuest(); } else openQuests(); };

// ---------- בנייה ----------
function startPlacing(kind, sub) {
  if (!G.playing) return;
  const S = M.HOUSE_TYPES[sub];
  G.placing = { kind, sub, w: S.w, h: S.h, x: 0, y: 0, ok: false };
  $('placeText').textContent = `🏠 ${S.name}: זוז כדי לבחור מקום`;
  $('placeBar').classList.remove('hidden');
  $('actions').classList.add('hidden');
}
function cancelPlace() {
  G.placing = null;
  $('placeBar').classList.add('hidden');
  if (G.playing && !G.race) $('actions').classList.remove('hidden');
}
function confirmPlace() {
  const P = G.placing;
  if (!P) return;
  if (!P.ok) { toast('אי אפשר לבנות כאן — לא על כביש, לא על שביל ולא צמוד לבניין', 'err'); SFX.error(); return; }
  send({ t: 'build', type: P.sub, x: P.x, y: P.y });
  cancelPlace();
}
$('placeOk').onclick = confirmPlace;
$('placeCancel').onclick = cancelPlace;

// ---------- צ'אט, הזמנה, הרבצה ----------
function openChat() { $('chatForm').classList.remove('hidden'); $('chatInput').focus(); keys.clear(); }
function closeChat() { $('chatForm').classList.add('hidden'); $('chatInput').blur(); $('chatInput').value = ''; }
$('chatBtn').onclick = () => ($('chatForm').classList.contains('hidden') ? openChat() : closeChat());
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  if (text) send({ t: 'chat', text });
  closeChat();
};
$('qrBtn').onclick = () => {
  SFX.click();
  openModal(`<h2 style="text-align:center">📱 הזמן חברים</h2><p class="sub">סורקים עם המצלמה של הטלפון ומקבלים <b>200 🪙</b> במתנה!</p><img class="bigqr" src="qr.svg" alt="QR"><div class="joinurl" style="text-align:center">${document.querySelector('.joinurl').textContent}</div>`);
};
$('hitBtn').onclick = () => {
  SFX.click();
  openModal(`<div class="medal">👊</div><h2 style="text-align:center">בטוח שאתה רוצה להרביץ?</h2><p class="sub">מי שמרביץ <b>מגורש מהמשחק!</b></p><button class="big danger" id="hy">כן, להרביץ</button><button class="big" id="hn">לא, אני חבר טוב 😇</button>`);
  $('hy').onclick = () => { closeModal(); send({ t: 'hit' }); };
  $('hn').onclick = () => { closeModal(); toast('כל הכבוד! 😇 חברים לא מרביצים', 'good'); };
};

// ---------- מפה ----------
function openBigMap() {
  const c = document.createElement('canvas');
  c.width = 720; c.height = 800;
  const x = c.getContext('2d');
  x.drawImage(W.groundCanvas, 0, 0, 720, 800);
  const sx = 720 / M.W, sy = 800 / M.H;
  x.font = '800 20px Rubik, Arial'; x.textAlign = 'center'; x.lineWidth = 5; x.strokeStyle = '#fff8ea';
  const label = (t, px, py, col) => { x.strokeText(t, px, py); x.fillStyle = col || '#7a1f0e'; x.fillText(t, px, py); };
  for (const t of M.towns) if (t.id !== 'ey' || G.founded) label(t.name + (G.acct.visited[t.id] ? ' ✔' : ''), t.x * sx, t.y * sy - 20);
  if (!G.founded) label('🚩 ?', M.EY.x * sx, M.EY.y * sy);
  for (const l of M.landmarks) label(((G.acct.places || {})[l.id] ? '✔ ' : '⭐ ') + l.name, l.x * sx, l.y * sy, '#5a3410');
  label('הרי אדום', 6800 * sx, 3800 * sy, '#5a2a14');
  if (G.questTarget) label('🎯', G.questTarget.x * sx, G.questTarget.y * sy);
  for (const o of G.others.values()) { x.fillStyle = o.color; x.beginPath(); x.arc(o.x * sx, o.y * sy, 6, 0, 7); x.fill(); }
  x.fillStyle = G.myColor; x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.arc(G.me.x * sx, G.me.y * sy, 9, 0, 7); x.fill(); x.stroke();
  label('אתה', G.me.x * sx, G.me.y * sy + 26, '#c0392b');
  openModal(`<h2>🗺️ מפת הערבה</h2><img class="bigmap" src="${c.toDataURL()}">`);
}
$('minimap').onclick = () => { SFX.init(); openBigMap(); };
const mm = $('minimap'), mctx = mm.getContext('2d');
function drawMinimap() {
  if (!G.playing) return;
  const sx = mm.width / M.W, sy = mm.height / M.H;
  mctx.drawImage(W.groundCanvas, 0, 0, mm.width, mm.height);
  if (G.questTarget) {
    const p = 3 + Math.abs(Math.sin(performance.now() / 300)) * 3;
    mctx.fillStyle = '#ffd23f'; mctx.strokeStyle = '#7a4a10'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(G.questTarget.x * sx, G.questTarget.y * sy, p, 0, 7); mctx.fill(); mctx.stroke();
  }
  for (const o of G.others.values()) { mctx.fillStyle = o.color; mctx.beginPath(); mctx.arc(o.x * sx, o.y * sy, 3, 0, 7); mctx.fill(); }
  mctx.save(); mctx.translate(G.me.x * sx, G.me.y * sy); mctx.rotate(-W.camYaw());
  mctx.fillStyle = G.myColor; mctx.strokeStyle = '#000'; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -5); mctx.lineTo(-2, 0); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

// ---------- סינמטיקה ----------
function cinematic(o) { G.cine = Object.assign({ t0: performance.now(), dur: 3000 }, o); }
function startFounding() {
  G.founded = true; G.foundT = performance.now();
  W.repaint();
  send({ t: 'found' });
  cinematic({ kind: 'found', lock: true, dur: 10000, zoom: true, titles: [
    [0, 'מצאתם את המקום! 🚩', 'כאן, בין נחל יהב לנחל נקרות'],
    [2600, 'מקימים את מושב עין יהב', 'רחובות, חממות, דקלים, בריכה ובית ספר...'],
    [6200, 'ברוכים הבאים לעין יהב 🌶️', 'עכשיו — להשיג כלים ולבנות את משק מזור!'],
  ] });
  SFX.fanfare();
  setTimeout(() => SFX.build(), 2300);
  setTimeout(() => SFX.build(), 3600);
  setTimeout(() => SFX.build(), 5000);
  setTimeout(() => { SFX.medal(); W.confetti(M.EY.x, M.EY.y, 150); }, 6200);
}

// ---------- המשפחה: אישה ושני ילדים הולכים אחריך ----------
function familyLook(color, i) {
  const pal = ['#e84393', '#f39c12', '#00b894', '#6c5ce7', '#fd79a8', '#0984e3'];
  const h = parseInt(color.slice(1), 16) % 6;
  if (i === 0) return { color: pal[h], female: true, hair: '#3b2414', pants: '#2d3436' };
  return { color: pal[(h + i * 2) % 6], kid: true, female: i === 2, hair: i === 1 ? '#4a2c17' : '#7a5230' };
}
function updateFamily(pid, leader, dt, inVehicleId, vType) {
  let fam = G.families.get(pid);
  if (!fam) {
    fam = { trail: [], members: [0, 1, 2].map((i) => ({ x: leader.x - 10 - i * 12, y: leader.y + 8 * i, a: 0, mv: false, look: familyLook(leader.color || G.myColor, i) })), inVehicle: null };
    G.families.set(pid, fam);
  }
  fam.inVehicle = inVehicleId && vType === 'jeep' ? inVehicleId : null;
  const t = fam.trail;
  if (!inVehicleId) {
    if (!t.length || Math.hypot(t[t.length - 1].x - leader.x, t[t.length - 1].y - leader.y) > 4) t.push({ x: leader.x, y: leader.y });
    if (t.length > 80) t.shift();
  }
  fam.members.forEach((f, i) => {
    if (inVehicleId) {
      if (fam.inVehicle) { f.x = leader.x; f.y = leader.y; t.length = 0; }
      const dd = Math.hypot(f.x - leader.x, f.y - leader.y);
      f.mv = false; f.wave = dd < 300;
      f.hidden = !fam.inVehicle && dd < 60; // לא עומדים מול המצלמה
      if (dd > 300) f.away = true;
      return;
    }
    f.hidden = false;
    if (f.away) {
      f.away = false;
      f.x = leader.x - Math.cos(leader.a || 0) * (20 + i * 12) + (Math.random() - 0.5) * 10; f.y = leader.y - Math.sin(leader.a || 0) * (20 + i * 12);
      t.length = 0;
      if (pid === G.myId && i === 0) { W.puff(f.x, f.y, 12); toast('👨‍👩‍👧 המשפחה הגיעה אליך!'); }
    }
    const back = 6 + i * 4;
    const target = t[Math.max(0, t.length - 1 - back)] || leader;
    const d = Math.hypot(target.x - f.x, target.y - f.y);
    if (d > 500) { f.x = target.x + (Math.random() - 0.5) * 20; f.y = target.y + (Math.random() - 0.5) * 20; if (pid === G.myId) W.puff(f.x, f.y, 8); }
    f.mv = d > 6;
    f.wave = false;
    if (f.mv) {
      f.a = Math.atan2(target.y - f.y, target.x - f.x);
      const sp = Math.min(d, (i ? 85 : 80) * dt * Math.min(2, d / 30 + 0.5));
      f.x += Math.cos(f.a) * sp; f.y += Math.sin(f.a) * sp;
    } else {
      const da = Math.atan2(leader.y - f.y, leader.x - f.x);
      f.a += angDiff(da, f.a) * 0.05;
    }
    f.sw = G.founded && M.inPool(f.x, f.y);
  });
}

// ---------- פיזיקה ----------
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));
function tryMove(o, nx, ny, r) {
  const ex = extraSolids(), sk = skipTown();
  if (M.collides(o.x, o.y, r, ex, sk)) { o.x = Math.max(r, Math.min(M.W - r, nx)); o.y = Math.max(r, Math.min(M.H - r, ny)); return true; }
  if (!M.collides(nx, ny, r, ex, sk)) { o.x = nx; o.y = ny; return true; }
  if (!M.collides(nx, o.y, r, ex, sk)) { o.x = nx; return false; }
  if (!M.collides(o.x, ny, r, ex, sk)) { o.y = ny; return false; }
  return false;
}
const GRAV = 13;
function dustFx(v, speed, dt, mine) {
  const S = V[v.type];
  v.odo = (v.odo || 0) + speed * dt;
  const kind = M.onRoad(v.x, v.y, skipTown());
  const off = !kind || kind === 'trail' || kind === 'track';
  const air = (v.Y != null ? v.Y - ground(v.x, v.y) : v.h || 0) > 0.4;
  if (speed > 60 && !air && Math.random() < (off ? 1 : 0.2) * dt * (mine ? 45 : 25)) {
    const bx = v.x - Math.cos(v.a) * S.len / SC / 2, by = v.y - Math.sin(v.a) * S.len / SC / 2;
    const gy = ground(bx, by);
    const sd = (Math.random() - 0.5) * S.wid;
    W.spawn(bx * SC - Math.sin(v.a) * sd, gy + 0.3, by * SC + Math.cos(v.a) * sd, -Math.cos(v.a) * 2 + (Math.random() - 0.5) * 2, 0.8 + Math.random(), -Math.sin(v.a) * 2 + (Math.random() - 0.5) * 2, off ? 1.6 + Math.random() * 1.4 : 0.7, off ? 1.4 : 0.6, off ? '#d9bd8e' : '#bbbbbb', off ? 0.55 : 0.25);
  }
}

const pendingPick = new Set();
const sentOnce = new Set();
let sendT = 0, drinkT = 0;
function update(dt, now) {
  const me = G.me;
  const inp = getInput();
  const k = 1 - Math.exp(-dt * 12);

  for (const v of G.vehicles.values()) {
    if (me.vid === v.id && me.role === 'driver') continue;
    if (Math.hypot(v.tx - v.x, v.ty - v.y) > 500) { v.x = v.tx; v.y = v.ty; }
    const ox = v.x, oy = v.y;
    v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; v.a += angDiff(v.ta, v.a) * k;
    v.h = (v.h || 0) + ((v.th || 0) - (v.h || 0)) * k;
    const sp = Math.hypot(v.x - ox, v.y - oy) / Math.max(dt, 0.001);
    if (sp > 5) dustFx(v, sp, dt, false);
  }
  for (const o of G.others.values()) {
    if (Math.hypot(o.tx - o.x, o.ty - o.y) > 500) { o.x = o.tx; o.y = o.ty; }
    o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.a += angDiff(o.ta, o.a) * k;
    const ov = o.vid && G.vehicles.get(o.vid);
    updateFamily(o.id, o, dt, o.vid, ov && ov.type);
  }
  if (G.cine && now - G.cine.t0 > G.cine.dur) G.cine = null;

  if (!G.playing) { SFX.engine(null); return; }

  const camA = -W.camYaw();
  const want = inp.m > 0.1 ? camA + Math.atan2(inp.x, -inp.y) : null;
  const v = me.vid && G.vehicles.get(me.vid);
  if (v && me.role === 'driver') {
    const S = V[v.type];
    if (v.Y == null) { v.Y = ground(v.x, v.y); v.vy = 0; }
    const g0 = ground(v.x, v.y);
    const airborne = v.Y > g0 + 0.15;
    if (want != null) {
      const d = angDiff(want, v.a);
      const turn = S.turn * dt * (0.5 + 0.5 * Math.min(1, Math.abs(me.speed) / 120)) * (airborne ? 0.35 : 1);
      v.a += Math.max(-turn, Math.min(turn, d));
      let target = Math.abs(d) > 2.3 ? 0 : S.max * inp.m * (Math.abs(d) > 1.2 ? 0.5 : 1);
      if (Math.abs(d) > 2.6 && me.speed < 30) target = -S.max * 0.25;
      if (!airborne) me.speed = approach(me.speed, target, S.acc * dt * (target < me.speed ? 1.4 : 1));
    } else if (!airborne) me.speed = approach(me.speed, 0, S.acc * 0.7 * dt);
    const kind = M.onRoad(v.x, v.y, skipTown());
    const terrain = kind && kind !== 'trail' && kind !== 'track' ? 1 : (kind ? Math.max(S.offroad, 0.9) : S.offroad);
    const step = me.speed * terrain * dt;
    if (!tryMove(v, v.x + Math.cos(v.a) * step, v.y + Math.sin(v.a) * step, S.r)) { if (Math.abs(me.speed) > 150) { SFX.land(); W.shake(0.4); } me.speed *= 0.4; }
    // גובה וקפיצות
    const g1 = ground(v.x, v.y);
    if (!airborne) {
      const cand = v.Y + (v.vy || 0) * dt - GRAV * dt * dt;
      const sMs = Math.abs(me.speed) * SC;
      if (cand > g1 + 0.12 && sMs > 7) { v.Y = cand; v.vy = (v.vy || 0) - GRAV * dt; v.airT = 0; }
      else { v.vy = Math.max(-25, Math.min(25, (g1 - v.Y) / dt)); v.Y = g1; }
    } else {
      v.vy -= GRAV * dt; v.Y += v.vy * dt; v.airT = (v.airT || 0) + dt;
      if (v.Y <= g1) {
        const air = v.airT;
        v.Y = g1; v.vy = 0;
        W.puff(v.x, v.y, Math.min(30, 6 + air * 10), '#dcc29a', 2.5);
        if (air > 0.35) { SFX.land(); W.shake(Math.min(0.6, air * 0.25)); }
        if (air >= 0.8) send({ t: 'jump', air: Math.round(air * 100) / 100 });
        v.airT = 0;
      }
    }
    // הטיה
    const L = S.len / SC / 2, ca = Math.cos(v.a), sa = Math.sin(v.a);
    const pitchG = Math.atan2(ground(v.x + ca * L, v.y + sa * L) - ground(v.x - ca * L, v.y - sa * L), S.len);
    const inAir = v.Y > g1 + 0.1;
    const tp = inAir ? Math.atan2(v.vy, Math.max(4, Math.abs(me.speed) * SC)) * 0.6 : pitchG;
    v.pitch = (v.pitch || 0) + (tp - (v.pitch || 0)) * Math.min(1, dt * 8);
    const Wd = Math.max(S.wid, 0.8) / SC / 2;
    const rollG = Math.atan2(ground(v.x - sa * Wd, v.y + ca * Wd) - ground(v.x + sa * Wd, v.y - ca * Wd), Math.max(S.wid, 0.8));
    const lean = (v.type === 'dirtbike' || v.type === 'moto' || v.type === 'bike') && want != null ? -Math.max(-0.45, Math.min(0.45, angDiff(want, v.a))) * Math.min(1, Math.abs(me.speed) / 200) : 0;
    v.roll = (v.roll || 0) + (rollG + lean - (v.roll || 0)) * Math.min(1, dt * 6);
    dustFx(v, Math.abs(me.speed * terrain), dt, true);
    me.x = v.x; me.y = v.y; me.a = v.a; me.mv = Math.abs(me.speed) > 5; me.sw = false;
    SFX.engine(v.type, me.speed);
  } else if (v) {
    me.x = v.x; me.y = v.y; me.a = v.a; me.mv = false; me.sw = false;
    SFX.engine(null);
  } else {
    if (me.vid && !v) { me.vid = null; me.role = null; }
    SFX.engine(null);
    me.sw = G.founded && M.inPool(me.x, me.y);
    if (want != null) {
      me.a = want;
      const base = me.sw ? 26 : 70 * (now < G.boostUntil ? 1.45 : 1) * (G.acct.food > 0 && G.acct.water > 0 ? 1 : 0.7);
      const sp = base * inp.m * dt;
      tryMove(me, me.x + Math.cos(me.a) * sp, me.y + Math.sin(me.a) * sp, 6);
      me.mv = true;
    } else me.mv = false;
  }
  const myV = me.vid && G.vehicles.get(me.vid);
  updateFamily(G.myId, { x: me.x, y: me.y, a: me.a, color: G.myColor }, dt, me.vid, myV && myV.type);

  // הקמת עין יהב
  if (!G.founded && Math.hypot(me.x - M.EY.x, me.y - M.EY.y) < 260) startFounding();

  // כניסה למושבים — כמו בסרט
  const town = M.townAt(me.x, me.y);
  const tid = town && (town.id !== 'ey' || G.founded) ? town.id : null;
  if (tid !== G.curTown) {
    G.curTown = tid;
    if (town && tid && (!G.cine || !G.cine.lock)) {
      cinematic({ title: 'ברוכים הבאים ל' + town.name, sub: town.sub, dur: 3200, town: true });
      SFX.whoosh();
      if (tid !== 'ey' && !G.acct.visited[tid]) send({ t: 'visit', town: tid });
    }
  }
  // גילוי מקומות, ארגזי כלים ומים
  for (const l of M.landmarks) if (!(G.acct.places || {})[l.id] && !sentOnce.has(l.id) && Math.hypot(l.x - me.x, l.y - me.y) < l.r) { sentOnce.add(l.id); send({ t: 'landmark', id: l.id }); }
  for (const b of M.toolboxes) if (!(G.acct.boxes || {})[b.id] && !sentOnce.has(b.id) && Math.hypot(b.x - me.x, b.y - me.y) < 60) { sentOnce.add(b.id); send({ t: 'toolbox', id: b.id }); }
  drinkT -= dt;
  if (drinkT <= 0 && G.acct.water < 95) {
    for (const s of M.springs) if ((!s.town || G.founded) && Math.hypot(s.x - me.x, s.y - me.y) < s.r + 60) { send({ t: 'drink' }); drinkT = 4; break; }
  }
  // קטיף פלפלים
  for (const p of G.peppers.values()) {
    if (p.town === 'ey' && !G.founded) continue;
    if (!pendingPick.has(p.id) && Math.hypot(p.x - me.x, p.y - me.y) < 26) { pendingPick.add(p.id); send({ t: 'pick', id: p.id }); }
  }
  // מקומות קרובים
  let ni = null, nd = 1e9;
  for (const it of M.interacts) {
    if (it.town === 'ey' && !G.founded) continue;
    const d = Math.hypot(it.x - me.x, it.y - me.y);
    if (d < it.r + (me.vid ? 25 : 0) && d < nd) { nd = d; ni = it; }
  }
  if (G.race) ni = null;
  if (ni !== G.nearInteract) {
    G.nearInteract = ni;
    const b = $('actBtn');
    if (ni) { b.classList.remove('hidden'); b.querySelector('b').textContent = 'ontouchstart' in window ? '👉' : 'F'; b.querySelector('span').textContent = ni.label; SFX.click(); }
    else b.classList.add('hidden');
  }
  if (G.job && Math.hypot(4615 - me.x, 3845 - me.y) < 90) { send({ t: 'jobDone' }); G.job = null; G.navTarget = null; updateQuest(); }
  if (G.navTarget && !G.job && Math.hypot(G.navTarget.x - me.x, G.navTarget.y - me.y) < 70) { G.navTarget = null; updateQuest(); }
  const cq = currentQuest();
  if (cq && (cq.id === 'trip' || cq.id === 'explore') && !G.navTarget) G.questTarget = questTargetOf(cq);

  const nv = me.vid ? null : findNearVehicle();
  if (nv !== nearVehicle) { nearVehicle = nv; updateRideBtn(); }
  let ht = '';
  if (G.race) ht = '';
  else if (me.vid && v) ht = me.role === 'driver' ? `${vEmoji(v.type)} ${V[v.type].name}` : `נוסע ב${V[v.type].name} עם חבר 😎`;
  else if (nearVehicle) {
    const mine = !nearVehicle.ownerAid || nearVehicle.ownerAid === G.acct.aid;
    ht = `${vEmoji(nearVehicle.type)} ${V[nearVehicle.type].name}${nearVehicle.owner ? ' של ' + (nearVehicle.ownerAid === G.acct.aid ? 'שלך' : nearVehicle.owner) : ''} — ${mine || nearVehicle.driver ? 'לחץ "עלה" (E)' : 'רק הבעלים נוהג'}`;
  } else if (me.sw) ht = '🏊 שוחים בבריכה!';
  const hint = $('hint');
  if (hint.textContent !== ht) { hint.textContent = ht; hint.classList.toggle('hidden', !ht); }

  if (G.placing) {
    const P = G.placing;
    const dist = 30 + Math.max(P.w, P.h) / 2 + 20;
    P.x = Math.round(me.x + Math.cos(me.a) * dist - P.w / 2); P.y = Math.round(me.y + Math.sin(me.a) * dist - P.h / 2);
    P.ok = M.canPlace({ x: P.x, y: P.y, w: P.w, h: P.h }, extraSolids());
  }
  raceTick(now);

  sendT += dt;
  if (sendT > 0.066) { sendT = 0; send(stateMsg()); }
}

// ---------- שכבת ממשק על המסך ----------
function drawOverlay(now) {
  const Wd = innerWidth, Hd = innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (ov.width !== Math.floor(Wd * dpr) || ov.height !== Math.floor(Hd * dpr)) { ov.width = Math.floor(Wd * dpr); ov.height = Math.floor(Hd * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, Wd, Hd);
  const text = (t, x, y, size, color, stroke, weight) => {
    octx.font = `${weight || 800} ${size}px Rubik, "Segoe UI", Arial, sans-serif`;
    octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.lineJoin = 'round';
    octx.lineWidth = Math.max(3, size / 5); octx.strokeStyle = stroke || 'rgba(40,20,5,.85)';
    octx.strokeText(t, x, y); octx.fillStyle = color || '#fff'; octx.fillText(t, x, y);
  };
  // חץ ליעד
  const t = G.race ? G.race.cps[G.race.idx] : G.questTarget;
  if (G.playing && t && !(G.cine && G.cine.lock)) {
    const p = W.project(t.x, t.y, 3);
    let sx = p.x * Wd, sy = p.y * Hd;
    const off = p.behind || sx < 40 || sx > Wd - 40 || sy < 90 || sy > Hd - 120;
    if (off) {
      if (p.behind) { sx = Wd - sx; sy = Hd * 2; }
      const cx = Wd / 2, cy = Hd / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const rx = Wd / 2 - 50, ry = Hd / 2 - 100;
      const kk = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
      const ax = cx + Math.cos(a) * kk, ay = cy + Math.sin(a) * kk;
      octx.save(); octx.translate(ax, ay); octx.rotate(a);
      const pulse = 1 + Math.sin(now / 200) * 0.1; octx.scale(pulse, pulse);
      octx.fillStyle = '#ffd23f'; octx.strokeStyle = '#7a4a10'; octx.lineWidth = 3;
      octx.beginPath(); octx.moveTo(26, 0); octx.lineTo(-12, -18); octx.lineTo(-4, 0); octx.lineTo(-12, 18); octx.closePath(); octx.fill(); octx.stroke();
      octx.restore();
      const dist = Math.round(Math.hypot(t.x - G.me.x, t.y - G.me.y) * SC);
      text(dist >= 1000 ? (dist / 1000).toFixed(1) + ' ק"מ' : dist + ' מ\'', ax - Math.cos(a) * 36, ay - Math.sin(a) * 32, 15, '#fff');
    }
  }
  // ג'ויסטיק
  if (joy.id !== null) {
    octx.fillStyle = 'rgba(255,255,255,.22)'; octx.strokeStyle = 'rgba(59,36,18,.4)'; octx.lineWidth = 3;
    octx.beginPath(); octx.arc(joy.sx, joy.sy, JOY_R, 0, 7); octx.fill(); octx.stroke();
    octx.fillStyle = 'rgba(255,248,234,.92)';
    octx.beginPath(); octx.arc(joy.sx + joy.dx, joy.sy + joy.dy, 26, 0, 7); octx.fill(); octx.stroke();
  } else if (G.playing && 'ontouchstart' in window && !G.me.mv && !G.cine) {
    text('👆 גרור באצבע על המסך כדי לנסוע', Wd / 2, Hd * 0.62, 16);
  }
  // מד מהירות
  const mv = G.me.vid && G.vehicles.get(G.me.vid);
  if (G.playing && mv && G.me.role === 'driver') {
    const kmh = Math.round(Math.abs(G.me.speed) * SC * 3.6);
    const x = 70, y = Hd - 80;
    octx.fillStyle = 'rgba(20,12,5,.55)'; octx.beginPath(); octx.arc(x, y, 52, 0, 7); octx.fill();
    octx.strokeStyle = '#ffd23f'; octx.lineWidth = 6; octx.lineCap = 'round';
    octx.beginPath(); octx.arc(x, y, 44, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1, kmh / 160)); octx.stroke();
    text(String(kmh), x, y - 4, 28, '#fff');
    text('קמ"ש', x, y + 22, 12, '#ffd23f');
    if (mv.Y != null && mv.Y - ground(mv.x, mv.y) > 0.6) text('🚀 באוויר!', x, y - 72, 18, '#ffd23f');
  }
  if (floatMsg && now < floatMsg.until) {
    const k = 1 - (floatMsg.until - now) / 1600;
    octx.globalAlpha = 1 - k * k;
    text(floatMsg.t, Wd / 2, Hd * 0.42 - k * 40, 26, '#ffd23f');
    octx.globalAlpha = 1;
  }
  // בועות צ'אט
  for (const [id, b] of G.bubbles) {
    if (now > b.until) { G.bubbles.delete(id); continue; }
    const o = id === G.myId ? G.me : G.others.get(id);
    if (!o) continue;
    const p = W.project(o.x, o.y, 3.4);
    if (p.behind) continue;
    octx.font = '700 15px Rubik, Arial';
    const w = Math.min(260, octx.measureText(b.text).width + 22);
    const bx = p.x * Wd - w / 2, by = p.y * Hd - 34;
    octx.fillStyle = '#fff'; octx.beginPath(); if (octx.roundRect) octx.roundRect(bx, by, w, 30, 13); else octx.rect(bx, by, w, 30); octx.fill();
    octx.fillStyle = '#3b2412'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(b.text, p.x * Wd, by + 15, w - 12);
  }
  // מקום לבנייה
  if (G.placing) {
    const P = G.placing;
    const pts = [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]].map(([x, y]) => W.project(x, y, 0.3));
    if (!pts.some((q) => q.behind)) {
      octx.fillStyle = P.ok ? 'rgba(39,174,96,.35)' : 'rgba(231,76,60,.35)'; octx.strokeStyle = P.ok ? '#27ae60' : '#e74c3c'; octx.lineWidth = 3;
      octx.beginPath(); pts.forEach((q, i) => (i ? octx.lineTo(q.x * Wd, q.y * Hd) : octx.moveTo(q.x * Wd, q.y * Hd))); octx.closePath(); octx.fill(); octx.stroke();
      const c = W.project(P.x + P.w / 2, P.y + P.h / 2, 3);
      text(P.ok ? '✔ אפשר לבנות כאן' : '✖ לא כאן', c.x * Wd, c.y * Hd, 17, P.ok ? '#b8f5c8' : '#ffb3a7');
    }
  }
  // ספירה לאחור
  if (G.race && now < G.race.t0 + 700) {
    const left = (G.race.t0 - now) / 1000;
    const n = left > 0 ? String(Math.ceil(left)) : 'צא!';
    const f = left > 0 ? 1 - (left % 1) : (now - G.race.t0) / 700;
    octx.globalAlpha = left > 0 ? 1 : 1 - f;
    text(n, Wd / 2, Hd / 2 - 40, 90 + f * 40, left > 0 ? '#ff6b5b' : '#5be38a', '#fff');
    octx.globalAlpha = 1;
  }
  // פסי קולנוע וכותרות
  const C = G.cine;
  if (C) {
    const e = now - C.t0;
    const kk = Math.max(0, Math.min(Math.min(1, e / 500), Math.min(1, (C.dur - e) / 500)));
    const bh = (C.town ? 0.09 : 0.13) * Hd * kk;
    octx.fillStyle = '#000'; octx.fillRect(0, 0, Wd, bh); octx.fillRect(0, Hd - bh, Wd, bh);
    let title = C.title, sub = C.sub, tt = e;
    if (C.titles) for (const [at, a, b] of C.titles) if (e >= at) { title = a; sub = b; tt = e - at; }
    octx.globalAlpha = Math.min(1, tt / 600) * kk;
    const big = Math.min(54, Wd / 13);
    const y = Hd * (C.town ? 0.3 : 0.26) + (1 - Math.min(1, tt / 600)) * 20;
    text(title, Wd / 2, y, big, '#fff8ea');
    if (sub) text(sub, Wd / 2, y + big * 0.95, Math.min(24, Wd / 26), '#ffd23f');
    octx.globalAlpha = 1;
  }
}

// ---------- לולאה ----------
function resize() { if (W) W.resize(innerWidth, innerHeight); }
addEventListener('resize', resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (W) {
    update(dt, now);
    const v = G.me.vid && G.vehicles.get(G.me.vid);
    const Y = v ? (v.Y != null ? v.Y : ground(v.x, v.y) + (v.h || 0)) : ground(G.me.x, G.me.y);
    W.updateCamera(dt, now, { x: G.me.x, y: G.me.y, Y, a: G.me.a, speed: Math.abs(G.me.speed) * SC, inVehicle: !!v, moving: G.me.mv });
    W.update(dt, now);
    W.render();
    drawOverlay(now);
    drawMinimap();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
