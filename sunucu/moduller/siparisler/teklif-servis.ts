import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { DenetimSecimi } from '#cekirdek/uc.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { PARA_BIRIMI_LISTEDE_YOK, paraBirimiSemasi } from '#paylasilan/sozlesme/siparisler.ts';
import type {
  SiparisDonusumVerisi, Teklif, TeklifArsivVerisi, TeklifAyrintisi, TeklifDurumu, TeklifEkleVerisi, TeklifFormuMetni, TeklifGuncelleVerisi, TeklifListesiSuzgeci,
  TeklifSilmeCevabi, TeklifSiparisUygulaVerisi, TeklifSurumuVerisi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { firmaKoduSecimi, numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { bildirimGonder, bildirimKapat, kalanGun } from '../bildirim/disari.ts';
import { olayAlanlari } from '#paylasilan/sozlesme/bildirim-kural-sabitleri.ts';
import { kdvSecenekleri } from '../finans/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzetleri, malzemeSatinAlmaAyrintilari, malzemeYerlilikOranlari, satisBirimleri } from '../malzemeler/disari.ts';
import { firmaAdlari, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import {
  ARSIVDE_DEGIL, UYGULA_KALEM_UYUMSUZ, arsivdeReddi, arsivReddi, silmeReddi, silmeYetkisiReddi, BIRIM_LISTEDE_YOK, FIRMA_YOK, NUMARA_UZUN, ONAYLANACAK_ISKONTO_YOK, ONAYLANACAK_TERMIN_YOK, SURUM_YOK, TEKLIF_YOK, aramaKalibi, fiyatReddi, firmaReddi, iskontoOnayiGerekir,
  formMetniReddi, kartBaglamaReddi, kartsizSatirReddi, malzemeReddi, miktarReddi, onayHedefi, talepDuzenlemeReddi, talepKalemi, dortGozReddi, surumHedefi, surumDurumu, kabulSonrasiPlanReddi, yenidenKabulReddi, siparisUygulaReddi, teklifGecisReddi, teklifHedefi,
} from './kurallar.ts';
import type { TeklifKomutu } from './kurallar.ts';
import { siparisAyrintisi, siparisEkle, siparisRevizeEt } from './servis.ts';
import * as sorgular from './sorgular.ts';
import { satisTaslagiHazirla, satisTaslagiYaz, yerTutaniKaldir } from './teklif-deneme.ts';
import type { KilitliTeklif, TeklifAlanlari, TeklifBaslikSatiri } from './sorgular.ts';

const KISITLAR = {
  siparisler_teklif_firma: { ileti: FIRMA_YOK, alan: 'firmaId' },
  siparisler_teklif_satiri_malzeme: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeNo' },
  siparisler_teklif_no_bicim: NUMARA_UZUN,
} as const;

async function cevir(db: Db, satirlar: TeklifBaslikSatiri[]): Promise<Teklif[]> {
  const adlar = await firmaAdlari(db, satirlar.map((s) => s.firma_id));
  const arsivleyenler = await kisiAdlari(db, satirlar.flatMap((s) => (s.arsivleyen_id === null ? [] : [s.arsivleyen_id])));
  return satirlar.map((s) => ({
    id: s.id, no: s.no, durum: s.durum, firmaId: s.firma_id, firmaAd: adlar.get(s.firma_id) ?? null, firmaKodu: s.firma_kodu, baslik: s.baslik,
    paraBirimi: s.para_birimi, istenenTarih: s.istenen_tarih, aciklama: s.aciklama, not: s.not_metni, kabulSurumu: s.kabul_surumu,
    siparisId: s.siparis_id, sonSurumNo: s.son_surum_no, olusturma: s.olusturma, guncelleme: s.guncelleme, surum: s.surum,
    olusturanId: s.olusturan_id,
    arsiv: s.arsiv_an === null || s.arsiv_nedeni === null ? null : {
      an: s.arsiv_an, kisi: s.arsivleyen_id === null ? null : (arsivleyenler.get(s.arsivleyen_id) ?? null), neden: s.arsiv_nedeni, not: s.arsiv_notu,
    },
  }));
}

export async function teklifListesi(db: Db, sorgu: TeklifListesiSuzgeci): Promise<SayfaliListe<Teklif>> {
  const suzgec = { kalip: aramaKalibi(sorgu.ara), durum: sorgu.durum ?? null, firmaId: sorgu.firmaId ?? null, arsiv: sorgu.arsiv === 'evet' };
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
  const nolar = talep.flatMap((t) => (t.malzeme_no === null ? [] : [t.malzeme_no]));
  const kartlar = await malzemeOzetleri(db, nolar);
  const ayrintilar = await malzemeSatinAlmaAyrintilari(db, nolar);
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
      kdvOrani: v.kdv_orani, kdvTutari: v.kdv_tutari, genelToplam: v.genel_toplam,
      iskontoOnaylayan: v.onaylayan_id === null ? null : (onaylayanlar.get(v.onaylayan_id) ?? null), iskontoOnayAni: v.onay_ani,
    };
  });
  return {
    ...teklif,
    satirlar: talep.map((t) => {
      const kart = t.malzeme_no === null ? undefined : kartlar.get(t.malzeme_no);
      const aciklamalar = t.malzeme_no === null ? [] : (ayrintilar.get(t.malzeme_no)?.aciklamalar ?? []);
      return {
        id: t.id, sira: t.sira, malzemeNo: t.malzeme_no, malzemeKodu: kart?.kod ?? null, malzemeAdi: kart?.ad ?? null, aciklamalar,
        tanim: t.tanim, birim: t.birim ?? kart?.birim ?? null, miktar: t.miktar, yerlilikOrani: t.yerlilik_orani,
      };
    }),
    surumler,
    siparisteSurumNo: teklif.siparisId === null ? null : await sorgular.siparistekiTeklifSurumu(db, teklif.siparisId),
    kdvSecenekleri: await kdvSecenekleri(db, tesisGunu(Date.now())),
  };
}

