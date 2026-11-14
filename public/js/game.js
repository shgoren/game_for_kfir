// עין יהב אונליין — לוגיקת המשחק בצד הלקוח
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const M = window.MAP, V = M.VEHICLES;
  const cv = $('game'), ctx = cv.getContext('2d');

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
    me: { x: M.SPAWN.x, y: M.SPAWN.y, a: 0, vid: null, role: null, speed: 0, mv: false, walkT: 0, sw: false },
    acct: { coins: 0, inv: {}, quests: {}, visited: {}, best: {}, hats: [], hat: null, aid: '' },
    others: new Map(), vehicles: new Map(), houses: [], containers: [], peppers: new Map(),
    mazor: { stage: 0, progress: {}, helpers: [] }, boards: {},
    founded: false, foundT: null, now: performance.now(), offset: 0,
    placing: null, race: null, particles: [], tracks: [], effects: [], bubbles: new Map(), gazelles: [],
    nearInteract: null, questTarget: null, navTarget: null, cine: null, boostUntil: 0, curTown: null,
    serverNow: () => Date.now() + G.offset,
    meView: () => ({ ...G.me, id: G.myId, name: G.myName, color: G.myColor, hat: G.acct.hat, boost: G.now < G.boostUntil }),
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
    const ex = G.houses.concat(G.containers);
    if (G.founded && G.mazor.stage >= 2) ex.push(M.MAZOR);
    return ex;
  };
  const skipTown = () => (G.founded ? null : 'ey');
  const hasMat = (need) => Object.keys(need).every((k) => k === 'coins' || (G.acct.inv[k] || 0) >= need[k]);
  const needHtml = (need, have) => Object.keys(need).map((k) => {
    if (k === 'coins') return `<span class="need">🪙 ${need[k]}</span>`;
    const h = have ? (have[k] || 0) : null;
    const cls = h == null ? '' : h >= need[k] ? 'ok' : 'miss';
    return `<span class="need ${cls}">${M.MATERIALS[k].emoji} ${h == null ? '' : h + '/'}${need[k]} ${M.MATERIALS[k].name}</span>`;
  }).join('');

  function confetti(x, y, n) {
    const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#ff6fb5'];
    for (let i = 0; i < (n || 60); i++) {
      const a = Math.random() * Math.PI * 2, s = 100 + Math.random() * 300;
      G.particles.push({ kind: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150, life: 0, max: 1.6 + Math.random(), c: cols[i % cols.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }

  // ---------- מסך כניסה ----------
  const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff6fb5', '#34495e', '#ffffff'];
  G.myColor = store.get('ey_color') || COLORS[Math.floor(Math.random() * COLORS.length)];
  let starter = store.get('ey_starter') || 'moto';
  const colorsEl = $('colors');
  COLORS.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'color' + (c === G.myColor ? ' sel' : '');
    d.style.background = c;
    d.onclick = () => { G.myColor = c; [...colorsEl.children].forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); renderStarters(); };
    colorsEl.appendChild(d);
  });
  function renderStarters() {
    $('starters').innerHTML = M.STARTER_TYPES.map((t) => `<div class="starter ${t === starter ? 'sel' : ''}" data-t="${t}"><img src="${R.vehicleIcon(t, G.myColor, 128)}" alt="">${V[t].name}</div>`).join('');
    $('starters').querySelectorAll('.starter').forEach((el) => { el.onclick = () => { starter = el.dataset.t; renderStarters(); SFX.init(); SFX.click(); }; });
  }
  renderStarters();
  $('nameInput').value = store.get('ey_name') || '';
  if (viaQR) $('qrGiftBanner').classList.remove('hidden');
  fetch('info').then((r) => r.json()).then((i) => { document.querySelectorAll('.joinurl').forEach((e) => (e.textContent = i.joinUrl)); }).catch(() => {});

  // ---------- רשת ----------
  let ws = null;
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/`);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: G.myName, color: G.myColor, token, vehicle: starter, qr: viaQR }));
    ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    ws.onclose = () => {
      if (G.kicked || !G.playing) return;
      toast('החיבור נותק... מתחבר מחדש', 'err');
      setTimeout(connect, 2000);
    };
  }
  const rawSend = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const stateMsg = () => ({ t: 'state', x: Math.round(G.me.x * 10) / 10, y: Math.round(G.me.y * 10) / 10, a: Math.round(G.me.a * 100) / 100, mv: G.me.mv, sw: G.me.sw });
  // לפני כל פעולה שולחים קודם את המיקום, כדי שהשרת יידע איפה אנחנו
  const send = (m) => { if (m.t !== 'state' && m.t !== 'join' && G.playing) rawSend(stateMsg()); rawSend(m); };
  const addV = (v) => G.vehicles.set(v.id, { ...v, tx: v.x, ty: v.y, ta: v.a, odo: 0, air: 0 });

  function setAcct(a) {
    const prevCoins = G.acct.coins;
    G.acct = a;
    $('coins').textContent = '🪙 ' + a.coins.toLocaleString();
    if (G.playing && a.coins > prevCoins) SFX.coin();
    const inv = Object.keys(M.MATERIALS).filter((k) => a.inv[k] > 0).map((k) => M.MATERIALS[k].emoji + a.inv[k]).join(' ');
    $('inv').textContent = inv;
    updateQuest();
    if (!$('modal').classList.contains('hidden') && modalRefresh) modalRefresh();
  }

  function onMsg(m) {
    switch (m.t) {
      case 'welcome': {
        G.myId = m.id; G.offset = m.now - Date.now();
        G.me.x = m.x; G.me.y = m.y; G.me.vid = m.vid; G.me.role = 'driver'; G.me.speed = 0; G.me.a = 0;
        G.vehicles.clear(); m.vehicles.forEach(addV);
        G.houses = m.houses; G.containers = m.containers;
        G.peppers.clear(); m.peppers.forEach((p) => G.peppers.set(p.id, p));
        G.others.clear(); pendingPick.clear();
        G.mazor = m.mazor; G.boards = m.boards;
        setAcct(m.acct);
        G.founded = !!m.acct.quests.found; G.foundT = null;
        minimapBase = null;
        G.race = null; G.cine = null;
        startPlaying();
        if (m.qrGift) { toast(`🎁 קיבלת ${m.qrGift} מטבעות על סריקת ה-QR!`, 'good'); confetti(G.me.x, G.me.y, 50); }
        if (viaQR) history.replaceState(null, '', location.pathname);
        if (!G.founded) cinematic({ title: 'חלוצים בערבה 🏜️', sub: 'מצאו את המקום להקים את מושב עין יהב — עקבו אחרי החץ הצהוב', dur: 5000 });
        else cinematic({ title: 'ברוכים השבים לשטח!', sub: 'עין יהב מחכה לכם', dur: 3000 });
        break;
      }
      case 'snap': {
        const seen = new Set();
        for (const p of m.players) {
          if (p.id === G.myId) continue;
          seen.add(p.id);
          let o = G.others.get(p.id);
          if (!o) { o = { ...p, tx: p.x, ty: p.y, ta: p.a, walkT: 0 }; G.others.set(p.id, o); }
          Object.assign(o, { name: p.name, color: p.color, hat: p.hat, vid: p.vid, mv: p.mv, sw: p.sw, tx: p.x, ty: p.y, ta: p.a });
        }
        for (const id of G.others.keys()) if (!seen.has(id)) G.others.delete(id);
        $('online').textContent = '👥 ' + m.players.length;
        for (const [id, x, y, a, driver, pass] of m.vehicles) {
          const v = G.vehicles.get(id);
          if (!v) continue;
          v.driver = driver; v.pass = pass;
          if (!(G.me.vid === id && G.me.role === 'driver')) { v.tx = x; v.ty = y; v.ta = a; }
        }
        break;
      }
      case 'acct': setAcct(m.acct); break;
      case 'entered': {
        const old = G.me.vid && G.vehicles.get(G.me.vid);
        if (old && old.id !== m.vid && G.me.role === 'driver') old.driver = null;
        G.me.vid = m.vid; G.me.role = m.role; G.me.speed = 0;
        const v = G.vehicles.get(m.vid);
        if (v && m.x != null) { v.x = v.tx = m.x; v.y = v.ty = m.y; }
        if (v && m.role === 'driver') v.driver = G.myId;
        SFX.click(); updateRideBtn();
        break;
      }
      case 'role': if (G.me.vid === m.vid) { G.me.role = m.role; G.me.speed = 0; toast('עכשיו אתה הנהג! 🏍️'); } break;
      case 'vadd': addV(m.v); break;
      case 'vmove': { const v = G.vehicles.get(m.id); if (v) Object.assign(v, { x: m.x, y: m.y, tx: m.x, ty: m.y, a: m.a, ta: m.a, color: m.color, owner: m.owner }); break; }
      case 'vremove': {
        const v = G.vehicles.get(m.id);
        if (G.me.vid === m.id && v) {
          const S = V[v.type];
          G.me.x = v.x + Math.cos(v.a + Math.PI / 2) * (S.wid / 2 + 16); G.me.y = v.y + Math.sin(v.a + Math.PI / 2) * (S.wid / 2 + 16);
          G.me.vid = null; G.me.role = null; G.me.speed = 0; updateRideBtn();
        }
        G.vehicles.delete(m.id);
        break;
      }
      case 'house':
        G.houses.push(m.h);
        G.effects.push({ kind: 'puff', x: m.h.x + m.h.w / 2, y: m.h.y + m.h.h / 2, t: 0, dur: 1.2 });
        if (Math.hypot(m.h.x - G.me.x, m.h.y - G.me.y) < 800) SFX.build();
        break;
      case 'container': G.containers.push(m.c); m.vehicles.forEach(addV); G.effects.push({ kind: 'puff', x: m.c.x + 70, y: m.c.y + 26, t: 0, dur: 1 }); break;
      case 'pepper+': G.peppers.set(m.p.id, m.p); break;
      case 'pepper-': {
        const p = G.peppers.get(m.id);
        if (p && m.by === G.myId) G.effects.push({ x: p.x, y: p.y, t: 0, text: '+10 🪙', dur: 1 });
        G.peppers.delete(m.id); pendingPick.delete(m.id);
        break;
      }
      case 'mazor': {
        const prev = G.mazor.stage;
        G.mazor = m.mazor;
        if (m.mazor.stage > prev) {
          G.effects.push({ kind: 'puff', x: M.MAZOR.x + 75, y: M.MAZOR.y + 60, t: 0, dur: 1.4 });
          if (Math.hypot(M.MAZOR.x - G.me.x, M.MAZOR.y - G.me.y) < 900) { SFX.build(); setTimeout(SFX.fanfare, 600); confetti(M.MAZOR.x + 75, M.MAZOR.y + 60, 80); }
        }
        if (modalRefresh) modalRefresh();
        break;
      }
      case 'boards': G.boards = m.boards; break;
      case 'quest': {
        const q = M.QUESTS.find((q) => q.id === m.id);
        toast(`✅ משימה הושלמה: ${q.title}  +${m.reward} 🪙`, 'good');
        SFX.fanfare(); confetti(G.me.x, G.me.y, 70);
        break;
      }
      case 'bought': toast(m.text, 'good'); SFX.coin(); if (m.vid) G.navTarget = null; break;
      case 'boost': G.boostUntil = G.now + m.secs * 1000; toast(m.text, 'good'); SFX.coin(); break;
      case 'schoolResult': schoolResult(m); break;
      case 'raceGo': raceGo(m.id); break;
      case 'raceResult': raceResult(m); break;
      case 'raceFail': endRaceUi(); toast(m.text, 'err'); SFX.error(); break;
      case 'chat':
        G.bubbles.set(m.id, { text: m.text, until: G.now + 5000 });
        toast(`💬 ${m.name}: ${m.text}`);
        break;
      case 'msg': toast(m.text); break;
      case 'err': toast(m.text, 'err'); SFX.error(); break;
      case 'punch':
        G.effects.push({ x: m.x, y: m.y, t: 0, text: '👊💥', dur: 1.2, big: true });
        SFX.punch();
        break;
      case 'kicked': showKicked(m.until); break;
    }
  }

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
    store.set('ey_name', G.myName); store.set('ey_color', G.myColor); store.set('ey_starter', starter);
    $('playBtn').disabled = true; $('playBtn').textContent = 'מתחבר...';
    connect();
  };
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('playBtn').click(); });
  $('backBtn').onclick = () => { G.kicked = false; $('kicked').classList.add('hidden'); connect(); };
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
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); toggleRide(); }
    if (e.code === 'KeyF') doInteract();
    if (e.code === 'Enter') { e.preventDefault(); if (G.placing) confirmPlace(); else openChat(); }
    if (e.code === 'KeyB') openBuildMenu();
    if (e.code === 'KeyM') openBigMap();
    if (e.code === 'KeyQ') openQuests();
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
    const locked = (G.cine && G.cine.lock) || (G.race && G.now < G.race.t0) || modalOpen();
    return locked ? { x: 0, y: 0, m: 0 } : { x, y, m: Math.min(1, m) };
  }

  // ---------- רכיבה ----------
  let nearVehicle = null;
  function findNearVehicle() {
    let best = null, bd = 80;
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
      const cands = [[v.a + Math.PI / 2, S.wid / 2 + 20], [v.a - Math.PI / 2, S.wid / 2 + 20], [v.a + Math.PI, S.len / 2 + 20], [v.a, S.len / 2 + 20]];
      let pos = { x: v.x, y: v.y };
      for (const [ang, d] of cands) {
        const x = v.x + Math.cos(ang) * d, y = v.y + Math.sin(ang) * d;
        if (!M.collides(x, y, 13, extraSolids(), skipTown())) { pos = { x, y }; break; }
      }
      if (G.me.role === 'driver') { v.driver = null; v.tx = v.x; v.ty = v.y; v.ta = v.a; }
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
  const vEmoji = (t) => ({ bike: '🚲', moto: '🏍️', atv: '🛻', jeep: '🚙', tractor: '🚜' }[t] || '🏍️');
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
  }
  $('actBtn').onclick = doInteract;

  function openShop(id) {
    const shop = M.SHOPS[id];
    let qty = 1;
    const draw = () => {
      const rows = shop.items.map((it) => {
        let ic = it.emoji ? `<div class="ic">${it.emoji}</div>` : `<div class="ic"><img src="${R.vehicleIcon(it.vehicle, G.myColor)}"></div>`;
        let extra = '';
        if (it.material) extra = `<small>יש לך: ${G.acct.inv[it.id] || 0}</small>`;
        if (it.boost) extra = `<small>⚡ ריצה מהירה ל-${it.boost} שניות</small>`;
        if (it.vehicle) extra = `<small>${V[it.vehicle].seats > 1 ? `${V[it.vehicle].seats} מקומות` : 'רוכב אחד'} · מהירות ${Math.round(V[it.vehicle].max / 4.3)}</small>`;
        if (it.container) extra = '<small>בוחרים איפה להציב אותה</small>';
        const owned = it.hat && G.acct.hats.includes(it.hat);
        const wearing = it.hat && G.acct.hat === it.hat;
        const price = it.material ? it.price * qty : it.price;
        const label = wearing ? 'חובש ✔' : owned ? 'לחבוש' : `${price.toLocaleString()} 🪙`;
        return `<div class="row"><div>${ic}</div><div class="tx"><b>${it.name}${it.material && qty > 1 ? ` ×${qty}` : ''}</b>${extra}</div><div class="btns"><button class="mini" data-buy="${it.id}" ${wearing || (!owned && G.acct.coins < price) ? 'disabled' : ''}>${label}</button></div></div>`;
      }).join('');
      const qtyBar = id === 'materials' ? `<div class="invline">כמות: <button class="mini ${qty === 1 ? '' : 'no'}" data-q="1">1</button> <button class="mini ${qty === 5 ? '' : 'no'}" data-q="5">5</button> <button class="mini ${qty === 10 ? '' : 'no'}" data-q="10">10</button></div>` : '';
      openModal(`<h2>${shop.title}</h2><p class="sub">${shop.sub}</p><div class="invline">🪙 ${G.acct.coins.toLocaleString()} ${$('inv').textContent ? ' · ' + $('inv').textContent : ''}</div>${qtyBar}${rows}`, draw);
      $('modalBody').querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { qty = +b.dataset.q; draw(); }; });
      $('modalBody').querySelectorAll('[data-buy]').forEach((b) => {
        b.onclick = () => {
          const it = shop.items.find((i) => i.id === b.dataset.buy);
          SFX.click();
          if (it.container) { closeModal(); startPlacing('container', it.container); return; }
          send({ t: 'shop', shop: id, item: it.id, qty });
        };
      });
    };
    draw();
  }

  function openBuildMenu() {
    if (!G.playing) return;
    const draw = () => {
      const rows = Object.keys(M.HOUSE_TYPES).map((k) => {
        const h = M.HOUSE_TYPES[k], ok = hasMat(h.need);
        return `<div class="row"><div class="ic">${k === 'villa' ? '🏰' : k === 'big' ? '🏡' : '🏠'}</div><div class="tx"><b>${h.name}</b>${needHtml(h.need, G.acct.inv)}</div><div class="btns"><button class="mini" data-h="${k}" ${ok ? '' : 'disabled'}>בנה</button></div></div>`;
      }).join('');
      openModal(`<h2>🏠 בניית בית</h2><p class="sub">קונים חומרי בניין בחנות שבמרכז הקניות של עין יהב, ואז בונים איפה שרוצים בשטח או במגרש ריק במושב.</p>${rows}<button class="big gold" id="goMat">🧭 נווט לחנות חומרי הבניין</button>`, draw);
      $('modalBody').querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => { closeModal(); startPlacing('house', b.dataset.h); }; });
      $('goMat').onclick = () => { G.navTarget = { x: 3357, y: 3778, label: 'חנות חומרי בניין' }; closeModal(); updateQuest(); };
    };
    draw();
  }
  $('buildBtn').onclick = () => { SFX.init(); SFX.click(); openBuildMenu(); };

  function openMazor() {
    const draw = () => {
      const st = G.mazor.stage, S = M.MAZOR_STAGES;
      if (st >= S.length) {
        openModal(`<div class="medal">🏡</div><h2 style="text-align:center">בית משפחת מזור גמור!</h2><p class="sub">תודה לכל מי שעזר לבנות:</p><p style="text-align:center">${G.mazor.helpers.join(' · ')}</p>`, draw);
        return;
      }
      const cur = S[st];
      const prog = Object.keys(cur.need).map((k) => {
        const have = G.mazor.progress[k] || 0;
        const nm = k === 'coins' ? '🪙 מטבעות' : `${M.MATERIALS[k].emoji} ${M.MATERIALS[k].name}`;
        return `<div><b>${nm}</b>: ${have} / ${cur.need[k]}<div class="bar"><i style="width:${Math.round(have / cur.need[k] * 100)}%"></i></div></div>`;
      }).join('');
      const stages = S.map((s, i) => `<span class="need ${i < st ? 'ok' : i === st ? 'miss' : ''}">${i < st ? '✔' : i + 1} ${s.name}</span>`).join('');
      openModal(`<h2>🏗️ בית משפחת מזור</h2><p class="sub">הבית המרכזי של עין יהב! כולם בונים אותו ביחד. כל מי שעוזר מקבל 150 🪙 כשהשלב נגמר.</p>
        <div style="text-align:center;margin-bottom:8px">${stages}</div><h3>עכשיו בונים: ${cur.name}</h3>${prog}
        <div class="invline">בתיק שלך: ${$('inv').textContent || 'אין חומרים'} · 🪙 ${G.acct.coins.toLocaleString()}</div>
        <button class="big" id="give">🧱 תרום את מה שיש לי</button><button class="big gold" id="goMat">🧭 נווט לחנות חומרי הבניין</button>
        ${G.mazor.helpers.length ? `<p class="sub">עזרו לבנות: ${G.mazor.helpers.join(' · ')}</p>` : ''}`, draw);
      $('give').onclick = () => { SFX.click(); send({ t: 'mazor' }); };
      $('goMat').onclick = () => { G.navTarget = { x: 3357, y: 3778, label: 'חנות חומרי בניין' }; closeModal(); updateQuest(); };
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
    if (m.correct) { SFX.medal(); confetti(G.me.x, G.me.y, 30 * m.correct); }
  }

  // ---------- חוגים ותחרויות ----------
  function boardHtml(id) {
    const b = G.boards[id] || [];
    if (!b.length) return '<p class="sub">עוד אין שיאים — תהיה הראשון!</p>';
    return `<table class="board">${b.slice(0, 5).map((e, i) => `<tr><td>${['🥇', '🥈', '🥉', '4', '5'][i]} ${e.name}</td><td>${fmt(e.ms)} שנ'</td></tr>`).join('')}</table>`;
  }
  function openChugim() {
    const rows = M.RACES.map((r) => `<div class="row ${G.acct.best[r.id] ? 'done' : ''}" style="opacity:1"><div class="ic">${r.emoji}</div><div class="tx"><b>${r.name}</b><small>${r.desc}</small><br><small>🥇 עד ${fmt(r.gold)} שנ' · פרס עד ${r.rewards[0]} 🪙${G.acct.best[r.id] ? ` · השיא שלך: ${fmt(G.acct.best[r.id])}` : ''}</small></div><div class="btns"><button class="mini" data-nav="${r.id}">🧭 סע</button></div></div>`).join('');
    openModal(`<h2>🏅 לוח החוגים והתחרויות</h2><p class="sub">מתחרים, מרוויחים כסף ושוברים שיאים! לוחצים "סע" והחץ הצהוב יוביל אותך לקו הזינוק.</p>${rows}`);
    $('modalBody').querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => { const r = M.RACES.find((x) => x.id === b.dataset.nav); G.navTarget = { x: r.start.x, y: r.start.y, label: r.name }; closeModal(); updateQuest(); };
    });
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
    G.race = { def, cps, idx: 0, t0: G.now + 3000, mode: cps[0].m || def.vehicle || 'foot', lastBeep: 4 };
    if (!def.vehicle && !cps[0].m) G.race.mode = 'foot';
    $('raceHud').classList.remove('hidden');
    $('actions').classList.add('hidden');
  }
  function raceTick() {
    const R = G.race;
    if (!R) return;
    const left = (R.t0 - G.now) / 1000;
    if (left > 0) {
      const n = Math.ceil(left);
      if (n < R.lastBeep) { R.lastBeep = n; SFX.beep(); }
      $('raceHud').querySelector('.rtime').textContent = String(n);
    } else {
      if (R.lastBeep > 0) { R.lastBeep = 0; SFX.go(); }
      if (!R.finished) $('raceHud').querySelector('.rtime').textContent = fmt(G.now - R.t0);
    }
    const lapLen = R.def.cps.length;
    $('raceHud').querySelector('.rinfo').innerHTML = `${R.def.emoji} ${R.def.name}<br>נקודה ${Math.min(R.idx + 1, R.cps.length)}/${R.cps.length}${R.def.laps > 1 ? ` · סיבוב ${Math.min(R.def.laps, Math.floor(R.idx / lapLen) + 1)}/${R.def.laps}` : ''}`;
    if (R.finished || left > 0) return;
    const c = R.cps[R.idx];
    const rad = G.me.vid ? 75 : 55;
    if (Math.hypot(c.x - G.me.x, c.y - G.me.y) < rad) {
      R.idx++;
      if (R.idx >= R.cps.length) {
        R.finished = true;
        SFX.go();
        send({ t: 'raceFinish', id: R.def.id });
        return;
      }
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
    const medal = ['🥇', '🥈', '🥉'][m.medal];
    openModal(`<div class="medal">${medal}</div><h2 style="text-align:center">${r.name}</h2><p class="sub" style="font-size:20px"><b>${fmt(m.ms)} שניות</b>${m.best ? ' — שיא אישי! 🎉' : ''}<br>קיבלת ${m.reward} 🪙</p><h3>🏆 טבלת השיאים</h3>${boardHtml(m.id)}<button class="big" id="again">🔁 עוד פעם</button><button class="big no" id="okb">סגור</button>`);
    $('okb').onclick = closeModal;
    $('again').onclick = () => { closeModal(); G.navTarget = { x: r.start.x, y: r.start.y, label: r.name }; updateQuest(); };
    SFX.medal(); confetti(G.me.x, G.me.y, 90);
  }

  // ---------- משימות ----------
  function currentQuest() {
    for (const q of M.QUESTS) if (!G.acct.quests[q.id]) return q;
    return null;
  }
  function questTargetOf(q) {
    if (!q) return null;
    if (q.id === 'trip') {
      let best = null, bd = 1e9;
      for (const t of M.towns) {
        if (t.id === 'ey' || G.acct.visited[t.id]) continue;
        const d = Math.hypot(t.x - G.me.x, t.y - G.me.y);
        if (d < bd) { bd = d; best = { x: t.x, y: t.y, label: t.name }; }
      }
      return best;
    }
    if (q.id === 'mazor' && !Object.keys(M.MATERIALS).some((k) => G.acct.inv[k] > 0) && G.mazor.stage < 4) return { x: 3357, y: 3778, label: 'חנות חומרי בניין' };
    return q.target;
  }
  function updateQuest() {
    const q = currentQuest();
    if (G.navTarget) {
      G.questTarget = G.navTarget;
      $('questCard').querySelector('.qt').textContent = '🧭 ' + G.navTarget.label;
      $('questCard').querySelector('.qd').textContent = 'עקוב אחרי החץ הצהוב';
      return;
    }
    G.questTarget = questTargetOf(q);
    if (!q) {
      $('questCard').querySelector('.qt').textContent = '🏆 סיימת את כל המשימות!';
      $('questCard').querySelector('.qd').textContent = 'עכשיו — תחרויות, בתים וטיולים עם חברים';
      return;
    }
    let d = q.desc;
    if (q.id === 'trip') d += ` (${Object.keys(G.acct.visited).length}/3)`;
    if (q.id === 'mazor' && G.questTarget && G.questTarget.label) d = 'קודם קונים חומרים בחנות חומרי הבניין';
    $('questCard').querySelector('.qt').textContent = '🎯 ' + q.title;
    $('questCard').querySelector('.qd').textContent = d;
  }
  function openQuests() {
    const cur = currentQuest();
    const rows = M.QUESTS.map((q) => `<div class="row ${G.acct.quests[q.id] ? 'done' : ''} ${q === cur ? 'cur' : ''}"><div class="ic">${G.acct.quests[q.id] ? '✅' : q === cur ? '🎯' : '⬜'}</div><div class="tx"><b>${q.title}</b><small>${q.desc} · ${q.reward} 🪙</small></div></div>`).join('');
    const done = M.QUESTS.filter((q) => G.acct.quests[q.id]).length;
    openModal(`<h2>🎯 המשימות שלי</h2><div class="bar"><i style="width:${done / M.QUESTS.length * 100}%"></i></div><p class="sub">${done} מתוך ${M.QUESTS.length}</p>${rows}`);
  }
  $('questCard').onclick = () => { SFX.init(); SFX.click(); if (G.navTarget) { G.navTarget = null; updateQuest(); } else openQuests(); };

  // ---------- בנייה ----------
  function startPlacing(kind, sub) {
    if (!G.playing) return;
    const S = kind === 'house' ? M.HOUSE_TYPES[sub] : M.CONTAINER_SIZE;
    G.placing = { kind, sub, w: S.w, h: S.h, x: 0, y: 0, ok: false };
    $('placeText').textContent = kind === 'house' ? `🏠 ${S.name}: זוז כדי לבחור מקום` : '📦 זוז כדי לבחור מקום למכולה';
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
    if (P.kind === 'house') send({ t: 'build', type: P.sub, x: P.x, y: P.y });
    else send({ t: 'buyContainer', kind: P.sub, x: P.x, y: P.y });
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

  // ---------- מפה גדולה ----------
  function openBigMap() {
    const big = R.buildMinimap(720, 800, G.founded);
    if (!big) return;
    const c = big.getContext('2d');
    const sx = 720 / M.W, sy = 800 / M.H;
    R.setCtx(c);
    for (const t of M.towns) if (t.id !== 'ey' || G.founded) R.text(t.name + (G.acct.visited[t.id] ? ' ✔' : ''), t.x * sx, t.y * sy - 18, 20, '#7a1f0e');
    if (!G.founded) R.text('🚩 ?', M.EY.x * sx, M.EY.y * sy, 22, '#c0392b');
    R.text('הרי אדום', 6800 * sx, 3800 * sy, 18, '#5a2a14');
    R.text('כביש 90', M.HWX * sx + 4, 300 * sy, 14, '#333');
    if (G.questTarget) { R.text('⭐', G.questTarget.x * sx, G.questTarget.y * sy, 26); }
    for (const o of G.others.values()) { c.fillStyle = o.color; c.beginPath(); c.arc(o.x * sx, o.y * sy, 6, 0, 7); c.fill(); }
    c.fillStyle = G.myColor; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.arc(G.me.x * sx, G.me.y * sy, 9, 0, 7); c.fill(); c.stroke();
    R.text('אתה', G.me.x * sx, G.me.y * sy + 20, 15, '#c0392b');
    openModal(`<h2>🗺️ מפת הערבה</h2><img class="bigmap" src="${big.toDataURL()}">`);
  }
  $('minimap').onclick = () => { SFX.init(); openBigMap(); };

  // ---------- סינמטיקה ----------
  function cinematic(o) {
    G.cine = Object.assign({ t0: G.now, dur: 3000 }, o);
  }
  function startFounding() {
    G.founded = true; G.foundT = G.now;
    minimapBase = null;
    send({ t: 'found' });
    cinematic({ kind: 'found', lock: true, dur: 9000, zoom: true, titles: [
      [0, 'מצאת את המקום! 🚩', 'כאן בדיוק, בלב הערבה'],
      [2600, 'מקימים את מושב עין יהב', 'בתים, חממות, דקלים ובריכה...'],
      [5800, 'ברוכים הבאים לעין יהב 🌶️', 'עכשיו — לבנות את בית משפחת מזור!'],
    ] });
    SFX.fanfare();
    for (const s of M.solids) {
      if (s.town !== 'ey') continue;
      const d = Math.hypot(s.x + s.w / 2 - M.EY.x, s.y + s.h / 2 - M.EY.y);
      if (Math.random() < 0.6) G.effects.push({ kind: 'puff', x: s.x + s.w / 2, y: s.y + s.h / 2, t: -(1.8 + d * 0.0032), dur: 1, delay: true });
    }
    setTimeout(() => SFX.build(), 1900);
    setTimeout(() => SFX.build(), 3200);
    setTimeout(() => { SFX.medal(); confetti(M.EY.x, M.EY.y, 120); }, 5800);
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
  function onJump(x, y) {
    for (const j of M.jumps) if (Math.hypot(j.x - x, j.y - y) < 24) return true;
    for (const d of M.dunes) {
      const dx = x - d.x, dy = y - d.y;
      const c = Math.cos(-d.rot), s = Math.sin(-d.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      const k = (lx * lx) / (d.rx * d.rx) + (ly * ly) / (d.ry * d.ry);
      if (k > 0.75 && k < 0.95) return true;
    }
    return false;
  }

  // אבק ועקבות לכל רכב שזז
  function vehicleFx(v, speed, dt) {
    const S = V[v.type];
    v.odo = (v.odo || 0) + speed * dt * 0.25;
    if (v.air > 0) {
      v.air = Math.max(0, v.air - dt * 1.8);
      if (v.air === 0) {
        for (let k = 0; k < 10; k++) G.particles.push({ x: v.x + (Math.random() - 0.5) * 30, y: v.y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, r: 9, life: 0, max: 0.9, c: '#dcc29a' });
        if (v.id === G.me.vid) { SFX.land(); G.shake = 0.25; }
      }
    } else if (speed > 200 && onJump(v.x, v.y) && !v.airCd) {
      v.air = 0.01; v.airUp = true; v.airCd = 0.8;
    }
    if (v.airUp) { v.air = Math.min(1, v.air + dt * 4); if (v.air >= 1) v.airUp = false; }
    if (v.airCd) v.airCd = Math.max(0, v.airCd - dt);
    const off = !M.onRoad(v.x, v.y, skipTown());
    v.wob = off && speed > 60 ? Math.sin(G.now / 40 + v.x) * 0.03 : 0;
    if (speed > 80 && v.air === 0 && G.particles.length < 450 && Math.random() < (off ? 0.9 : 0.25) * dt * 40) {
      const bx = v.x - Math.cos(v.a) * S.len / 2, by = v.y - Math.sin(v.a) * S.len / 2;
      G.particles.push({ x: bx + (Math.random() - 0.5) * S.wid, y: by + (Math.random() - 0.5) * S.wid, vx: -Math.cos(v.a) * 40 + (Math.random() - 0.5) * 40, vy: -Math.sin(v.a) * 40 + (Math.random() - 0.5) * 40, r: off ? 7 + Math.random() * 6 : 4, life: 0, max: off ? 1.1 : 0.5, c: off ? '#d9bd8e' : '#bbb', a: off ? 0.5 : 0.25 });
    }
    if (off && speed > 30 && v.air === 0 && v.type !== 'bike') {
      const lt = v.lastTrack;
      if (!lt || Math.hypot(lt.x - v.x, lt.y - v.y) > 16) {
        if (lt && Math.hypot(lt.x - v.x, lt.y - v.y) < 60) {
          const w = v.type === 'moto' ? [0] : [-S.wid / 2 + 4, S.wid / 2 - 4];
          for (const o of w) {
            const nx = -Math.sin(v.a) * o, ny = Math.cos(v.a) * o;
            const lnx = -Math.sin(lt.a) * o, lny = Math.cos(lt.a) * o;
            G.tracks.push({ x1: lt.x + lnx, y1: lt.y + lny, x2: v.x + nx, y2: v.y + ny, w: v.type === 'moto' ? 3 : 4, t: G.now });
          }
          if (G.tracks.length > 900) G.tracks.splice(0, G.tracks.length - 900);
        }
        v.lastTrack = { x: v.x, y: v.y, a: v.a };
      }
    }
  }

  // צבאים
  function initGazelles() {
    for (const h of M.GAZELLE_HERDS) for (let k = 0; k < 5; k++) {
      G.gazelles.push({ hx: h.x, hy: h.y, x: h.x + (Math.random() - 0.5) * 200, y: h.y + (Math.random() - 0.5) * 200, a: Math.random() * 6, sp: 0, t: Math.random() * 10, tx: h.x, ty: h.y, wait: Math.random() * 3 });
    }
  }
  initGazelles();
  function updateGazelles(dt) {
    for (const g of G.gazelles) {
      g.t += dt;
      let fx = 0, fy = 0, flee = false;
      const threats = [G.me, ...G.others.values()];
      for (const p of threats) {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < 230) { fx += (g.x - p.x) / d; fy += (g.y - p.y) / d; flee = true; }
      }
      let want = 0, ta = g.a;
      if (flee) { ta = Math.atan2(fy, fx); want = 300; g.wait = 2; }
      else {
        g.wait -= dt;
        if (g.wait <= 0) { g.tx = g.hx + (Math.random() - 0.5) * 500; g.ty = g.hy + (Math.random() - 0.5) * 500; g.wait = 4 + Math.random() * 6; }
        const d = Math.hypot(g.tx - g.x, g.ty - g.y);
        if (d > 20) { ta = Math.atan2(g.ty - g.y, g.tx - g.x); want = 45; }
      }
      g.a += angDiff(ta, g.a) * Math.min(1, dt * 5);
      g.sp = approach(g.sp, want, 400 * dt);
      const nx = g.x + Math.cos(g.a) * g.sp * dt, ny = g.y + Math.sin(g.a) * g.sp * dt;
      if (!M.collides(nx, ny, 10, null, null) && !M.townAt(nx, ny)) { g.x = nx; g.y = ny; } else g.a += 1;
      if (Math.hypot(g.x - g.hx, g.y - g.hy) > 900) { g.tx = g.hx; g.ty = g.hy; }
    }
  }

  const pendingPick = new Set();
  let sendT = 0;
  function update(dt) {
    const me = G.me;
    const inp = getInput();
    const k = 1 - Math.exp(-dt * 12);

    // רכבים ושחקנים אחרים — החלקה ואפקטים
    for (const v of G.vehicles.values()) {
      if (G.me.vid === v.id && G.me.role === 'driver') continue;
      if (Math.hypot(v.tx - v.x, v.ty - v.y) > 500) { v.x = v.tx; v.y = v.ty; }
      const ox = v.x, oy = v.y;
      v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; v.a += angDiff(v.ta, v.a) * k;
      const sp = Math.hypot(v.x - ox, v.y - oy) / Math.max(dt, 0.001);
      if (sp > 5 || v.air) vehicleFx(v, sp, dt);
    }
    for (const o of G.others.values()) {
      if (Math.hypot(o.tx - o.x, o.ty - o.y) > 500) { o.x = o.tx; o.y = o.ty; }
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.a += angDiff(o.ta, o.a) * k;
      if (o.mv) o.walkT += dt * 10;
    }
    updateGazelles(dt);

    // חלקיקים
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life += dt;
      if (p.life >= p.max) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'confetti') { p.vy += 350 * dt; p.vx *= 0.98; p.rot += p.vr * dt; }
      else { p.vx *= 0.95; p.vy *= 0.95; }
    }
    for (let i = G.effects.length - 1; i >= 0; i--) { G.effects[i].t += dt; if (G.effects[i].t > G.effects[i].dur) G.effects.splice(i, 1); }
    if (G.cine && G.now - G.cine.t0 > G.cine.dur) G.cine = null;
    if (G.shake) G.shake = Math.max(0, G.shake - dt);

    if (!G.playing) { SFX.engine(null); return; }

    const v = me.vid && G.vehicles.get(me.vid);
    if (v && me.role === 'driver') {
      const S = V[v.type];
      if (inp.m > 0.15) {
        const d = angDiff(Math.atan2(inp.y, inp.x), v.a);
        const turn = S.turn * dt * (0.55 + 0.45 * Math.min(1, Math.abs(me.speed) / 150)) * (v.air > 0.3 ? 0.3 : 1);
        v.a += Math.max(-turn, Math.min(turn, d));
        const want = Math.abs(d) > 2.2 ? 0 : S.max * inp.m * (Math.abs(d) > 1.1 ? 0.45 : 1);
        me.speed = approach(me.speed, want, S.acc * dt);
      } else me.speed = approach(me.speed, 0, S.acc * 0.9 * dt);
      const terrain = M.onRoad(v.x, v.y, skipTown()) ? 1 : S.offroad;
      const step = me.speed * terrain * dt;
      if (!tryMove(v, v.x + Math.cos(v.a) * step, v.y + Math.sin(v.a) * step, S.r)) me.speed *= 0.6;
      vehicleFx(v, Math.abs(me.speed * terrain), dt);
      me.x = v.x; me.y = v.y; me.a = v.a; me.mv = Math.abs(me.speed) > 5; me.sw = false;
      SFX.engine(v.type, me.speed);
    } else if (v) {
      me.x = v.x; me.y = v.y; me.a = v.a; me.mv = false; me.sw = false;
      SFX.engine(null);
    } else {
      if (me.vid && !v) { me.vid = null; me.role = null; }
      SFX.engine(null);
      me.sw = G.founded && M.inPool(me.x, me.y);
      if (inp.m > 0.1) {
        me.a = Math.atan2(inp.y, inp.x);
        const base = me.sw ? 95 : 175 * (G.now < G.boostUntil ? 1.6 : 1);
        const sp = base * inp.m * dt;
        tryMove(me, me.x + Math.cos(me.a) * sp, me.y + Math.sin(me.a) * sp, 13);
        me.mv = true; me.walkT += dt * (me.sw ? 6 : 10);
      } else me.mv = false;
    }

    // הקמת עין יהב
    if (!G.founded && Math.hypot(me.x - M.EY.x, me.y - M.EY.y) < 230) startFounding();

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

    // קטיף פלפלים
    for (const p of G.peppers.values()) {
      if (p.town === 'ey' && !G.founded) continue;
      if (!pendingPick.has(p.id) && Math.hypot(p.x - me.x, p.y - me.y) < 38) { pendingPick.add(p.id); send({ t: 'pick', id: p.id }); }
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
    if (G.navTarget && Math.hypot(G.navTarget.x - me.x, G.navTarget.y - me.y) < 90) { G.navTarget = null; updateQuest(); }
    if (currentQuest() && currentQuest().id === 'trip') G.questTarget = questTargetOf(currentQuest());

    const nv = me.vid ? null : findNearVehicle();
    if (nv !== nearVehicle) { nearVehicle = nv; updateRideBtn(); }
    let ht = '';
    if (G.race) ht = '';
    else if (me.vid && v) ht = me.role === 'driver' ? `נוהג ב${V[v.type].name} 💨` : `נוסע ב${V[v.type].name} עם חבר 😎`;
    else if (nearVehicle) {
      const mine = !nearVehicle.ownerAid || nearVehicle.ownerAid === G.acct.aid;
      ht = `${vEmoji(nearVehicle.type)} ${V[nearVehicle.type].name}${nearVehicle.owner ? ' של ' + (nearVehicle.ownerAid === G.acct.aid ? 'שלך' : nearVehicle.owner) : ''} — ${mine || nearVehicle.driver ? 'לחץ "עלה" (E)' : 'רק הבעלים נוהג'}`;
    } else if (me.sw) ht = '🏊 שוחים בבריכה!';
    const hint = $('hint');
    if (hint.textContent !== ht) { hint.textContent = ht; hint.classList.toggle('hidden', !ht); }

    if (G.placing) {
      const P = G.placing;
      const dist = 40 + Math.max(P.w, P.h) / 2 + 20;
      P.x = Math.round(me.x + Math.cos(me.a) * dist - P.w / 2); P.y = Math.round(me.y + Math.sin(me.a) * dist - P.h / 2);
      P.ok = M.canPlace({ x: P.x, y: P.y, w: P.w, h: P.h + (P.kind === 'house' ? 0 : 75) }, extraSolids());
    }

    raceTick();

    sendT += dt;
    if (sendT > 0.066) {
      sendT = 0;
      send(stateMsg());
    }
  }

  // ---------- ציור ----------
  let dpr = 1, baseScale = 1, viewW = 0, viewH = 0;
  const cam = { x: 0, y: 0, w: 0, h: 0 };
  let zoom = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
    baseScale = Math.max(0.72, Math.min(1.15, Math.min(innerWidth, innerHeight) / 560));
  }
  addEventListener('resize', resize);
  resize();

  let minimapBase = null;
  const mm = $('minimap'), mctx = mm.getContext('2d');
  function drawMinimap() {
    if (!G.playing) return;
    if (!minimapBase) minimapBase = R.buildMinimap(mm.width, mm.height, G.founded);
    if (!minimapBase) return;
    const sx = mm.width / M.W, sy = mm.height / M.H;
    mctx.drawImage(minimapBase, 0, 0);
    for (const h of G.houses) { mctx.fillStyle = h.color; mctx.fillRect(h.x * sx - 1, h.y * sy - 1, 3, 3); }
    mctx.strokeStyle = 'rgba(0,0,0,.45)'; mctx.lineWidth = 1;
    mctx.strokeRect(cam.x * sx, cam.y * sy, cam.w * sx, cam.h * sy);
    if (G.questTarget) {
      const p = 3 + Math.abs(Math.sin(G.now / 300)) * 3;
      mctx.fillStyle = '#ffd23f'; mctx.strokeStyle = '#7a4a10'; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(G.questTarget.x * sx, G.questTarget.y * sy, p, 0, 7); mctx.fill(); mctx.stroke();
    }
    for (const o of G.others.values()) { mctx.fillStyle = o.color; mctx.beginPath(); mctx.arc(o.x * sx, o.y * sy, 3, 0, 7); mctx.fill(); }
    mctx.fillStyle = G.myColor; mctx.strokeStyle = '#000'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(G.me.x * sx, G.me.y * sy, 4.5, 0, 7); mctx.fill(); mctx.stroke();
  }

  function drawScreen() {
    const W = innerWidth, H = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ויניטה חמה
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(80,40,10,.28)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // חץ למשימה
    const t = G.race ? G.race.cps[G.race.idx] : G.questTarget;
    if (G.playing && t && !(G.cine && G.cine.lock)) {
      const sx = (t.x - cam.x) * zoom * baseScale, sy = (t.y - cam.y) * zoom * baseScale;
      const m = 60;
      if (sx < m || sx > W - m || sy < m + 60 || sy > H - m - 60) {
        const cx = W / 2, cy = H / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const rx = W / 2 - 50, ry = H / 2 - 90;
        const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
        const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        const pulse = 1 + Math.sin(G.now / 200) * 0.1;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = G.race ? '#ffd23f' : '#ffd23f'; ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-12, -18); ctx.lineTo(-4, 0); ctx.lineTo(-12, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        const dist = Math.round(Math.hypot(t.x - G.me.x, t.y - G.me.y) / 2);
        R.setCtx(ctx);
        R.text(`${dist >= 1000 ? (dist / 1000).toFixed(1) + ' ק"מ' : dist + ' מ\''}`, ax - Math.cos(a) * 34, ay - Math.sin(a) * 30, 14, '#3b2412');
      }
    }

    // ג'ויסטיק
    if (joy.id !== null) {
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.strokeStyle = 'rgba(59,36,18,.4)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(joy.sx, joy.sy, JOY_R, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,234,.92)';
      ctx.beginPath(); ctx.arc(joy.sx + joy.dx, joy.sy + joy.dy, 26, 0, 7); ctx.fill(); ctx.stroke();
    } else if (G.playing && 'ontouchstart' in window && !G.me.mv && !G.cine) {
      R.setCtx(ctx); R.text('👆 גרור באצבע על המסך כדי לזוז', W / 2, H * 0.64, 16);
    }

    // ספירה לאחור
    if (G.race && G.now < G.race.t0 + 700) {
      const left = (G.race.t0 - G.now) / 1000;
      const n = left > 0 ? String(Math.ceil(left)) : 'צא!';
      const f = left > 0 ? 1 - (left % 1) : (G.now - G.race.t0) / 700;
      R.setCtx(ctx);
      ctx.globalAlpha = left > 0 ? 1 : 1 - f;
      R.text(n, W / 2, H / 2 - 40, 90 + f * 40, left > 0 ? '#c0392b' : '#27ae60', '#fff');
      ctx.globalAlpha = 1;
    }

    // פסים של סרט וכותרות
    const C = G.cine;
    if (C) {
      const e = G.now - C.t0;
      const inK = Math.min(1, e / 500), outK = Math.min(1, (C.dur - e) / 500);
      const k = Math.max(0, Math.min(inK, outK));
      const bh = (C.town ? 0.09 : 0.13) * H * k;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
      let title = C.title, sub = C.sub, tt = e;
      if (C.titles) { for (const [at, a, b] of C.titles) if (e >= at) { title = a; sub = b; tt = e - at; } }
      const tk = Math.min(1, tt / 600) * k;
      ctx.globalAlpha = tk;
      R.setCtx(ctx);
      const big = Math.min(54, W / 13);
      R.text(title, W / 2, H * (C.town ? 0.3 : 0.26) + (1 - Math.min(1, tt / 600)) * 20, big, '#fff8ea', 'rgba(60,30,10,.85)', 800);
      if (sub) R.text(sub, W / 2, H * (C.town ? 0.3 : 0.26) + big * 0.95, Math.min(24, W / 26), '#ffd23f', 'rgba(60,30,10,.85)', 700);
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    // זום של הסינמטיקה
    let target = 1, focus = { x: G.me.x, y: G.me.y };
    if (G.cine && G.cine.zoom) {
      const e = G.now - G.cine.t0;
      const k = Math.min(1, e / 1500) * Math.min(1, (G.cine.dur - e) / 1500);
      target = 1 - 0.55 * k;
      focus = { x: G.me.x + (M.EY.x - G.me.x) * k, y: G.me.y + (M.EY.y - G.me.y) * k };
    } else if (G.me.vid) {
      const v = G.vehicles.get(G.me.vid);
      if (v) target = 1 - Math.min(0.18, Math.abs(G.me.speed) / 2400);
    }
    zoom += (target - zoom) * 0.06;
    const sc = baseScale * zoom;
    cam.w = innerWidth / sc; cam.h = innerHeight / sc;
    cam.x = focus.x - cam.w / 2; cam.y = focus.y - cam.h / 2;
    cam.x = cam.w >= M.W ? (M.W - cam.w) / 2 : Math.max(0, Math.min(M.W - cam.w, cam.x));
    cam.y = cam.h >= M.H ? (M.H - cam.h) / 2 : Math.max(0, Math.min(M.H - cam.h, cam.y));
    let shx = 0, shy = 0;
    if (G.shake) { shx = (Math.random() - 0.5) * 8 * G.shake * 4; shy = (Math.random() - 0.5) * 8 * G.shake * 4; }
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, (-cam.x * sc + shx) * dpr, (-cam.y * sc + shy) * dpr);
    R.drawWorld(ctx, G, cam);
    drawScreen();
    drawMinimap();
  }

  // ---------- לולאה ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.now = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
