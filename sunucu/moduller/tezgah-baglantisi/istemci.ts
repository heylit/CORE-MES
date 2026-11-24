import { AZAMI_CEVAP_UZUNLUGU, XmlHatasi, xmlAyristir } from './xml.ts';
import type { XmlOgesi } from './xml.ts';
import { ISTEK_SURESI_MS } from './kurallar.ts';

// Tezgâh servisiyle yalnız bu dosya konuşur (kart 3373, 3659; ADR 0033). Yalnız GET, yalnız dört sabit yol; yönlendirme izlenmez,
// yinelenmez. Sorgu parametresi yalnız /sample'da ve yalnız from ile count'tur. Adres hata metnine ve günlüğe girmez.
export const TEZGAH_YOLLARI = ['/probe', '/current', '/sample', '/assets'] as const;
export type TezgahYolu = (typeof TEZGAH_YOLLARI)[number];

// count izin listesindendir; from sıfır ya da pozitif güvenli tam sayıdır.
export const SAMPLE_SAYILARI = [100, 500, 1000, 2000] as const;
export interface SampleSorgusu {
  from: number;
  count: (typeof SAMPLE_SAYILARI)[number];
}

export type TezgahIstemciSonucu =
  | { tur: 'basarili'; kok: XmlOgesi }
  // Servis istenen sıranın tampondan düştüğünü söyledi (MTConnectError OUT_OF_RANGE).
  | { tur: 'aralik-disi'; ileti: string }
  // Servis bu yolu vermiyor (404): hata sayılmaz, çağıran "veri yok" der.
  | { tur: 'yok'; ileti: string }
  | { tur: 'zaman-asimi' | 'ag' | 'http' | 'bozuk'; ileti: string };

export interface TezgahIstemcisi {
  oku(yol: TezgahYolu, sorgu?: SampleSorgusu): Promise<TezgahIstemciSonucu>;
}

export interface TezgahIstemciSecenegi {
  fetch?: typeof fetch;
  istekSuresiMs?: number;
}

function sorguMetni(yol: TezgahYolu, sorgu: SampleSorgusu | undefined): string {
  if (sorgu === undefined) {
    if (yol === '/sample') throw new Error('Tezgâh servisinde /sample from ve count ister.');
    return '';
  }
  if (yol !== '/sample') throw new Error('Sorgu parametresi yalnız /sample yolunda olur.');
  const anahtarlar = Object.keys(sorgu).sort().join(',');
  if (anahtarlar !== 'count,from') throw new Error('Sorgu parametresi yalnız from ve count olur.');
  if (!Number.isSafeInteger(sorgu.from) || sorgu.from < 0) throw new Error('from sıfır ya da pozitif tam sayı olur.');
  if (!SAMPLE_SAYILARI.includes(sorgu.count)) throw new Error('count izin listesinde olmalı.');
  return `?from=${sorgu.from}&count=${sorgu.count}`;
}

// Cevap gövdesi akarken sınırlanır: content-length yoksa ya da yalansa bellek şişmez.
async function sinirliOku(cevap: Response): Promise<string | null> {
  const okuyucu = cevap.body?.getReader();
  if (okuyucu === undefined) {
    const metin = await cevap.text();
    return metin.length > AZAMI_CEVAP_UZUNLUGU ? null : metin;
  }
  const cozucu = new TextDecoder();
  let metin = '';
  let bayt = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    bayt += value.byteLength;
    if (bayt > AZAMI_CEVAP_UZUNLUGU) {
      await okuyucu.cancel();
      return null;
    }
    metin += cozucu.decode(value, { stream: true });
  }
  return metin + cozucu.decode();
}

const HATA_GOVDESI_SINIRI = 64 * 1024;

// MTConnectError cevabında istenen sıra tampon dışıysa OUT_OF_RANGE kodu gelir (HTTP 4xx).
async function hataGovdesiAralikDisiMi(cevap: Response): Promise<boolean> {
  try {
    const metin = await sinirliOku(cevap);
    if (metin === null || metin.length > HATA_GOVDESI_SINIRI) return false;
    const kok = xmlAyristir(metin);
    return kok.ad === 'MTConnectError' && JSON.stringify(kok).includes('OUT_OF_RANGE');
  } catch {
    return false;
  }
}

export function tezgahIstemcisiKur(adres: string, secenek: TezgahIstemciSecenegi = {}): TezgahIstemcisi {
  const cagir = secenek.fetch ?? fetch;
  const sure = secenek.istekSuresiMs ?? ISTEK_SURESI_MS;
  return {
    async oku(yol, sorgu) {
      if (!TEZGAH_YOLLARI.includes(yol)) throw new Error('Tezgâh servisinde yalnız /probe, /current, /sample ve /assets okunur.');
      const ek = sorguMetni(yol, sorgu);
      let metin: string | null;
      try {
        const cevap = await cagir(`${adres}${yol}${ek}`, { method: 'GET', headers: { Accept: 'text/xml, application/xml' }, signal: AbortSignal.timeout(sure), redirect: 'error' });
        if (!cevap.ok) {
          if (yol === '/sample' && (cevap.status === 400 || cevap.status === 404 || cevap.status === 416) && (await hataGovdesiAralikDisiMi(cevap))) {
            return { tur: 'aralik-disi', ileti: 'Tezgâh servisi istenen sırayı tamponunda bulamadı.' };
          }
          await cevap.body?.cancel().catch(() => undefined);
          if (yol === '/assets' && cevap.status === 404) return { tur: 'yok', ileti: 'Tezgâh servisi takım verisi vermiyor.' };
          return { tur: 'http', ileti: `Tezgâh servisi hata döndürdü (HTTP ${cevap.status}).` };
        }
        if (Number(cevap.headers.get('content-length') ?? '0') > AZAMI_CEVAP_UZUNLUGU) {
          await cevap.body?.cancel();
          return { tur: 'bozuk', ileti: 'Tezgâh servisinin cevabı çok büyük.' };
        }
        metin = await sinirliOku(cevap);
      } catch (hata) {
        const ad = hata instanceof Error ? hata.name : '';
        return ad === 'TimeoutError' || ad === 'AbortError'
          ? { tur: 'zaman-asimi', ileti: 'Tezgâh servisi süresinde cevap vermedi.' }
          : { tur: 'ag', ileti: 'Tezgâh servisine bağlanılamadı.' };
      }
      if (metin === null) return { tur: 'bozuk', ileti: 'Tezgâh servisinin cevabı çok büyük.' };
      try {
        return { tur: 'basarili', kok: xmlAyristir(metin) };
      } catch (hata) {
        if (hata instanceof XmlHatasi) return { tur: 'bozuk', ileti: `Tezgâh servisinin cevabı okunamadı: ${hata.message}` };
        throw hata;
      }
    },
  };
}
