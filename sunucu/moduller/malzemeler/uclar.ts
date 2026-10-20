import { uc } from '#cekirdek/uc.ts';
import {
  katalogAyarKaydetGovdesi, katalogAyarParametresi, katalogAyarlariCevabi, katalogKartiKaydetCevabi, katalogKartiKaydetGovdesi, katalogKartiRotasiCevabi,
  katalogKartlariCevabi, katalogKartlariSorgusu, katalogKimlikCevabi, katalogKimlikParametresi, katalogSablonlariCevabi, katalogSablonuKaydetGovdesi, katalogSurumluKayitCevabi,
  firmaSecenekleriCevabi, firmaSecenekleriSorgusu, logoDurumuCevabi, logoKarsiligiKaydetGovdesi, malzemelerOzetiCevabi, olcuBirimleriCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import { katalogKaydiAlanlari } from './kurallar.ts';
import { aramaUclari } from './arama/uclar.ts';
import * as servis from './servis.ts';

// Kart ve şablon kaydetme uçları bütün içeriği gövdede taşır; denetim kaydına gövde yerine özet girer (kullanıcı kararı 07.10.2026, #227 madde 23).
// Ekran prototiptir, veri burada. Okuma uçları malzemeler sayfasının işlemini ister (kullanıcı kararı Ç1 = A); başka modüller kartı disari.ts ile okur.
const OKUMA = { biri: ['sayfa.malzemeler'] } as const;

export const uclar = [
  // Pano kartı: oturumu olan sorar, her sayı kendi işlemiyle dolar (stok özetiyle aynı yol).
  uc({ yontem: 'GET', yol: '/malzemeler/ozet', yetki: 'oturum', cevap: malzemelerOzetiCevabi, isle: ({ db, kullanici }) => servis.malzemelerOzeti(db, kullanici.islemler) }),
  uc({ yontem: 'GET', yol: '/malzeme-katalogu-kartlari', yetki: OKUMA, sorgu: katalogKartlariSorgusu, cevap: katalogKartlariCevabi, isle: ({ db, sorgu }) => servis.katalogKartlariniGetir(db, sorgu) }),
  uc({
    yontem: 'POST', yol: '/malzeme-katalogu-kartlari/:kimlik/kaydet', yetki: 'malzemeler.yaz', parametre: katalogKimlikParametresi,
    govde: katalogKartiKaydetGovdesi, cevap: katalogKartiKaydetCevabi, denetim: 'govdesiz',
    // Onaya gönderme, onay, ret ve pasife alma ayrı uç değil, bu gövdededir: kimin neye çevirdiği defterden okunsun.
    // `talep`: gövde bekleyen bir değişiklik talebi taşıyor mu (içeriği yazılmaz); talep, uygulanması ve düz düzenleme üçü de aktif yazımdır.
    denetimOzeti: (govde) => {
      const talep = govde.kayit['talep'];
      const alanlar = katalogKaydiAlanlari(govde.kayit, govde.ozet);
      const gecerli = !('alan' in alanlar);
      return {
        tur: gecerli ? alanlar.tur : null, onay_durumu: gecerli ? alanlar.onayDurumu : null, surum: govde.surum,
        talep: typeof talep === 'object' && talep !== null,
      };
    },
    isle: ({ db, kullanici, parametre, govde }) => servis.katalogKartiKaydet(db, kullanici, parametre.kimlik, govde),
  }),
  uc({
    yontem: 'GET', yol: '/malzeme-katalogu-kartlari/:kimlik/rota', yetki: OKUMA, parametre: katalogKimlikParametresi, cevap: katalogKartiRotasiCevabi,
    isle: ({ db, parametre }) => servis.katalogKartiRotasi(db, parametre.kimlik),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-katalogu-kartlari/:kimlik/iptal', yetki: 'malzemeler.yaz', parametre: katalogKimlikParametresi, cevap: katalogKimlikCevabi,
    isle: ({ db, kullanici, parametre }) => servis.katalogKartiIptal(db, kullanici, parametre.kimlik),
  }),
  uc({ yontem: 'GET', yol: '/malzeme-katalogu-sablonlari', yetki: OKUMA, cevap: katalogSablonlariCevabi, isle: ({ db, kullanici }) => servis.katalogSablonlariniGetir(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/malzeme-katalogu-sablonlari/:kimlik/kaydet', yetki: 'malzemeler.yaz', parametre: katalogKimlikParametresi,
    govde: katalogSablonuKaydetGovdesi, cevap: katalogSurumluKayitCevabi, denetim: 'govdesiz',
    isle: ({ db, kullanici, parametre, govde }) => servis.katalogSablonuKaydet(db, kullanici, parametre.kimlik, govde.sablon, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-katalogu-sablonlari/:kimlik/kaldir', yetki: 'malzemeler.yaz', parametre: katalogKimlikParametresi, cevap: katalogKimlikCevabi,
    isle: ({ db, kullanici, parametre }) => servis.katalogSablonuKaldir(db, kullanici, parametre.kimlik),
  }),
  uc({
    yontem: 'GET', yol: '/malzeme-katalogu-ayarlari', yetki: OKUMA, cevap: katalogAyarlariCevabi,
    isle: ({ db, kullanici }) => servis.katalogAyarlariniGetir(db, kullanici),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-katalogu-ayarlari/:anahtar/kaydet', yetki: 'malzemeler.tanim-yaz', parametre: katalogAyarParametresi,
    govde: katalogAyarKaydetGovdesi, cevap: katalogSurumluKayitCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.katalogAyariKaydet(db, kullanici, parametre.anahtar, govde.deger, govde.surum),
  }),
  // Tedarikçi seçimi (kart #466): kartı yazan, finanstaki firmayı adıyla arar.
  uc({
    yontem: 'GET', yol: '/malzeme-firma-secenekleri', yetki: 'malzemeler.yaz', sorgu: firmaSecenekleriSorgusu, cevap: firmaSecenekleriCevabi,
    isle: async ({ db, sorgu }) => ({ firmalar: await servis.firmaSecenekleri(db, sorgu.ara) }),
  }),
  // Ölçü birimi listesi (kart #163, SH4 a); listeyi prototipin Ayarlar ekranı düzenler (ayar kaydı, ML2 b).
  uc({ yontem: 'GET', yol: '/malzeme-birimleri', yetki: OKUMA, cevap: olcuBirimleriCevabi, isle: ({ db }) => servis.olcuBirimleriniGetir(db) }),
  // Logo'ya gönderime hazırlık (kart #232): durum salt okunur; karşılığı malzeme tanımlarını yazan doldurur (yeni işlem yok, kullanıcı kararı 08.10.2026).
  uc({ yontem: 'GET', yol: '/malzeme-logo-durumu', yetki: OKUMA, cevap: logoDurumuCevabi, isle: ({ db, kullanici }) => servis.logoDurumunuGetir(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-karsiliklari/kaydet', yetki: 'malzemeler.tanim-yaz', govde: logoKarsiligiKaydetGovdesi, cevap: katalogKimlikCevabi,
    isle: ({ db, kullanici, govde }) => servis.logoKarsiligiKaydet(db, kullanici, govde),
  }),
  ...aramaUclari,
];
