import { uc } from '#cekirdek/uc.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import {
  adetDenemesiCevabi, adetDenemesiSorgusu, atolyeTaslaklariCevabi, denemeTaslagiGovdesi, durumGovdesi, idParametresi, planTaslaklariCevabi, terminDenemesiCevabi, terminDenemesiSorgusu, terminOnayGovdesi, iskontoOnayGovdesi, malzemeSecenekSorgusu, malzemeSecenekleriCevabi, iptalGovdesi, kartBaglaGovdesi, siparisAyrintiSemasi, siparisDonusumCevabi, siparisDonusumGovdesi,
  siparisEkleGovdesi, siparisGuncelleGovdesi, siparisListesiCevabi, siparisListesiSorgusu, siparisOzetiCevabi, teklifAyrintiCevabi, teklifEkleGovdesi,
  teklifGuncelleGovdesi, teklifKabulGovdesi, teklifListesiCevabi, teklifListesiSorgusu, teklifNotGovdesi, teklifSatirParametresi,
  teklifSurumuGovdesi,
} from '#paylasilan/sozlesme/siparisler.ts';
import type { AdetDenemesiCevabi, AtolyeTaslagi, PlanTaslagi, SiparisAyrintisi, TeklifAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { FIYAT_YETKISI_YOK, denemeSuzgeci, siparisAyrintisiFiyatsiz, siparisFiyatsiz, teklifFiyatsiz } from './kurallar.ts';
import * as servis from './servis.ts';
import * as deneme from './teklif-deneme.ts';
import * as teklif from './teklif-servis.ts';

// 180: fiyatı ve maliyeti yalnız `siparisler.fiyat-oku` olan görür; bütün cevaplar buradan geçer, servis ve disari dolu kalır.
const FIYAT_ISLEMI = 'siparisler.fiyat-oku';
const fiyatGorur = (k: Kullanici): boolean => islemVarMi(k, FIYAT_ISLEMI);
const siparisCevabi = (k: Kullanici) => async (s: Promise<SiparisAyrintisi>) => (fiyatGorur(k) ? s : siparisAyrintisiFiyatsiz(await s));
const teklifCevabi = (k: Kullanici) => async (t: Promise<TeklifAyrintisi>) => (fiyatGorur(k) ? t : teklifFiyatsiz(await t));
// 65 a: maliyet toplamı fiyatla, dökümü `siparisler.maliyet-oku` ile görünür.
const TERMIN_ISLEMI = 'siparisler.termin-dene';
const MALIYET_ISLEMI = 'siparisler.maliyet-oku';
const TERMIN_YETKISI_YOK = 'Plan taslağıyla sürüm yalnız termin deneme yetkisiyle verilir; termini elle girin.';
const maliyetGorusu = (k: Kullanici) => ({ toplam: fiyatGorur(k) || islemVarMi(k, MALIYET_ISLEMI), dokum: islemVarMi(k, MALIYET_ISLEMI) });
const taslakCevabi = (k: Kullanici) => async (l: Promise<PlanTaslagi[]>) => {
  const toplam = maliyetGorusu(k).toplam;
  return { taslaklar: (await l).map((t) => (toplam ? t : { ...t, karOrani: null, maliyetToplami: null })) };
};
// Adet tablosunda maliyet denemedeki görünüşle aynıdır: toplamı görmeyene birim ve toplam maliyet gitmez.
const adetCevabi = (k: Kullanici) => async (c: Promise<AdetDenemesiCevabi>): Promise<AdetDenemesiCevabi> => {
  const a = await c;
  if (maliyetGorusu(k).toplam) return a;
  return { ...a, satirlar: a.satirlar.map((s) => ({ ...s, maliyetToplami: null, kalemler: s.kalemler.map((m) => ({ ...m, birimMaliyet: null })) })) };
};
const atolyeCevabi = (k: Kullanici) => async (l: Promise<AtolyeTaslagi[]>) => {
  const gorur = fiyatGorur(k);
  return { taslaklar: (await l).map((t) => (gorur ? t : { ...t, karOrani: null, tutar: null })) };
};

// Taslağı `siparisler.yaz` açar ve düzenler; onay, kapatma ve iptal `siparisler.onayla` ister (onaylı kayıt onaysız değişmez).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/siparisler',
    yetki: 'siparisler.oku',
    sorgu: siparisListesiSorgusu,
    cevap: siparisListesiCevabi,
    isle: async ({ db, kullanici, sorgu }) => {
      const liste = await servis.siparisListesi(db, sorgu);
      return fiyatGorur(kullanici) ? liste : { ...liste, satirlar: liste.satirlar.map(siparisFiyatsiz) };
    },
  }),
  // Ana sayfa özeti (76 a): yalnız sayı, fiyat taşımaz; listeyi okuyan görür.
  uc({
    yontem: 'GET',
    yol: '/siparisler/ozet',
    yetki: 'siparisler.oku',
    cevap: siparisOzetiCevabi,
    isle: ({ db }) => servis.siparisOzeti(db),
  }),
  // Kart seçimi yalnız sipariş ve teklif yazanın işidir.
  uc({
    yontem: 'GET',
    yol: '/siparisler/malzeme-secenekleri',
    yetki: 'siparisler.yaz',
    sorgu: malzemeSecenekSorgusu,
    cevap: malzemeSecenekleriCevabi,
    isle: ({ db, sorgu }) => servis.malzemeSecenekleri(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/siparisler/:id',
    yetki: 'siparisler.oku',
    parametre: idParametresi,
    cevap: siparisAyrintiSemasi,
    isle: ({ db, kullanici, parametre }) => siparisCevabi(kullanici)(servis.siparisAyrintisi(db, parametre.id)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/ekle',
    yetki: 'siparisler.yaz',
    tekrarKorumali: true,
    govde: siparisEkleGovdesi,
    cevap: siparisAyrintiSemasi,
    isle: ({ db, kullanici, govde }) => siparisCevabi(kullanici)(servis.siparisEkle(db, kullanici, govde, fiyatGorur(kullanici))),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/:id/guncelle',
    yetki: 'siparisler.yaz',
    parametre: idParametresi,
    govde: siparisGuncelleGovdesi,
    cevap: siparisAyrintiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => siparisCevabi(kullanici)(servis.siparisGuncelle(db, kullanici, parametre.id, govde, fiyatGorur(kullanici))),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/:id/onayla',
    yetki: 'siparisler.onayla',
    parametre: idParametresi,
    govde: durumGovdesi,
    cevap: siparisAyrintiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => siparisCevabi(kullanici)(servis.durumDegistir(db, kullanici, parametre.id, 'onayla', govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/:id/kapat',
    yetki: 'siparisler.onayla',
    parametre: idParametresi,
    govde: durumGovdesi,
    cevap: siparisAyrintiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => siparisCevabi(kullanici)(servis.durumDegistir(db, kullanici, parametre.id, 'kapat', govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/:id/iptal',
    yetki: 'siparisler.onayla',
    parametre: idParametresi,
    govde: iptalGovdesi,
    cevap: siparisAyrintiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => siparisCevabi(kullanici)(servis.durumDegistir(db, kullanici, parametre.id, 'iptal', govde)),
  }),
  // Satış teklifi (soru 148): bütün teklif yazmaları `siparisler.yaz`; tekliften açılan sipariş taslaktır, onayı ayrıca `siparisler.onayla` ister.
  uc({
    yontem: 'GET',
    yol: '/siparisler/teklifler',
    yetki: 'siparisler.oku',
    sorgu: teklifListesiSorgusu,
    cevap: teklifListesiCevabi,
    isle: ({ db, sorgu }) => teklif.teklifListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/siparisler/teklifler/:id',
    yetki: 'siparisler.oku',
    parametre: idParametresi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre }) => teklifCevabi(kullanici)(teklif.teklifAyrintisi(db, parametre.id)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/ekle',
    yetki: 'siparisler.yaz',
    tekrarKorumali: true,
    govde: teklifEkleGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, govde }) => teklifCevabi(kullanici)(teklif.teklifEkle(db, kullanici, govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/guncelle',
    yetki: 'siparisler.yaz',
    parametre: idParametresi,
    govde: teklifGuncelleGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.teklifGuncelle(db, kullanici, parametre.id, govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/surum-ver',
    yetki: 'siparisler.yaz',
    parametre: idParametresi,
    govde: teklifSurumuGovdesi,
    cevap: teklifAyrintiCevabi,
    // 201 a: teklif sürümü fiyattır; yalnız fiyatı gören verir. Satış taslağı (49) termin deneme yetkisi ister.
    isle: ({ db, kullanici, parametre, govde }) => {
      if (!fiyatGorur(kullanici)) throw yetkiYok(FIYAT_YETKISI_YOK);
      if (govde.planTaslagi !== null && !islemVarMi(kullanici, TERMIN_ISLEMI)) throw yetkiYok(TERMIN_YETKISI_YOK);
      return teklifCevabi(kullanici)(teklif.surumVer(db, kullanici, parametre.id, govde));
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/revizyon-iste',
    yetki: 'siparisler.yaz',
    parametre: idParametresi,
    govde: teklifNotGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.notluGecis(db, kullanici, parametre.id, 'revizyon', govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/reddet',
    yetki: 'siparisler.yaz',
    parametre: idParametresi,
    govde: teklifNotGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.notluGecis(db, kullanici, parametre.id, 'red', govde)),
  }),
  // 291 a: eşiği aşan iskontoyu yalnız müdür onaylar; yazma işlemi tek başına yetmez.
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/iskonto-onayla',
    yetki: 'siparisler.iskonto-onayla',
    parametre: idParametresi,
    govde: iskontoOnayGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.iskontoOnayla(db, kullanici, parametre.id, govde)),
  }),
  // 63 b: istenen termini başka siparişi geciktiren satış taslağını onaylar; 237 ve 871: plan.yaz değil, kendi işlemi.
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/termin-onayla',
    yetki: 'siparisler.termin-onayla',
    parametre: idParametresi,
    govde: terminOnayGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.terminOnayla(db, kullanici, parametre.id, govde)),
  }),
  // 44: teklif planın arkasına denenir; termin herkese, maliyet yetkiye göre.
  uc({
    yontem: 'GET',
    yol: '/siparisler/teklifler/:id/termin-denemesi',
    yetki: TERMIN_ISLEMI,
    parametre: idParametresi,
    sorgu: terminDenemesiSorgusu,
    cevap: terminDenemesiCevabi,
    isle: async ({ db, kullanici, parametre, sorgu }) => denemeSuzgeci(await deneme.terminDenemesi(db, kullanici, parametre.id, sorgu), maliyetGorusu(kullanici)),
  }),
  uc({
    yontem: 'GET',
    yol: '/siparisler/teklifler/:id/adet-denemesi',
    yetki: TERMIN_ISLEMI,
    parametre: idParametresi,
    sorgu: adetDenemesiSorgusu,
    cevap: adetDenemesiCevabi,
    isle: ({ db, kullanici, parametre, sorgu }) => adetCevabi(kullanici)(deneme.adetDenemesi(db, kullanici, parametre.id, sorgu)),
  }),
  uc({
    yontem: 'GET',
    yol: '/siparisler/satis-taslaklari',
    yetki: 'siparisler.oku',
    cevap: atolyeTaslaklariCevabi,
    isle: ({ db, kullanici }) => atolyeCevabi(kullanici)(deneme.atolyeTaslaklari(db)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/deneme-taslagi',
    yetki: TERMIN_ISLEMI,
    tekrarKorumali: true,
    parametre: idParametresi,
    govde: denemeTaslagiGovdesi,
    cevap: planTaslaklariCevabi,
    isle: ({ db, kullanici, parametre, govde }) => taslakCevabi(kullanici)(deneme.denemeTaslagiAc(db, kullanici, parametre.id, govde)),
  }),
  uc({
    yontem: 'GET',
    yol: '/siparisler/teklifler/:id/plan-taslaklari',
    yetki: 'siparisler.oku',
    parametre: idParametresi,
    cevap: planTaslaklariCevabi,
    isle: ({ db, kullanici, parametre }) => taslakCevabi(kullanici)(deneme.planTaslaklari(db, parametre.id)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/kabul',
    yetki: 'siparisler.yaz',
    parametre: idParametresi,
    govde: teklifKabulGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.kabulEt(db, kullanici, parametre.id, govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/satirlar/:satirId/kart-bagla',
    yetki: 'siparisler.yaz',
    parametre: teklifSatirParametresi,
    govde: kartBaglaGovdesi,
    cevap: teklifAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => teklifCevabi(kullanici)(teklif.kartBagla(db, kullanici, parametre.id, parametre.satirId, govde)),
  }),
  uc({
    yontem: 'POST',
    yol: '/siparisler/teklifler/:id/siparise-donustur',
    yetki: 'siparisler.yaz',
    tekrarKorumali: true,
    parametre: idParametresi,
    govde: siparisDonusumGovdesi,
    cevap: siparisDonusumCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      const sonuc = await teklif.siparisDonustur(db, kullanici, parametre.id, govde);
      return fiyatGorur(kullanici) ? sonuc : { ...sonuc, teklif: teklifFiyatsiz(sonuc.teklif) };
    },
  }),
];
