// שירות רקע — מאפשר להתקין את המשחק כאפליקציה, ושומר בזיכרון את הקבצים הכבדים
const CACHE = 'ein-yahav-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname === '/info' || url.pathname === '/qr.svg') return;
  // ספריית התלת־ממד לא משתנה — מהזיכרון קודם
  if (url.pathname.startsWith('/vendor/')) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // כל השאר — תמיד הגרסה החדשה מהשרת, ומהזיכרון רק אם אין אינטרנט
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
