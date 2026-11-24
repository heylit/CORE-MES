import { FATURA_TURLERI, faturaCariBaslangicGunu, faturaCariOkunmaliMi } from './fatura-cari-sozlesmesi.ts';
import type { FaturaCariAkisi } from './fatura-cari-sozlesmesi.ts';
import { OKUMA_HATA_BEKLEME_MS } from './kurallar.ts';
import { okumaKapisi, turuKos } from './servis.ts';
import type { TurOrtami, TurSonucu, TxAcan, Yazici } from './servis.ts';
import * as s from './sorgular.ts';

// 3675 D1: Logo fatura başlıkları (satış, alış ve iadeleri) ve cari hareketler yalnız okunur (GET) ve CORE aynasına yazılır; Logo'ya, finans
// belgelerine ve cari bakiyeye hiçbir şey yazılmaz, eşleşme finans belgesine işlenmez. Anahtarlar varsayılan kapalıdır; köprü sözleşmesi
// doğrulanmadığı için (fatura-cari-sozlesmesi.ts) yardımcı ucu onaylanana kadar açılmaz.
// Turda tek sayfa: önce bütün geçmiş (sayfa doluysa her turda), yetişince saatte bir yeniler. İmleç yalnız aynaya yazıldıktan sonra, aynı
// transaction'da ilerler. Yardımcı başka firma ya da döneme geçtiyse o dönemin imleci sıfırdan açılır, okunan sayfa yazılmaz.
// Sınır (D1): imleç kayıt numarasıyla ilerler; eski kaydın sonradan değişmesi ya da silinmesi izlenmez.
const FATURA_AYARI = 'logo.fatura-listesi-okumasi';
const CARI_AYARI = 'logo.cari-hareket-okumasi';

export function faturaListesiTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, FATURA_AYARI, 'fatura-listesi-kapali');
    if ('tur' in kopru) return kopru;
    const hata = o.bellek.okumaDenemeleri.get('fatura-listesi');
    if (hata && o.saat().getTime() - hata.getTime() < OKUMA_HATA_BEKLEME_MS) return { tur: 'bos' };
    // Köprüye turda tek istek: zamanı gelen ilk tür okunur, diğeri sonraki turda.
    for (const tur of FATURA_TURLERI) {
      const akis: FaturaCariAkisi = `fatura-${tur}`;
      const imlec = await s.faturaCariImleci(db, akis);
      if (!faturaCariOkunmaliMi(imlec, o.saat(), o.zorlaAni ?? null)) continue;
      return async (): Promise<Yazici<TurSonucu>> => {
        const r = await kopru.faturaListesiOku(tur, imlec?.sonRef ?? 0, faturaCariBaslangicGunu(o.saat()));
        if (r.tur !== 'basarili') {
          o.bellek.okumaDenemeleri.set('fatura-listesi', o.saat());
          return async () => ({ tur: 'okuma', akis: 'fatura-listesi', sonuc: r.tur, sayi: 0, ileti: r.ileti });
        }
        o.bellek.okumaDenemeleri.delete('fatura-listesi');
        const v = r.veri;
        if (imlec !== null && (imlec.firma !== v.firma || imlec.donem !== v.donem)) {
          return async (db2) => {
            const onceki = await s.faturaCariImleciVar(db2, akis, v.firma, v.donem);
            await s.faturaCariImleciYaz(db2, akis, { firma: v.firma, donem: v.donem, sonRef: onceki?.sonRef ?? 0, dolu: true }, o.saat());
            return { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 0 };
          };
        }
        return async (db2) => {
          const sayi = await s.faturaBasliklariniYaz(db2, tur, v.firma, v.donem, v.kayitlar, o.saat());
          const sonRef = v.kayitlar.reduce((en, k) => Math.max(en, k.logoKayitNo), imlec?.sonRef ?? 0);
          await s.faturaCariImleciYaz(db2, akis, { firma: v.firma, donem: v.donem, sonRef: v.sonraki ?? sonRef, dolu: v.sonraki !== null }, o.saat());
          return { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi };
        };
      };
    }
    return { tur: 'bos' };
  });
}

export function cariHareketTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, CARI_AYARI, 'cari-hareket-kapali');
    if ('tur' in kopru) return kopru;
    const hata = o.bellek.okumaDenemeleri.get('cari-hareket');
    if (hata && o.saat().getTime() - hata.getTime() < OKUMA_HATA_BEKLEME_MS) return { tur: 'bos' };
    const imlec = await s.faturaCariImleci(db, 'cari-hareket');
    if (!faturaCariOkunmaliMi(imlec, o.saat(), o.zorlaAni ?? null)) return { tur: 'bos' };
    return async (): Promise<Yazici<TurSonucu>> => {
      const r = await kopru.cariHareketleriOku(imlec?.sonRef ?? 0, faturaCariBaslangicGunu(o.saat()));
      if (r.tur !== 'basarili') {
        o.bellek.okumaDenemeleri.set('cari-hareket', o.saat());
        return async () => ({ tur: 'okuma', akis: 'cari-hareket', sonuc: r.tur, sayi: 0, ileti: r.ileti });
      }
      o.bellek.okumaDenemeleri.delete('cari-hareket');
      const v = r.veri;
      if (imlec !== null && (imlec.firma !== v.firma || imlec.donem !== v.donem)) {
        return async (db2) => {
          const onceki = await s.faturaCariImleciVar(db2, 'cari-hareket', v.firma, v.donem);
          await s.faturaCariImleciYaz(db2, 'cari-hareket', { firma: v.firma, donem: v.donem, sonRef: onceki?.sonRef ?? 0, dolu: true }, o.saat());
          return { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 0 };
        };
      }
      return async (db2) => {
        const sayi = await s.cariHareketleriniYaz(db2, v.firma, v.donem, v.kayitlar, o.saat());
        const sonRef = v.kayitlar.reduce((en, k) => Math.max(en, k.logoKayitNo), imlec?.sonRef ?? 0);
        await s.faturaCariImleciYaz(db2, 'cari-hareket', { firma: v.firma, donem: v.donem, sonRef: v.sonraki ?? sonRef, dolu: v.sonraki !== null }, o.saat());
        return { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi };
      };
    };
  });
}
