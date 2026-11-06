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
export interface PushOlayi { waitUntil(s: Promise<unknown>): void }
export interface GosterilenBildirim { body: string; tag: string; data: { yol: string } }
export interface CalisanOrtami {
  konum: string;
  dinle(ad: 'install', fn: () => void): void;
  dinle(ad: 'activate', fn: (olay: { waitUntil(s: Promise<unknown>): void }) => void): void;
  dinle(ad: 'fetch', fn: (olay: { request: CalisanIstegi; respondWith(c: Promise<CalisanCevabi>): void }) => void): void;
  dinle(ad: 'notificationclick', fn: (olay: BildirimTiklamasi) => void): void;
  dinle(ad: 'push', fn: (olay: PushOlayi) => void): void;
  beklemedenGec(): void;
  sahiplen(): Promise<void>;
  onbellekler: {
    keys(): Promise<string[]>;
    delete(ad: string): Promise<boolean>;
    open(ad: string): Promise<Onbellek>;
  };
  getir(istek: CalisanIstegi): Promise<CalisanCevabi>;
  // Aynı kökene oturum çereziyle JSON okuma; ağ ya da oturum hatasında atar.
  veriGetir(adres: string): Promise<unknown>;
  bildirimGoster(baslik: string, secenek: GosterilenBildirim): Promise<void>;
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

// Web Push (ADR 0031): sinyal içeriksizdir. Çalışan ayrıntıyı iç sunucudan oturum çereziyle çeker; ulaşamazsa (telefon şirket ağı dışında,
// oturum kapalı) yalnız genel metin gösterir. Tarayıcı her sinyalde bir bildirim ister, bu yüzden boş liste de genel metne düşer.
export const PUSH_GENEL_BASLIK = 'CORE: yeni bildirim';
export const PUSH_EN_COK = 3;
export const PUSH_LISTE_YOLU = `/api/bildirimler?durum=okunmamis&sayfaBoyu=${String(PUSH_EN_COK)}`;

export interface PushSatiri { id: number; baslik: string; metin: string | null; yol: string | null }

// Çalışan paylaşılan sözleşmeyi ithal edemez; cevap burada savunmacı okunur, beklenmeyen satır atlanır.
export function pushSatirlari(veri: unknown): PushSatiri[] {
  const satirlar = typeof veri === 'object' && veri !== null ? (veri as { satirlar?: unknown }).satirlar : undefined;
  if (!Array.isArray(satirlar)) return [];
  return satirlar.flatMap((s: unknown) => {
    if (typeof s !== 'object' || s === null) return [];
    const { id, baslik, metin, yol } = s as Record<string, unknown>;
    if (typeof id !== 'number' || typeof baslik !== 'string') return [];
    return [{ id, baslik, metin: typeof metin === 'string' ? metin : null, yol: typeof yol === 'string' ? yol : null }];
  }).slice(0, PUSH_EN_COK);
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

  // Etiket uygulama açıkken düşen cihaz bildirimiyle (cihaz.ts) aynıdır: aynı bildirim iki kez görünmez.
  o.dinle('push', (olay) => {
    olay.waitUntil((async () => {
      let satirlar: PushSatiri[] = [];
      try {
        satirlar = pushSatirlari(await o.veriGetir(new URL(PUSH_LISTE_YOLU, koken).href));
      } catch {
        satirlar = [];
      }
      if (satirlar.length === 0) {
        await o.bildirimGoster(PUSH_GENEL_BASLIK, { body: '', tag: 'core-push-genel', data: { yol: YOLSUZ_BILDIRIM_YOLU } });
        return;
      }
      for (const b of satirlar) {
        await o.bildirimGoster(b.baslik, { body: b.metin ?? '', tag: `tmi-bildirim-${String(b.id)}`, data: { yol: bildirimYolu({ yol: b.yol }) } });
      }
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
