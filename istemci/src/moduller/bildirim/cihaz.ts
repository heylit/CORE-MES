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

// Web Push (ADR 0031): uygulama kapalıyken de sinyal gelsin diye kişi bu cihazı açar. Sinyal içeriksizdir; ayrıntıyı service worker
// iç sunucudan çeker. iPhone'da yalnız ana ekrana eklenmiş uygulamada çalışır.
export interface PushOrtami {
  // false: tarayıcı push desteklemiyor ya da bağlam güvenli değil; düğme görünmez.
  destek: boolean;
  // Bu cihazın açık aboneliğinin adresi; yoksa null.
  mevcut(): Promise<string | null>;
  // İzin ister ve abone olur; adresi döner. İzin verilmezse atar.
  aboneOl(acikAnahtar: string): Promise<string>;
  // Aboneliği bırakır; bıraktığı adresi döner (yoksa null).
  birak(): Promise<string | null>;
}

export function anahtarBaytlari(b64u: string): Uint8Array<ArrayBuffer> {
  const ham = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  const sonuc = new Uint8Array(new ArrayBuffer(ham.length));
  for (let i = 0; i < ham.length; i += 1) sonuc[i] = ham.charCodeAt(i);
  return sonuc;
}

export function tarayiciPushOrtami(): PushOrtami {
  const destek = typeof window !== 'undefined' && window.isSecureContext && typeof navigator.serviceWorker !== 'undefined'
    && typeof PushManager !== 'undefined' && typeof Notification !== 'undefined';
  const abonelik = async () => (await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()) ?? null;
  return {
    destek,
    mevcut: async () => (destek ? (await abonelik())?.endpoint ?? null : null),
    aboneOl: async (acikAnahtar) => {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bildirim izni verilmedi.');
      const kayit = await navigator.serviceWorker.ready;
      const a = await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarBaytlari(acikAnahtar) });
      return a.endpoint;
    },
    birak: async () => {
      const a = await abonelik();
      if (a === null) return null;
      await a.unsubscribe();
      return a.endpoint;
    },
  };
}
