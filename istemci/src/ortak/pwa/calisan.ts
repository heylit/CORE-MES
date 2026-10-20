// Service worker kuralları. Yalnız derlenmiş statik dosyaları (adında özet taşıyan /assets/ dosyaları ve simgeler) önbellekte tutar.
// Veri her an güncel olmalı: /api ve Arkon (/arkon-mes/) istekleri ile sayfa gezintileri hiç ele alınmaz, tarayıcı doğrudan ağa gider.
// Her derleme yeni sürüm adıyla gelir; yeni çalışan etkinleşince eski sürümün önbelleği silinir.

// Tarayıcının çalışan kapsamından kullanılan kısım; test sahtesini verir.
export interface CalisanIstegi { method: string; url: string }
export interface CalisanCevabi { ok: boolean; type: string; clone(): CalisanCevabi }
export interface Onbellek {
  match(istek: CalisanIstegi): Promise<CalisanCevabi | undefined>;
  put(istek: CalisanIstegi, cevap: CalisanCevabi): Promise<void>;
}
export interface CalisanPenceresi { url: string; focus(): Promise<unknown>; navigate(adres: string): Promise<unknown> }
export interface BildirimTiklamasi { notification: { data: unknown; close(): void }; waitUntil(s: Promise<unknown>): void }
export interface CalisanOrtami {
  konum: string;
  dinle(ad: 'install', fn: () => void): void;
  dinle(ad: 'activate', fn: (olay: { waitUntil(s: Promise<unknown>): void }) => void): void;
  dinle(ad: 'fetch', fn: (olay: { request: CalisanIstegi; respondWith(c: Promise<CalisanCevabi>): void }) => void): void;
  dinle(ad: 'notificationclick', fn: (olay: BildirimTiklamasi) => void): void;
  beklemedenGec(): void;
  sahiplen(): Promise<void>;
  onbellekler: {
    keys(): Promise<string[]>;
    delete(ad: string): Promise<boolean>;
    open(ad: string): Promise<Onbellek>;
  };
  getir(istek: CalisanIstegi): Promise<CalisanCevabi>;
  pencereler: {
    tumu(): Promise<CalisanPenceresi[]>;
    ac(adres: string): Promise<unknown>;
  };
}

export const ONBELLEK_ONEKI = 'tmi-statik-';

// İzin listesidir: /api ve /arkon-mes/ (Arkon'un kendi /assets/ klasörü dahil) bu öneklerle başlamaz, hiç ele alınmaz.
export function statikMi(yol: string): boolean {
  return yol.startsWith('/assets/') || yol.startsWith('/simgeler/') || yol === '/apple-touch-icon.png';
}

export const YOLSUZ_BILDIRIM_YOLU = '/profil/bildirimler';

// Cihaz bildirimi (342 a) yalnız uygulama içi yolu açar: başka kaynağa ya da "//" ile başlayan adrese gidilmez.
export function bildirimYolu(data: unknown): string {
  const yol = typeof data === 'object' && data !== null ? (data as { yol?: unknown }).yol : undefined;
  return typeof yol === 'string' && yol.startsWith('/') && !yol.startsWith('//') ? yol : YOLSUZ_BILDIRIM_YOLU;
}

export function calisaniKur(o: CalisanOrtami, surum: string): void {
  const ad = `${ONBELLEK_ONEKI}${surum}`;
  const koken = new URL(o.konum).origin;

  o.dinle('install', () => { o.beklemedenGec(); });

  o.dinle('activate', (olay) => {
    olay.waitUntil((async () => {
      const eskiler = (await o.onbellekler.keys()).filter((a) => a.startsWith(ONBELLEK_ONEKI) && a !== ad);
      for (const eski of eskiler) await o.onbellekler.delete(eski);
      await o.sahiplen();
    })());
  });

  // Açık uygulama penceresi varsa öne gelip bildirimin sayfasına gider; yoksa sayfa yeni pencerede açılır.
  o.dinle('notificationclick', (olay) => {
    olay.notification.close();
    const adres = new URL(bildirimYolu(olay.notification.data), koken).href;
    olay.waitUntil((async () => {
      const pencere = (await o.pencereler.tumu()).find((p) => new URL(p.url).origin === koken);
      if (pencere === undefined) {
        await o.pencereler.ac(adres);
        return;
      }
      await pencere.focus();
      await pencere.navigate(adres);
    })());
  });

  o.dinle('fetch', (olay) => {
    const istek = olay.request;
    if (istek.method !== 'GET') return;
    const adres = new URL(istek.url);
    if (adres.origin !== koken || !statikMi(adres.pathname)) return;
    olay.respondWith((async () => {
      const onbellek = await o.onbellekler.open(ad);
      const kayitli = await onbellek.match(istek);
      if (kayitli) return kayitli;
      const cevap = await o.getir(istek);
      if (cevap.ok && cevap.type === 'basic') await onbellek.put(istek, cevap.clone());
      return cevap;
    })());
  });
}
