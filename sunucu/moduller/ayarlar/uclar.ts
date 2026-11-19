import { ikiliCevap, ikiliCevapYaDaBos, uc } from '#cekirdek/uc.ts';
import {
  ayarDegistirGovdesi, ayarParametresi, firmaKodlariCevabi, firmaKoduDuzenleGovdesi, firmaKoduEkleGovdesi, firmaKoduParametresi, firmaKoduSemasi, ayarSemasi, ayarlarCevabi, guncellemeIlerlemesiCevabi, guncellemePaketiSemasi, guncellemePaketleriCevabi,
  guncellemeParcasiCevabi, guncellemeParcasiGovdesi, guncellemeSilCevabi, guncellemeUygulamaIstegi, guncellemeUygulaParametresi, guncellemeYuklemeParametresi,
  girisSesiCevabi, gorunumCevabi, kapaliSayfalarCevabi, kapaliSayfalarGovdesi, karsilamaCevabi, kurumCevabi, kurumLogosuCevabi, kurumLogosuGovdesi, yedekAlCevabi,
  yedekDiziniCevabi, yedekDiziniGovdesi, yedekIndirSorgusu, yedekIndirmeIzniCevabi, yedekParametresi, yedeklerCevabi,
  sifirlaCevabi, sifirlaGovdesi, sunucuSureciCevabi, yenidenBaslatCevabi, sifirlamaOzetiCevabi, sifirlamaOzetiSorgusu, temizleCevabi, temizleGovdesi, temizlikAdaylariCevabi, temizlikAdaylariSorgusu, temizlikEtkisiCevabi, temizlikEtkisiSorgusu, temizlikIsaretCevabi,
  temizlikIsaretGovdesi,
  temizlikTarihleIsaretGovdesi,
  temizlikTarihSayisiCevabi,
  temizlikTarihSayisiSorgusu,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { ilerlemeOku, ortamdanOku, paketiSil, paketleriListele, parcaYaz, surumuSil, uygulamaIste, yuklemeyiBitir } from './guncelleme.ts';
import {
  ayarDegistir, ayarlariListele, firmaKoduDuzenle, firmaKoduEkle, firmaKodlari, girisLogosuOku, girisSesiOku, gorunumOku, kapaliSayfalariDegistir, kapaliSayfalariOku, karsilamaOku, kurumLogosuDegistir, kurumOku, kurumLogosuOku,
} from './servis.ts';
import { sunucuSureciOku, yenidenBaslatIste } from './sunucu-sureci.ts';
import { yedekDiziniDegistir, yedekOrtaminiKur } from './yedek-dizini.ts';
import { denemeIsaretiDegistir, denemeIsaretleTarihleUc, sifirdanBasla, sifirlamaOzeti, temizlikAdaylari, temizlikEtkisi, temizlikTarihSayisi, veriTemizle } from './veri-temizleme.ts';
import { elleYedekBaslat, indirmeIzniVer, yedekEkrani, yedekIndir } from './yedek.ts';

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
    yetki: 'oturum', sahiplik: 'yok',
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
    isle: ({ db, parametre, govde, kullanici }) => ayarDegistir(db, kullanici.id, parametre.anahtar, govde.deger, govde.beklenen),
  }),
  uc({
    yontem: 'GET',
    yol: '/firma-kodlari',
    // 3399 a: proje, malzeme, teklif ve sipariş formları seçer; o kayıtları yazan okur. Yeni 'oturum' ucu açılmaz (ADR 0007 madde 4).
    yetki: { biri: ['ayarlar.yaz', 'projeler.yaz', 'malzemeler.yaz', 'siparisler.yaz'] },
    cevap: firmaKodlariCevabi,
    isle: ({ db }) => firmaKodlari(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/firma-kodlari/ekle',
    yetki: 'ayarlar.yaz',
    govde: firmaKoduEkleGovdesi,
    cevap: firmaKoduSemasi,
    isle: ({ db, govde, kullanici }) => firmaKoduEkle(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/firma-kodlari/:id/duzenle',
    yetki: 'ayarlar.yaz',
    parametre: firmaKoduParametresi,
    govde: firmaKoduDuzenleGovdesi,
    cevap: firmaKoduSemasi,
    isle: ({ db, parametre, govde, kullanici }) => firmaKoduDuzenle(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/kurum-logosu',
    // Kabuk her oturumda çizer; logo kurumun herkese görünen işaretidir.
    yetki: 'oturum', sahiplik: 'yok',
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
    yetki: 'oturum', sahiplik: 'yok',
    cevap: karsilamaCevabi,
    isle: ({ db }) => karsilamaOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/gorunum',
    // Kabuk her oturumda hareket dilini ve açılışı bununla uygular; yazma genel değiştirme ucundan, ayar yazan kişiyledir.
    yetki: 'oturum', sahiplik: 'yok',
    cevap: gorunumCevabi,
    isle: ({ db }) => gorunumOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/giris-kurum-adi',
    // Giriş ekranı oturum açılmadan "<Firma> CORE" yazar (kullanıcı kararı 2002). Yalnız firma adı döner; kimlik istemez (ADR 0003 madde 2).
    yetki: 'acik',
    cevap: kurumCevabi,
    isle: ({ db }) => kurumOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/giris-sesi',
    // Giriş ekranı açılış sesini kurum ayarından oturumsuz okur (kart 2175). Yalnız açık/kapalı döner; kimlik istemez (ADR 0003 madde 2).
    yetki: 'acik',
    cevap: girisSesiCevabi,
    isle: ({ db }) => girisSesiOku(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kurum',
    // Modül başlıkları her oturumda yazar; yazma genel değiştirme ucundan, ayar yazan kişiyledir.
    yetki: 'oturum', sahiplik: 'yok',
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
  // Süren uygulamanın adımı; ekran kurulum sürerken sık yoklar, paket listesini her seferinde okumasın diye ayrı uçtur.
  uc({
    yontem: 'GET',
    yol: '/guncelleme/ilerleme',
    yetki: 'ayarlar.guncelleme-yukle',
    cevap: guncellemeIlerlemesiCevabi,
    isle: () => ilerlemeOku(ortamdanOku()),
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
  // Ekrandan yeniden başlatma: güncellemeyi uygulayabilen kişi sunucuyu da yeniden başlatabilir (uygulama zaten yeniden başlatır).
  // Sunucu kendini kapatır, bekçi açar; bekçi görülmezse reddedilir (sunucu-sureci.ts).
  uc({
    yontem: 'GET',
    yol: '/sunucu-sureci',
    yetki: 'ayarlar.guncelleme-yukle',
    txDisi: true,
    cevap: sunucuSureciCevabi,
    isle: () => sunucuSureciOku(ortamdanOku()),
  }),
  uc({
    yontem: 'POST',
    yol: '/sunucu-sureci/yeniden-baslat',
    yetki: 'ayarlar.guncelleme-yukle',
    cevap: yenidenBaslatCevabi,
    isle: ({ kullanici }) => yenidenBaslatIste(ortamdanOku(), kullanici.id, new Date()),
  }),
  // Veritabanı yedeği (kart #1205): klasör her istekte ayardan, yoksa ortamdan okunur; gece yedeğini `isler.ts` alır.
  uc({
    yontem: 'GET',
    yol: '/yedekler',
    yetki: 'ayarlar.yedek-indir',
    cevap: yedeklerCevabi,
    isle: async ({ db }) => yedekEkrani(db, await yedekOrtaminiKur(db)),
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
  // Deneme verisi temizleme (3395 a): yalnız bayraklı yönetici; işlem hiçbir role verilmez.
  uc({
    yontem: 'GET',
    yol: '/veri-temizleme/adaylar',
    yetki: 'ayarlar.veri-temizle',
    sorgu: temizlikAdaylariSorgusu,
    cevap: temizlikAdaylariCevabi,
    isle: ({ db, sorgu, kullanici }) => temizlikAdaylari(db, kullanici.id, sorgu),
  }),
  uc({
    yontem: 'POST',
    yol: '/veri-temizleme/isaret',
    yetki: 'ayarlar.veri-temizle',
    govde: temizlikIsaretGovdesi,
    cevap: temizlikIsaretCevabi,
    isle: ({ db, govde, kullanici }) => denemeIsaretiDegistir(db, kullanici.id, govde.secim, govde.isaretli),
  }),
  uc({
    yontem: 'GET',
    yol: '/veri-temizleme/etki',
    yetki: 'ayarlar.veri-temizle',
    sorgu: temizlikEtkisiSorgusu,
    cevap: temizlikEtkisiCevabi,
    isle: ({ db, sorgu, kullanici }) => temizlikEtkisi(
      db, kullanici.id, sorgu.bitis !== undefined && sorgu.turler !== undefined ? { tarih: { bitis: sorgu.bitis, turler: sorgu.turler } } : { secim: sorgu.secim ?? [] },
    ),
  }),
  uc({
    yontem: 'POST',
    yol: '/veri-temizleme/isaret-tarihle',
    yetki: 'ayarlar.veri-temizle',
    govde: temizlikTarihleIsaretGovdesi,
    cevap: temizlikIsaretCevabi,
    isle: ({ db, govde, kullanici }) => denemeIsaretleTarihleUc(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/veri-temizleme/tarih-sayisi',
    yetki: 'ayarlar.veri-temizle',
    sorgu: temizlikTarihSayisiSorgusu,
    cevap: temizlikTarihSayisiCevabi,
    isle: ({ db, sorgu, kullanici }) => temizlikTarihSayisi(db, kullanici.id, sorgu),
  }),
  // Parola sözleşmede gizlidir, deftere girmez; silinen numaralar denetim ekiyle girer.
  uc({
    yontem: 'POST',
    yol: '/veri-temizleme/temizle',
    yetki: 'ayarlar.veri-temizle',
    tekrarKorumali: true,
    govde: temizleGovdesi,
    cevap: temizleCevabi,
    isle: ({ db, govde, kullanici, denetimEki }) => veriTemizle(db, kullanici.id, govde, denetimEki, new Date()),
  }),
  uc({
    yontem: 'GET',
    yol: '/veri-temizleme/sifirlama-ozeti',
    yetki: 'ayarlar.veri-temizle',
    sorgu: sifirlamaOzetiSorgusu,
    cevap: sifirlamaOzetiCevabi,
    isle: ({ db, sorgu, kullanici }) => sifirlamaOzeti(db, kullanici.id, sorgu),
  }),
  // "Sıfırdan başla" (3426 a); parola sözleşmede gizlidir. Denetim kaydı (seçenekler dahil) sıfırlamadan sonra yazılır.
  uc({
    yontem: 'POST',
    yol: '/veri-temizleme/sifirla',
    yetki: 'ayarlar.veri-temizle',
    tekrarKorumali: true,
    govde: sifirlaGovdesi,
    cevap: sifirlaCevabi,
    isle: ({ db, govde, kullanici }) => sifirdanBasla(db, kullanici.id, govde, new Date()),
  }),
];
