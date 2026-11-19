import type { Db } from '#cekirdek/db.ts';
import type { LogoSonAlisCevabi } from '#paylasilan/sozlesme/logo.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { LOGO_DOVIZ_TURLERI, OKUMA_HATA_BEKLEME_MS, sonAlisOkunmaliMi } from './kurallar.ts';
import { okumaKapisi, turuKos } from './servis.ts';
import type { TurOrtami, TurSonucu, TxAcan, Yazici } from './servis.ts';
import * as s from './sorgular.ts';

const AYAR = 'logo.son-alis-okumasi';
const AKIS = 'son-alis';

// 3384-c a: Logo alış faturası satırları yalnız okunur (GET) ve CORE kopyasına eklenir; Logo'ya, maliyete ya da satın almaya hiçbir şey yazılmaz.
// Turda tek sayfa: önce bütün geçmiş (sayfa doluysa her turda), yetişince saatte bir yeniler. İmleç yalnız satırlar yazıldıktan sonra, aynı
// transaction'da ilerler. Yardımcı başka firma ya da döneme geçtiyse o dönemin imleci sıfırdan açılır, okunan sayfa yazılmaz.
// Eski yardımcıda uç yoktur: sonuç "reddedildi" (yardımcı eski) olur, bekleme süresince istek yinelenmez.
export function sonAlisTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, AYAR, 'son-alis-kapali');
    if ('tur' in kopru) return kopru;
    const hata = o.bellek.okumaDenemeleri.get(AKIS);
    if (hata && o.saat().getTime() - hata.getTime() < OKUMA_HATA_BEKLEME_MS) return { tur: 'bos' };
    const imlec = await s.sonAlisImleci(db);
    if (!sonAlisOkunmaliMi(imlec, o.saat(), o.zorlaAni ?? null)) return { tur: 'bos' };
    return async (): Promise<Yazici<TurSonucu>> => {
      const r = await kopru.topluAlislariOku(imlec?.sonRef ?? 0);
      if (r.tur !== 'basarili') {
        o.bellek.okumaDenemeleri.set(AKIS, o.saat());
        return async () => ({ tur: 'okuma', akis: AKIS, sonuc: r.tur, sayi: 0, ileti: r.ileti });
      }
      o.bellek.okumaDenemeleri.delete(AKIS);
      const v = r.veri;
      if (imlec !== null && (imlec.firma !== v.firma || imlec.donem !== v.donem)) {
        return async (db2) => {
          const onceki = await s.sonAlisImleciVar(db2, v.firma, v.donem);
          await s.sonAlisImleciYaz(db2, { firma: v.firma, donem: v.donem, sonRef: onceki?.sonRef ?? 0, dolu: true }, o.saat());
          return { tur: 'okuma', akis: AKIS, sonuc: 'okundu', sayi: 0 };
        };
      }
      return async (db2) => {
        const sayi = await s.sonAlislariYaz(db2, v.firma, v.donem, v.kayitlar, o.saat());
        const sonRef = v.kayitlar.reduce((en, k) => Math.max(en, k.logoKayitNo), imlec?.sonRef ?? 0);
        await s.sonAlisImleciYaz(db2, { firma: v.firma, donem: v.donem, sonRef: v.sonraki ?? sonRef, dolu: v.sonraki !== null }, o.saat());
        return { tur: 'okuma', akis: AKIS, sonuc: 'okundu', sayi };
      };
    };
  });
}

// Teklif ve proje maliyetindeki öneri: malzeme başına en yeni alış faturası satırı. Okuma kapalıysa satır döndürülmez (eski kopya öneri olmaz).
// Yetki uçta denetlenir.
export async function sonAlisOnerileri(db: Db, stokKodlari: readonly string[]): Promise<LogoSonAlisCevabi> {
  const acik = (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, AYAR)) === true;
  if (!acik) return { okuma: 'kapali', kayitlar: [] };
  const kod = (tur: number | null): string | null => (tur === null ? null : Object.entries(LOGO_DOVIZ_TURLERI).find(([, t]) => t === tur)?.[0] ?? null);
  const kayitlar = stokKodlari.length === 0 ? [] : await s.sonAlislar(db, stokKodlari);
  return { okuma: 'acik', kayitlar: kayitlar.map((k) => ({ ...k, dovizKodu: kod(k.dovizTuru) })) };
}