async function firmayiDenetle(db: Db, firmaId: number, mevcut: number | null): Promise<void> {
  const ret = firmaReddi(await firmaOzeti(db, firmaId), firmaId, mevcut);
  if (ret !== null) throw dogrulama(ret, 'firmaId');
}

// Talepte kart isteğe bağlıdır; verilen kart SIP-02'ye uymalı ve adet birimli kartta miktar tam sayıdır (SIP-4 a).
async function kartlariDenetle(
  db: Db, satirlar: readonly { malzemeNo: number | null; miktar: string }[], alan: (i: number, ad: 'malzemeNo' | 'miktar') => string,
): Promise<void> {
  const kartlar = await malzemeOzetleri(db, satirlar.flatMap((s) => (s.malzemeNo === null ? [] : [s.malzemeNo])));
  satirlar.forEach((s, i) => {
    if (s.malzemeNo === null) return;
    const kart = kartlar.get(s.malzemeNo) ?? null;
    const ret = malzemeReddi(kart);
    if (ret !== null) throw dogrulama(ret, alan(i, 'malzemeNo'));
    const miktar = miktarReddi(kart?.birim ?? null, s.miktar);
    if (miktar !== null) throw dogrulama(miktar, alan(i, 'miktar'));
  });
}

// 3400-2/3: kalemin yazılacak birimi ve yerlilik oranı; kartsız kalemin birimi aktif listede olmalı.
async function talepKalemleri(db: Db, satirlar: TeklifEkleVerisi['satirlar']): Promise<TeklifEkleVerisi['satirlar']> {
  const oranlar = await malzemeYerlilikOranlari(db, satirlar.flatMap((s) => (s.malzemeNo === null ? [] : [s.malzemeNo])));
  const birimler = new Set((await satisBirimleri(db)).map((b) => b.kod));
  return satirlar.map((s, i) => {
    if (s.malzemeNo === null && s.birim !== null && !birimler.has(s.birim)) throw dogrulama(BIRIM_LISTEDE_YOK, `satirlar.${i}.birim`);
    return talepKalemi(s, s.malzemeNo === null ? null : (oranlar.get(s.malzemeNo) ?? null));
  });
}

