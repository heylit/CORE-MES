import { bulunamadi } from '#cekirdek/hata.ts';
import { uc } from '#cekirdek/uc.ts';
import { disDuzeltmeCevabi, disDuzeltmelerCevabi, disSiparisCevabi, disSiparisDuzeltGovdesi, disSiparisSorgusu } from '#paylasilan/sozlesme/logo.ts';
import { birimSetiCevabi, birimSetiEkleGovdesi, birimSetiParametresi, birimSetleriCevabi, logoGecisKomutuCevabi, logoHazirlikCevabi, logoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import { logoMalzemeAramaCevabi, logoMalzemeAramaSorgusu, logoMalzemeEkleCevabi, logoMalzemeEkleGovdesi } from '#paylasilan/sozlesme/logo.ts';
import { logoKartAlislariCevabi, logoKartBolumuCevabi, logoKartHareketleriCevabi, logoKartHareketSorgusu, logoKartParametresi } from '#paylasilan/sozlesme/logo.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import { kartBolumu } from './kart-bolumu.ts';
import { disDuzeltmeAcik, ortamKoprusu, ortamOzeti } from './baglanti.ts';
import { disDuzeltmeleri, disSiparisDuzelt } from './dis-siparis.ts';
import { logodaMalzemeAra, logodanDisSiparisOku, logodanKartAlislari, logodanKartHareketleri } from './isler.ts';
import { birimSetiEkle, birimSetiKaldir, birimSetleriniGetir, gecisiBitir, gecisOkumasiIste, hazirlik, kontrol, logoAramaSonucunuEkle } from './servis.ts';

// 3201 a: bölümü kartı görebilen ister; stok ve hareket parçası yalnız stoğu okuyabilene (stok uçlarının okuma yetkisi; malzeme
// sayfası olup stok sayfası olmayan rol depo miktarını burada da görmez), fiyat parçası yalnız alış fiyatını görebilene.
const KART_OKUMA = { biri: ['sayfa.malzemeler'] } as const;
const KART_STOK = ['sayfa.stok', ...STOK_ISLEMLERI] as const;
const KART_FIYAT = ['satin-alma.oku', 'satin-alma.yaz', 'finans.maliyet-oku'] as const;

// Birim seti listesi: malzemelerin "Logo gönderimi" sayfası karşılık seçerken okur (LB9 a); elle ekleme ve kaldırma yalnız yöneticide (LB11 a).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/logo/birim-setleri',
    yetki: { biri: ['sayfa.malzemeler', 'logo.birim-seti-yaz'] },
    cevap: birimSetleriCevabi,
    isle: ({ db }) => birimSetleriniGetir(db, ortamKoprusu),
  }),
  uc({
    yontem: 'POST',
    yol: '/logo/birim-setleri/ekle',
    yetki: 'logo.birim-seti-yaz',
    govde: birimSetiEkleGovdesi,
    cevap: birimSetiCevabi,
    isle: ({ db, kullanici, govde }) => birimSetiEkle(db, kullanici.id, govde.kod, govde.ad),
  }),
  uc({
    yontem: 'POST',
    yol: '/logo/birim-setleri/:kod/kaldir',
    yetki: 'logo.birim-seti-yaz',
    parametre: birimSetiParametresi,
    cevap: birimSetiCevabi,
    isle: ({ db, parametre }) => birimSetiKaldir(db, parametre.kod),
  }),
  // 3077 a: geçiş okuması yalnız istekle. Ayarı değiştirdiği için Sistem Ayarları'nın yazma yetkisini ister (3078 b); Logo'ya yalnız okuma gider.
  uc({
    yontem: 'POST',
    yol: '/logo-gecisi/oku',
    yetki: 'ayarlar.yaz',
    cevap: logoGecisKomutuCevabi,
    isle: async ({ db, kullanici }) => { await gecisOkumasiIste(db, kullanici.id); return { tamam: true as const }; },
  }),
  uc({
    yontem: 'POST',
    yol: '/logo-gecisi/bitir',
    yetki: 'ayarlar.yaz',
    cevap: logoGecisKomutuCevabi,
    isle: async ({ db, kullanici }) => { await gecisiBitir(db, kullanici.id); return { tamam: true as const }; },
  }),
  // Hazırlık ve canlı kontrol yalnız sistem ayrıntısını görene (yönetici): adres ve ayar durumu gösterilir, anahtar gösterilmez.
  uc({
    yontem: 'GET',
    yol: '/logo/hazirlik',
    yetki: 'saglik.ayrinti-oku',
    cevap: logoHazirlikCevabi,
    isle: ({ db }) => hazirlik(db, ortamKoprusu, ortamOzeti),
  }),
  // Köprüye yalnız GET gider. Transaction dışında koşar: köprü 60 sn'ye kadar cevap bekletebilir, okuma transaction'ı açık kalmasın.
  uc({
    yontem: 'GET',
    yol: '/logo/hazirlik/kontrol',
    yetki: 'saglik.ayrinti-oku',
    txDisi: true,
    cevap: logoKontrolCevabi,
    isle: () => kontrol(ortamKoprusu),
  }),
  // D7 (kartlar 2986 a, 2987 a): Logo'da CORE MES dışında açılmış satın alma siparişi. Okuma fiyat ve cari kodu döndürür: yalnız düzeltme
  // yetkisinde (G1, D4b). Anahtar kapalıyken uçlar yok sayılır (404), yetki denetimi yine önce gelir.
  uc({
    yontem: 'GET',
    yol: '/logo/dis-siparis',
    yetki: 'logo.siparis-duzelt',
    txDisi: true,
    sorgu: disSiparisSorgusu,
    cevap: disSiparisCevabi,
    isle: ({ db, kullanici, sorgu }) => {
      if (!disDuzeltmeAcik()) throw bulunamadi();
      return logodanDisSiparisOku({ tx: (f) => f(db) }, kullanici.id, sorgu.no);
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/logo/dis-siparis/duzelt',
    yetki: 'logo.siparis-duzelt',
    tekrarKorumali: true,
    govde: disSiparisDuzeltGovdesi,
    cevap: disDuzeltmeCevabi,
    isle: async ({ db, kullanici, govde }) => {
      if (!disDuzeltmeAcik()) throw bulunamadi();
      return { kayit: await disSiparisDuzelt(db, kullanici.id, govde) };
    },
  }),
  uc({
    yontem: 'GET',
    yol: '/logo/dis-siparis/duzeltmeler',
    yetki: 'logo.siparis-duzelt',
    sorgu: disSiparisSorgusu,
    cevap: disDuzeltmelerCevabi,
    isle: async ({ db, sorgu }) => {
      if (!disDuzeltmeAcik()) throw bulunamadi();
      return { kayitlar: await disDuzeltmeleri(db, sorgu.no) };
    },
  }),
  // 3080 a: Logo geçişinde tek kart canlı araması; malzeme kartı açabilen arar ve bulduğunu listeye ekler. Arama köprüyü beklediği için
  // transaction dışındadır ve yalnız okur; ekleme köprüye gitmez, aynı kişinin son aramasındaki kartı okunmuş kopyaya yazar.
  uc({
    yontem: 'GET',
    yol: '/logo-gecisi/malzeme-ara',
    yetki: 'malzemeler.yaz',
    txDisi: true,
    sorgu: logoMalzemeAramaSorgusu,
    cevap: logoMalzemeAramaCevabi,
    isle: async ({ db, kullanici, sorgu }) => {
      const r = await logodaMalzemeAra({ tx: (f) => f(db) }, kullanici.id, sorgu.q);
      return r.tur === 'tamam'
        ? { durum: 'tamam' as const, ileti: r.veri.length === 0 ? 'Logo\'da bu metinle kullanımda kart yok.' : null, kartlar: r.veri.map((k) => ({ logoKayitNo: k.logoKayitNo, kod: k.kod, ad: k.ad })) }
        : { durum: r.tur, ileti: r.ileti, kartlar: [] };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/logo-gecisi/malzeme-ekle',
    yetki: 'malzemeler.yaz',
    tekrarKorumali: true,
    govde: logoMalzemeEkleGovdesi,
    cevap: logoMalzemeEkleCevabi,
    isle: async ({ db, kullanici, govde }) => ({ eklenen: await logoAramaSonucunuEkle(db, kullanici.id, govde.kartlar, new Date()) }),
  }),
  // 3201 a: malzeme kartının "Logo'da" bölümü. Parçalar ve stok aynadan okunur (Logo'ya istek yok); hareket ve son alış istenince köprüden,
  // transaction dışında (köprü 60 sn bekleyebilir). Hepsi yalnız okuma.
  uc({
    yontem: 'GET',
    yol: '/logo/malzeme-karti/:kod',
    yetki: KART_OKUMA,
    parametre: logoKartParametresi,
    cevap: logoKartBolumuCevabi,
    isle: ({ db, kullanici, parametre }) => kartBolumu(db, parametre.kod, {
      stok: KART_STOK.some((i) => islemVarMi(kullanici, i)),
      fiyat: KART_FIYAT.some((i) => islemVarMi(kullanici, i)),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/logo/malzeme-karti/:kod/hareketler',
    yetki: { biri: KART_STOK },
    txDisi: true,
    parametre: logoKartParametresi,
    sorgu: logoKartHareketSorgusu,
    cevap: logoKartHareketleriCevabi,
    isle: ({ db, parametre, sorgu }) => logodanKartHareketleri({ tx: (f) => f(db) }, parametre.kod, sorgu.once ?? null),
  }),
  uc({
    yontem: 'GET',
    yol: '/logo/malzeme-karti/:kod/son-alislar',
    yetki: { biri: KART_FIYAT },
    txDisi: true,
    parametre: logoKartParametresi,
    cevap: logoKartAlislariCevabi,
    isle: ({ db, parametre }) => logodanKartAlislari({ tx: (f) => f(db) }, parametre.kod),
  }),
];
