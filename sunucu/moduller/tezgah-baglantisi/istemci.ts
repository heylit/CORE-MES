import { AZAMI_CEVAP_UZUNLUGU, XmlHatasi, xmlAyristir } from './xml.ts';
import type { XmlOgesi } from './xml.ts';
import { ISTEK_SURESI_MS } from './kurallar.ts';

// Tezgah servisiyle yalnız bu dosya konuşur (kart 3373, ADR 0033). Yalnız GET, yalnız iki sabit yol; yönlendirme izlenmez,
// yinelenmez. Akış (/sample) ve başka yol yoktur. Adres hata metnine ve günlüğe girmez.
export const TEZGAH_YOLLARI = ['/probe', '/current'] as const;
export type TezgahYolu = (typeof TEZGAH_YOLLARI)[number];

export type TezgahIstemciSonucu =
  | { tur: 'basarili'; kok: XmlOgesi }
  | { tur: 'zaman-asimi' | 'ag' | 'http' | 'bozuk'; ileti: string };

export interface TezgahIstemcisi {
  oku(yol: TezgahYolu): Promise<TezgahIstemciSonucu>;
}

export interface TezgahIstemciSecenegi {
  fetch?: typeof fetch;
  istekSuresiMs?: number;
}

export function tezgahIstemcisiKur(adres: string, secenek: TezgahIstemciSecenegi = {}): TezgahIstemcisi {
  const cagir = secenek.fetch ?? fetch;
  const sure = secenek.istekSuresiMs ?? ISTEK_SURESI_MS;
  return {
    async oku(yol) {
      if (!TEZGAH_YOLLARI.includes(yol)) throw new Error('Tezgah servisinde yalnız /probe ve /current okunur.');
      let metin: string;
      try {
        const cevap = await cagir(`${adres}${yol}`, { method: 'GET', headers: { Accept: 'text/xml, application/xml' }, signal: AbortSignal.timeout(sure), redirect: 'error' });
        if (!cevap.ok) {
          await cevap.body?.cancel();
          return { tur: 'http', ileti: `Tezgah servisi hata döndürdü (HTTP ${cevap.status}).` };
        }
        if (Number(cevap.headers.get('content-length') ?? '0') > AZAMI_CEVAP_UZUNLUGU) {
          await cevap.body?.cancel();
          return { tur: 'bozuk', ileti: 'Tezgah servisinin cevabı çok büyük.' };
        }
        metin = await cevap.text();
      } catch (hata) {
        const ad = hata instanceof Error ? hata.name : '';
        return ad === 'TimeoutError' || ad === 'AbortError'
          ? { tur: 'zaman-asimi', ileti: 'Tezgah servisi süresinde cevap vermedi.' }
          : { tur: 'ag', ileti: 'Tezgah servisine bağlanılamadı.' };
      }
      try {
        return { tur: 'basarili', kok: xmlAyristir(metin) };
      } catch (hata) {
        if (hata instanceof XmlHatasi) return { tur: 'bozuk', ileti: `Tezgah servisinin cevabı okunamadı: ${hata.message}` };
        throw hata;
      }
    },
  };
}
