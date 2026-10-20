import { ikiliCevap, ikiliCevapYaDaBos, uc } from '#cekirdek/uc.ts';
import {
  ayarDegistirGovdesi, ayarParametresi, ayarSemasi, ayarlarCevabi, guncellemePaketiSemasi, guncellemePaketleriCevabi,
  guncellemeParcasiCevabi, guncellemeParcasiGovdesi, guncellemeSilCevabi, guncellemeUygulamaIstegi, guncellemeUygulaParametresi, guncellemeYuklemeParametresi,
  gorunumCevabi, kapaliSayfalarCevabi, kapaliSayfalarGovdesi, karsilamaCevabi, kurumCevabi, kurumLogosuCevabi, kurumLogosuGovdesi, yedekAlCevabi,
  yedekDiziniCevabi, yedekDiziniGovdesi, yedekIndirSorgusu, yedekIndirmeIzniCevabi, yedekParametresi, yedeklerCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { ortamdanOku, paketiSil, paketleriListele, parcaYaz, surumuSil, uygulamaIste, yuklemeyiBitir } from './guncelleme.ts';
import {
  ayarDegistir, ayarlariListele, girisLogosuOku, gorunumOku, kapaliSayfalariDegistir, kapaliSayfalariOku, karsilamaOku, kurumLogosuDegistir, kurumOku, kurumLogosuOku,
} from './servis.ts';
import { yedekDiziniDegistir, yedekOrtaminiKur } from './yedek-dizini.ts';
import { elleYedekBaslat, indirmeIzniVer, yedekIndir, yedekleriListele } from './yedek.ts';

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/ayarlar',
    yetki: 'ayarlar.yaz',
    cevap: ayarlarCevabi,
    isle: ({ db }) => ayarlariListele(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kapali-sayfalar',
    // Kabuk her oturumda menüyü bununla süzer; liste yalnız sayfa yollarıdır.
    yetki: 'oturum',
    cevap: kapaliSayfalarCevabi,
    isle: ({ db }) => kapaliSayfalariOku(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/kapali-sayfalar/degistir',
    yetki: 'ayarlar.yaz',
    govde: kapaliSayfalarGovdesi,
    cevap: kapaliSayfalarCevabi,
    isle: ({ db, govde, kullanici }) => kapaliSayfalariDegistir(db, kullanici.id, govde.yol, govde.kapali),
  }),
  uc({
    yontem: 'POST',
    yol: '/ayarlar/:anahtar/degistir',
    yetki: 'ayarlar.yaz',
    parametre: ayarParametresi,
    govde: ayarDegistirGovdesi,
    cevap: ayarSemasi,
    isle: ({ db, parametre, govde, kullanici }) => ayarDegistir(db, kullanici.id, parametre.anahtar, govde.deger),
  }),
  uc({
    yontem: 'GET',
    yol: '/kurum-logosu',
    // Kabuk her oturumda çizer; logo kurumun herkese görünen işaretidir.
    yetki: 'oturum',
    cevap: kurumLogosuCevabi,
    isle: ({ db }) => kurumLogosuOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/giris-logosu',
    // Giriş ekranı oturum açılmadan çizer (kullanıcı kararı 2026-10-14). Yalnız logo yüklenirken yazılan görsel kopyası döner.
    yetki: 'acik',
    cevap: ikiliCevapYaDaBos,
    isle: ({ db }) => girisLogosuOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/karsilama',
    // Kabuk girişten sonra herkese çizer; yazma genel değiştirme ucundan, ayar yazan kişiyledir.
    yetki: 'oturum',
    cevap: karsilamaCevabi,
    isle: ({ db }) => karsilamaOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/gorunum',
    // Kabuk her oturumda hareket dilini ve açılışı bununla uygular; yazma genel değiştirme ucundan, ayar yazan kişiyledir.
    yetki: 'oturum',
    cevap: gorunumCevabi,
    isle: ({ db }) => gorunumOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kurum',
    // Modül başlıkları her oturumda yazar; yazma genel değiştirme ucundan, ayar yazan kişiyledir.
    yetki: 'oturum',
    cevap: kurumCevabi,
    isle: ({ db }) => kurumOku(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/kurum-logosu/degistir',
    yetki: 'ayarlar.yaz',
    govde: kurumLogosuGovdesi,
    cevap: kurumLogosuCevabi,
    isle: ({ db, govde, kullanici }) => kurumLogosuDegistir(db, kullanici.id, govde.logo),
  }),
  // Güncelleme paketi (kart #870, #1210): sunucu saklar ve uygulama isteğini yazar; uygulamayı güncelleyici yapar.
  // Dizin ve anahtar her istekte ortamdan okunur.
  uc({
    yontem: 'GET',
    yol: '/guncelleme/paketler',
    yetki: 'ayarlar.guncelleme-yukle',
    cevap: guncellemePaketleriCevabi,
    isle: () => paketleriListele(ortamdanOku()),
  }),
  uc({
    yontem: 'POST',
    yol: '/guncelleme/yuklemeler/:kimlik/parca',
    yetki: 'ayarlar.guncelleme-yukle',
    parametre: guncellemeYuklemeParametresi,
    govde: guncellemeParcasiGovdesi,
    cevap: guncellemeParcasiCevabi,
    // Parça içeriği deftere girmez, boyutu ve özeti girer (kullanıcı kararı 2026-10-12, kart #870; DS9 gibi).
    denetim: 'govdesiz',
    isle: ({ kullanici, parametre, govde }) => parcaYaz(ortamdanOku(), kullanici.id, parametre.kimlik, govde, new Date()),
  }),
  uc({
    yontem: 'POST',
    yol: '/guncelleme/yuklemeler/:kimlik/bitir',
    yetki: 'ayarlar.guncelleme-yukle',
    parametre: guncellemeYuklemeParametresi,
    cevap: guncellemePaketiSemasi,
    isle: ({ kullanici, parametre }) => yuklemeyiBitir(ortamdanOku(), kullanici.id, parametre.kimlik, new Date()),
  }),
  uc({
    yontem: 'POST',
    yol: '/guncelleme/paketler/:commit/uygula',
    yetki: 'ayarlar.guncelleme-yukle',
    parametre: guncellemeUygulaParametresi,
    cevap: guncellemeUygulamaIstegi,
    isle: ({ kullanici, parametre }) => uygulamaIste(ortamdanOku(), kullanici.id, parametre.commit, new Date()),
  }),
  uc({
    yontem: 'POST',
    yol: '/guncelleme/paketler/:commit/sil',
    yetki: 'ayarlar.guncelleme-yukle',
    parametre: guncellemeUygulaParametresi,
    cevap: guncellemeSilCevabi,
    isle: ({ parametre }) => paketiSil(ortamdanOku(), parametre.commit),
  }),
  uc({
    yontem: 'POST',
    yol: '/guncelleme/surumler/:commit/sil',
    yetki: 'ayarlar.guncelleme-yukle',
    parametre: guncellemeUygulaParametresi,
    cevap: guncellemeSilCevabi,
    isle: ({ parametre }) => surumuSil(ortamdanOku(), parametre.commit),
  }),
  // Veritabanı yedeği (kart #1205): klasör her istekte ayardan, yoksa ortamdan okunur; gece yedeğini `isler.ts` alır.
  uc({
    yontem: 'GET',
    yol: '/yedekler',
    yetki: 'ayarlar.yedek-indir',
    cevap: yedeklerCevabi,
    isle: async ({ db }) => yedekleriListele(await yedekOrtaminiKur(db)),
  }),
  uc({
    yontem: 'POST',
    yol: '/yedekler/al',
    yetki: 'ayarlar.yedek-indir',
    cevap: yedekAlCevabi,
    isle: async ({ db, gunluk }) => elleYedekBaslat(await yedekOrtaminiKur(db), gunluk, new Date()),
  }),
  uc({
    yontem: 'POST',
    yol: '/yedekler/:ad/indirme-izni',
    yetki: 'ayarlar.yedek-indir',
    parametre: yedekParametresi,
    cevap: yedekIndirmeIzniCevabi,
    isle: async ({ db, parametre, kullanici }) => indirmeIzniVer(await yedekOrtaminiKur(db), parametre.ad, kullanici.id, new Date()),
  }),
  uc({
    yontem: 'GET',
    yol: '/yedekler/:ad/indir',
    yetki: 'ayarlar.yedek-indir',
    parametre: yedekParametresi,
    sorgu: yedekIndirSorgusu,
    cevap: ikiliCevap,
    isle: async ({ db, parametre, sorgu, kullanici, gunluk }) =>
      yedekIndir(await yedekOrtaminiKur(db), parametre.ad, kullanici.id, sorgu.izin, gunluk),
  }),
  uc({
    yontem: 'POST',
    yol: '/yedekler/dizin/degistir',
    yetki: 'ayarlar.yedek-indir',
    govde: yedekDiziniGovdesi,
    cevap: yedekDiziniCevabi,
    isle: ({ db, govde, kullanici }) => yedekDiziniDegistir(db, kullanici.id, govde.dizin),
  }),
];
