import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { IrsaliyeCevabi, IrsaliyeListesiCevabi, IrsaliyeListeSatiri } from '#paylasilan/sozlesme/logo.ts';
import { IRSALIYE_ESLESME_DURUMLARI } from '#paylasilan/sozlesme/logo.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { logoSatirliSiparisSatirlari } from '../satin-alma/disari.ts';
import { belgeNoluSevkIsleri } from '../sevkiyat/disari.ts';
import { iadeMalKabulleri } from '../stok/disari.ts';
import {
  ALIS_TURLERI, degismeImleci, gorunenIrsaliyeTurleri, irsaliyeBaslangicGunu, irsaliyeBeklemesiMs, irsaliyeEslesmesi, IRSALIYE_SAYFASI, IRSALIYE_TUR_ADLARI,
  sonrakiIrsaliyeSirasi,
} from './kurallar.ts';
import type { CoreKarsiligi, EslesmeKaynaklari, IrsaliyeEslesmesi, IrsaliyeTuru, KopruSonucu } from './kurallar.ts';
import { okumaKapisi, turuKos } from './servis.ts';
import type { TurOrtami, TurSonucu, TxAcan, Yazici } from './servis.ts';
import * as s from './sorgular.ts';
import type { IrsaliyeAynaBasligi, IrsaliyeAynaSatiri, IrsaliyeImleci } from './sorgular.ts';

const AYAR = 'logo.irsaliye-okumasi';

// 3345 a: Logo irsaliyeleri yalnız okunur (GET), aynaya yazılır; Logo'ya, stoka, satın almaya, sevkiyata ya da finansa hiçbir şey yazılmaz.
// Turda tek istek: imlecin sırasına göre yeni başlıklar, değişen başlıklar (Logo değişme zamanıyla, Risk K1) ya da silinme denetimi.
// İmleç yalnız ayna yazıldıktan sonra, aynı transaction'da ilerler. Yardımcı başka firma ya da döneme geçtiyse o dönemin imleci sıfırdan açılır.
export function irsaliyeTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, AYAR, 'irsaliye-kapali');
    if ('tur' in kopru) return kopru;
    const h = o.bellek.irsaliyeHatasi;
    if (h !== null && o.saat().getTime() - h.son.getTime() < irsaliyeBeklemesiMs(h.sayi)) return { tur: 'bos' };
    const imlec = await s.irsaliyeImleci(db);
    const sira = imlec?.sira ?? 'yeni';
    const baslangic = irsaliyeBaslangicGunu(o.saat());
    const hata = (sonuc: Exclude<KopruSonucu, { tur: 'basarili' }>['tur']): Yazici<TurSonucu> => {
      o.bellek.irsaliyeHatasi = { sayi: (o.bellek.irsaliyeHatasi?.sayi ?? 0) + 1, son: o.saat() };
      return async () => ({ tur: 'okuma', akis: 'irsaliye', sonuc, sayi: 0 });
    };
    // Dönem değişti: yeni dönemin imleci açılır, okunan sayfa yazılmaz (bir sonraki tur o dönemde baştan okur).
    const yeniDonem = (firma: number, donem: number): Yazici<TurSonucu> => async (db2) => {
      await s.irsaliyeImleciYaz(db2, { firma, donem, sonRef: 0, degisme: null, degismeRef: 0, sira: 'yeni', refDenetimi: null }, o.saat());
      return { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: 0 };
    };
    const ayniDonem = (firma: number, donem: number): boolean => imlec === null || (imlec.firma === firma && imlec.donem === donem);
    return async (): Promise<Yazici<TurSonucu>> => {
      if (sira === 'refler') {
        const r = await kopru.irsaliyeRefleriOku(baslangic);
        if (r.tur !== 'basarili') return hata(r.tur);
        o.bellek.irsaliyeHatasi = null;
        if (!ayniDonem(r.veri.firma, r.veri.donem)) return yeniDonem(r.veri.firma, r.veri.donem);
        return async (db2) => {
          const sayi = await s.irsaliyeYoklariniIsaretle(db2, r.veri.firma, r.veri.donem, baslangic, r.veri.refler, o.saat());
          await s.irsaliyeImleciYaz(db2, { ...imlecVeya(imlec, r.veri), sira: sonrakiIrsaliyeSirasi('refler', false, null, o.saat()), refDenetimi: o.saat() }, o.saat());
          return { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi };
        };
      }
      const degismeZamani = sira === 'degisen' ? (imlec?.degisme ?? null) : null;
      const degisen = degismeZamani !== null;
      const r = await kopru.irsaliyeOku(degisen ? (imlec?.degismeRef ?? 0) : (imlec?.sonRef ?? 0), baslangic, degismeZamani);
      if (r.tur !== 'basarili') return hata(r.tur);
      o.bellek.irsaliyeHatasi = null;
      const v = r.veri;
      if (!ayniDonem(v.firma, v.donem)) return yeniDonem(v.firma, v.donem);
      return async (db2) => {
        await s.irsaliyeleriYaz(db2, v.firma, v.donem, v.basliklar, o.saat());
        const onceki = imlecVeya(imlec, v);
        const d = degismeImleci({ degisme: onceki.degisme, ref: onceki.degismeRef }, v.basliklar);
        const dolu = v.gelen >= IRSALIYE_SAYFASI;
        await s.irsaliyeImleciYaz(db2, {
          ...onceki,
          sonRef: degisen ? onceki.sonRef : v.basliklar.reduce((en, b) => Math.max(en, b.kayitNo), onceki.sonRef),
          degisme: d.degisme,
          degismeRef: d.ref,
          // Değişme imleci hiç yoksa (Logo değişme zamanı vermedi) değişen okuması bitmiş sayılır.
          sira: sira === 'degisen' && !degisen && !dolu
            ? sonrakiIrsaliyeSirasi('degisen', false, onceki.refDenetimi, o.saat())
            : sonrakiIrsaliyeSirasi(degisen ? 'degisen' : 'yeni', dolu, onceki.refDenetimi, o.saat()),
          refDenetimi: null,
        }, o.saat());
        return { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: v.basliklar.length };
      };
    };
  });
}

