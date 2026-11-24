import { api, AgHatasi, ApiHatasi, IstekKesildi } from './api.ts';
import { DERLEME } from './surum.ts';

// Ekran hataları (3668-1): çizim hatası (HataSiniri) ve pencerenin yakalanmamış hata/söz reddi kendi sunucumuza gider; başka yere gitmez.
// Kişi istemciden gönderilmez, sunucu oturumdan alır. Sunucu ucu sağlık modülündedir (EKRAN_HATASI_YOLU); uç yokken ya da ulaşılamazken
// gönderim sessizce düşer, ekran etkilenmez.
export const EKRAN_HATASI_YOLU = '/saglik/ekran-hatalari';
// Aynı hata dakikada en çok bir kez gider; sunucu aynı hatayı gruplayıp sayar.
export const EKRAN_HATASI_ARALIGI_MS = 60_000;
export const EKRAN_HATASI_ILETI_AZAMI = 300;
export const EKRAN_HATASI_YIGIN_AZAMI = 2000;
export const EKRAN_HATASI_SAYFA_AZAMI = 200;
const AZAMI_ANAHTAR = 100;
const ZAMAN_ASIMI_MS = 10_000;

export interface EkranHatasiGovdesi {
  // Sorgu ve parçasız yol.
  sayfa: string;
  hata: string;
  yigin: string | null;
  surum: string | null;
}

export type EkranHatasiGondericisi = (govde: EkranHatasiGovdesi) => Promise<unknown>;

// Uç dilim C ile gelir; gelene kadar gönderim kapalıdır (olmayan uca istek 404 üretir). C'de true olur.
export const EKRAN_HATASI_UCU_HAZIR = false;

const sunucuyaGonder: EkranHatasiGondericisi = (govde) => !EKRAN_HATASI_UCU_HAZIR ? Promise.resolve() :
  api.post(EKRAN_HATASI_YOLU, govde, { arkaPlan: true, oturumBitirmez: true, zamanAsimiMs: ZAMAN_ASIMI_MS });

// Sunucu cevabı ya da ağ kesintisi ekran hatası değildir: sunucu kendi hatasını zaten günlüğe yazar, kesinti bağlantı şeridinde görünür.
const bildirilmez = (hata: unknown): boolean => hata instanceof ApiHatasi || hata instanceof AgHatasi || hata instanceof IstekKesildi;

// Tarayıcının zararsız bildirimi: ResizeObserver bir karede yetişemedi. Hata nesnesi yoktur, ekran bozulmaz; hata sayılmaz.
const ZARARSIZ = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

export function ekranHatasiGovdesi(hata: unknown, sayfa: string): EkranHatasiGovdesi {
  const e = hata instanceof Error ? hata : null;
  const iletisi = e !== null ? e.message : typeof hata === 'string' ? hata : 'Bilinmeyen hata';
  return {
    sayfa: sayfa.split(/[?#]/, 1)[0]?.slice(0, EKRAN_HATASI_SAYFA_AZAMI) ?? '',
    hata: `${e?.name ?? 'Hata'}: ${iletisi}`.slice(0, EKRAN_HATASI_ILETI_AZAMI),
    yigin: e?.stack === undefined ? null : e.stack.slice(0, EKRAN_HATASI_YIGIN_AZAMI),
    surum: DERLEME.surum.trim().slice(0, 64) || null,
  };
}

export interface EkranHatasiBildirici {
  bildir(hata: unknown, sayfa?: string): boolean;
}

export function ekranHatasiBildiriciKur(gonder: EkranHatasiGondericisi = sunucuyaGonder, simdi: () => number = Date.now,
  sayfaOku: () => string = () => window.location.pathname): EkranHatasiBildirici {
  const sonGonderim = new Map<string, number>();
  return {
    bildir(hata, sayfa) {
      if (bildirilmez(hata)) return false;
      if (typeof hata === 'string' && ZARARSIZ.test(hata)) return false;
      if (hata instanceof Error && ZARARSIZ.test(hata.message)) return false;
      const govde = ekranHatasiGovdesi(hata, sayfa ?? sayfaOku());
      const anahtar = `${govde.sayfa}|${govde.hata}|${govde.yigin?.split('\n', 2)[1] ?? ''}`;
      const an = simdi();
      const onceki = sonGonderim.get(anahtar);
      if (onceki !== undefined && an - onceki < EKRAN_HATASI_ARALIGI_MS) return false;
      sonGonderim.set(anahtar, an);
      if (sonGonderim.size > AZAMI_ANAHTAR) {
        const en = sonGonderim.keys().next();
        if (en.done !== true) sonGonderim.delete(en.value);
      }
      // Gönderim hatası ikinci bir ekran hatası doğurmaz.
      try { void gonder(govde).catch(() => undefined); } catch { /* eşzamanlı hata da düşer */ }
      return true;
    },
  };
}

const varsayilan = ekranHatasiBildiriciKur();

export const ekranHatasiniBildir = (hata: unknown, sayfa?: string): boolean => varsayilan.bildir(hata, sayfa);

type Hedef = Pick<Window, 'addEventListener' | 'removeEventListener'>;

// Pencerenin yakalanmamış hatasını ve söz reddini bildirir; durduran işlevi döner.
export function ekranHatasiDinleyicisiniKur(bildirici: EkranHatasiBildirici = varsayilan, hedef: Hedef = window): () => void {
  const hataDinle = (o: Event): void => { bildirici.bildir((o as ErrorEvent).error ?? (o as ErrorEvent).message); };
  const retDinle = (o: Event): void => { bildirici.bildir((o as PromiseRejectionEvent).reason); };
  hedef.addEventListener('error', hataDinle);
  hedef.addEventListener('unhandledrejection', retDinle);
  return () => {
    hedef.removeEventListener('error', hataDinle);
    hedef.removeEventListener('unhandledrejection', retDinle);
  };
}
