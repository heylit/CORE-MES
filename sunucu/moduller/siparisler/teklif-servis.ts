import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  SiparisDonusumVerisi, Teklif, TeklifAyrintisi, TeklifDurumu, TeklifEkleVerisi, TeklifGuncelleVerisi, TeklifListesiSuzgeci, TeklifSurumuVerisi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { firmaAdlari, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import {
  FIRMA_YOK, SURUM_YOK, TEKLIF_YOK, aramaKalibi, fiyatReddi, firmaReddi, kartBaglamaReddi, kartsizSatirReddi, malzemeReddi, talepDuzenlemeReddi,
  teklifGecisReddi, teklifHedefi, teklifNo,
} from './kurallar.ts';
import type { TeklifKomutu } from './kurallar.ts';
import { siparisEkle } from './servis.ts';
import * as sorgular from './sorgular.ts';
import type { TeklifAlanlari, TeklifBaslikSatiri } from './sorgular.ts';

const KISITLAR = {
  siparisler_teklif_firma: { ileti: FIRMA_YOK, alan: 'firmaId' },
  siparisler_teklif_satiri_malzeme: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeNo' },
} as const;

async function cevir(db: Db, satirlar: TeklifBaslikSatiri[]): Promise<Teklif[]> {
  const adlar = await firmaAdlari(db, satirlar.map((s) => s.firma_id));
  return satirlar.map((s) => ({
    id: s.id, no: s.no, durum: s.durum, firmaId: s.firma_id, firmaAd: adlar.get(s.firma_id) ?? null, baslik: s.baslik,
    paraBirimi: s.para_birimi, istenenTarih: s.istenen_tarih, aciklama: s.aciklama, not: s.not_metni, kabulSurumu: s.kabul_surumu,
    siparisId: s.siparis_id, sonSurumNo: s.son_surum_no, olusturma: s.olusturma, guncelleme: s.guncelleme, surum: s.surum,
  }));
}

export async function teklifListesi(db: Db, sorgu: TeklifListesiSuzgeci): Promise<SayfaliListe<Teklif>> {
  const suzgec = { kalip: aramaKalibi(sorgu.ara), durum: sorgu.durum ?? null, firmaId: sorgu.firmaId ?? null };
  return sayfaliListe(sorgu, {
    say: () => sorgular.teklifSay(db, suzgec),
    satirlar: async (dilim) => cevir(db, await sorgular.teklifSatirlari(db, suzgec, sorgu, dilim)),
  });
}

export async function teklifAyrintisi(db: Db, id: number): Promise<TeklifAyrintisi> {
  const satir = await sorgular.teklifGetir(db, id);
  if (satir === null) throw bulunamadi(TEKLIF_YOK);
  const [teklif] = await cevir(db, [satir]);
  if (teklif === undefined) throw new Error('Teklif çevrilemedi');
  const talep = await sorgular.talepSatirlari(db, id);
  const kartlar = await malzemeOzetleri(db, talep.flatMap((t) => (t.malzeme_no === null ? [] : [t.malzeme_no])));
  const fiyatlar = await sorgular.teklifFiyatlari(db, id);
  const surumler = (await sorgular.teklifSurumleri(db, id)).map((v) => {
    const kendi = fiyatlar.filter((f) => f.surum_id === v.id);
    return {
      surumNo: v.surum_no, iskontoOrani: v.iskonto_orani, teslimGun: v.teslim_gun, odemeKosulu: v.odeme_kosulu, gecerlilik: v.gecerlilik,
      aciklama: v.aciklama, olusturma: v.olusturma,
      fiyatlar: kendi.map((f) => ({ satirId: f.satir_id, birimFiyat: f.birim_fiyat, iskontoluFiyat: f.iskontolu_fiyat, tutar: f.tutar })),
      toplam: v.toplam,
    };
  });
  return {
    ...teklif,
    satirlar: talep.map((t) => {
      const kart = t.malzeme_no === null ? undefined : kartlar.get(t.malzeme_no);
      return { id: t.id, sira: t.sira, malzemeNo: t.malzeme_no, malzemeKodu: kart?.kod ?? null, tanim: t.tanim, birim: kart?.birim ?? null, miktar: t.miktar };
    }),
    surumler,
  };
}

async function firmayiDenetle(db: Db, firmaId: number, mevcut: number | null): Promise<void> {
  const ret = firmaReddi(await firmaOzeti(db, firmaId), firmaId, mevcut);
  if (ret !== null) throw dogrulama(ret, 'firmaId');
}

// Talepte kart isteğe bağlıdır; verilen kart SIP-02'ye uymalı.
async function kartlariDenetle(db: Db, nolar: (number | null)[], alan: (i: number) => string): Promise<void> {
  const kartlar = await malzemeOzetleri(db, nolar.flatMap((m) => (m === null ? [] : [m])));
  nolar.forEach((m, i) => {
    if (m === null) return;
    const ret = malzemeReddi(kartlar.get(m) ?? null);
    if (ret !== null) throw dogrulama(ret, alan(i));
  });
}

const alanlar = (g: TeklifEkleVerisi): TeklifAlanlari => ({
  firmaId: g.firmaId, baslik: g.baslik, paraBirimi: g.paraBirimi, istenenTarih: g.istenenTarih, aciklama: g.aciklama,
});

export async function teklifEkle(db: Db, kullanici: Kullanici, g: TeklifEkleVerisi): Promise<TeklifAyrintisi> {
  await firmayiDenetle(db, g.firmaId, null);
  await kartlariDenetle(db, g.satirlar.map((s) => s.malzemeNo), (i) => `satirlar.${i}.malzemeNo`);
  const { yil, sira } = await sorgular.siradakiTeklifNo(db);
  const id = await kisitKorumali(KISITLAR, () => sorgular.teklifEkle(db, teklifNo(yil, sira), alanlar(g), kullanici.id));
  await sorgular.talepSatirlariniYaz(db, id, g.satirlar);
  return teklifAyrintisi(db, id);
}

async function kilitle(db: Db, id: number): Promise<{ durum: TeklifDurumu; firma_id: number; para_birimi: string }> {
  const mevcut = await sorgular.teklifKilitle(db, id);
  if (mevcut === null) throw bulunamadi(TEKLIF_YOK);
  return mevcut;
}

const surumluYaz = (db: Db, id: number, guncelle: () => Promise<{ id: number } | null>) =>
  kisitKorumali(KISITLAR, () => surumluGuncelle({ guncelle, varMi: () => sorgular.teklifVarMi(db, id), bulunamadiIletisi: TEKLIF_YOK }));

function gecisDenetle(durum: TeklifDurumu, komut: TeklifKomutu): void {
  const ret = teklifGecisReddi(durum, komut);
  if (ret !== null) throw gecersiz(ret);
}

export async function teklifGuncelle(db: Db, kullanici: Kullanici, id: number, g: TeklifGuncelleVerisi): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  const ret = talepDuzenlemeReddi(mevcut.durum);
  if (ret !== null) throw gecersiz(ret);
  await firmayiDenetle(db, g.firmaId, mevcut.firma_id);
  await kartlariDenetle(db, g.satirlar.map((s) => s.malzemeNo), (i) => `satirlar.${i}.malzemeNo`);
  await surumluYaz(db, id, () => sorgular.teklifGuncelle(db, id, alanlar(g), g.surum, kullanici.id));
  await sorgular.talepSatirlariniYaz(db, id, g.satirlar);
  return teklifAyrintisi(db, id);
}