const alanlar = (g: TeklifEkleVerisi): TeklifAlanlari => ({
  firmaId: g.firmaId, baslik: g.baslik, paraBirimi: g.paraBirimi, istenenTarih: g.istenenTarih, aciklama: g.aciklama,
});

export async function teklifEkle(db: Db, kullanici: Kullanici, g: TeklifEkleVerisi): Promise<TeklifAyrintisi> {
  await firmayiDenetle(db, g.firmaId, null);
  await kartlariDenetle(db, g.satirlar, (i, ad) => `satirlar.${i}.${ad}`);
  // 3399 a: seçilmediyse varsayılan kod; numara bu kodla verilir.
  const firmaKodu = await firmaKoduSecimi(db, g.firmaKodu, 'firmaKodu');
  const no = await numaraAl(db, 'siparisler.teklif-no', { alanlar: { FIRMA: firmaKodu }, varMi: (n) => sorgular.teklifNoVarMi(db, n) });
  const id = await kisitKorumali(KISITLAR, () => sorgular.teklifEkle(db, no, { ...alanlar(g), firmaKodu }, kullanici.id));
  await sorgular.talepSatirlariniYaz(db, id, await talepKalemleri(db, g.satirlar));
  return teklifAyrintisi(db, id);
}

async function kilitleArsivDahil(db: Db, id: number): Promise<KilitliTeklif> {
  const mevcut = await sorgular.teklifKilitle(db, id);
  if (mevcut === null) throw bulunamadi(TEKLIF_YOK);
  return mevcut;
}

// 3419 a (Risk K1): arşivdeki teklife hiçbir komut işlemez; denetim satır kilidi altındadır.
async function kilitle(db: Db, id: number): Promise<KilitliTeklif> {
  const mevcut = await kilitleArsivDahil(db, id);
  const ret = arsivdeReddi(mevcut.arsivde);
  if (ret !== null) throw gecersiz(ret);
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
  await kartlariDenetle(db, g.satirlar, (i, ad) => `satirlar.${i}.${ad}`);
  await surumluYaz(db, id, () => sorgular.teklifGuncelle(db, id, alanlar(g), g.surum, kullanici.id));
  await sorgular.talepSatirlariniYaz(db, id, await talepKalemleri(db, g.satirlar));
  return teklifAyrintisi(db, id);
}

