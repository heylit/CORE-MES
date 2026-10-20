import type { Bildirim } from '#paylasilan/sozlesme/bildirim.ts';
import { modulAdi } from './gorunum.ts';

// 342 a: uygulama açıkken (arka sekmede de) yeni okunmamış bildirim cihaz bildirimi olarak düşer. Sunucudan itme ve dış servis yok:
// zilin yoklaması yeni bildirimi görünce mevcut service worker kaydıyla gösterilir. Uygulama kapalıyken gelmez.
export type CihazIzni = 'default' | 'granted' | 'denied';

export interface CihazBildirimi {
  body: string;
  // Aynı kimlik aynı etiketle düşer: birden çok sekme açıkken bildirim çoğalmaz, birbirinin yerine geçer.
  tag: string;
  data: { yol: string };
}

export interface CihazOrtami {
  // null: tarayıcı desteklemiyor, bağlam güvenli değil (düz http) ya da service worker yok; bildirim yalnız zilde kalır.
  izin(): CihazIzni | null;
  izinIste(): Promise<CihazIzni>;
  goster(baslik: string, secenek: CihazBildirimi): Promise<void>;
}

export const CIHAZ_LISTE_BOYU = 20;
export const YOLSUZ_BILDIRIM_YOLU = '/profil/bildirimler';

export function cihazBildirimi(b: Bildirim): { baslik: string; secenek: CihazBildirimi } {
  return {
    baslik: b.baslik,
    secenek: { body: b.metin ?? modulAdi(b.kaynakModul), tag: `tmi-bildirim-${String(b.id)}`, data: { yol: b.yol ?? YOLSUZ_BILDIRIM_YOLU } },
  };
}

// Son görülen kimlikten büyük olanlar, eskiden yeniye.
export function yeniBildirimler(satirlar: readonly Bildirim[], sonKimlik: number): Bildirim[] {
  return satirlar.filter((b) => b.id > sonKimlik).sort((a, b) => a.id - b.id);
}

// iPhone yalnız ana ekrana eklenmiş uygulamada izin verir; Notification orada da service worker kaydı ister.
export function tarayiciCihazOrtami(): CihazOrtami {
  const destek = typeof Notification !== 'undefined' && typeof navigator.serviceWorker !== 'undefined' && window.isSecureContext;
  return {
    izin: () => (destek ? Notification.permission : null),
    izinIste: () => Notification.requestPermission(),
    goster: async (baslik, secenek) => {
      const kayit = await navigator.serviceWorker.getRegistration();
      if (kayit) await kayit.showNotification(baslik, secenek);
    },
  };
}
