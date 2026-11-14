// עין יהב אונליין — צד הלקוח
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), ctx = cv.getContext('2d');
  const V = MAP.VEHICLES;

  // ---------- זיכרון מקומי ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  let token = store.get('ey_token');
  if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('ey_token', token); }

  // ---------- מסך כניסה ----------
  const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff6fb5', '#34495e', '#ffffff'];
  let myColor = store.get('ey_color') || COLORS[Math.floor(Math.random() * COLORS.length)];
  const colorsEl = $('colors');
  COLORS.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'color' + (c === myColor ? ' sel' : '');
    d.style.background = c;
    d.onclick = () => { myColor = c; [...colorsEl.children].forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); };
    colorsEl.appendChild(d);
  });
  $('nameInput').value = store.get('ey_name') || '';
  fetch('info').then((r) => r.json()).then((i) => { document.querySelectorAll('.joinurl').forEach((e) => (e.textContent = i.joinUrl)); }).catch(() => {});

  // ---------- מצב המשחק ----------
  let ws = null, myId = null, playing = false, kicked = false, coins = 0;
  const me = { x: MAP.spawn.x, y: MAP.spawn.y, a: 0, vid: null, role: null, speed: 0, mv: false, walkT: 0 };
  let myName = '';
  const others = new Map();
  const vehicles = new Map();
  let houses = [], containers = [];
  const peppers = new Map();
  const pendingPick = new Set();
  const effects = [];
  const bubbles = new Map(); // id -> {text, until}
  let placing = null;
  let nearVehicle = null;

  function toast(text, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 4000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  function setCoins(c) { coins = c; $('coins').textContent = '🪙 ' + c; }
  const extraSolids = () => houses.concat(containers);

  // ---------- רשת ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/`);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: myName, color: myColor, token }));
    ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    ws.onclose = () => {
      if (kicked || !playing) return;
      toast('החיבור נותק... מתחבר מחדש', true);
      setTimeout(connect, 2000);
    };
  }
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function addVehicleLocal(v) { vehicles.set(v.id, { ...v, tx: v.x, ty: v.y, ta: v.a }); }

  function onMsg(m) {
    switch (m.t) {
      case 'welcome':
        myId = m.id; me.x = m.x; me.y = m.y; me.vid = null; me.role = null; me.speed = 0;
        setCoins(m.coins);
        houses = m.houses; containers = m.containers;
        vehicles.clear(); m.vehicles.forEach(addVehicleLocal);
        peppers.clear(); m.peppers.forEach((p) => peppers.set(p.id, p));
        others.clear(); pendingPick.clear();
        startPlaying();
        break;
      case 'snap': {
        const seen = new Set();
        for (const p of m.players) {
          if (p.id === myId) continue;
          seen.add(p.id);
          let o = others.get(p.id);
          if (!o) { o = { ...p, tx: p.x, ty: p.y, ta: p.a, walkT: 0 }; others.set(p.id, o); }
          o.name = p.name; o.color = p.color; o.vid = p.vid; o.mv = p.mv;
          o.tx = p.x; o.ty = p.y; o.ta = p.a;
        }
        for (const id of others.keys()) if (!seen.has(id)) others.delete(id);
        $('online').textContent = '👥 ' + m.players.length;
        for (const [id, x, y, a, driver, pass] of m.vehicles) {
          const v = vehicles.get(id);
          if (!v) continue;
          v.driver = driver; v.pass = pass;
          if (!(me.vid === id && me.role === 'driver')) { v.tx = x; v.ty = y; v.ta = a; }
        }
        break;
      }
      case 'coins': setCoins(m.coins); break;
      case 'entered': me.vid = m.vid; me.role = m.role; me.speed = 0; updateRideBtn(); break;
      case 'role': if (me.vid === m.vid) { me.role = m.role; me.speed = 0; toast('עכשיו אתה הנהג! 🏍️'); } break;
      case 'house': houses.push(m.h); break;
      case 'container': containers.push(m.c); m.vehicles.forEach(addVehicleLocal); break;
      case 'pepper+': peppers.set(m.p.id, m.p); break;
      case 'pepper-': {
        const p = peppers.get(m.id);
        if (p && m.by === myId) effects.push({ x: p.x, y: p.y, t: 0, text: '+5 🪙', dur: 1 });
        peppers.delete(m.id); pendingPick.delete(m.id);
        break;
      }
      case 'chat':
        bubbles.set(m.id, { text: m.text, until: performance.now() + 5000 });
        toast(`${m.name}: ${m.text}`);
        break;
      case 'msg': toast(m.text); break;
      case 'err': toast(m.text, true); break;
      case 'punch':
        effects.push({ x: m.x, y: m.y, t: 0, text: '👊💥', dur: 1.2, big: true });
        break;
      case 'kicked': showKicked(m.until); break;
    }
  }

  function startPlaying() {
    playing = true;
    ['lobby', 'kicked'].forEach((id) => $(id).classList.add('hidden'));
    ['hud', 'minimap', 'actions'].forEach((id) => $(id).classList.remove('hidden'));
    updateRideBtn();
  }

  let kickTimer = null;
  function showKicked(until) {
    kicked = true; playing = false;
    placing = null; $('placeBar').classList.add('hidden');
    ['hud', 'minimap', 'actions', 'chatForm', 'hitConfirm', 'shop', 'qrModal', 'lobby'].forEach((id) => $(id).classList.add('hidden'));
    $('kicked').classList.remove('hidden');
    clearInterval(kickTimer);
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left > 0) {
        $('kickTimer').textContent = `אפשר לחזור בעוד ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        $('backBtn').disabled = true;
      } else {
        $('kickTimer').textContent = 'אפשר לחזור! והפעם — בלי מכות 😉';
        $('backBtn').disabled = false;
        clearInterval(kickTimer);
      }
    };
    tick();
    kickTimer = setInterval(tick, 500);
  }

  $('playBtn').onclick = () => {
    myName = $('nameInput').value.trim().slice(0, 14) || 'שחקן';
    store.set('ey_name', myName); store.set('ey_color', myColor);
    $('playBtn').disabled = true; $('playBtn').textContent = 'מתחבר...';
    connect();
  };
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('playBtn').click(); });
  $('backBtn').onclick = () => { kicked = false; $('kicked').classList.add('hidden'); connect(); };

  // ---------- קלט ----------
  const keys = new Set();
  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  addEventListener('keydown', (e) => {
    if (typing()) { if (e.key === 'Escape') closeChat(); return; }
    keys.add(e.code);
    if (!playing) return;
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); toggleRide(); }
    if (e.code === 'Enter') { e.preventDefault(); if (placing) confirmPlace(); else openChat(); }
    if (e.code === 'KeyB') startPlacing('house');
    if (e.code === 'Escape') cancelPlace();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const joy = { id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
  const JOY_R = 60;
  cv.addEventListener('pointerdown', (e) => {
    if (joy.id !== null || !playing) return;
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
    if (!typing()) {
      if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
    }
    if (joy.id !== null) { x += joy.dx / JOY_R; y += joy.dy / JOY_R; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, m: Math.min(1, m) };
  }

  // ---------- רכיבה ----------
  function findNearVehicle() {
    let best = null, bd = 75;
    for (const v of vehicles.values()) {
      const d = Math.hypot(v.x - me.x, v.y - me.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function toggleRide() {
    if (!playing) return;
    if (me.vid) {
      const v = vehicles.get(me.vid);
      if (v) {
        const S = V[v.type];
        const off = S.wid / 2 + 22;
        const cands = [v.a + Math.PI / 2, v.a - Math.PI / 2, v.a + Math.PI, v.a];
        let pos = { x: v.x, y: v.y };
        for (const ang of cands) {
          const x = v.x + Math.cos(ang) * (ang === v.a || ang === v.a + Math.PI ? S.len / 2 + 22 : off);
          const y = v.y + Math.sin(ang) * (ang === v.a || ang === v.a + Math.PI ? S.len / 2 + 22 : off);
          if (!MAP.collides(x, y, 14, extraSolids())) { pos = { x, y }; break; }
        }
        if (me.role === 'driver') { v.driver = null; v.tx = v.x; v.ty = v.y; v.ta = v.a; }
        me.x = pos.x; me.y = pos.y;
      }
      me.vid = null; me.role = null; me.speed = 0;
      send({ t: 'exit', x: me.x, y: me.y });
    } else if (nearVehicle) {
      send({ t: 'enter', vid: nearVehicle.id });
    } else {
      toast('אין כלי רכב קרוב. חפש אופנועים בחנייה במרכז המושב! 🏍️');
    }
    updateRideBtn();
  }
  function updateRideBtn() {
    const b = $('rideBtn');
    if (me.vid) { b.innerHTML = '🚶<span>רד</span>'; b.classList.add('on'); }
    else { b.innerHTML = (nearVehicle ? vehicleEmoji(nearVehicle.type) : '🏍️') + '<span>עלה</span>'; b.classList.toggle('on', !!nearVehicle); }
  }
  const vehicleEmoji = (t) => ({ moto: '🏍️', atv: '🛻', jeep: '🚙', tractor: '🚜' }[t] || '🏍️');
  $('rideBtn').onclick = toggleRide;

  // ---------- בנייה וקנייה ----------
  function startPlacing(kind) {
    if (!playing) return;
    const price = MAP.PRICES[kind];
    if (coins < price) { toast(`צריך ${price} מטבעות. יש לך ${coins}. לך לקטוף פלפלים בחממות! 🌶️`, true); return; }
    const S = kind === 'house' ? MAP.HOUSE_SIZE : MAP.CONTAINER_SIZE;
    placing = { kind, w: S.w, h: S.h, x: 0, y: 0, ok: false };
    $('placeText').textContent = kind === 'house' ? '🏠 זוז כדי לבחור מקום לבית' : '📦 זוז כדי לבחור מקום למכולה';
    $('placeBar').classList.remove('hidden');
    $('actions').classList.add('hidden');
  }
  function cancelPlace() {
    placing = null;
    $('placeBar').classList.add('hidden');
    if (playing) $('actions').classList.remove('hidden');
  }
  function confirmPlace() {
    if (!placing) return;
    if (!placing.ok) { toast('אי אפשר לבנות כאן — לא על כביש ולא צמוד לבית אחר', true); return; }
    if (placing.kind === 'house') send({ t: 'build', x: placing.x, y: placing.y });
    else send({ t: 'buy', kind: placing.kind, x: placing.x, y: placing.y });
    cancelPlace();
  }
  $('buildBtn').onclick = () => startPlacing('house');
  $('placeOk').onclick = confirmPlace;
  $('placeCancel').onclick = cancelPlace;
  $('shopBtn').onclick = () => $('shop').classList.remove('hidden');
  document.querySelectorAll('.shopItem').forEach((b) => {
    b.onclick = () => { $('shop').classList.add('hidden'); startPlacing(b.dataset.kind); };
  });
  document.querySelectorAll('.closeBtn').forEach((b) => { b.onclick = () => b.closest('.overlay').classList.add('hidden'); });
  $('qrBtn').onclick = () => $('qrModal').classList.remove('hidden');

  // ---------- צ'אט ----------
  function openChat() { $('chatForm').classList.remove('hidden'); $('chatInput').focus(); keys.clear(); }
  function closeChat() { $('chatForm').classList.add('hidden'); $('chatInput').blur(); $('chatInput').value = ''; }
  $('chatBtn').onclick = () => ($('chatForm').classList.contains('hidden') ? openChat() : closeChat());
  $('chatForm').onsubmit = (e) => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (text) send({ t: 'chat', text });
    closeChat();
  };

  // ---------- הרבצה ----------
  $('hitBtn').onclick = () => $('hitConfirm').classList.remove('hidden');
  $('hitNo').onclick = () => { $('hitConfirm').classList.add('hidden'); toast('כל הכבוד! 😇 חברים לא מרביצים'); };
  $('hitYes').onclick = () => { $('hitConfirm').classList.add('hidden'); send({ t: 'hit' }); };

  // ---------- פיזיקה ----------
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const approach = (v, t, s) => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));

  function tryMove(o, nx, ny, r) {
    const ex = extraSolids();
    if (MAP.collides(o.x, o.y, r, ex)) { o.x = Math.max(r, Math.min(MAP.W - r, nx)); o.y = Math.max(r, Math.min(MAP.H - r, ny)); return true; }
    if (!MAP.collides(nx, ny, r, ex)) { o.x = nx; o.y = ny; return true; }
    if (!MAP.collides(nx, o.y, r, ex)) { o.x = nx; return false; }
    if (!MAP.collides(o.x, ny, r, ex)) { o.y = ny; return false; }
    return false;
  }

  let sendT = 0;
  function update(dt) {
    const inp = getInput();
    const k = 1 - Math.exp(-dt * 12);

    // רכבים ושחקנים אחרים — החלקה
    for (const v of vehicles.values()) {
      if (me.vid === v.id && me.role === 'driver') continue;
      if (Math.hypot(v.tx - v.x, v.ty - v.y) > 400) { v.x = v.tx; v.y = v.ty; }
      v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; v.a += angDiff(v.ta, v.a) * k;
    }
    for (const o of others.values()) {
      if (Math.hypot(o.tx - o.x, o.ty - o.y) > 400) { o.x = o.tx; o.y = o.ty; }
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.a += angDiff(o.ta, o.a) * k;
      if (o.mv) o.walkT += dt * 10;
    }

    if (!playing) return;

    const v = me.vid && vehicles.get(me.vid);
    if (v && me.role === 'driver') {
      const S = V[v.type];
      if (inp.m > 0.15) {
        const d = angDiff(Math.atan2(inp.y, inp.x), v.a);
        const turn = S.turn * dt * (0.55 + 0.45 * Math.min(1, Math.abs(me.speed) / 150));
        v.a += Math.max(-turn, Math.min(turn, d));
        const want = Math.abs(d) > 2.2 ? 0 : S.max * inp.m * (Math.abs(d) > 1.1 ? 0.45 : 1);
        me.speed = approach(me.speed, want, S.acc * dt);
      } else {
        me.speed = approach(me.speed, 0, S.acc * 0.9 * dt);
      }
      const terrain = MAP.onRoad(v.x, v.y) ? 1 : S.offroad * 0.8;
      const step = me.speed * terrain * dt;
      if (!tryMove(v, v.x + Math.cos(v.a) * step, v.y + Math.sin(v.a) * step, S.r)) me.speed *= 0.6;
      me.x = v.x; me.y = v.y; me.a = v.a; me.mv = Math.abs(me.speed) > 5;
    } else if (v) {
      me.x = v.x; me.y = v.y; me.a = v.a; me.mv = false;
    } else {
      if (me.vid && !v) { me.vid = null; me.role = null; }
      if (inp.m > 0.1) {
        me.a = Math.atan2(inp.y, inp.x);
        const sp = 175 * inp.m * dt;
        tryMove(me, me.x + Math.cos(me.a) * sp, me.y + Math.sin(me.a) * sp, 13);
        me.mv = true; me.walkT += dt * 10;
      } else me.mv = false;
    }

    // קטיף פלפלים
    for (const p of peppers.values()) {
      if (!pendingPick.has(p.id) && Math.hypot(p.x - me.x, p.y - me.y) < 36) {
        pendingPick.add(p.id); send({ t: 'pick', id: p.id });
      }
    }

    // רכב קרוב
    const nv = me.vid ? null : findNearVehicle();
    if (nv !== nearVehicle) { nearVehicle = nv; updateRideBtn(); }
    const hint = $('hint');
    let ht = '';
    if (me.vid && v) ht = me.role === 'driver' ? `נוהג ב${V[v.type].name} 💨` : `נוסע ב${V[v.type].name} עם חבר 😎`;
    else if (nearVehicle) {
      const free = !nearVehicle.driver;
      ht = `${vehicleEmoji(nearVehicle.type)} ${V[nearVehicle.type].name}${nearVehicle.owner ? ' של ' + nearVehicle.owner : ''} — לחץ "עלה"${free ? '' : ' כדי לנסוע איתו'}`;
    }
    if (hint.textContent !== ht) hint.textContent = ht;

    // מיקום לבנייה
    if (placing) {
      const dist = 40 + Math.max(placing.w, placing.h) / 2 + 20;
      const cx = me.x + Math.cos(me.a) * dist, cy = me.y + Math.sin(me.a) * dist;
      placing.x = Math.round(cx - placing.w / 2); placing.y = Math.round(cy - placing.h / 2);
      const area = { x: placing.x, y: placing.y, w: placing.w, h: placing.h + (placing.kind === 'house' ? 0 : 75) };
      placing.ok = MAP.canPlace(area, extraSolids());
    }

    sendT += dt;
    if (sendT > 0.066) {
      sendT = 0;
      send({ t: 'state', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, a: Math.round(me.a * 100) / 100, mv: me.mv });
    }

    for (let i = effects.length - 1; i >= 0; i--) { effects[i].t += dt; if (effects[i].t > effects[i].dur) effects.splice(i, 1); }
  }

  // ---------- ציור ----------
  let dpr = 1, scale = 1, viewW = 0, viewH = 0, camX = 0, camY = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr);
    scale = Math.max(0.55, Math.min(1.15, Math.min(innerWidth, innerHeight) / 620));
    viewW = innerWidth / scale; viewH = innerHeight / scale;
  }
  addEventListener('resize', resize);
  resize();

  const vis = (x, y, w, h, m = 60) => x + w > camX - m && x < camX + viewW + m && y + h > camY - m && y < camY + viewH + m;
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function text(t, x, y, size, color, stroke) {
    ctx.font = `bold ${size}px Rubik, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = stroke || 'rgba(255,255,255,.9)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color || '#3b2412'; ctx.fillText(t, x, y);
  }

  function drawGround() {
    ctx.fillStyle = '#e8cf9a';
    ctx.fillRect(camX - 10, camY - 10, viewW + 20, viewH + 20);
    const C = 120;
    const x0 = Math.floor(camX / C), y0 = Math.floor(camY / C), x1 = Math.ceil((camX + viewW) / C), y1 = Math.ceil((camY + viewH) / C);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      for (let s = 0; s < 4; s++) {
        const r = hash(i * 7 + s, j * 13 + s);
        const px = i * C + hash(i + s, j) * C, py = j * C + hash(i, j + s * 3) * C;
        ctx.fillStyle = r < 0.5 ? 'rgba(170,125,70,.25)' : 'rgba(255,245,215,.45)';
        ctx.fillRect(px, py, 3 + r * 4, 2 + r * 3);
        if (r > 0.93) { // שיח מדבר
          ctx.fillStyle = '#9aa85a'; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#b5c070'; ctx.beginPath(); ctx.arc(px - 2, py - 2, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function drawDecor(d) {
    if (!vis(d.x, d.y, d.w, d.h)) return;
    switch (d.kind) {
      case 'mountains': {
        ctx.fillStyle = '#c98a5f'; ctx.fillRect(d.x, d.y, d.w, d.h);
        for (let y = Math.floor(camY / 140) * 140 - 140; y < camY + viewH + 140; y += 140) {
          const h = hash(3, y);
          ctx.fillStyle = h < 0.5 ? '#b06a45' : '#a65e3b';
          ctx.beginPath(); ctx.moveTo(d.x - 10, y + 160); ctx.lineTo(d.x + 120 + h * 120, y + 30); ctx.lineTo(d.x + d.w, y + 120 + h * 40); ctx.lineTo(d.x + d.w, y + 200); ctx.fill();
          ctx.fillStyle = 'rgba(255,220,190,.35)';
          ctx.beginPath(); ctx.moveTo(d.x + 120 + h * 120, y + 30); ctx.lineTo(d.x + 90 + h * 120, y + 80); ctx.lineTo(d.x + 150 + h * 120, y + 70); ctx.fill();
        }
        break;
      }
      case 'plaza':
        ctx.fillStyle = '#d6c2a0'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = 'rgba(150,120,90,.3)'; ctx.lineWidth = 1;
        for (let x = d.x; x < d.x + d.w; x += 20) { ctx.beginPath(); ctx.moveTo(x, d.y); ctx.lineTo(x, d.y + d.h); ctx.stroke(); }
        for (let y = d.y; y < d.y + d.h; y += 20) { ctx.beginPath(); ctx.moveTo(d.x, y); ctx.lineTo(d.x + d.w, y); ctx.stroke(); }
        break;
      case 'yard': ctx.fillStyle = '#d9c7a5'; ctx.fillRect(d.x, d.y, d.w, d.h); break;
      case 'grass': ctx.fillStyle = '#8fbf5a'; ctx.fillRect(d.x, d.y, d.w, d.h); break;
      case 'garden':
        ctx.fillStyle = '#9cc96b'; rrect(d.x, d.y, d.w, d.h, 8); ctx.fill();
        ctx.strokeStyle = '#7da653'; ctx.lineWidth = 3; ctx.stroke();
        break;
      case 'pool':
        ctx.fillStyle = '#fff'; rrect(d.x - 8, d.y - 8, d.w + 16, d.h + 16, 10); ctx.fill();
        ctx.fillStyle = '#3db8ee'; rrect(d.x, d.y, d.w, d.h, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
        for (let y = d.y + 22; y < d.y + d.h; y += 22) { ctx.beginPath(); ctx.moveTo(d.x + 6, y); ctx.lineTo(d.x + d.w - 6, y); ctx.stroke(); }
        text(d.label, d.x + d.w / 2, d.y + d.h / 2, 18, '#fff', '#1f7fae');
        break;
      case 'playground':
        ctx.fillStyle = '#f3d9a4'; rrect(d.x, d.y, d.w, d.h, 10); ctx.fill();
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(d.x + 12, d.y + 15, 14, 50);
        ctx.fillStyle = '#3498db'; ctx.fillRect(d.x + 45, d.y + 20, 50, 8); ctx.fillRect(d.x + 45, d.y + 50, 50, 8);
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(d.x + 70, d.y + 92, 14, 0, Math.PI * 2); ctx.fill();
        text(d.label, d.x + d.w / 2, d.y + d.h - 10, 12);
        break;
      case 'dune':
        ctx.fillStyle = '#dcb575'; ctx.beginPath(); ctx.ellipse(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, d.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,.5)'; ctx.beginPath(); ctx.ellipse(d.x + d.w / 2 - d.w * 0.12, d.y + d.h / 2 - d.h * 0.15, d.w / 3, d.h / 4, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'jump':
        ctx.fillStyle = '#9b6b3c'; rrect(d.x, d.y, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = '#c4935e'; ctx.fillRect(d.x + 4, d.y + 4, d.w - 8, 5);
        break;
    }
  }

  function drawRoads() {
    for (const t of MAP.trails) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#c49a5c'; ctx.lineWidth = t.w;
      ctx.beginPath(); t.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.strokeStyle = 'rgba(225,190,135,.7)'; ctx.lineWidth = t.w * 0.35; ctx.stroke();
    }
    for (const r of MAP.roads) {
      if (!vis(r.x, r.y, r.w, r.h)) continue;
      if (r.kind === 'dirt') { ctx.fillStyle = '#c9a46a'; ctx.fillRect(r.x, r.y, r.w, r.h); continue; }
      ctx.fillStyle = r.kind === 'highway' ? '#4a4a4a' : '#6b6b6b';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // סימוני כביש
    ctx.fillStyle = '#f4d03f';
    const hw = MAP.roads[0];
    for (let y = Math.floor(camY / 60) * 60; y < camY + viewH + 60; y += 60) { ctx.fillRect(hw.x + hw.w / 2 - 3, y, 6, 32); }
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const r of MAP.roads) {
      if (r.kind !== 'road' || !vis(r.x, r.y, r.w, r.h)) continue;
      if (r.w > r.h) for (let x = r.x + 10; x < r.x + r.w - 20; x += 50) ctx.fillRect(x, r.y + r.h / 2 - 2, 24, 4);
      else for (let y = r.y + 10; y < r.y + r.h - 20; y += 50) ctx.fillRect(r.x + r.w / 2 - 2, y, 4, 24);
    }
    // כיכר
    const s = MAP.spawn;
    if (vis(s.x - 50, s.y - 50, 100, 100)) {
      ctx.fillStyle = '#6b6b6b'; ctx.beginPath(); ctx.arc(s.x, s.y, 58, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8fbf5a'; ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawGreenhouse(g) {
    if (!vis(g.x, g.y, g.w, g.h)) return;
    ctx.fillStyle = '#c7b07d'; ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = '#4e8f3a';
    for (let y = g.y + 14; y < g.y + g.h - 6; y += 20) ctx.fillRect(g.x + 8, y, g.w - 16, 8);
  }
  function drawGreenhouseRoof(g) {
    if (!vis(g.x, g.y, g.w, g.h)) return;
    ctx.fillStyle = 'rgba(240,248,255,.42)'; ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
    ctx.strokeRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    for (let x = g.x + 18; x < g.x + g.w; x += 18) { ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke(); }
  }

  function drawPepper(p) {
    if (!vis(p.x, p.y, 1, 1)) return;
    const bob = Math.sin(performance.now() / 300 + p.x) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e3241b'; ctx.beginPath(); ctx.ellipse(p.x, p.y + bob, 7, 10, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(p.x - 2, p.y - 3 + bob, 2, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(p.x - 1, p.y - 13 + bob, 4, 6);
  }

  function drawHouseShape(x, y, w, h, roof) {
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 6, y + 6, w, h);
    ctx.fillStyle = '#f3e5c8'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = roof; ctx.fillRect(x + 3, y + 3, w - 6, h / 2 - 3);
    ctx.fillStyle = shade(roof, -25); ctx.fillRect(x + 3, y + h / 2, w - 6, h / 2 - 3);
    ctx.strokeStyle = shade(roof, -45); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, y + h / 2); ctx.lineTo(x + w - 3, y + h / 2); ctx.stroke();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }

  function drawSolid(s) {
    if (!vis(s.x, s.y, s.w, s.h)) return;
    if (s.kind === 'house') return drawHouseShape(s.x, s.y, s.w, s.h, s.color);
    if (s.kind === 'tower') {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(cx + 10, cy + 10, s.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(cx, cy, s.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e1e6ea'; ctx.beginPath(); ctx.arc(cx - 6, cy - 6, s.w / 4, 0, Math.PI * 2); ctx.fill();
      text(s.label, cx, s.y - 14, 15);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(s.x + 7, s.y + 7, s.w, s.h);
    ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = shade(s.color, -40); ctx.lineWidth = 3; ctx.strokeRect(s.x + 1.5, s.y + 1.5, s.w - 3, s.h - 3);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(s.x + 6, s.y + 6, s.w - 12, 8);
    if (s.label) text(s.label, s.x + s.w / 2, s.y + s.h / 2, 16, '#fff', 'rgba(0,0,0,.55)');
  }

  function drawPlayerHouse(h) {
    if (!vis(h.x, h.y, h.w, h.h)) return;
    drawHouseShape(h.x, h.y, h.w, h.h, h.color === '#ffffff' ? '#dddddd' : h.color);
    ctx.fillStyle = '#7b4a26'; ctx.fillRect(h.x + h.w / 2 - 8, h.y + h.h - 4, 16, 6); // דלת
    text('הבית של ' + h.owner, h.x + h.w / 2, h.y + h.h + 14, 13);
  }
  function drawContainer(c) {
    if (!vis(c.x, c.y, c.w, c.h + 80)) return;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(c.x + 6, c.y + 6, c.w, c.h);
    ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = shade(c.color, -50); ctx.lineWidth = 2;
    for (let x = c.x + 8; x < c.x + c.w; x += 9) { ctx.beginPath(); ctx.moveTo(x, c.y + 3); ctx.lineTo(x, c.y + c.h - 3); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = 'rgba(120,90,60,.25)'; ctx.fillRect(c.x, c.y + c.h, c.w, 75);
    text('📦 המכולה של ' + c.owner, c.x + c.w / 2, c.y - 12, 13);
  }

  function drawPalm(p) {
    if (!vis(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2)) return;
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(p.x + 8, p.y + 8, p.r * 0.9, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + p.x;
      ctx.fillStyle = i % 2 ? '#3d8b37' : '#4fa443';
      ctx.beginPath();
      ctx.ellipse(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.5, p.r * 0.55, p.r * 0.18, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7a5a2a'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
  }

  const DEFAULT_COLOR = { moto: '#e67e22', atv: '#c0392b', jeep: '#2e7d32', tractor: '#27ae60' };

  function drawVehicle(v) {
    if (!vis(v.x - 40, v.y - 40, 80, 80)) return;
    const S = V[v.type], col = v.color || DEFAULT_COLOR[v.type];
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.a);
    const L = S.len, Wd = S.wid;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; rrect(-L / 2 + 4, -Wd / 2 + 4, L, Wd, 6); ctx.fill();
    ctx.fillStyle = '#222';
    if (v.type === 'moto') {
      rrect(-L / 2, -4, 13, 8, 3); ctx.fill(); rrect(L / 2 - 13, -4, 13, 8, 3); ctx.fill();
      ctx.fillStyle = col; rrect(-L / 2 + 8, -6, L - 16, 12, 5); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(-4, -5, 14, 10);
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L / 2 - 14, -10); ctx.lineTo(L / 2 - 14, 10); ctx.stroke();
      ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(L / 2 - 4, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (v.type === 'atv') {
      for (const [x, y] of [[-L / 2, -Wd / 2], [L / 2 - 12, -Wd / 2], [-L / 2, Wd / 2 - 9], [L / 2 - 12, Wd / 2 - 9]]) { rrect(x, y, 12, 9, 3); ctx.fill(); }
      ctx.fillStyle = col; rrect(-L / 2 + 6, -Wd / 2 + 6, L - 12, Wd - 12, 6); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(-6, -5, 14, 10);
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L / 2 - 12, -10); ctx.lineTo(L / 2 - 12, 10); ctx.stroke();
    } else if (v.type === 'jeep') {
      for (const [x, y] of [[-L / 2 + 6, -Wd / 2 - 3], [L / 2 - 22, -Wd / 2 - 3], [-L / 2 + 6, Wd / 2 - 6], [L / 2 - 22, Wd / 2 - 6]]) { rrect(x, y, 16, 9, 3); ctx.fill(); }
      ctx.fillStyle = col; rrect(-L / 2, -Wd / 2, L, Wd, 7); ctx.fill();
      ctx.fillStyle = shade(col, -30); ctx.fillRect(-L / 2 + 4, -Wd / 2 + 4, 12, Wd - 8);
      ctx.fillStyle = '#9fd6ef'; rrect(L / 2 - 26, -Wd / 2 + 4, 9, Wd - 8, 2); ctx.fill();
      ctx.fillStyle = '#ffe680'; ctx.fillRect(L / 2 - 3, -Wd / 2 + 4, 3, 6); ctx.fillRect(L / 2 - 3, Wd / 2 - 10, 3, 6);
    } else if (v.type === 'tractor') {
      rrect(-L / 2, -Wd / 2 - 4, 22, 12, 3); ctx.fill(); rrect(-L / 2, Wd / 2 - 8, 22, 12, 3); ctx.fill();
      rrect(L / 2 - 14, -Wd / 2 + 2, 12, 7, 2); ctx.fill(); rrect(L / 2 - 14, Wd / 2 - 9, 12, 7, 2); ctx.fill();
      ctx.fillStyle = col; rrect(-L / 2 + 4, -Wd / 2 + 8, L - 6, Wd - 16, 4); ctx.fill();
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(-L / 2 + 6, -8, 18, 16);
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(L / 2 - 16, -4, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // רוכבים
    const riders = [v.driver, ...(v.pass || [])].filter(Boolean);
    riders.forEach((id, i) => {
      const p = id === myId ? { color: myColor, name: myName } : others.get(id);
      if (!p) return;
      let ox, oy;
      if (v.type === 'jeep') { ox = (i < 2 ? 6 : -14); oy = (i % 2 ? -1 : 1) * 9; }
      else { ox = -i * 12 - 2; oy = 0; }
      const cx = v.x + Math.cos(v.a) * ox - Math.sin(v.a) * oy;
      const cy = v.y + Math.sin(v.a) * ox + Math.cos(v.a) * oy;
      drawHead(cx, cy, p.color, 7.5);
    });
    if (v.driver) {
      const d = v.driver === myId ? { name: myName } : others.get(v.driver);
      if (d) {
        const names = [d.name, ...(v.pass || []).map((id) => (id === myId ? myName : (others.get(id) || {}).name)).filter(Boolean)];
        text(names.join(' + '), v.x, v.y - 34, 14);
      }
    }
  }

  function drawHead(x, y, color, r) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  function drawWalker(p, isMe) {
    if (!vis(p.x - 30, p.y - 30, 60, 60)) return;
    const swing = p.mv ? Math.sin(p.walkT) * 6 : 0;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(3, 4, 15, 13, 0, 0, Math.PI * 2); ctx.fill();
    // רגליים
    ctx.fillStyle = '#3b3b5c';
    ctx.beginPath(); ctx.ellipse(swing, -6, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-swing, 6, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    // גוף
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, 9, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
    // ידיים
    ctx.fillStyle = '#f2c29b';
    ctx.beginPath(); ctx.arc(4 - swing * 0.6, -14, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 + swing * 0.6, 14, 4, 0, Math.PI * 2); ctx.fill();
    // ראש
    ctx.fillStyle = '#f2c29b'; ctx.beginPath(); ctx.arc(1, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2c17'; ctx.beginPath(); ctx.arc(-1, 0, 7.5, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
    ctx.restore();
    text(p.name, p.x, p.y - 30, isMe ? 15 : 14, isMe ? '#c0392b' : '#3b2412');
  }

  function drawBubble(id, x, y) {
    const b = bubbles.get(id);
    if (!b) return;
    if (performance.now() > b.until) { bubbles.delete(id); return; }
    ctx.font = 'bold 15px Rubik, Arial, sans-serif';
    const w = Math.min(260, ctx.measureText(b.text).width + 20);
    const bx = x - w / 2, by = y - 78;
    ctx.fillStyle = '#fff'; rrect(bx, by, w, 30, 12); ctx.fill();
    ctx.strokeStyle = '#d9a35b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, by + 30); ctx.lineTo(x, by + 38); ctx.lineTo(x + 6, by + 30); ctx.fill();
    ctx.fillStyle = '#3b2412'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, x, by + 15, w - 12);
  }

  function render() {
    // מצלמה
    camX = me.x - viewW / 2; camY = me.y - viewH / 2;
    camX = viewW >= MAP.W ? (MAP.W - viewW) / 2 : Math.max(0, Math.min(MAP.W - viewW, camX));
    camY = viewH >= MAP.H ? (MAP.H - viewH) / 2 : Math.max(0, Math.min(MAP.H - viewH, camY));
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -camX * dpr * scale, -camY * dpr * scale);

    drawGround();
    for (const d of MAP.decor) if (d.kind !== 'pool' && d.kind !== 'playground' && d.kind !== 'jump') drawDecor(d);
    drawRoads();
    for (const d of MAP.decor) if (d.kind === 'pool' || d.kind === 'playground' || d.kind === 'jump') drawDecor(d);
    MAP.greenhouses.forEach(drawGreenhouse);
    peppers.forEach(drawPepper);
    containers.forEach(drawContainer);
    MAP.solids.forEach(drawSolid);
    houses.forEach(drawPlayerHouse);

    // רוח רפאים של בנייה
    if (placing) {
      const ok = placing.ok;
      ctx.globalAlpha = 0.6;
      if (placing.kind === 'house') drawHouseShape(placing.x, placing.y, placing.w, placing.h, myColor);
      else { ctx.fillStyle = myColor; ctx.fillRect(placing.x, placing.y, placing.w, placing.h); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? '#27ae60' : '#e74c3c'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
      ctx.strokeRect(placing.x - 4, placing.y - 4, placing.w + 8, placing.h + 8 + (placing.kind === 'house' ? 0 : 75));
      ctx.setLineDash([]);
      text(ok ? '✔ אפשר לבנות כאן' : '✖ לא כאן', placing.x + placing.w / 2, placing.y - 16, 15, ok ? '#1e8449' : '#c0392b');
    }

    vehicles.forEach(drawVehicle);
    for (const o of others.values()) if (!o.vid) drawWalker(o, false);
    if (!me.vid) drawWalker({ ...me, name: myName, color: myColor }, true);

    MAP.greenhouses.forEach(drawGreenhouseRoof);
    MAP.palms.forEach(drawPalm);
    for (const l of MAP.labels) if (vis(l.x - 200, l.y - 40, 400, 80)) text(l.text, l.x, l.y, l.size, '#5a3410');

    // בועות צ'אט
    for (const o of others.values()) drawBubble(o.id, o.x, o.y);
    if (myId) drawBubble(myId, me.x, me.y);

    // אפקטים
    for (const e of effects) {
      const p = e.t / e.dur;
      ctx.globalAlpha = 1 - p * p;
      text(e.text, e.x, e.y - 30 - p * 40, e.big ? 40 + p * 40 : 18, e.big ? '#c0392b' : '#b7950b');
      ctx.globalAlpha = 1;
    }

    // ג'ויסטיק
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (joy.id !== null) {
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.strokeStyle = 'rgba(59,36,18,.4)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(joy.sx, joy.sy, JOY_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,234,.9)';
      ctx.beginPath(); ctx.arc(joy.sx + joy.dx, joy.sy + joy.dy, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (playing && 'ontouchstart' in window && !me.mv) {
      text('👆 גרור באצבע על המסך כדי לזוז', innerWidth / 2, innerHeight * 0.62, 16);
    }
    drawMinimap();
  }

  // ---------- מפה קטנה ----------
  const mm = $('minimap'), mctx = mm.getContext('2d');
  const MS = mm.width / MAP.W;
  const mmBase = document.createElement('canvas');
  mmBase.width = mm.width; mmBase.height = mm.height;
  (() => {
    const c = mmBase.getContext('2d');
    c.fillStyle = '#e8cf9a'; c.fillRect(0, 0, mm.width, mm.height);
    c.fillStyle = '#c98a5f'; c.fillRect(3720 * MS, 0, 280 * MS, mm.height);
    c.fillStyle = '#9ec46b'; for (const p of MAP.palms) c.fillRect(p.x * MS - 1, p.y * MS - 1, 2, 2);
    c.fillStyle = '#f5f8fa'; for (const g of MAP.greenhouses) c.fillRect(g.x * MS, g.y * MS, g.w * MS, g.h * MS);
    c.strokeStyle = '#c49a5c'; c.lineWidth = 1.5;
    for (const t of MAP.trails) { c.beginPath(); t.pts.forEach((p, i) => (i ? c.lineTo(p[0] * MS, p[1] * MS) : c.moveTo(p[0] * MS, p[1] * MS))); c.stroke(); }
    for (const r of MAP.roads) { c.fillStyle = r.kind === 'dirt' ? '#c9a46a' : '#666'; c.fillRect(r.x * MS, r.y * MS, Math.max(1.5, r.w * MS), Math.max(1.5, r.h * MS)); }
    c.fillStyle = '#b5452f'; for (const s of MAP.solids) c.fillRect(s.x * MS, s.y * MS, Math.max(2, s.w * MS), Math.max(2, s.h * MS));
  })();
  function drawMinimap() {
    if (!playing) return;
    mctx.drawImage(mmBase, 0, 0);
    for (const h of houses) { mctx.fillStyle = h.color; mctx.fillRect(h.x * MS, h.y * MS, 4, 4); }
    for (const c of containers) { mctx.fillStyle = c.color; mctx.fillRect(c.x * MS, c.y * MS, 6, 3); }
    mctx.strokeStyle = 'rgba(0,0,0,.5)'; mctx.lineWidth = 1;
    mctx.strokeRect(camX * MS, camY * MS, viewW * MS, viewH * MS);
    for (const o of others.values()) {
      mctx.fillStyle = o.color; mctx.beginPath(); mctx.arc(o.x * MS, o.y * MS, 3, 0, Math.PI * 2); mctx.fill();
    }
    mctx.fillStyle = myColor; mctx.strokeStyle = '#000'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(me.x * MS, me.y * MS, 4.5, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
  }

  // ---------- לולאה ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
