import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { kararliJson } from '#cekirdek/tekrar.ts';
import type { DenetimGirdisi, Denetle } from '#cekirdek/uc.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  DegisiklikSatiri, DegisiklikSecenekleriCevabi, KayitSatiri, OkumaSatiri, SuzgecSecenekleriCevabi, degisiklikListesiSorgusu,
  kayitListesiSorgusu, okumaListesiSorgusu,
} from '#paylasilan/sozlesme/denetim.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import {
  type DegisiklikAlani, OKUMA_SAKLAMA_GUN, akisAlanlari, akisIstegiHatasi, degisiklikAlanlari, gizle, icerenKalibi, kimlikParametreleri,
  okumaIzi,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Kayıt tabloları yalnız büyür; 10.000 üstünde kesin sayının işte karşılığı yok, liste "10.000+" yazar (2216-8 a).
const SAYIM_SINIRI = 10_000;

type KayitListesiSorgusuCikti = z.output<typeof kayitListesiSorgusu>;
type DegisiklikListesiSorgusuCikti = z.output<typeof degisiklikListesiSorgusu>;
type OkumaListesiSorgusuCikti = z.output<typeof okumaListesiSorgusu>;

export interface GovdeOzeti {
  _ozet: { boyut: number; sha256: string };
}

// Gövdesiz uçta gövdenin yerine yazılan: kararlı JSON'un bayt sayısı ve özeti. Maskelenmiş gövde verilir: ham
// gövdenin özeti deftere girerse kısa bir gizli değer (parola, PIN) özetten çevrimdışı denenebilir.
export function govdeOzeti(maskeliGovde: unknown): GovdeOzeti | undefined {
  if (maskeliGovde === undefined) return undefined;
  const metin = Buffer.from(kararliJson(maskeliGovde), 'utf8');
  return { _ozet: { boyut: metin.length, sha256: createHash('sha256').update(metin).digest('hex') } };
}

// Ucun seçtiği alanlar özetin yanına ayrı anahtarla girer; seçim de maskelenir (seçici gizli adlı alanı seçmiş olabilir).
function govdesizKayit(maskeliGovde: unknown, secilen: DenetimGirdisi['secilen']): (GovdeOzeti & { _secilen?: unknown }) | undefined {
  const ozet = govdeOzeti(maskeliGovde);
  return ozet === undefined || secilen === undefined ? ozet : { ...ozet, _secilen: gizle(secilen) };
}

// Ek gövdenin parçasıdır (yalnız gövdeyi okuyabilen görür): ayrılmış `_ek` anahtarına girer. Gövde düz nesne değilse ya da
// kendisi `_ek` taşıyorsa gövde `_govde` altına alınır; ek gövdenin bir alanını ezemez.
function ekli(govde: unknown, ek: DenetimGirdisi['ek']): unknown {
  if (ek === undefined) return govde;
  const maskeliEk = gizle(ek);
  const duz = typeof govde === 'object' && govde !== null && !Array.isArray(govde);
  if (duz && !Object.hasOwn(govde, '_ek')) return { ...govde, _ek: maskeliEk };
  return govde === undefined ? { _ek: maskeliEk } : { _govde: govde, _ek: maskeliEk };
}

// Parametre de maskelenir: gövdesiz uçta satırın tek içerik sütunudur ve yol parametresi gizli değer taşıyabilir.
export const denetimYaz: Denetle = (db, girdi) => {
  if (girdi.kip === 'okuma') return okumaYaz(db, girdi);
  const maskeli = gizle(girdi.govde);
  return sorgular.denetimEkle(db, {
    ...girdi,
    parametre: gizle(girdi.parametre),
    govde: ekli(girdi.kip === 'govdesiz' ? govdesizKayit(maskeli, girdi.secilen) : maskeli, girdi.ek),
  });
};

