/* =====================================================================
   Saha Operasyon — Service Worker

   AMAÇ: uygulamanın telefona kurulabilmesi ve kapak dosyalarının
   (Leaflet, yazı tipleri, Excel kitaplığı) ikinci açılışta anında
   gelmesi.

   ÖNEMLİ KURAL: uygulamanın kendisi (index.html) ASLA önbellekten
   önce sunulmaz. Önce ağdan denenir; yeni sürüm yüklediğinizde
   kullanıcı eski sürümde kalmaz. Ağ yoksa son çalışan kopya açılır.

   Supabase istekleri (veri) hiçbir zaman önbelleğe alınmaz.
   ===================================================================== */

const SURUM   = 'saha-v2';
const KABUK   = 'kabuk-' + SURUM;   /* uygulama dosyası */
const VARLIK  = 'varlik-' + SURUM;  /* dışarıdan gelen kitaplıklar */

const DIS_KAYNAK = [
  'https://cdnjs.cloudflare.com/',
  'https://cdn.jsdelivr.net/',
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(KABUK).then((c) => c.addAll(['./', './index.html', './manifest.json']))
      .catch(() => {})   /* ilk kurulumda ağ yoksa sessizce geç */
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(
        adlar.filter((a) => a !== KABUK && a !== VARLIK).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'guncelle') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET') return;

  const url = new URL(istek.url);

  /* Veri istekleri: asla önbellek. Supabase, Mobiliz, harita karoları. */
  if (url.hostname.endsWith('.supabase.co') ||
      url.hostname.endsWith('.tile.openstreetmap.org') ||
      url.hostname.endsWith('nominatim.openstreetmap.org') ||
      url.hostname.endsWith('photon.komoot.io')) return;

  /* Uygulama sayfası: önce ağ, olmazsa son kopya */
  if (istek.mode === 'navigate' ||
      (url.origin === self.location.origin && url.pathname.endsWith('.html'))) {
    e.respondWith(
      fetch(istek)
        .then((c) => {
          const kopya = c.clone();
          caches.open(KABUK).then((k) => k.put('./index.html', kopya));
          return c;
        })
        .catch(() => caches.match('./index.html').then((c) => c || caches.match('./')))
    );
    return;
  }

  /* Kendi dosyalarımız (simge, manifest): önce önbellek */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(istek).then((c) => c || fetch(istek).then((y) => {
        const kopya = y.clone();
        caches.open(KABUK).then((k) => k.put(istek, kopya));
        return y;
      }))
    );
    return;
  }

  /* Dış kitaplıklar: önce önbellek, yoksa ağdan alıp sakla */
  if (DIS_KAYNAK.some((k) => istek.url.startsWith(k))) {
    e.respondWith(
      caches.match(istek).then((c) => c || fetch(istek).then((y) => {
        if (y.ok || y.type === 'opaque') {
          const kopya = y.clone();
          caches.open(VARLIK).then((k) => k.put(istek, kopya));
        }
        return y;
      }).catch(() => c))
    );
  }
});