export async function surumVer(db: Db, kullanici: Kullanici, id: number, g: TeklifSurumuVerisi): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'surum');
  // 3637: kabul edilmiş teklifin plandaki yeri değişmez; plan taslaklı sürüm de, yeri kaldıran elle sürüm de bu durumda yoktur.
  const planRet = kabulSonrasiPlanReddi(mevcut.durum, g.planTaslagi !== null);
  if (planRet !== null) throw dogrulama(planRet, 'planTaslagi');
  const kabulSonrasi = mevcut.durum === 'kabul' || mevcut.durum === 'siparis';
  const talep = await sorgular.talepSatirlari(db, id);
  const ret = fiyatReddi(talep.map((t) => t.id), g.fiyatlar.map((f) => f.satirId));
  if (ret !== null) throw dogrulama(ret, 'fiyatlar');
  // 49, 59-60 a: plan taslağıyla verilen sürümün termini denemeden gelir; sürüm yazılmadan önce denenir.
  const plan = g.planTaslagi !== null && g.gecerlilik !== null ? await satisTaslagiHazirla(db, kullanici, id, g.gecerlilik, g.planTaslagi) : null;
  const terminOnayi = plan?.onayBekler ?? false;
  const hedef = surumHedefi(g.iskontoOrani, terminOnayi);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: surumDurumu(mevcut.durum, hedef), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  const surum = await sorgular.surumEkle(db, id, { ...g, terminTarihi: plan === null ? g.terminTarihi : plan.termin }, g.fiyatlar, kullanici.id);
  if (hedef === 'verildi') await sorgular.logoTeklifSirasinaEkle(db, id, null);
  if (plan !== null && g.planTaslagi !== null && g.gecerlilik !== null) {
    await satisTaslagiYaz(db, kullanici, id, surum.id, g.gecerlilik, g.planTaslagi, plan.hazirlik);
  } else if (!kabulSonrasi) {
    await yerTutaniKaldir(db, id);
  }
  const t = await teklifAyrintisi(db, id);
  if (iskontoOnayiGerekir(g.iskontoOrani)) {
    await bildirimGonder(db, {
      tur: 'siparisler.iskonto-onay-bekliyor', baslik: `İskonto onayı bekleyen teklif: ${t.no}`, metin: `%${g.iskontoOrani} iskonto`,
      yol: `/siparisler/teklifler/${id}`, kaynakKimlik: String(id), haric: kullanici.id, alanlar: olayAlanlari('siparisler.iskonto-onay-bekliyor', { iskonto_orani: g.iskontoOrani }),
    });
  }
  if (terminOnayi) {
    await bildirimGonder(db, {
      tur: 'siparisler.termin-onay-bekliyor', baslik: `Termin onayı bekleyen teklif: ${t.no}`, metin: `İstenen termin ${g.planTaslagi?.istenenTermin ?? ''} başka siparişi geciktiriyor`,
      yol: `/siparisler/teklifler/${id}`, kaynakKimlik: String(id), haric: kullanici.id,
      alanlar: olayAlanlari('siparisler.termin-onay-bekliyor', { termine_kalan_gun: kalanGun(g.planTaslagi?.istenenTermin, Date.now()) }),
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
    hedef: surumDurumu(mevcut.durum, onayHedefi({ ...bekleyen, iskonto: false })), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  await sorgular.iskontoOnayiEkle(db, id, kullanici.id);
  if (onayHedefi({ ...bekleyen, iskonto: false }) === 'verildi') await sorgular.logoTeklifSirasinaEkle(db, id, null);
  return onaySonucunuBildir(db, kullanici, id, 'iskonto', veren);
}

// TKL-15 (63 b): istenen termin bir siparişi geciktiren satış taslağını `siparisler.termin-onayla` yetkilisi onaylar; onaya kadar yer tutar,
// teklif müşteriye verilmiş sayılmaz. İskonto onayı da bekleniyorsa teklif müdürü bekler.
export async function terminOnayla(db: Db, kullanici: Kullanici, id: number, g: { surum: number }): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'termin-onay');
  const bekleyen = await bekleyenOnaylar(db, id);
  if (!bekleyen.termin) throw gecersiz(ONAYLANACAK_TERMIN_YOK);
  const veren = await sorgular.sonSurumuVeren(db, id);
  const ret = veren === null ? null : dortGozReddi(await sistemAyariOku(db, 'siparisler.termin-dort-goz'), veren, kullanici.id, 'termin');
  if (ret !== null) throw gecersiz(ret);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: onayHedefi({ ...bekleyen, termin: false }), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: null, siparisId: null,
  }));
  if ((await sorgular.terminOnayiYaz(db, id, kullanici.id)) === null) throw new Error('Termin onayı yazılamadı');
  if (onayHedefi({ ...bekleyen, termin: false }) === 'verildi') await sorgular.logoTeklifSirasinaEkle(db, id, null);
  return onaySonucunuBildir(db, kullanici, id, 'termin', veren);
}