const imlecVeya = (i: IrsaliyeImleci | null, d: { firma: number; donem: number }): IrsaliyeImleci =>
  i ?? { firma: d.firma, donem: d.donem, sonRef: 0, degisme: null, degismeRef: 0, sira: 'yeni', refDenetimi: null };

/* ---------------- Sayfa: liste ve tek irsaliye ---------------- */

const fiyatYetkisi = (k: Kullanici, tur: IrsaliyeTuru): boolean => islemVarMi(k, ALIS_TURLERI.includes(tur) ? 'satin-alma.oku' : 'siparisler.fiyat-oku');

async function okumaDurumu(db: Db): Promise<IrsaliyeListesiCevabi['okuma']> {
  const acik = (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, AYAR)) === true;
  return { acik, sonOkuma: await s.irsaliyeSonOkumasi(db) };
}

// Eşleşme için gereken CORE kayıtları tek seferde okunur (sahibi modüllerin disari.ts'iyle); hiçbir kayıt yazılmaz.
async function eslesmeKaynaklari(db: Db, basliklar: readonly IrsaliyeAynaBasligi[], satirlar: readonly IrsaliyeAynaSatiri[]): Promise<(b: IrsaliyeAynaBasligi) => EslesmeKaynaklari> {
  const alisRefleri = new Map<string, number[]>();
  for (const x of satirlar) {
    if (x.siparisSatirRef === null) continue;
    const k = `${x.firma}-${x.donem}`;
    alisRefleri.set(k, [...(alisRefleri.get(k) ?? []), x.siparisSatirRef]);
  }
  const numaralar = (turler: readonly number[]): string[] =>
    basliklar.filter((b) => turler.includes(b.tur)).flatMap((b) => [b.fisNo, b.belgeNo].filter((n): n is string => n !== null));
  const siparisSatirlari = await logoSatirliSiparisSatirlari(db, [...alisRefleri.values()].flat().map(String));
  const sevkIsleri = await belgeNoluSevkIsleri(db, numaralar([8]));
  const iadeler = await iadeMalKabulleri(db, numaralar([3]));
  const netler = new Map<string, Map<number, string>>();
  for (const [k, refler] of alisRefleri) {
    const [firma, donem] = k.split('-').map(Number) as [number, number];
    netler.set(k, await s.logoSiparisNetleri(db, firma, donem, refler));
  }
  const sevkler = new Map<string, CoreKarsiligi>([...sevkIsleri].map(([no, x]) => [no, { tur: 'sevk', id: x.id, no: `#${x.id} · ${x.tarih}` }]));
  const iadeMalKabulu = new Map<string, CoreKarsiligi>([...iadeler].map(([no, x]) => [no, { tur: 'mal-kabul', id: x.id, no: x.no }]));
  return (b) => ({ siparisSatirlari, logoNetleri: netler.get(`${b.firma}-${b.donem}`) ?? new Map(), sevkler, iadeMalKabulleri: iadeMalKabulu });
}

const anahtar = (x: { firma: number; donem: number }, ref: number): string => `${x.firma}-${x.donem}-${ref}`;

function eslestir(b: IrsaliyeAynaBasligi, satirlar: readonly IrsaliyeAynaSatiri[], k: EslesmeKaynaklari): IrsaliyeEslesmesi {
  return irsaliyeEslesmesi({ tur: b.tur, iptal: b.iptal, logodaYok: b.logodaYok, fisNo: b.fisNo, belgeNo: b.belgeNo, satirlar }, k);
}

const listeSatiri = (b: IrsaliyeAynaBasligi, satirSayisi: number, e: IrsaliyeEslesmesi): IrsaliyeListeSatiri => ({
  firma: b.firma, donem: b.donem, kayitNo: b.kayitNo, tur: b.tur, turAdi: IRSALIYE_TUR_ADLARI[b.tur], fisNo: b.fisNo, belgeNo: b.belgeNo, tarih: b.tarih,
  cariKodu: b.cariKodu, cariAdi: b.cariAdi, eIrsaliye: b.eIrsaliye, faturaNo: b.faturaNo, satirSayisi, durum: e.durum, ozet: e.ozet,
});

