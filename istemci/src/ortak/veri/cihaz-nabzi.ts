import type { NabizCevabi, NabizGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { api } from './api.ts';
import { DERLEME } from './surum.ts';

// Cihaz nabzı (kart 1666, 1621 a, 1745 a): girişli cihaz beş dakikada bir istemci sürümünü, çevrimdışı kuyruğunu, son eşitlemesini
// ve son nabızdan beri yakalanan JS hata sayısını bildirir. Kişi, konum ve istemci saati gönderilmez; cihazı sunucu çerezden tanır.
export const NABIZ_ARALIGI_MS = 5 * 60 * 1000;
// Açılışta hemen değil: sayfa ve oturum yerleşsin, yeniden yüklemeler sunucuya nabız yağdırmasın.
export const ILK_NABIZ_MS = 30 * 1000;
const NABIZ_ZAMAN_ASIMI_MS = 15 * 1000;
// Sunucu şemasının sınırları (paylasilan/sozlesme/oturum.ts); şema istemciye değer olarak ithal edilmez, aşan nabız 400 alırdı.
const NABIZ_JS_HATA_AZAMI = 10_000;
const NABIZ_SURUM_AZAMI = 64;

// Çevrimdışı kuyruğu olan ekran (Arkon) kuyruk uzunluğunu ve son başarılı eşitlemenin üzerinden geçen saniyeyi verir.
// Kaynak yoksa ikisi de bilinmez: null, sıfır uydurulmaz.
export interface KuyrukBilgisi { kuyruk: number | null; sonEsitlemeSn: number | null }
export type KuyrukKaynagi = () => KuyrukBilgisi;

export interface NabizSecenegi {
  gonder?: (govde: NabizGovdesi) => Promise<NabizCevabi>;
  kuyrukKaynagi?: KuyrukKaynagi;
  hedef?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'setInterval' | 'clearTimeout' | 'clearInterval'>;
}

const sunucuyaGonder = (govde: NabizGovdesi): Promise<NabizCevabi> =>
  // Arka plan yazması: ulaşılamazsa "sonucu bilinmeyen kayıt" sayılmaz. 401 oturumu kapatmaz; giriş ekranı kendi sorgusuyla bilir.
  api.post<NabizCevabi>('/oturum/nabiz', govde, { arkaPlan: true, oturumBitirmez: true, zamanAsimiMs: NABIZ_ZAMAN_ASIMI_MS });

const BOS_KUYRUK: KuyrukBilgisi = { kuyruk: null, sonEsitlemeSn: null };

// Nabzı başlatır, durduran işlevi döner. Hata sayacı yalnız nabız yazılınca sıfırlanır: gönderilemeyen ya da sık diye yazılmayan
// nabzın hataları sonrakine eklenir.
export function cihazNabziniBaslat(secenek: NabizSecenegi = {}): () => void {
  const gonder = secenek.gonder ?? sunucuyaGonder;
  const hedef = secenek.hedef ?? window;
  let jsHata = 0;
  let gidiyor = false;
  const hataSay = () => { jsHata = Math.min(jsHata + 1, NABIZ_JS_HATA_AZAMI); };

  const nabiz = async (): Promise<void> => {
    if (gidiyor) return;
    gidiyor = true;
    const gonderilen = jsHata;
    try {
      const { kuyruk, sonEsitlemeSn } = secenek.kuyrukKaynagi?.() ?? BOS_KUYRUK;
      const cevap = await gonder({ surum: DERLEME.surum.trim().slice(0, NABIZ_SURUM_AZAMI) || null, kuyruk, sonEsitlemeSn, jsHata: gonderilen });
      if (cevap.yazildi) jsHata -= gonderilen;
    } catch {
      // Oturumsuz (401), dış izleyici (403) ya da bağlantısız: nabız sessizce düşer, sonraki turda yeniden denenir.
    } finally {
      gidiyor = false;
    }
  };

  hedef.addEventListener('error', hataSay);
  hedef.addEventListener('unhandledrejection', hataSay);
  const ilk = hedef.setTimeout(() => { void nabiz(); }, ILK_NABIZ_MS);
  const tur = hedef.setInterval(() => { void nabiz(); }, NABIZ_ARALIGI_MS);
  return () => {
    hedef.clearTimeout(ilk);
    hedef.clearInterval(tur);
    hedef.removeEventListener('error', hataSay);
    hedef.removeEventListener('unhandledrejection', hataSay);
  };
}