// 2158-4 a: sınırlı hesabın okuması okuma kaydına girer, denetim kaydına değil. Kişisiz okuma kaydı olmaz: uç katmanı yalnız
// oturumlu sınırlı hesapta çağırır; başka yoldan gelirse yazılmadan reddedilir (çağıran 500 alır, cevap gitmez: 2158-8 a).
async function okumaYaz(db: Db, girdi: DenetimGirdisi): Promise<void> {
  if (girdi.kisiId === null) throw new Error(`Okuma kaydı kişisiz yazılamaz: ${girdi.yontem} ${girdi.yol}`);
  await sorgular.okumaEkle(db, {
    kisiId: girdi.kisiId, modul: girdi.modul ?? null, yol: girdi.yol, parametre: okumaIzi(girdi.parametre), sorgu: okumaIzi(girdi.sorgu),
  });
}

export async function okumaListesi(db: Db, sorgu: OkumaListesiSorgusuCikti): Promise<SayfaliListe<OkumaSatiri>> {
  const s: sorgular.OkumaSuzgeci = {
    kisi: sorgu.kisi ?? null, baslangic: sorgu.baslangic ?? null, bitis: sorgu.bitis ?? null, modul: sorgu.modul ?? null,
  };
  return sayfaliListe(sorgu, {
    say: (ust) => sorgular.okumaSay(db, s, ust),
    sayimSiniri: SAYIM_SINIRI,
    satirlar: async (dilim) => {
      const ham = await sorgular.okumalar(db, s, dilim);
      const adlar = await kisiAdlari(db, ham.map((o) => o.kisi_id));
      // Kayıt yazılırken süzülmüştür; okurken yeniden süzülür: kural sonradan daralırsa eski satırdaki değer de çıkmaz.
      return ham.map((o) => ({
        id: o.id, zaman: o.zaman, kisiId: o.kisi_id, kisiAd: adlar.get(o.kisi_id) ?? null, modul: o.modul, yol: o.yol,
        kimlikler: kimlikParametreleri(o.parametre), sorguKimlikleri: kimlikParametreleri(o.sorgu),
      }));
    },
  });
}

export const eskiOkumalariSil = (db: Db): Promise<number> => sorgular.eskiOkumalariSil(db, OKUMA_SAKLAMA_GUN);

const suzgec = (s: KayitListesiSorgusuCikti): sorgular.KayitSuzgeci => ({
  kisi: s.kisi ?? null, baslangic: s.baslangic ?? null, bitis: s.bitis ?? null, yontem: s.yontem ?? null, modul: s.modul ?? null,
  yol: s.yol !== undefined && s.yolTam ? s.yol : null,
  yolKalibi: s.yol !== undefined && !s.yolTam ? icerenKalibi(s.yol) : null,
});

export async function kayitListesi(db: Db, sorgu: KayitListesiSorgusuCikti): Promise<SayfaliListe<KayitSatiri>> {
  const s = suzgec(sorgu);
  return sayfaliListe(sorgu, {
    say: (ust) => sorgular.kayitSay(db, s, ust),
    sayimSiniri: SAYIM_SINIRI,
    satirlar: async (dilim) => {
      const ham = await sorgular.kayitlar(db, s, dilim);
      const adlar = await kisiAdlari(db, ham.flatMap((k) => (k.kisi_id === null ? [] : [k.kisi_id])));
      return ham.map((k) => ({
        id: k.id, zaman: k.zaman, kisiId: k.kisi_id, kisiAd: k.kisi_id === null ? null : adlar.get(k.kisi_id) ?? null,
        yontem: k.yontem, yol: k.yol, modul: k.modul, yetki: k.yetki, kimlikler: kimlikParametreleri(k.parametre),
      }));
    },
  });
}

export async function suzgecSecenekleri(db: Db): Promise<SuzgecSecenekleriCevabi> {
  const adlar = await kisiAdlari(db, await sorgular.kayitliKisiler(db));
  const kisiler = [...adlar].map(([id, ad]) => ({ id, ad })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.id - b.id);
  return { kisiler, moduller: await sorgular.kayitliModuller(db), komutlar: await sorgular.kayitliKomutlar(db) };
}

// Kayıt yazılırken maskelenmiştir; okurken yeniden maskelenir: kural sonradan genişlediyse eski satırdaki değer de çıkmaz.
export async function kayitIcerigi(db: Db, id: number): Promise<{ id: number; parametre: unknown; govde: unknown }> {
  const kayit = await sorgular.kayitIcerigi(db, id);
  if (!kayit) throw bulunamadi('Denetim kaydı bulunamadı.');
  return { id: kayit.id, parametre: gizle(kayit.parametre), govde: gizle(kayit.govde) };
}

