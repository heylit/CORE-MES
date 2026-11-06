import { calisaniKur } from './calisan.ts';
import type { CalisanOrtami, CalisanPenceresi, GosterilenBildirim } from './calisan.ts';

// Derlemede /sw.js olarak tek dosya çıkar (vite-eklentisi.ts); çalışan ithal edemez, bu yüzden istemciyle paylaşılan modül (surum.ts) ithal edilmez.
// Sürüm, derleme anında vite.config.ts'nin yazdığı değerdir; her derleme yeni önbellek adı getirir.
declare const __TMI_DERLEME__: { tarih: string; commit: string | null };

// İstemci lib'i DOM'dur; çalışan kapsamı burada daraltılmış tiple okunur.
interface Kapsam {
  location: { href: string };
  addEventListener(ad: string, fn: (olay: never) => void): void;
  skipWaiting(): Promise<void>;
  registration: { showNotification(baslik: string, secenek: GosterilenBildirim): Promise<void> };
  clients: {
    claim(): Promise<void>;
    matchAll(ayar: { type: 'window'; includeUncontrolled: boolean }): Promise<CalisanPenceresi[]>;
    openWindow(adres: string): Promise<unknown>;
  };
}
const kapsam = self as unknown as Kapsam;

const ortam: CalisanOrtami = {
  konum: kapsam.location.href,
  dinle: (ad: string, fn: (olay: never) => void) => { kapsam.addEventListener(ad, fn); },
  beklemedenGec: () => { void kapsam.skipWaiting(); },
  sahiplen: () => kapsam.clients.claim(),
  onbellekler: caches as unknown as CalisanOrtami['onbellekler'],
  getir: (istek) => fetch(istek as unknown as Request) as unknown as ReturnType<CalisanOrtami['getir']>,
  veriGetir: async (adres) => {
    const cevap = await fetch(adres, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!cevap.ok) throw new Error(`HTTP ${String(cevap.status)}`);
    return cevap.json() as Promise<unknown>;
  },
  bildirimGoster: (baslik, secenek) => kapsam.registration.showNotification(baslik, secenek),
  pencereler: {
    tumu: () => kapsam.clients.matchAll({ type: 'window', includeUncontrolled: true }),
    ac: (adres) => kapsam.clients.openWindow(adres),
  },
};

calisaniKur(ortam, `${__TMI_DERLEME__.commit ?? 'yerel'}-${__TMI_DERLEME__.tarih}`);
