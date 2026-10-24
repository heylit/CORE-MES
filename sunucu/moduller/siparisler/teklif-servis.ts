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
import { numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { firmaAdlari, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import {
  FIRMA_YOK, NUMARA_UZUN, ONAYLANACAK_ISKONTO_YOK, ONAYLANACAK_TERMIN_YOK, SURUM_YOK, TEKLIF_YOK, aramaKalibi, fiyatReddi, firmaReddi, iskontoOnayiGerekir,
  kartBaglamaReddi, kartsizSatirReddi, malzemeReddi, onayHedefi, talepDuzenlemeReddi, dortGozReddi, surumHedefi, teklifGecisReddi, teklifHedefi,
} from './kurallar.ts';
import type { TeklifKomutu } from './kurallar.ts';
import { siparisEkle } from './servis.ts';
import * as sorgular from './sorgular.ts';
import { satisTaslagiHazirla, satisTaslagiYaz, yerTutaniKaldir } from './teklif-deneme.ts';
import type { TeklifAlanlari, TeklifBaslikSatiri } from './sorgular.ts';

const KISITLAR = {
  siparisler_teklif_firma: { ileti: FIRMA_YOK, alan: 'firmaId' },
  siparisler_teklif_satiri_malzeme: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeNo' },
  siparisler_teklif_no_bicim: NUMARA_UZUN,
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
  const ham = await sorgular.teklifSurumleri(db, id);
  const onaylayanlar = await kisiAdlari(db, ham.flatMap((v) => (v.onaylayan_id === null ? [] : [v.onaylayan_id])));
  const surumler = ham.map((v) => {
    const kendi = fiyatlar.filter((f) => f.surum_id === v.id);
    return {
      surumNo: v.surum_no, iskontoOrani: v.iskonto_orani, teslimGun: v.teslim_gun, terminTarihi: v.termin_tarihi, odemeKosulu: v.odeme_kosulu, gecerlilik: v.gecerlilik,
      aciklama: v.aciklama, olusturma: v.olusturma,
      fiyatlar: kendi.map((f) => ({ satirId: f.satir_id, birimFiyat: f.birim_fiyat, iskontoluFiyat: f.iskontolu_fiyat, tutar: f.tutar })),
      toplam: v.toplam,
      iskontoOnaylayan: v.onaylayan_id === null ? null : (onaylayanlar.get(v.onaylayan_id) ?? null), iskontoOnayAni: v.onay_ani,
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
  const no = await numaraAl(db, 'siparisler.teklif-no', { varMi: (n) => sorgular.teklifNoVarMi(db, n) });
  const id = await kisitKorumali(KISITLAR, () => sorgular.teklifEkle(db, no, alanlar(g), kullanici.id));
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
  // 49, 59-60 a: plan taslağıyla verilen sürümün termini denemeden gelir; sürüm yazılmadan önce denenir.
  const plan = g.planTaslagi !== null && g.gecerlilik !== null ? await satisTaslagiHazirla(db, kullanici, id, g.gecerlilik, g.planTaslagi) : null;
  const terminOnayi = plan?.onayBekler ?? false;
  const hedef = surumHedefi(g.iskontoOrani, terminOnayi);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef, surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  const surum = await sorgular.surumEkle(db, id, { ...g, terminTarihi: plan === null ? g.terminTarihi : plan.termin }, g.fiyatlar, kullanici.id);
  if (hedef === 'verildi') await sorgular.logoTeklifSirasinaEkle(db, id, null);
  if (plan !== null && g.planTaslagi !== null && g.gecerlilik !== null) {
    await satisTaslagiYaz(db, kullanici, id, surum.id, g.gecerlilik, g.planTaslagi, plan.hazirlik);
  } else {
    await yerTutaniKaldir(db, id);
  }
  const t = await teklifAyrintisi(db, id);
  if (iskontoOnayiGerekir(g.iskontoOrani)) {
    await bildirimGonder(db, {
      tur: 'siparisler.iskonto-onay-bekliyor', baslik: `İskonto onayı bekleyen teklif: ${t.no}`, metin: `%${g.iskontoOrani} iskonto`,
      yol: `/siparisler/teklifler/${id}`, kaynakKimlik: String(id), haric: kullanici.id,
    });
  }
  if (terminOnayi) {
    await bildirimGonder(db, {
      tur: 'siparisler.termin-onay-bekliyor', baslik: `Termin onayı bekleyen teklif: ${t.no}`, metin: `İstenen termin ${g.planTaslagi?.istenenTermin ?? ''} başka siparişi geciktiriyor`,
      yol: `/siparisler/teklifler/${id}`, kaynakKimlik: String(id), haric: kullanici.id,
    });
  }
  return t;
}

async function bekleyenOnaylar(db: Db, id: number): Promise<{ iskonto: boolean; termin: boolean }> {
  const son = await sorgular.sonSurumIskontosu(db, id);
  const yer = await sorgular.yerTutanTaslak(db, id);
  return { iskonto: son !== null && iskontoOnayiGerekir(son.iskonto_orani) && !son.onayli, termin: yer?.durum === 'onay-bekliyor' };
}

// 291 a: müdür son sürümün iskontosunu onaylar. Termin onayı da bekleniyorsa teklif plancıyı bekler (63 b). Geri çevirmek yeni sürüm ya da redle olur.
export async function iskontoOnayla(db: Db, kullanici: Kullanici, id: number, g: { surum: number }): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'iskonto-onay');
  const bekleyen = await bekleyenOnaylar(db, id);
  if (!bekleyen.iskonto) throw gecersiz(ONAYLANACAK_ISKONTO_YOK);
  const veren = await sorgular.sonSurumuVeren(db, id);
  const ret = veren === null ? null : dortGozReddi(await sistemAyariOku(db, 'siparisler.iskonto-dort-goz'), veren, kullanici.id);
  if (ret !== null) throw gecersiz(ret);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: onayHedefi({ ...bekleyen, iskonto: false }), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  await sorgular.iskontoOnayiEkle(db, id, kullanici.id);
  if (onayHedefi({ ...bekleyen, iskonto: false }) === 'verildi') await sorgular.logoTeklifSirasinaEkle(db, id, null);
  return teklifAyrintisi(db, id);
}

// TKL-15 (63 b): istenen termin bir siparişi geciktiren satış taslağını plancı (`plan.yaz`) onaylar; onaya kadar yer tutar,
// teklif müşteriye verilmiş sayılmaz. İskonto onayı da bekleniyorsa teklif müdürü bekler.
export async function terminOnayla(db: Db, kullanici: Kullanici, id: number, g: { surum: number }): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'termin-onay');
  const bekleyen = await bekleyenOnaylar(db, id);
  if (!bekleyen.termin) throw gecersiz(ONAYLANACAK_TERMIN_YOK);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: onayHedefi({ ...bekleyen, termin: false }), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  if ((await sorgular.terminOnayiYaz(db, id, kullanici.id)) === null) throw new Error('Termin onayı yazılamadı');
  if (onayHedefi({ ...bekleyen, termin: false }) === 'verildi') await sorgular.logoTeklifSirasinaEkle(db, id, null);
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
  if (komut === 'red') await yerTutaniKaldir(db, id);
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
  // Logo siparişi kabul edilen sürümün teklifinden açılır; o sürüm sıraya girmemişse (H10'dan önce verilmiş) burada girer.
  await sorgular.logoTeklifSirasinaEkle(db, id, kabul.surumNo);
  await sorgular.logoSiparisSirasinaEkle(db, id, kabul.surumNo, siparis.id);
  // Sipariş plana kendi emriyle girer; satış taslağının yeri kalkar.
  await yerTutaniKaldir(db, id);
  return { teklif: await teklifAyrintisi(db, id), siparisId: siparis.id };
}

// Portal talep listesi (254 a): tek sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok.
export async function teklifDurumlari(db: Db, idler: readonly number[]): Promise<Map<number, TeklifDurumu>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.teklifDurumlariniBul(db, tekil)).map((t) => [t.id, t.durum]));
}
