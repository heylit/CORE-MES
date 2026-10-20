import { uc } from '#cekirdek/uc.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import {
  durumGovdesi, idParametresi, malzemeSecenekSorgusu, malzemeSecenekleriCevabi, iptalGovdesi, kartBaglaGovdesi, siparisAyrintiSemasi, siparisDonusumCevabi, siparisDonusumGovdesi,
  siparisEkleGovdesi, siparisGuncelleGovdesi, siparisListesiCevabi, siparisListesiSorgusu, teklifAyrintiCevabi, teklifEkleGovdesi,
  teklifGuncelleGovdesi, teklifKabulGovdesi, teklifListesiCevabi, teklifListesiSorgusu, teklifNotGovdesi, teklifSatirParametresi,
  teklifSurumuGovdesi,
} from '#paylasilan/sozlesme/siparisler.ts';
import type { SiparisAyrintisi, TeklifAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { FIYAT_YETKISI_YOK, siparisAyrintisiFiyatsiz, siparisFiyatsiz, teklifFiyatsiz } from './kurallar.ts';
import * as servis from './servis.ts';
import * as teklif from './teklif-servis.ts';

// 180: fiyatı ve maliyeti yalnız `siparisler.fiyat-oku` olan görür; bütün cevaplar buradan geçer, servis ve disari dolu kalır.
const FIYAT_ISLEMI = 'siparisler.fiyat-oku';
const fiyatGorur = (k: Kullanici): boolean => islemVarMi(k, FIYAT_ISLEMI);
const siparisCevabi = (k: Kullanici) => async (s: Promise<SiparisAyrintisi>) => (fiyatGorur(k) ? s : siparisAyrintisiFiyatsiz(await s));
const teklifCevabi = (k: Kullanici) => async (t: Promise<TeklifAyrintisi>) => (fiyatGorur(k) ? t : teklifFiyatsiz(await t));

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
    // 201 a: teklif sürümü fiyattır; yalnız fiyatı gören verir.
    isle: ({ db, kullanici, parametre, govde }) => {
      if (!fiyatGorur(kullanici)) throw yetkiYok(FIYAT_YETKISI_YOK);
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