// 3478: onaylanan iskonto ya da termin için bekleyen onay işi kapanır, sürümü veren haber alır (olay varsayılan kapalı).
async function onaySonucunuBildir(db: Db, kullanici: Kullanici, id: number, ne: 'iskonto' | 'termin', veren: number | null): Promise<TeklifAyrintisi> {
  await bildirimKapat(db, { tur: ne === 'iskonto' ? 'siparisler.iskonto-onay-bekliyor' : 'siparisler.termin-onay-bekliyor', kaynakKimlik: String(id) });
  const t = await teklifAyrintisi(db, id);
  if (veren !== null) {
    await bildirimGonder(db, {
      tur: ne === 'iskonto' ? 'siparisler.iskonto-onaylandi' : 'siparisler.termin-onaylandi',
      baslik: `${ne === 'iskonto' ? 'İskontosu' : 'Termini'} onaylanan teklif: ${t.no}`, yol: `/siparisler/teklifler/${id}`, kaynakKimlik: String(id), kisiler: [veren], haric: kullanici.id,
    });
  }
  return t;
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

// 3328: teklife özel form metni; fiyat ve kalem değişmez, yalnız basılan metin. Kabul, red ve siparişte kapalı; null şablona döner.
export async function formMetniKaydet(db: Db, kullanici: Kullanici, id: number, g: { surum: number; metin: TeklifFormuMetni | null }): Promise<TeklifAyrintisi> {
  const ret = formMetniReddi((await kilitle(db, id)).durum);
  if (ret !== null) throw gecersiz(ret);
  await surumluYaz(db, id, () => sorgular.teklifFormMetniYaz(db, id, g.metin, g.surum, kullanici.id));
  return teklifAyrintisi(db, id);
}

export async function kabulEt(db: Db, kullanici: Kullanici, id: number, g: { surum: number; surumNo: number }): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  gecisDenetle(mevcut.durum, 'kabul');
  const surumler = await sorgular.teklifSurumleri(db, id);
  const kabulEdilen = surumler.find((v) => v.surum_no === g.surumNo);
  if (kabulEdilen === undefined) throw dogrulama(SURUM_YOK, 'surumNo');
  // 3637: kabuldeki ya da siparişteki teklifte yeni kabul, kabul edilenden sonraki ve iskontosu onaylı sürüme olur.
  const yeniden = yenidenKabulReddi(mevcut.durum, mevcut.kabul_surumu, g.surumNo, iskontoOnayiGerekir(kabulEdilen.iskonto_orani) && kabulEdilen.onaylayan_id === null);
  if (yeniden !== null) throw gecersiz(yeniden);
  await surumluYaz(db, id, () => sorgular.teklifDurumYaz(db, id, {
    hedef: surumDurumu(mevcut.durum, teklifHedefi('kabul')), surum: g.surum, kisiId: kullanici.id, not: null, kabulSurumu: g.surumNo, siparisId: null,
  }));
  return teklifAyrintisi(db, id);
}