export interface IrsaliyeListeIstegi {
  sayfa: number;
  sayfaBoyu?: number | undefined;
  yon: 'alis' | 'satis';
  tur?: number | undefined;
  gun: number;
  durum?: (typeof IRSALIYE_ESLESME_DURUMLARI)[number] | undefined;
  ara?: string | undefined;
}

// Liste aynadan okunur, eşleşme her istekte bellekte hesaplanır (aynada en çok 90 günlük kayıt beklenir). Ölçülmemiş konsinye türleri görünmez.
export async function irsaliyeListesi(db: Db, simdi: Date, q: IrsaliyeListeIstegi): Promise<IrsaliyeListesiCevabi> {
  const turler = gorunenIrsaliyeTurleri(q.yon);
  const baslangic = new Date(simdi.getTime() - q.gun * 86_400_000).toISOString().slice(0, 10);
  const ara = q.ara !== undefined && q.ara !== '' ? q.ara : null;
  const basliklar = await s.irsaliyeBasliklari(db, { turler, baslangic, ara });
  const satirlar = await s.irsaliyeSatirlari(db, basliklar);
  const satirlariBul = new Map<string, IrsaliyeAynaSatiri[]>();
  for (const x of satirlar) {
    const k = anahtar(x, x.irsaliyeRef);
    satirlariBul.set(k, [...(satirlariBul.get(k) ?? []), x]);
  }
  const kaynak = await eslesmeKaynaklari(db, basliklar, satirlar);
  const hepsi = basliklar.map((b) => {
    const st = satirlariBul.get(anahtar(b, b.kayitNo)) ?? [];
    return listeSatiri(b, st.length, eslestir(b, st, kaynak(b)));
  });
  const turdeki = q.tur === undefined ? hepsi : hepsi.filter((x) => x.tur === q.tur);
  const secilen = q.durum === undefined ? turdeki : turdeki.filter((x) => x.durum === q.durum);
  const boy = Math.min(q.sayfaBoyu ?? 50, 200);
  const sayfa = Math.max(1, Math.min(q.sayfa, Math.ceil(secilen.length / boy) || 1));
  return {
    satirlar: secilen.slice((sayfa - 1) * boy, sayfa * boy),
    toplam: secilen.length,
    sayfa,
    sayfaBoyu: boy,
    turler: turler.map((t) => ({ tur: t, ad: IRSALIYE_TUR_ADLARI[t], sayi: hepsi.filter((x) => x.tur === t).length })),
    durumlar: IRSALIYE_ESLESME_DURUMLARI.map((d) => ({ durum: d, sayi: turdeki.filter((x) => x.durum === d).length })),
    okuma: await okumaDurumu(db),
  };
}

// Fiyat ve tutar yalnız fiyat yetkisi olana çıkar (alışta satin-alma.oku, satışta siparisler.fiyat-oku); yetkisizde alan null (Risk K3).
// Ölçülmemiş konsinye türünün kaydı da bulunamadı sayılır.
export async function irsaliyeGetir(db: Db, k: Kullanici, p: { firma: number; donem: number; kayitNo: number }): Promise<IrsaliyeCevabi> {
  const b = await s.irsaliyeBasligi(db, p.firma, p.donem, p.kayitNo);
  if (b === null || !gorunenIrsaliyeTurleri(ALIS_TURLERI.includes(b.tur) ? 'alis' : 'satis').includes(b.tur)) throw bulunamadi('İrsaliye bulunamadı.');
  const satirlar = await s.irsaliyeSatirlari(db, [b]);
  const e = eslestir(b, satirlar, (await eslesmeKaynaklari(db, [b], satirlar))(b));
  const fiyat = fiyatYetkisi(k, b.tur);
  const esli = new Map(e.satirlar.map((x) => [x.kayitNo, x]));
  return {
    baslik: { ...listeSatiri(b, satirlar.length, e), ambar: b.ambar, iptal: b.iptal, logodaYok: b.logodaYok, okumaZamani: b.okumaZamani },
    fiyatGorunur: fiyat,
    satirlar: satirlar.map((x) => {
      const m = esli.get(x.kayitNo);
      return {
        kayitNo: x.kayitNo, malzemeKodu: x.malzemeKodu, malzemeAdi: x.malzemeAdi, miktar: x.miktar, birim: x.birim,
        fiyat: fiyat ? x.fiyat : null, tutar: fiyat ? x.tutar : null, dovizTuru: fiyat ? x.dovizTuru : null, dovizFiyati: fiyat ? x.dovizFiyati : null,
        siparisNo: x.siparisNo,
        durum: m?.durum ?? e.durum, neden: m?.neden ?? null, core: m?.core ?? null, coreMiktari: m?.coreMiktari ?? null, coreBirimi: m?.coreBirimi ?? null,
      };
    }),
  };
}