export async function surumVer(db: Db, kullanici: Kullanici, id: number, g: TeklifSurumuVerisi): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'surum');
  const talep = await sorgular.talepSatirlari(db, id);
  const ret = fiyatReddi(talep.map((t) => t.id), g.fiyatlar.map((f) => f.satirId));
  if (ret !== null) throw dogrulama(ret, 'fiyatlar');
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: teklifHedefi('surum'), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  await sorgular.surumEkle(db, id, g, g.fiyatlar, kullanici.id);
  return teklifAyrintisi(db, id);
}

export async function notluGecis(
  db: Db, kullanici: Kullanici, id: number, komut: 'revizyon' | 'red', g: { surum: number; not: string },
): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, komut);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: teklifHedefi(komut), surum: g.surum, kisiId: kullanici.id, not: g.not, kabulSurumu: null, siparisId: null,
  }));
  return teklifAyrintisi(db, id);
}

export async function kabulEt(db: Db, kullanici: Kullanici, id: number, g: { surum: number; surumNo: number }): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'kabul');
  if (!(await sorgular.teklifSurumleri(db, id)).some((v) => v.surum_no === g.surumNo)) throw dogrulama(SURUM_YOK, 'surumNo');
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: teklifHedefi('kabul'), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: g.surumNo, siparisId: null,
  }));
  return teklifAyrintisi(db, id);
}

