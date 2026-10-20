import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  acilDurumCevabi, benimZiyaretcimSemasi, cikisGovdesi, evSahipleriCevabi, gecmisCevabi, gecmisSorgusu, girisGovdesi, habersizGovdesi,
  idParametresi, kapiCevabi, kartBildirGovdesi, kartEkleGovdesi, kartlarCevabi, kartSemasi, onKayitGovdesi, oneriSorgusu, onerilerCevabi,
  pdksAktarCevabi, pdksAktarGovdesi, pdksCihazAnahtarCevabi, pdksCihazDurumGovdesi, pdksCihazEkleGovdesi, pdksCihazHareketiCevabi,
  pdksCihazHareketiGovdesi, pdksCihazlarCevabi, pdksCihazSemasi, surumGovdesi, ziyaretcilerimCevabi, ziyaretSemasi,
} from '#paylasilan/sozlesme/nizamiye.ts';
import * as servis from './servis.ts';

// Kapıdaki görevli, idari işler ve müdür okur (174 a); giriş ve çıkışı görevli ile idari işler yapar; kartı idari işler ve müdür yönetir.
// Ev sahibinin kendi ön kaydı yalnız oturum ister (217 a): kişi oturumdan alınır, başkasının kaydına erişemez.
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/nizamiye/menu-sayaclari',
    yetki: 'oturum',
    cevap: ikinciMenuSayacSemasi,
    // Okuyamayan kişiye sayı verilmez: kabuk eksik anahtarda sayı göstermez.
    isle: async ({ db, kullanici }) => (kullanici.islemler.includes('nizamiye.oku') ? servis.menuSayaclari(db) : {}),
  }),
  uc({ yontem: 'GET', yol: '/nizamiye/kapi', yetki: 'nizamiye.oku', cevap: kapiCevabi, isle: ({ db }) => servis.kapi(db) }),
  uc({
    yontem: 'GET', yol: '/nizamiye/gecmis', yetki: 'nizamiye.oku', sorgu: gecmisSorgusu, cevap: gecmisCevabi,
    isle: ({ db, sorgu }) => servis.gecmis(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/nizamiye/acil-durum', yetki: 'nizamiye.oku', cevap: acilDurumCevabi,
    isle: ({ db, kullanici }) => servis.acilDurum(db, kullanici),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/pdks/aktar', yetki: 'nizamiye.pdks-aktar',
    // Aktarım kaydı açar: yeniden gönderilen istek ikinci aktarım kaydı yazmamalı (hareketler zaten tektir).
    tekrarKorumali: true,
    govde: pdksAktarGovdesi, cevap: pdksAktarCevabi,
    isle: ({ db, kullanici, govde }) => servis.pdksAktar(db, kullanici, govde),
  }),
  // Kart okuyucular (289 b, ADR 0016) PDKS'yi aktaranın, insan kaynaklarının elindedir; anahtar yalnız bu cevaplarda bir kez görünür.
  // Tekrar korumalı değildir: tekrar deposu cevabı saklar, anahtar veritabanına düz girerdi. İkinci istek ikinci anahtar üretir, öncekini geçersiz kılar.
  uc({ yontem: 'GET', yol: '/nizamiye/pdks/cihazlar', yetki: 'nizamiye.pdks-aktar', cevap: pdksCihazlarCevabi, isle: ({ db }) => servis.pdksCihazlari(db) }),
  uc({
    yontem: 'POST', yol: '/nizamiye/pdks/cihazlar', yetki: 'nizamiye.pdks-aktar', govde: pdksCihazEkleGovdesi, cevap: pdksCihazAnahtarCevabi,
    isle: ({ db, kullanici, govde }) => servis.pdksCihazEkle(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/pdks/cihazlar/:id/anahtar', yetki: 'nizamiye.pdks-aktar', parametre: idParametresi, govde: surumGovdesi,
    cevap: pdksCihazAnahtarCevabi, isle: ({ db, parametre, govde }) => servis.pdksCihazAnahtarYenile(db, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/pdks/cihazlar/:id/durum', yetki: 'nizamiye.pdks-aktar', parametre: idParametresi, govde: pdksCihazDurumGovdesi,
    cevap: pdksCihazSemasi, isle: ({ db, parametre, govde }) => servis.pdksCihazDurum(db, parametre.id, govde),
  }),
  // Oturumsuz uç (kullanıcı onayı 289 b): kimlik ağ aralığı, kayıtlı adres ve cihaz anahtarıdır; korumalar servis.pdksCihazHareketi'nde.
  uc({
    yontem: 'POST', yol: '/nizamiye/pdks/cihaz-hareketi', yetki: 'acik', govde: pdksCihazHareketiGovdesi, cevap: pdksCihazHareketiCevabi,
    isle: ({ db, istek, govde }) => servis.pdksCihazHareketi(db, istek.ip, govde),
  }),
  uc({ yontem: 'GET', yol: '/nizamiye/kartlar', yetki: 'nizamiye.oku', cevap: kartlarCevabi, isle: ({ db }) => servis.kartlar(db) }),
  uc({ yontem: 'GET', yol: '/nizamiye/ev-sahipleri', yetki: 'nizamiye.yaz', cevap: evSahipleriCevabi, isle: ({ db }) => servis.evSahipleri(db) }),
  uc({
    yontem: 'GET', yol: '/nizamiye/oneriler', yetki: 'nizamiye.yaz', sorgu: oneriSorgusu, cevap: onerilerCevabi,
    isle: ({ db, sorgu }) => servis.oneriler(db, sorgu.ara),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/ziyaretler/habersiz', yetki: 'nizamiye.yaz',
    // Kayıt açar: cevabı yitirilip yeniden gönderilen istek ikinci ziyaret açmamalı.
    tekrarKorumali: true,
    govde: habersizGovdesi, cevap: ziyaretSemasi,
    isle: ({ db, kullanici, govde }) => servis.habersizGiris(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/ziyaretler/:id/giris', yetki: 'nizamiye.yaz', parametre: idParametresi, govde: girisGovdesi, cevap: ziyaretSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.girisYap(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/ziyaretler/:id/cikis', yetki: 'nizamiye.yaz', parametre: idParametresi, govde: cikisGovdesi, cevap: ziyaretSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.cikisYap(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/ziyaretler/:id/iptal', yetki: 'nizamiye.yaz', parametre: idParametresi, govde: surumGovdesi, cevap: ziyaretSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.iptalEt(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/ziyaretler/:id/geri-al', yetki: 'nizamiye.yaz', parametre: idParametresi, govde: surumGovdesi, cevap: ziyaretSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.geriAl(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/kartlar/:id/bildir', yetki: 'nizamiye.yaz', parametre: idParametresi, govde: kartBildirGovdesi, cevap: kartSemasi,
    isle: ({ db, parametre, govde }) => servis.kartBildir(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/kartlar', yetki: 'nizamiye.kart-yonet', govde: kartEkleGovdesi, cevap: kartSemasi,
    isle: ({ db, govde }) => servis.kartEkle(db, govde),
  }),
  uc({
    yontem: 'POST', yol: '/nizamiye/kartlar/:id/rafa-al', yetki: 'nizamiye.kart-yonet', parametre: idParametresi, govde: surumGovdesi, cevap: kartSemasi,
    isle: ({ db, parametre, govde }) => servis.rafaAl(db, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'GET', yol: '/ziyaretcilerim', yetki: 'oturum', cevap: ziyaretcilerimCevabi,
    isle: ({ db, kullanici }) => servis.ziyaretcilerim(db, kullanici),
  }),
  uc({
    yontem: 'POST', yol: '/ziyaretcilerim/on-kayit', yetki: 'oturum', tekrarKorumali: true, govde: onKayitGovdesi, cevap: benimZiyaretcimSemasi,
    isle: ({ db, kullanici, govde }) => servis.onKayitAc(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/ziyaretcilerim/:id/iptal', yetki: 'oturum', parametre: idParametresi, govde: surumGovdesi, cevap: benimZiyaretcimSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.kendiZiyaretiniIptalEt(db, kullanici, parametre.id, govde.surum),
  }),
];
