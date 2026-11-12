import { uc } from '#cekirdek/uc.ts';
import {
  logoGecisCevabi, logoGecisSorgusu, logoGeriAlCevabi, logoGeriAlGovdesi, logoTopluAlGovdesi, logoTopluBaglaGovdesi, logoTopluCevabi,
  katalogAyarKaydetGovdesi, katalogAyarParametresi, katalogAyarlariCevabi, katalogKartiKaydetCevabi, katalogKartiKaydetGovdesi, katalogKartiRotasiCevabi,
  katalogKartlariCevabi, katalogKartlariSorgusu, katalogKimlikCevabi, katalogKimlikParametresi, katalogSablonlariCevabi, katalogSablonuKaydetGovdesi, katalogSurumluKayitCevabi,
  demirbasMakineSecenekleriCevabi, demirbasTeknikCevabi, demirbasTeknikKaydetGovdesi,
  firmaSecenekleriCevabi, firmaSecenekleriSorgusu, logoDurumuCevabi, logoGelenCevabi, logoGelenParametresi, logoGelenSorgusu, logodanAlCevabi, logodanAlGovdesi,
  arsivKaliciSilGovdesi, arsivKartiCevabi, arsivKartlariCevabi, katalogKartiIptalCevabi,
  logoKartSurumCevabi, logoKartSurumGovdesi, logoYeniKodCevabi, malzemeSecimCevabi, malzemeSecimSorgusu, logoKarsiligiKaydetGovdesi, malzemelerOzetiCevabi, olcuAletiSecenekleriCevabi, olcuBirimleriCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import { katalogKaydiAlanlari } from './kurallar.ts';
import * as servis from './servis.ts';

// Kart ve şablon kaydetme uçları bütün içeriği gövdede taşır; denetim kaydına gövde yerine özet girer (kullanıcı kararı 07.10.2026, #227 madde 23).
// Ekran prototiptir, veri burada. Okuma uçları malzemeler sayfasının işlemini ister (kullanıcı kararı Ç1 = A); başka modüller kartı disari.ts ile okur.
const OKUMA = { biri: ['sayfa.malzemeler'] } as const;
// Ortak malzeme seçicisini çağıran modüller (karar 1321 b): malzemeler ve bugün malzeme seçen stok, markalama, siparişler ve Arkon.
// Seçiciyi alan modül (A5) işlemini buraya ekler.
const SECIM_OKUMA = { biri: ['sayfa.malzemeler', 'malzemeler.yaz', 'sayfa.stok', 'sayfa.markalama', 'sayfa.siparisler', 'sayfa.arkon'] } as const;

export const uclar = [
  // Ortak seçici (kart #1319): yalnız kart no, stok kodu, ad ve aktiflik döner.
  uc({
    yontem: 'GET', yol: '/malzemeler/secim-ara', yetki: SECIM_OKUMA, sorgu: malzemeSecimSorgusu, cevap: malzemeSecimCevabi,
    isle: ({ db, sorgu }) => servis.malzemeSecimAra(db, sorgu),
  }),
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
    yontem: 'POST', yol: '/malzeme-katalogu-kartlari/:kimlik/iptal', yetki: 'malzemeler.yaz', parametre: katalogKimlikParametresi, cevap: katalogKartiIptalCevabi,
    isle: ({ db, kullanici, parametre }) => servis.katalogKartiIptal(db, kullanici, parametre.kimlik),
  }),
  // Demirbaş teknik bilgisi (1595): sınırlar, enerji ve serbest özellikler; kartı okuyan görür, kartı yazan girer. Fiyat burada yok (finans, 1599 a).
  uc({
    yontem: 'GET', yol: '/malzeme-katalogu-kartlari/:kimlik/demirbas-teknik', yetki: OKUMA, parametre: katalogKimlikParametresi, cevap: demirbasTeknikCevabi,
    isle: ({ db, parametre }) => servis.demirbasTeknikOku(db, parametre.kimlik),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-katalogu-kartlari/:kimlik/demirbas-teknik/kaydet', yetki: 'malzemeler.yaz', parametre: katalogKimlikParametresi,
    govde: demirbasTeknikKaydetGovdesi, cevap: demirbasTeknikCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.demirbasTeknikKaydet(db, kullanici, parametre.kimlik, govde),
  }),
  uc({ yontem: 'GET', yol: '/malzeme-demirbas-makineleri', yetki: 'malzemeler.yaz', cevap: demirbasMakineSecenekleriCevabi, isle: ({ db }) => servis.demirbasMakineSecenekleri(db) }),
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
  uc({ yontem: 'GET', yol: '/malzeme-olcu-aletleri', yetki: OKUMA, cevap: olcuAletiSecenekleriCevabi, isle: ({ db }) => servis.olcuAletiSecenekleri(db) }),
  // Ölçü birimi listesi (kart #163, SH4 a); listeyi prototipin Ayarlar ekranı düzenler (ayar kaydı, ML2 b).
  uc({ yontem: 'GET', yol: '/malzeme-birimleri', yetki: OKUMA, cevap: olcuBirimleriCevabi, isle: ({ db }) => servis.olcuBirimleriniGetir(db) }),
  // Logo'ya gönderime hazırlık (kart #232): durum salt okunur; karşılığı malzeme tanımlarını yazan doldurur (yeni işlem yok, kullanıcı kararı 08.10.2026).
  uc({ yontem: 'GET', yol: '/malzeme-logo-durumu', yetki: OKUMA, cevap: logoDurumuCevabi, isle: ({ db, kullanici }) => servis.logoDurumunuGetir(db, kullanici) }),
  // Logo'dan gelen kartlar (2116): liste okuyana açık; almak, bağlamak ve Logo'dakini almak kart yazma işlemiyle (yeni işlem yok).
  uc({
    yontem: 'GET', yol: '/malzeme-logo-kartlari', yetki: OKUMA, sorgu: logoGelenSorgusu, cevap: logoGelenCevabi,
    isle: ({ db, sorgu }) => servis.logodanGelenler(db, sorgu),
  }),
  // 3068: Logo geçişi; aynı okuma işlemiyle (yeni veri işlemi yok), toplu işlem adaylığı satırda.
  uc({
    yontem: 'GET', yol: '/malzeme-logo-gecisi', yetki: OKUMA, sorgu: logoGecisSorgusu, cevap: logoGecisCevabi,
    isle: ({ db, sorgu }) => servis.logoGecisi(db, sorgu),
  }),
  // 3068 a: toplu işlemler tek kart işlemlerinin yetkisiyle (malzemeler.yaz); geri alma yalnız CORE'da, Logo'ya istek gitmez.
  uc({
    yontem: 'POST', yol: '/malzeme-logo-gecisi/toplu-bagla', yetki: 'malzemeler.yaz', tekrarKorumali: true, govde: logoTopluBaglaGovdesi, cevap: logoTopluCevabi,
    isle: ({ db, kullanici, govde }) => servis.logoTopluBagla(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-gecisi/toplu-al', yetki: 'malzemeler.yaz', tekrarKorumali: true, govde: logoTopluAlGovdesi, cevap: logoTopluCevabi,
    isle: ({ db, kullanici, govde }) => servis.logoTopluAl(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-gecisi/geri-al', yetki: 'malzemeler.yaz', tekrarKorumali: true, govde: logoGeriAlGovdesi, cevap: logoGeriAlCevabi,
    isle: ({ db, kullanici, govde }) => servis.logoGecisiGeriAl(db, kullanici, govde.islem),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-kartlari/:ref/al', yetki: 'malzemeler.yaz', parametre: logoGelenParametresi, govde: logodanAlGovdesi, cevap: logodanAlCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.logodanKartAl(db, kullanici, parametre.ref, govde),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-kartlari/:ref/bagla', yetki: 'malzemeler.yaz', parametre: logoGelenParametresi, govde: logoKartSurumGovdesi, cevap: logoKartSurumCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.logoKartiBagla(db, kullanici, parametre.ref, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-kartlari/:ref/farki-al', yetki: 'malzemeler.yaz', parametre: logoGelenParametresi, govde: logoKartSurumGovdesi, cevap: logoKartSurumCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.logoFarkiniAl(db, kullanici, parametre.ref, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-kartlari/:ref/yeni-koda-gec', yetki: 'malzemeler.yaz', parametre: logoGelenParametresi, govde: logoKartSurumGovdesi,
    cevap: logoYeniKodCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.logoKartiYeniKodaGec(db, kullanici, parametre.ref, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-logo-karsiliklari/kaydet', yetki: 'malzemeler.tanim-yaz', govde: logoKarsiligiKaydetGovdesi, cevap: katalogKimlikCevabi,
    isle: ({ db, kullanici, govde }) => servis.logoKarsiligiKaydet(db, kullanici, govde),
  }),
  // Arşiv (2114c): silinen kartlar ve bağları sayfayı okuyana açık; geri getirme ve kalıcı silme yalnız onaycıda (2114-4 a).
  uc({ yontem: 'GET', yol: '/malzeme-arsivi', yetki: OKUMA, cevap: arsivKartlariCevabi, isle: ({ db }) => servis.arsivKartlariniGetir(db) }),
  uc({
    yontem: 'GET', yol: '/malzeme-arsivi/:kimlik', yetki: OKUMA, parametre: katalogKimlikParametresi, cevap: arsivKartiCevabi,
    isle: ({ db, parametre }) => servis.arsivKartiniGetir(db, parametre.kimlik),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-arsivi/:kimlik/geri-getir', yetki: 'malzemeler.onayla', parametre: katalogKimlikParametresi, cevap: katalogKimlikCevabi,
    isle: ({ db, kullanici, parametre }) => servis.arsivdenGeriGetir(db, kullanici, parametre.kimlik),
  }),
  uc({
    yontem: 'POST', yol: '/malzeme-arsivi/:kimlik/kalici-sil', yetki: 'malzemeler.onayla', parametre: katalogKimlikParametresi, govde: arsivKaliciSilGovdesi,
    cevap: katalogKimlikCevabi, isle: ({ db, parametre, govde }) => servis.arsivdenKaliciSil(db, parametre.kimlik, govde.stokKodu),
  }),
];
