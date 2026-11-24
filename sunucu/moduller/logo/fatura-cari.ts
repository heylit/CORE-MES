import { FATURA_ONCEKI_DONEM_GUNU, FATURA_TURLERI, faturaCariBaslangicGunu, faturaCariOkunmaliMi } from './fatura-cari-sozlesmesi.ts';
import type { FaturaCariAkisi, FaturaTuru } from './fatura-cari-sozlesmesi.ts';
import { OKUMA_HATA_BEKLEME_MS } from './kurallar.ts';
import type { KopruSonucu } from './kurallar.ts';
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
    // Bekleme anahtarı kaynak başınadır (tür, önceki dönem, değişen): tek bozuk sayfa ya da satır yalnız kendi okumasını bekletir, diğerleri sürer (Risk N5).
    // Başarısızlık veritabanına da yazılır; sağlık ekranı bu satırdan okur ve ilgili okuma başarılı olunca silinir.
    const beklemede = (k: string): boolean => {
      const hata = o.bellek.okumaDenemeleri.get(k);
      return hata !== undefined && o.saat().getTime() - hata.getTime() < OKUMA_HATA_BEKLEME_MS;
    };
    const basarisiz = (k: string, r: Exclude<KopruSonucu, { tur: 'basarili' }>): Yazici<TurSonucu> => {
      o.bellek.okumaDenemeleri.set(k, o.saat());
      return async (db2) => {
        await s.faturaCariHataYaz(db2, k, o.saat(), r.ileti);
        return { tur: 'okuma', akis: 'fatura-listesi', sonuc: r.tur, sayi: 0, ileti: r.ileti };
      };
    };
    const yazici = (k: string, is: (db2: Parameters<Yazici<TurSonucu>>[0]) => Promise<TurSonucu>): Yazici<TurSonucu> => {
      o.bellek.okumaDenemeleri.delete(k);
      return async (db2) => { await s.faturaCariHataSil(db2, k); return is(db2); };
    };
    const okundu = (sayi: number): TurSonucu => ({ tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi });
    const from = faturaCariBaslangicGunu(o.saat());
    // Köprüye turda tek istek. Sıra: açık dönemde türler, sonra önceki dönemler (N4), sonra değişen faturalar (N3).
    const imlecler = new Map<FaturaTuru, s.FaturaCariImleci | null>();
    for (const tur of FATURA_TURLERI) {
      const akis: FaturaCariAkisi = `fatura-${tur}`;
      const imlec = await s.faturaCariImleci(db, akis);
      imlecler.set(tur, imlec);
      const k = `fatura-listesi:${tur}`;
      if (beklemede(k) || !faturaCariOkunmaliMi(imlec, o.saat(), o.zorlaAni ?? null)) continue;
      return async (): Promise<Yazici<TurSonucu>> => {
        const r = await kopru.faturaListesiOku(tur, imlec?.sonRef ?? 0, from);
        if (r.tur !== 'basarili') return basarisiz(k, r);
        const v = r.veri;
        if (imlec !== null && (imlec.firma !== v.firma || imlec.donem !== v.donem)) {
          return yazici(k, async (db2) => {
            const onceki = await s.faturaCariImleciVar(db2, akis, v.firma, v.donem);
            await s.faturaCariImleciYaz(db2, akis, { firma: v.firma, donem: v.donem, sonRef: onceki?.sonRef ?? 0, dolu: true }, o.saat());
            return okundu(0);
          });
        }
        return yazici(k, async (db2) => {
          const sayi = await s.faturaBasliklariniYaz(db2, tur, v.firma, v.donem, v.kayitlar, o.saat());
          const sonRef = v.kayitlar.reduce((en, k2) => Math.max(en, k2.logoKayitNo), imlec?.sonRef ?? 0);
          await s.faturaCariImleciYaz(db2, akis, { firma: v.firma, donem: v.donem, sonRef: v.sonraki ?? sonRef, dolu: v.sonraki !== null }, o.saat());
          return okundu(sayi);
        });
      };
    }
    // N4: yeni dönemin imleci açıldıktan sonra önceki dönem bir süre daha okunur (geç girilen faturalar); okunan sayfa istenen dönemin değilse yazılmaz.
    for (const tur of FATURA_TURLERI) {
      const akis: FaturaCariAkisi = `fatura-${tur}`;
      const guncel = imlecler.get(tur) ?? null;
      if (guncel === null) continue;
      const k = `fatura-listesi:onceki:${tur}`;
      if (beklemede(k)) continue;
      for (const eski of await s.faturaOncekiDonemImlecleri(db, akis, guncel.firma, guncel.donem, o.saat(), FATURA_ONCEKI_DONEM_GUNU)) {
        if (!faturaCariOkunmaliMi(eski, o.saat(), o.zorlaAni ?? null)) continue;
        return async (): Promise<Yazici<TurSonucu>> => {
          const r = await kopru.faturaListesiOku(tur, eski.sonRef, from, eski.donem);
          if (r.tur !== 'basarili') return basarisiz(k, r);
          const v = r.veri;
          if (v.firma !== eski.firma || v.donem !== eski.donem) return basarisiz(k, { tur: 'belirsiz', ileti: 'Yardımcı istenen önceki dönemi vermedi; okunan sayfa yazılmadı.' });
          return yazici(k, async (db2) => {
            const sayi = await s.faturaBasliklariniYaz(db2, tur, v.firma, v.donem, v.kayitlar, o.saat());
            const sonRef = v.kayitlar.reduce((en, k2) => Math.max(en, k2.logoKayitNo), eski.sonRef);
            await s.faturaCariImleciYaz(db2, akis, { firma: v.firma, donem: v.donem, sonRef: v.sonraki ?? sonRef, dolu: v.sonraki !== null }, o.saat());
            return okundu(sayi);
          });
        };
      }
    }
    // N3: Logo'da sonradan değişen (iptal edilen) faturalar değişme zamanıyla yeniden okunur; başlangıç aynadaki en eski okumadır.
    const ilk = await s.faturaAynaIlkOkuma(db);
    if (ilk === null || beklemede('fatura-degisen')) return { tur: 'bos' };
    const degisen = await s.faturaCariImleci(db, 'fatura-degisen');
    if (!faturaCariOkunmaliMi(degisen, o.saat(), o.zorlaAni ?? null)) return { tur: 'bos' };
    return async (): Promise<Yazici<TurSonucu>> => {
      const r = await kopru.faturaDegisenOku(degisen?.degisme ?? ilk, degisen?.sonRef ?? 0, from);
      if (r.tur !== 'basarili') return basarisiz('fatura-degisen', r);
      const v = r.veri;
      return yazici('fatura-degisen', async (db2) => {
        const sayi = await s.faturaBasliklariniYaz(db2, null, v.firma, v.donem, v.kayitlar, o.saat());
        // İmleç (değişme zamanı, kayıt no) çiftinin en büyüğüdür; sayfa doluysa bekleme yok.
        const son = v.kayitlar.reduce<{ degisme: string; ref: number } | null>((en, k) => {
          const d = k.degisme ?? '';
          const fark = en === null ? 1 : Date.parse(d) - Date.parse(en.degisme);
          return en === null || fark > 0 || (fark === 0 && k.logoKayitNo > en.ref) ? { degisme: d, ref: k.logoKayitNo } : en;
        }, null);
        await s.faturaCariImleciYaz(db2, 'fatura-degisen', { firma: v.firma, donem: v.donem, sonRef: son?.ref ?? degisen?.sonRef ?? 0, dolu: v.sonraki !== null, degisme: son?.degisme ?? degisen?.degisme ?? ilk }, o.saat());
        return okundu(sayi);
      });
    };
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
        return async (db2) => {
          await s.faturaCariHataYaz(db2, 'cari-hareket', o.saat(), r.ileti);
          return { tur: 'okuma', akis: 'cari-hareket', sonuc: r.tur, sayi: 0, ileti: r.ileti };
        };
      }
      o.bellek.okumaDenemeleri.delete('cari-hareket');
      const v = r.veri;
      if (imlec !== null && (imlec.firma !== v.firma || imlec.donem !== v.donem)) {
        return async (db2) => {
          await s.faturaCariHataSil(db2, 'cari-hareket');
          const onceki = await s.faturaCariImleciVar(db2, 'cari-hareket', v.firma, v.donem);
          await s.faturaCariImleciYaz(db2, 'cari-hareket', { firma: v.firma, donem: v.donem, sonRef: onceki?.sonRef ?? 0, dolu: true }, o.saat());
          return { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 0 };
        };
      }
      return async (db2) => {
        await s.faturaCariHataSil(db2, 'cari-hareket');
        const sayi = await s.cariHareketleriniYaz(db2, v.firma, v.donem, v.kayitlar, o.saat());
        const sonRef = v.kayitlar.reduce((en, k) => Math.max(en, k.logoKayitNo), imlec?.sonRef ?? 0);
        await s.faturaCariImleciYaz(db2, 'cari-hareket', { firma: v.firma, donem: v.donem, sonRef: v.sonraki ?? sonRef, dolu: v.sonraki !== null }, o.saat());
        return { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi };
      };
    };
  });
}