export async function degisiklikListesi(db: Db, sorgu: DegisiklikListesiSorgusuCikti): Promise<SayfaliListe<DegisiklikSatiri>> {
  const s: sorgular.DegisiklikSuzgeci = {
    kisi: sorgu.kisi ?? null, baslangic: sorgu.baslangic ?? null, bitis: sorgu.bitis ?? null, tablo: sorgu.tablo ?? null,
    kayitlar: sorgu.kayitlar ?? null,
  };
  return sayfaliListe(sorgu, {
    say: (ust) => sorgular.degisiklikSay(db, s, ust),
    sayimSiniri: SAYIM_SINIRI,
    satirlar: async (dilim) => {
      const ham = await sorgular.degisiklikler(db, s, dilim);
      const adlar = await kisiAdlari(db, ham.flatMap((d) => (d.kisi_id === null ? [] : [d.kisi_id])));
      return ham.map((d) => ({
        id: d.id, zaman: d.zaman, kisiId: d.kisi_id, kisiAd: d.kisi_id === null ? null : adlar.get(d.kisi_id) ?? null,
        tablo: d.tablo, anahtar: d.anahtar, islem: d.islem, alanAdlari: d.alan_adlari,
      }));
    },
  });
}

export async function degisiklikSecenekleri(db: Db): Promise<DegisiklikSecenekleriCevabi> {
  const adlar = await kisiAdlari(db, await sorgular.degisiklikKisileri(db));
  const kisiler = [...adlar].map(([id, ad]) => ({ id, ad })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.id - b.id);
  return { kisiler, tablolar: await sorgular.degisiklikTablolari(db) };
}

// Değer okurken maskelenir: defter tetikle yazılır ve maskeleme kuralı sonradan genişleyebilir.
export async function degisiklikIcerigi(db: Db, id: number): Promise<{ id: number; alanlar: DegisiklikAlani[] }> {
  const kayit = await sorgular.degisiklikIcerigi(db, id);
  if (!kayit) throw bulunamadi('Değişiklik kaydı bulunamadı.');
  return { id: kayit.id, alanlar: degisiklikAlanlari(kayit.alanlar) };
}

export interface DegisiklikAkisiIstegi {
  // Tablo -> değeri gösterilecek sütunlar (okuyan modülün sözlüğü).
  tablolar: Readonly<Record<string, readonly string[]>>;
  // timestamptz metni; bu andan (dahil) bu yana.
  baslangic: string;
  sinir: number;
  // Sayfalama: önceki sayfanın son satırının kimliği.
  onceId?: number;
}

export interface DegisiklikAkisiSatiri {
  id: number;
  zaman: string;
  kisiId: number | null;
  kisiAd: string | null;
  tablo: string;
  anahtar: Record<string, number | string | boolean>;
  islem: 'ekle' | 'guncelle' | 'sil';
  alanlar: DegisiklikAlani[];
  digerAlanlar: string[];
}

// Yetki denetlemez: çağıran modülün ucu kendi işlemiyle denetler (1966 a). Ham gövde ve sözlük dışı değer dönmez.
export async function degisiklikAkisi(db: Db, istek: DegisiklikAkisiIstegi): Promise<DegisiklikAkisiSatiri[]> {
  const hata = akisIstegiHatasi(istek);
  if (hata !== null) throw gecersiz(hata);
  const ham = await sorgular.akisSatirlari(db, {
    tablolar: Object.keys(istek.tablolar), baslangic: istek.baslangic, onceId: istek.onceId ?? null, sinir: istek.sinir,
  });
  const adlar = await kisiAdlari(db, ham.flatMap((d) => (d.kisi_id === null ? [] : [d.kisi_id])));
  return ham.map((d) => ({
    id: d.id, zaman: d.zaman, kisiId: d.kisi_id, kisiAd: d.kisi_id === null ? null : adlar.get(d.kisi_id) ?? null,
    tablo: d.tablo, anahtar: d.anahtar, islem: d.islem, ...akisAlanlari(d.alanlar, istek.tablolar[d.tablo] ?? []),
  }));
}