export async function kartBagla(
  db: Db, kullanici: Kullanici, id: number, satirId: number, g: { surum: number; malzemeNo: number },
): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  const ret = kartBaglamaReddi(mevcut.durum);
  if (ret !== null) throw gecersiz(ret);
  await kartlariDenetle(db, [g.malzemeNo], () => 'malzemeNo');
  await surumluYaz(db, id, () => sorgular.teklifSurumuArtir(db, id, g.surum, kullanici.id));
  if ((await kisitKorumali(KISITLAR, () => sorgular.kartBagla(db, id, satirId, g.malzemeNo))) === null) throw bulunamadi('Teklif satırı bulunamadı.');
  return teklifAyrintisi(db, id);
}

// TKL-07: kabul edilen sürümün iskontolu fiyatlarıyla taslak sipariş açılır; teklif siparişe bağlanır. Sipariş kuralları (SIP-01, 02, 07, 08) aynen işler.
export async function siparisDonustur(
  db: Db, kullanici: Kullanici, id: number, g: SiparisDonusumVerisi,
): Promise<{ teklif: TeklifAyrintisi; siparisId: number }> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'siparis');
  const teklif = await teklifAyrintisi(db, id);
  const kartsiz = kartsizSatirReddi(teklif.satirlar.map((s) => s.malzemeNo));
  if (kartsiz !== null) throw gecersiz(kartsiz);
  const kabul = teklif.surumler.find((v) => v.surumNo === teklif.kabulSurumu);
  if (kabul === undefined) throw new Error('Kabul edilen sürüm bulunamadı');
  const fiyat = new Map(kabul.fiyatlar.map((f) => [f.satirId, f.iskontoluFiyat]));
  const siparis = await siparisEkle(db, kullanici, {
    firmaId: mevcut.firma_id, musteriSiparisNo: g.musteriSiparisNo, siparisTarihi: g.siparisTarihi, termin: g.termin,
    paraBirimi: mevcut.para_birimi, kdvOrani: g.kdvOrani, odemeKosulu: kabul.odemeKosulu, aciklama: `${teklif.no} teklifinden (sürüm ${kabul.surumNo}).`,
    cezaOraniGun: g.cezaOraniGun, cezaTavaniOrani: g.cezaTavaniOrani, odemeVadesiGun: g.odemeVadesiGun,
    satirlar: teklif.satirlar.map((s) => ({
      malzemeNo: s.malzemeNo ?? 0, miktar: s.miktar, birimFiyat: fiyat.get(s.id) ?? null, termin: null, aciklama: null,
    })),
  });
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: teklifHedefi('siparis'), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: siparis.id,
  }));
  return { teklif: await teklifAyrintisi(db, id), siparisId: siparis.id };
}

// Portal talep listesi (254 a): tek sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok.
export async function teklifDurumlari(db: Db, idler: readonly number[]): Promise<Map<number, TeklifDurumu>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.teklifDurumlariniBul(db, tekil)).map((t) => [t.id, t.durum]));
}