export async function kartBagla(
  db: Db, kullanici: Kullanici, id: number, satirId: number, g: { surum: number; malzemeNo: number },
): Promise<TeklifAyrintisi> {
  const mevcut = await kilitle(db, id);
  const ret = kartBaglamaReddi(mevcut.durum);
  if (ret !== null) throw gecersiz(ret);
  const satir = (await sorgular.talepSatirlari(db, id)).find((t) => t.id === satirId);
  if (satir === undefined) throw bulunamadi('Teklif satırı bulunamadı.');
  await kartlariDenetle(db, [{ malzemeNo: g.malzemeNo, miktar: satir.miktar }], (_, ad) => ad);
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
  // Liste kuralından (SIP-4 a) önce açılmış teklif listede olmayan kodla kalmış olabilir; sipariş o kodla açılmaz.
  const paraBirimi = paraBirimiSemasi.safeParse(mevcut.para_birimi);
  if (!paraBirimi.success) throw dogrulama(PARA_BIRIMI_LISTEDE_YOK, 'paraBirimi');
  const siparis = await siparisEkle(db, kullanici, {
    firmaId: mevcut.firma_id, firmaKodu: mevcut.firma_kodu, musteriSiparisNo: g.musteriSiparisNo, siparisTarihi: g.siparisTarihi, termin: g.termin,
    paraBirimi: paraBirimi.data, kdvOrani: g.kdvOrani, odemeKosulu: kabul.odemeKosulu, aciklama: `${teklif.no} teklifinden (sürüm ${kabul.surumNo}).`,
    cezaOraniGun: g.cezaOraniGun, cezaTavaniOrani: g.cezaTavaniOrani, odemeVadesiGun: g.odemeVadesiGun,
    satirlar: teklif.satirlar.map((s) => ({
      malzemeNo: s.malzemeNo ?? 0, miktar: s.miktar, birimFiyat: fiyat.get(s.id) ?? null, termin: null, aciklama: null,
      // 3438 a: müşteri teklifteki kartı kabul etti; kart sonradan eskiye düştüyse sipariş o revizyonla açılır. Yürürlükteki kartta silinir.
      eskiRevizyonGerekcesi: `${teklif.no} teklifinde kabul edilen revizyon.`,
    })),
  }, true, mevcut.firma_kodu);
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

// 3637: kabul edilen sürümün fiyatları, KDV oranı ve ödeme koşulu onaylı siparişin yeni sürümü (Rev) olarak uygulanır. Kalem, miktar, termin,
// müşteri ve para birimi değişmez (sipariş Rev kuralı da bunu ister); sürümdeki termin siparişe geçmez, sipariş ekranından elle değişir.
// Sipariş Rev yetkisi ve kuralları aynen işler (yetki uçta: siparisler.onayla ve fiyat görme); Finans beklenen tahsilatı Rev ile yeniden yazılır.
export async function siparisUygula(
  db: Db, kullanici: Kullanici, id: number, g: TeklifSiparisUygulaVerisi,
): Promise<{ teklif: TeklifAyrintisi; siparisId: number }> {
  const mevcut = await kilitle(db, id);
  const siparisteki = mevcut.siparis_id === null ? null : await sorgular.siparistekiTeklifSurumu(db, mevcut.siparis_id);
  const ret = siparisUygulaReddi({ durum: mevcut.durum, siparisId: mevcut.siparis_id, kabulSurumu: mevcut.kabul_surumu }, g.surumNo, siparisteki);
  if (ret !== null) throw gecersiz(ret);
  const siparisId = mevcut.siparis_id;
  if (siparisId === null) throw new Error('Teklifin siparişi yok');
  const teklif = await teklifAyrintisi(db, id);
  const surum = teklif.surumler.find((v) => v.surumNo === g.surumNo);
  if (surum === undefined) throw dogrulama(SURUM_YOK, 'surumNo');
  const fiyat = new Map(surum.fiyatlar.map((f) => [f.satirId, f.iskontoluFiyat]));
  const siparis = await siparisAyrintisi(db, siparisId);
  const satirlar = siparis.satirlar.map((k) => {
    const t = teklif.satirlar.find((x) => x.sira === k.sira && x.malzemeNo === k.malzemeNo);
    const yeni = t === undefined ? undefined : fiyat.get(t.id);
    return { id: k.id, malzemeNo: k.malzemeNo, miktar: k.miktar, birimFiyat: yeni ?? null, termin: k.termin, aciklama: k.aciklama, eslesti: yeni !== undefined };
  });
  if (satirlar.length !== teklif.satirlar.length || satirlar.some((k) => !k.eslesti)) throw gecersiz(UYGULA_KALEM_UYUMSUZ);
  const gerekce = `${teklif.no} sürüm ${String(g.surumNo)}: ${g.gerekce}`;
  const paraBirimi = paraBirimiSemasi.safeParse(siparis.paraBirimi);
  if (!paraBirimi.success) throw dogrulama(PARA_BIRIMI_LISTEDE_YOK, 'paraBirimi');
  await siparisRevizeEt(db, kullanici, siparisId, {
    firmaId: siparis.firmaId, musteriSiparisNo: siparis.musteriSiparisNo, siparisTarihi: siparis.siparisTarihi, termin: siparis.termin,
    paraBirimi: paraBirimi.data, kdvOrani: surum.kdvOrani ?? siparis.kdvOrani, odemeKosulu: surum.odemeKosulu ?? siparis.odemeKosulu,
    aciklama: siparis.aciklama, cezaOraniGun: siparis.cezaOraniGun, cezaTavaniOrani: siparis.cezaTavaniOrani, odemeVadesiGun: siparis.odemeVadesiGun,
    satirlar: satirlar.map(({ eslesti: _e, ...k }) => k), surum: g.siparisSurum, gerekce,
  }, true, g.surumNo);
  return { teklif: await teklifAyrintisi(db, id), siparisId };
}

// 3419 a: yalnız sürümü olmayan teklif kalıcı silinir; açan ya da sipariş onay yetkilisi siler. Numara geri verilmez.
// Denetim kaydı aynı transaction'da, uç kaydının ekinde: no, firma, başlık, kalem ve taslak sayısı (Risk K4).
export async function teklifSil(
  db: Db, kullanici: Kullanici, id: number, surum: number, denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<TeklifSilmeCevabi> {
  const mevcut = await kilitle(db, id);
  const yetki = silmeYetkisiReddi(mevcut.olusturan_id, kullanici.id, islemVarMi(kullanici, 'siparisler.onayla'));
  if (yetki !== null) throw yetkiYok(yetki);
  if (mevcut.surum !== surum) throw eskiSurum();
  const silme = silmeReddi({ durum: mevcut.durum, surumSayisi: await sorgular.teklifSurumSayisi(db, id) });
  if (silme !== null) throw gecersiz(silme);
  const baslik = await sorgular.teklifGetir(db, id);
  const silinecek = await sorgular.teklifSilinecekleri(db, id);
  if (!(await sorgular.teklifSil(db, id))) throw bulunamadi(TEKLIF_YOK);
  denetimEki([{
    islem: 'teklif-sil', teklif: id, no: mevcut.no, firma: mevcut.firma_id, baslik: baslik?.baslik ?? null, kalem: silinecek.kalem, taslak: silinecek.taslak,
  }]);
  return { id, no: mevcut.no };
}

// 3419 a: fiyatı verilmiş, siparişe dönmemiş teklif arşivlenir. Plandaki yeri kalkar, onay bildirimleri kapanır (K3);
// Logo'ya gitmemiş sürümü gönderim sırasında bekler ve arşivden çıkınca gider (K2). Logo'ya gitmiş kayıt Logo'da kalır (2963 a).
export async function teklifArsivle(db: Db, kullanici: Kullanici, id: number, g: TeklifArsivVerisi): Promise<TeklifAyrintisi> {
  const mevcut = await kilitleArsivDahil(db, id);
  const ret = arsivReddi(mevcut.durum, mevcut.arsivde);
  if (ret !== null) throw gecersiz(ret);
  await surumluYaz(db, id, () => sorgular.teklifArsivle(db, id, { surum: g.surum, kisiId: kullanici.id, neden: g.neden, not: g.not }));
  await yerTutaniKaldir(db, id);
  await bildirimKapat(db, { tur: 'siparisler.iskonto-onay-bekliyor', kaynakKimlik: String(id) });
  await bildirimKapat(db, { tur: 'siparisler.termin-onay-bekliyor', kaynakKimlik: String(id) });
  return teklifAyrintisi(db, id);
}

export async function teklifArsivdenCikar(db: Db, kullanici: Kullanici, id: number, g: { surum: number }): Promise<TeklifAyrintisi> {
  const mevcut = await kilitleArsivDahil(db, id);
  if (!mevcut.arsivde) throw gecersiz(ARSIVDE_DEGIL);
  await surumluYaz(db, id, () => sorgular.teklifArsivdenCikar(db, id, g.surum, kullanici.id));
  return teklifAyrintisi(db, id);
}

// Portal talep listesi (254 a): tek sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok.
export async function teklifDurumlari(db: Db, idler: readonly number[]): Promise<Map<number, TeklifDurumu>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.teklifDurumlariniBul(db, tekil)).map((t) => [t.id, t.durum]));
}
