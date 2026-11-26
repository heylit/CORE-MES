import { KOD_ONEKI } from '#paylasilan/kod-sozlugu.ts';
import type { Sablon, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { cm1Yaz } from './kod-yaz.ts';
import { yerlesimleriUret } from './yerlesimler.ts';
import { altSatir, ana, baslik as govdeBasligi, bant, ozel, satir, seritSablonu, yanSatir, type SeritGirdisi } from './serit.ts';
import { REFAKAT_ADIM_SAYISI, REFAKAT_ALT_CIZGI, REFAKAT_SATIR_ARALIGI, SATIR_BASI, refakatAdimlari, type AlanDegerleri } from './kurallar.ts';

// Hazır şablonlar kodda durur: kullanıcı şablonu gelince bunlar kopyalanıp değiştirilecek. Ölçüler mm.
// Piktogram alanı "<karo>:<piktogram>" (paylasilan/etiket-piktogramlari.ts).
// Alan "=" ile başlarsa sabit metindir. Konum kodu 20 karaktere kadar kesilmeden sığar (stok_konum_kod_bicimi, EM-13). Raf etiketi Fabrika Haritası rafından (#116). Bugünkü baskılarla aynı içerik: konum ve malzeme (stok/Etiketler.tsx),
// lot (stok/LotEtiketi.tsx), refakat kartı (stok/RefakatKarti.tsx).

const KOD_ALANLARI = [
  { anahtar: 'kodBaslik', ad: 'Kod başlığı (tür ve etiketi tanıtan değer)' }, { anahtar: 'kodBilgi', ad: 'Kod bilgi yazısı (tür, alanlar, basım)' },
  { anahtar: 'kodBilgiKisa', ad: 'Kod bilgi yazısı, kısa (tür ve basım)' }, { anahtar: 'kodBasim', ad: 'Kod basım tarihi (Basım GG.AA.YYYY)' },
];
const ALANLAR_TEMEL: Record<SablonTuru, { anahtar: string; ad: string }[]> = {
  konum: [{ anahtar: 'qr', ad: 'Kod (LOC)' }, { anahtar: 'kod', ad: 'Konum kodu' }, { anahtar: 'ad', ad: 'Konum adı' }, { anahtar: 'yer', ad: 'Salon ve kutu türü' }],
  raf: [{ anahtar: 'qr', ad: 'Kod (RAF)' }, { anahtar: 'kod', ad: 'Raf kodu' }, { anahtar: 'ad', ad: 'Raf adı' }, { anahtar: 'yer', ad: 'Bölüm, bölme ve kat' }],
  malzeme: [{ anahtar: 'qr', ad: 'Kod (MLZ)' }, { anahtar: 'ad', ad: 'Malzeme adı' }, { anahtar: 'kod', ad: 'Stok kodu' }, { anahtar: 'kart', ad: 'Kart no' }],
  lot: [
    { anahtar: 'qr', ad: 'Kod (LOT)' }, { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'malzeme', ad: 'Malzeme' }, { anahtar: 'kart', ad: 'Kart ve tür' },
    { anahtar: 'parti', ad: 'Parti, döküm, sertifika' }, { anahtar: 'giris', ad: 'Giriş, miktar, belge' },
    { anahtar: 'durumBant', ad: 'Durum (Mal kabul, Serbest, Hatalı, Şartlı kabul, Red)' }, { anahtar: 'durumAlt', ad: 'Durum açıklaması' }, { anahtar: 'bantSimge', ad: 'Durum piktogramı' },
    { anahtar: 'bakiye', ad: 'Bu etiketin miktarı ve konumu' }, { anahtar: 'basimZamani', ad: 'Basım zamanı' }, { anahtar: 'tur', ad: 'Malzeme türü' },
    { anahtar: 'olcu', ad: 'Ölçü' }, { anahtar: 'kalite', ad: 'Kalite' }, { anahtar: 'temper', ad: 'Durum (ısıl işlem / temper)' }, { anahtar: 'islem', ad: 'İşlem' },
    { anahtar: 'tedarikci', ad: 'Tedarikçi' }, { anahtar: 'sertifika', ad: 'Sertifika, döküm, parti' }, { anahtar: 'girisSatiri', ad: 'Giriş, miktar, mal kabul' }, { anahtar: 'gkk', ad: 'GKK no ve sonucu' },
  ],
  refakat: [
    { anahtar: 'qr', ad: 'Kod (UE ya da RP)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'urunAd', ad: 'Ürün adı' }, { anahtar: 'urunKod', ad: 'Parça no' }, { anahtar: 'revizyon', ad: 'Revizyon kodu (Rev …)' },
    { anahtar: 'adetTermin', ad: 'Adet ve termin' }, { anahtar: 'parti', ad: 'Parti' }, { anahtar: 'basim', ad: 'Basım tarihi' },
    { anahtar: 'adimlar', ad: 'İşlem sırası' }, { anahtar: 'rota', ad: 'Rota (adım başına satır)' }, { anahtar: 'lot', ad: 'Lot, parti, döküm, sertifika' },
    { anahtar: 'adet', ad: 'Adet' }, { anahtar: 'termin', ad: 'Termin' }, { anahtar: 'adim1Ad', ad: 'İşlem satırları (no, ad, yer, piktogram)' },
    { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'lotEk', ad: 'Döküm, sertifika, tedarikçi partisi' }, { anahtar: 'kopya', ad: 'Kopya sırası (n/N)' },
    { anahtar: 'kartKodu', ad: 'Refakat kodu (elle yazılacak, RP …)' },
  ],
  istasyon: [{ anahtar: 'qr', ad: 'Kod (LOC)' }, { anahtar: 'kod', ad: 'İstasyon kodu' }, { anahtar: 'ad', ad: 'İstasyon adı' }],
  'kalite-durum': [
    { anahtar: 'qr', ad: 'Kod (LOT)' }, { anahtar: 'durum', ad: 'Kalite durumu' }, { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'malzeme', ad: 'Malzeme adı ve kodu' },
    { anahtar: 'miktar', ad: 'Miktar, birim ve konum' }, { anahtar: 'kararSimge', ad: 'Karar piktogramı' },
    { anahtar: 'kart', ad: 'Kart ve tür' }, { anahtar: 'parti', ad: 'Parti, döküm, sertifika' }, { anahtar: 'giris', ad: 'Giriş, miktar, belge' },
    { anahtar: 'durumBant', ad: 'Durum (Mal kabul, Serbest, Hatalı, Şartlı kabul, Red)' }, { anahtar: 'durumAlt', ad: 'Durum açıklaması' }, { anahtar: 'bantSimge', ad: 'Durum piktogramı' },
    { anahtar: 'bakiye', ad: 'Bu etiketin miktarı ve konumu' }, { anahtar: 'basimZamani', ad: 'Basım zamanı' }, { anahtar: 'tur', ad: 'Malzeme türü' },
    { anahtar: 'olcu', ad: 'Ölçü' }, { anahtar: 'kalite', ad: 'Kalite' }, { anahtar: 'temper', ad: 'Durum (ısıl işlem / temper)' }, { anahtar: 'islem', ad: 'İşlem' },
    { anahtar: 'tedarikci', ad: 'Tedarikçi' }, { anahtar: 'sertifika', ad: 'Sertifika, döküm, parti' }, { anahtar: 'girisSatiri', ad: 'Giriş, miktar, mal kabul' }, { anahtar: 'gkk', ad: 'GKK no ve sonucu' },
  ],
  'hatali-parca': [
    { anahtar: 'qr', ad: 'Kod (UE, parçanın emri)' }, { anahtar: 'durum', ad: 'Durum (karar)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'parca', ad: 'Parça no ve adı' },
    { anahtar: 'islem', ad: 'İşlem no ve adı' }, { anahtar: 'adetNeden', ad: 'Adet ve hurda nedeni' }, { anahtar: 'ayiran', ad: 'Ayıran ve zaman' },
    { anahtar: 'karar', ad: 'Karar veren, zaman, NCR no, not' }, { anahtar: 'kararSimge', ad: 'Karar piktogramı' },
  ],
  'sevk-koli': [
    { anahtar: 'qr', ad: 'Kod (UE, kalemin emri)' }, { anahtar: 'musteri', ad: 'Müşteri' }, { anahtar: 'parca', ad: 'Parça no ve adı' },
    { anahtar: 'adet', ad: 'Koli içi adet' }, { anahtar: 'koli', ad: 'Koli sırası (n/N)' }, { anahtar: 'koliSira', ad: 'Koli sırası, kısa' }, { anahtar: 'adetSayi', ad: 'Koli içi adet, sayı' }, { anahtar: 'adetBaslik', ad: 'Adet başlığı (koli içi ya da kalem toplamı)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'sevk', ad: 'Sevk tarihi ve belge no' },
  ],
  deneme: [{ anahtar: 'qr', ad: 'Kod (DataMatrix)' }, { anahtar: 'kimlik', ad: 'Kod (QR, yalnız kimlik)' }, { anahtar: 'yazici', ad: 'Dil ve çözünürlük' }],
};
export const ALANLAR: Record<SablonTuru, { anahtar: string; ad: string }[]> = Object.fromEntries(
  Object.entries(ALANLAR_TEMEL).map(([tur, liste]) => [tur, tur === 'deneme' ? liste : [...liste, ...KOD_ALANLARI]]),
) as Record<SablonTuru, { anahtar: string; ad: string }[]>;

type Ek = { ters?: boolean; kosul?: string; mono?: boolean };
// Kod yeri: DataMatrix (varsayılan) ya da QR; alan özet kodu (CM1) taşır, yazıcı denemesinde ikinci kod yalnız kimliği.
const kodOge = (x: number, y: number, boyut: number, alan = 'qr', simge?: 'dm' | 'qr') => ({ tur: 'kod' as const, x, y, boyut, alan, ...(simge === undefined ? {} : { simge }) });
const metin = (x: number, y: number, genislik: number, yukseklik: number, yaziMm: number, alan: string, kalin = false, ek: Ek = {}) =>
  ({ tur: 'metin' as const, x, y, genislik, yukseklik, yaziMm, kalin, alan, ...ek });
const kutu = (x: number, y: number, genislik: number, yukseklik: number, kalinlik = 0.3, kosul?: string) =>
  ({ tur: 'kutu' as const, x, y, genislik, yukseklik, kalinlik, ...(kosul === undefined ? {} : { kosul }) });
const simge = (x: number, y: number, boyut: number, alan: string, kosul?: string) =>
  ({ tur: 'simge' as const, x, y, boyut, alan, ...(kosul === undefined ? {} : { kosul }) });
// Alan başlığı: 1,9 mm büyük harf; değeri olmayan satırın başlığı basılmaz.
const baslik = (x: number, y: number, genislik: number, metni: string, kosul?: string) => metin(x, y, genislik, 2.2, 1.9, `=${metni}`, false, kosul === undefined ? {} : { kosul });

// Refakat kartında işlem satırı (EM-27, 2907): no, ad, yer ve işaret (fason ya da çıkış); satır altında ince çizgi. İmza kutusu yok
// (2907-1 a), elle kayıt kutusu da yok (2932: kullanıcı kaldırdı). Satır aralığı REFAKAT_SATIR_ARALIGI: on beş satır işlem başlığından alt çizgiye yayılır.
const refakatAdimi = (i: number) => {
  const y = 65 + (i - 1) * REFAKAT_SATIR_ARALIGI;
  const ad = `adim${i}Ad`;
  return [
    metin(4, y, 9, 3.6, 3.2, `adim${i}No`, true), metin(14, y, 37, 3.6, 3.2, ad, true), metin(52, y + 0.4, 36, 3, 2.4, `adim${i}Yer`),
    simge(90.8, y + 0.1, 3.8, `adim${i}Isaret`), kutu(4, y + 4.4, 92, 0.2, 0.2, ad),
  ];
};
// 3758 b: kamera kullanmayan operatör kodu terminale elle yazar. Kartın sağ altında, işlem tablosunun boş köşesinde çerçeveli
// "REFAKAT KODU" kutusu; kod kalın, eşit aralıklı, kutuya sığana kadar küçülür. Değer (kartKodu) uzun rotada boştur (kurallar.ts).
const refakatKodKutusu = [
  kutu(55.5, 132.9, 42, 9.6, 0.5, 'kartKodu'),
  metin(57.3, 133.4, 38, 2.6, 2.2, '=REFAKAT KODU:', true, { kosul: 'kartKodu' }),
  metin(57.3, 135.6, 38.4, 6.4, 5.3, 'kartKodu', true, { mono: true }),
];
const DENEME_SIMGELERI = ['konum', 'raf', 'malzeme', 'lot', 'refakat', 'tezgah', 'kalite', 'hatali', 'koli', 'kumpas'];

// Kart 3562 (A, kod şeridi): her şablon şerit ve gövdedir (serit.ts). Gövde sırası: tür başlığı, durum bandı, ana değer, satırlar; sığmayan satır
// düşer ve şablonun uyarısına yazılır. Kalite durumu ve Hatalı parça başlığı ters yazıdır (Z1), şeritteki piktogram kararın piktogramıdır.
const bandKutusu = (x: number, y: number, genislik: number, yukseklik: number, kosul?: string) => kutu(x, y, genislik, yukseklik, yukseklik, kosul);
const dene = (anahtar: string, ad: string, tur: SablonTuru, genislik: number, yukseklik: number, o: Omit<SeritGirdisi, 'anahtar' | 'ad' | 'tur' | 'genislik' | 'yukseklik'>): Sablon =>
  seritSablonu({ anahtar, ad, tur, genislik, yukseklik, ...o });

// Malzeme etiketi: etiket ve değer aynı satırda (yükseklik dar); durum bandı, çerçeve ve piktogram malzeme durumundan gelir.
const malzemeBloklari = [
  govdeBasligi('LOT', false, false, [{ alan: 'tur', genislik: 19, yazi: 2.2 }, { alan: 'bakiye', genislik: 'kalan', yazi: 2.6, kalin: true }]),
  bant('durumBant', { alt: 'durumAlt' }), ana('lotNo', 4.6), altSatir('malzeme', 2.6),
  yanSatir([['ÖLÇÜ', 'olcu', 0.55], ['KALİTE', 'kalite', 0.45]]), yanSatir([['İŞLEM', 'islem', 0.55], ['DURUM', 'temper', 0.45]]), yanSatir([['TEDARİKÇİ', 'tedarikci', 1]]),
  yanSatir([['SERTİFİKA', 'sertifika', 1]]), yanSatir([['GİRİŞ', 'girisSatiri', 1]]), yanSatir([['GKK', 'gkk', 1]]),
];

// Refakat kartı: şerit ve gövde ilk 60 mm; işlem tablosu ve basım satırı bugünkü gibi tam enle (EM-27, 2907).
const refakatGovdesi = [
  govdeBasligi('REFAKAT KARTI'),
  ozel('kopya', 3.2, (y, yer) => [metin(yer.bx, y, 20, 2.6, 2.2, 'kopya', true), metin(yer.bx + 21, y, 25, 2.6, 2.2, 'revizyon', true)]),
  ana('emirNo', 7.4),
  ozel('urunAd', 4.8, (y, yer) => [metin(yer.bx, y, yer.bw, 4.2, 3.6, 'urunAd', true)]),
  altSatir('urunKod', 2.6),
  ozel('adet ve termin', 14, (y, yer) => {
    const yarim = yer.bw * 0.45;
    return [
      kutu(yer.bx, y, yer.bw, 12.5, 0.4), kutu(yer.bx + yarim, y, 0.4, 12.5, 0.4),
      baslik(yer.bx + 1.5, y + 1.2, yarim - 2, 'EMİR ADEDİ'), metin(yer.bx + 1.5, y + 3.6, yarim - 2, 7.2, 6.6, 'adet', true),
      baslik(yer.bx + yarim + 1.8, y + 1.2, yer.bw - yarim - 3, 'TERMİN'), metin(yer.bx + yarim + 1.8, y + 4.8, yer.bw - yarim - 3, 4.6, 4, 'termin', true),
    ];
  }),
  ozel('lot', 12.3, (y, yer) => [
    bandKutusu(yer.bx, y, yer.bw, 11.5, 'lotNo'),
    metin(yer.bx + 1.5, y + 1.2, 28, 2.2, 1.9, '=LOT', false, { ters: true, kosul: 'lotNo' }), metin(yer.bx + 1.5, y + 3.6, 28, 6, 5, 'lotNo', true, { ters: true }),
    metin(yer.bx + 31, y + 1.8, yer.bw - 32.5, 7.6, 2.1, 'lotEk', false, { ters: true }),
  ]),
];

// Sevk kolisi: koli içi adet çerçevede, koli sırası siyah kutuda; müşteri uzaktan okunur.
const sevkKutulari = ozel('koli kutuları', 13.2, (y, yer) => {
  const w = (yer.bw - 1.5) / 2;
  const x2 = yer.bx + w + 1.5;
  return [
    kutu(yer.bx, y, w, 12.4, 0.4), metin(yer.bx + 1.2, y + 0.6, w - 2, 2.2, 1.9, 'adetBaslik', false, { kosul: 'adetSayi' }),
    metin(yer.bx + 1.2, y + 2.8, w - 2, 6.6, 5.2, 'adetSayi', true), metin(yer.bx + 1.2, y + 9.4, w - 2, 3, 2.4, '=adet', false, { kosul: 'adetSayi' }),
    bandKutusu(x2, y, w, 12.4), metin(x2 + 1.2, y + 0.6, w - 2, 2.2, 1.9, '=KOLİ', false, { ters: true }), metin(x2 + 1.2, y + 2.8, w - 2, 7, 5.6, 'koliSira', true, { ters: true }),
  ];
});
const sevkYukari = ozel('yön oku', 10, (y, yer) => [simge(yer.bx, y, 9, '=yok:yukari'), metin(yer.bx + 11, y + 2.8, yer.bw - 11, 3.4, 2.8, '=Bu yüz yukarı', true)]);

// Yazıcı denemesi: Türkçe harf, ters yazı ve piktogramlar; yazıcının bunları basabildiği burada görülür. İkinci kod eski QR'dır (yalnız kimlik).
const DENEME_ADIM = 6.6;
const denemeBloklari = [
  govdeBasligi('YAZICI DENEMESİ'),
  ozel('harf', 4.4, (y, yer) => [metin(yer.bx, y, yer.bw - 12, 3.8, 3, '=ÇĞİÖŞÜ çğıöşü', true)]),
  ozel('yazı', 3.2, (y, yer) => [metin(yer.bx, y, yer.bw - 12, 2.6, 2, '=Yazı 2 mm: 0123456789')]),
  ozel('ters', 5.6, (y, yer) => [bandKutusu(yer.bx, y, 32, 4.6), metin(yer.bx + 1.4, y + 0.7, 30, 3.2, 2.6, '=TERS YAZI', true, { ters: true })]),
  ozel('dil', 8, (y, yer) => [metin(yer.bx, y, yer.bw, 7, 2.6, 'yazici')]),
  ozel('piktogram', 6.8, (y, yer) => DENEME_SIMGELERI.map((p, i) => simge(yer.bx + i * DENEME_ADIM, y, 5.6, `=siyah:${p}`))),
  ozel('piktogram yazısı', 3.2, (y, yer) => [metin(yer.bx, y, yer.bw, 2.8, 2.2, '=Piktogram 5,6 mm')]),
];

const SERIT_SABLONLARI: readonly Sablon[] = [
  dene('konum-50x25', 'Yer 50x25', 'konum', 50, 25, {
    turAdi: 'KONUM', simge: 'siyah:konum', bloklar: [ana('kod', 3.8, { satir: 2 }), satir('', 'yer', 2.2), satir('', 'ad', 2.2)],
  }),
  dene('konum-100x50', 'Yer 100x50', 'konum', 100, 50, {
    turAdi: 'KONUM', simge: 'siyah:konum', bloklar: [govdeBasligi('KONUM'), ana('kod', 7), satir('AD', 'ad', 3.2), satir('YER', 'yer')],
  }),
  // Raf etiketi rafta uzaktan okutulur (3336 b): kare etikette kod büyük (72 mm) ve üstte, ad ve yer altta; kullanıcı kararı (3563 sonrası): Raf 100x100 büyük kodda kalır, kod şeridi seçilebilir yerleşimdir.
  // Kodun çevresinde kendi iki modülüne ek 3 mm boşluk kalır (#707). Raf türünde ilk sıradadır (varsayılan).
  { anahtar: 'raf-100x100', ad: 'Raf 100x100', tur: 'raf', genislik: 100, yukseklik: 100, ogeler: [
    simge(88, 2, 10, '=siyah:raf'), metin(3, 2.4, 83, 10, 9.5, 'kod', true),
    kodOge(14, 15.4, 72),
    metin(3, 90.4, 94, 4.4, 3.8, 'ad', true), metin(3, 95.2, 94, 4, 3.2, 'yer'),
  ] },
  dene('raf-100x50', 'Raf 100x50', 'raf', 100, 50, {
    turAdi: 'RAF', simge: 'siyah:raf', bloklar: [govdeBasligi('RAF'), ana('kod', 9), satir('AD', 'ad', 3.2), satir('YER', 'yer')],
  }),
  dene('raf-50x25', 'Raf 50x25', 'raf', 50, 25, {
    turAdi: 'RAF', simge: 'siyah:raf', bloklar: [ana('kod', 3.8, { satir: 2 }), satir('', 'yer', 2.2)],
  }),
  dene('malzeme-50x25', 'Malzeme 50x25', 'malzeme', 50, 25, {
    turAdi: 'MALZEME', simge: 'siyah:malzeme', bloklar: [ana('kod', 3.8, { satir: 2 }), satir('', 'kart', 2.2), satir('', 'ad', 2.2)],
  }),
  dene('malzeme-etiketi-100x50', 'Malzeme etiketi 100x50', 'lot', 100, 50, {
    turAdi: 'LOT', simge: 'bantSimge', simgeAlani: true, cerceve: 'cerceve', bloklar: malzemeBloklari,
  }),
  dene('lot-100x50', 'Lot 100x50', 'lot', 100, 50, {
    turAdi: 'LOT', simge: 'siyah:lot', bloklar: [govdeBasligi('LOT', false, false, [{ alan: 'kart', genislik: 'kalan', yazi: 2.2 }]), ana('lotNo', 6.2), satir('MALZEME', 'malzeme', 2.8), satir('PARTİ · DÖKÜM · SERTİFİKA', 'parti'), satir('GİRİŞ', 'giris')],
  }),
  // 2907 (2912 a): şerit ve gövde ilk 60 mm; işlem sırası adım başına tek satır, on beş satır; elle kayıt kutusu yok (2932).
  dene('refakat-100x150', 'Refakat kartı 100x150', 'refakat', 100, 150, {
    turAdi: 'REFAKAT', simge: 'siyah:refakat', bloklar: refakatGovdesi,
    ek: [
      kutu(1, 60, 98, 0.4), baslik(4, 61.6, 60, 'İŞLEM SIRASI', 'adim1Ad'),
      ...Array.from({ length: REFAKAT_ADIM_SAYISI }, (_, i) => refakatAdimi(i + 1)).flat(),
      kutu(1.5, REFAKAT_ALT_CIZGI, 97, 0.3), metin(4, REFAKAT_ALT_CIZGI + 1.4, 58, 3, 2.4, 'parti'),
      ...refakatKodKutusu,
    ],
  }),
  // 2922 a: istasyon etiketi yer etiketinin bir boyudur; kod aynı konum kodudur (LOC), başlıkta "Teslim yeri" yazar.
  dene('istasyon-100x50', 'Yer 100x50 · Teslim yeri', 'istasyon', 100, 50, {
    turAdi: 'TESLİM YERİ', simge: 'siyah:tezgah', bloklar: [govdeBasligi('TESLİM YERİ'), ana('kod', 7), satir('AD', 'ad', 4)],
  }),
  dene('malzeme-durum-100x50', 'Malzeme etiketi 100x50', 'kalite-durum', 100, 50, {
    turAdi: 'LOT', simge: 'bantSimge', simgeAlani: true, cerceve: 'cerceve', bloklar: malzemeBloklari,
  }),
  dene('kalite-durum-100x50', 'Kalite durumu 100x50', 'kalite-durum', 100, 50, {
    turAdi: 'KALİTE · LOT', simge: 'kararSimge', simgeAlani: true, cerceve: 'redCerceve',
    bloklar: [govdeBasligi('KALİTE · LOT', true), bant('durum', { buyuk: true }), ana('lotNo', 5.4), satir('MALZEME', 'malzeme', 2.8), satir('MİKTAR · KONUM', 'miktar', 2.8)],
  }),
  dene('sevk-koli-100x75', 'Sevk kolisi 100x75', 'sevk-koli', 100, 75, {
    turAdi: 'SEVK KOLİSİ', simge: 'siyah:koli',
    bloklar: [govdeBasligi('SEVK KOLİSİ'), ana('musteri', 6, { baslik: 'MÜŞTERİ', kosul: 'musteri' }), satir('PARÇA', 'parca', 3), sevkKutulari, satir('EMİR', 'emirNo', 3.2), satir('SEVK · BELGE', 'sevk', 2.8), sevkYukari],
  }),
  dene('hatali-parca-100x50', 'Hatalı parça 100x50', 'hatali-parca', 100, 50, {
    turAdi: 'HATALI PARÇA', simge: 'kararSimge', simgeAlani: true, cerceve: 'redCerceve',
    bloklar: [
      govdeBasligi('HATALI PARÇA', true), bant('durum', { buyuk: true }), ana('emirNo', 4.6, { baslik: 'EMİR', kosul: 'emirNo' }),
      yanSatir([['PARÇA', 'parca', 1]]), yanSatir([['İŞLEM', 'islem', 1]]), yanSatir([['ADET', 'adetNeden', 1]]), yanSatir([['AYIRAN', 'ayiran', 1]]), yanSatir([['KARAR', 'karar', 1]]),
    ],
  }),
  dene('deneme-100x50', 'Yazıcı denemesi 100x50', 'deneme', 100, 50, {
    turAdi: 'DENEME', simge: 'siyah:yazici', bloklar: denemeBloklari, govdeSimgesi: 0,
    ek: [kutu(0.5, 0.5, 99, 49, 0.4), kodOge(89, 1.5, 9.5, 'kimlik', 'qr')],
  }),
  dene('deneme-50x25', 'Yazıcı denemesi 50x25', 'deneme', 50, 25, {
    turAdi: 'DENEME', simge: 'siyah:yazici',
    bloklar: [
      ozel('harf', 3.4, (y, yer) => [metin(yer.bx, y, yer.en(y), 3, 2.6, '=ÇĞİÖŞÜ çğıöşü', true)]),
      ozel('piktogram', 5.6, (y, yer) => [simge(yer.bx, y, 5, '=siyah:lot'), simge(yer.bx + 5.6, y, 5, '=beyaz:onay'), simge(yer.bx + 11.2, y, 5, '=cizgili:bekliyor'), simge(yer.bx + 16.8, y, 5, '=siyah:red')]),
      ozel('dil', 7, (y, yer) => [metin(yer.bx, y, yer.bw, 6.4, 2, 'yazici')]),
    ],
    ek: [kutu(0.5, 0.5, 49, 24, 0.4)],
  }),
];

// Kod şeridi seçilebilir yerleşimdir: Raf 100x100'ün tabanı büyük kodlu düzendir (kullanıcı kararı), şerit düzeni yanında sunulur.
const KOD_SERIDI_EKLERI: readonly Sablon[] = [
  { ...dene('raf-100x100-kod-seridi', 'Raf 100x100 · Kod şeridi', 'raf', 100, 100, {
    turAdi: 'RAF', simge: 'siyah:raf', bloklar: [ana('kod', 12), satir('AD', 'ad', 3.6), satir('YER', 'yer', 3.2)],
  }), yerlesim: 'kod-seridi', taban: 'raf-100x100' },
];

// Şerit hazır şablonun kendisidir; öteki yerleşimler sonda gelir, böylece türün ilk şablonu (varsayılan seçim) değişmez.
export const HAZIR_SABLONLAR: readonly Sablon[] = [
  ...SERIT_SABLONLARI.map((s): Sablon => ({ ...s, yerlesim: 'serit', taban: s.anahtar })),
  ...yerlesimleriUret(SERIT_SABLONLARI),
  ...KOD_SERIDI_EKLERI,
];

const ozetOrnegi = (kimlik: string, alanlar: Record<string, string>, sira?: readonly string[]): string => {
  const i = kimlik.indexOf(':');
  return cm1Yaz({ anahtar: kimlik.slice(0, i), deger: kimlik.slice(i + 1) }, alanlar, new Date('2026-11-22T09:00:00Z'), sira);
};
const MALZEME_ORNEGI = {
  durumBant: 'MAL KABUL', durumAlt: 'GKK bekliyor · kullanılamaz', bantSimge: 'cizgili:bekliyor', cerceve: null, bakiye: '120 kg · ORN-KRN-01', basimZamani: '18.10.2026 09:15',
  tur: 'HAMMADDE', olcu: 'Ø50×3000 mm', kalite: '42CrMo4', temper: 'Islah (+QT)', islem: 'Gerilim giderme', tedarikci: 'Örnek Çelik A.Ş.',
  sertifika: 'S-01 · Döküm D-01 · Parti P-01', girisSatiri: '18.10.2026 · 120 kg · MK-000045', gkk: 'Bekliyor',
};
// Önizleme ve deneme için uydurma örnek değerler; gerçek kayıt değildir.
export const ORNEK_DEGERLER: Record<SablonTuru, AlanDegerleri> = {
  konum: { qr: ozetOrnegi('LOC:A01-02-3', { AD: 'Örnek raf gözü' }), kod: 'A01-02-3', ad: 'Örnek raf gözü', yer: 'Salon 1 · Raf gözü' },
  raf: { qr: ozetOrnegi('RAF:A12', { AD: 'Örnek palet rafı', YER: 'SALON1 6x4' }), kod: 'A12', ad: 'Örnek palet rafı', yer: 'SALON1 · 6 bölme × 4 kat' },
  malzeme: { qr: ozetOrnegi('MLZ:1001', { SK: 'ORN-0001' }), ad: 'Örnek çelik mil Ø20', kod: 'ORN-0001', kart: 'Kart 1001' },
  lot: {
    qr: ozetOrnegi('LOT:LT-000123', { TPN: 'ORN-P-01', DKM: 'ORN-D-01', SRT: 'ORN-S-01', MK: 'MK-000045', GT: '261018' }), lotNo: 'LT-000123', malzeme: 'Örnek çelik mil Ø20 · ORN-0001', kart: 'Kart 1001 · Hammadde',
    parti: 'Parti P-01 · Döküm D-01', giris: '18.10.2026 · 12 adet · MK-000045', ...MALZEME_ORNEGI,
  },
  refakat: {
    qr: ozetOrnegi('UE:4512', { PRC: 'ORN-FL-01', REV: 'C', ADT: '40', TRM: '301026', OPS: '10+20+30' }), emirNo: 'UE-004512', urunAd: 'Örnek flanş', urunKod: 'Parça no: ORN-FL-01', revizyon: 'Rev C',
    adetTermin: 'Adet 40 · Termin 30.10.2026', parti: null, basim: 'Basım 18.10.2026',
    adimlar: '10 Torna (Örnek tezgâh) · 20 Kaplama (Örnek fason, fason) · 30 Son kontrol',
    rota: ['10 Torna (Örnek tezgâh)', '20 Kaplama (Örnek fason, fason)', '30 Son kontrol'].join(SATIR_BASI), lot: 'Lot LT-000123 · Döküm D-01 · Sertifika S-01',
    lotNo: 'LT-000123', lotEk: 'Döküm D-01 · Sertifika S-01',
    adet: '40', termin: '30.10.2026', kopya: 'Kopya 1/2', kartKodu: 'RP 1234',
    ...refakatAdimlari([{ opNo: 10, ad: 'Torna', yer: 'Örnek tezgâh', fason: false }, { opNo: 20, ad: 'Kaplama', yer: 'Örnek fason', fason: true }, { opNo: 30, ad: 'Son kontrol', yer: null, fason: false }]),
  },
  istasyon: { qr: ozetOrnegi('LOC:IST-CNC-01', { AD: 'Örnek CNC tezgâhı' }), kod: 'IST-CNC-01', ad: 'Örnek CNC tezgâhı' },
  'kalite-durum': {
    qr: ozetOrnegi('LOT:LT-000123', { DRM: 'KBK' }), durum: 'KARAR BEKLİYOR', lotNo: 'LT-000123', malzeme: 'Örnek çubuk Ø40 · ORN-HM-01', miktar: '120 kg · Konum ORN-A01',
    kararSimge: 'cizgili:bekliyor', redCerceve: null, kart: 'Kart 1001 · Hammadde', parti: 'Parti P-01 · Döküm D-01', giris: '18.10.2026 · 120 kg · MK-000045',
    ...MALZEME_ORNEGI,
  },
  'sevk-koli': {
    qr: ozetOrnegi('UE:4512', { NN: '1-4', SVK: 'ORN-1', PRC: 'ORN-FL-01', ADT: '50' }, ['UE', 'NN', 'SVK', 'PRC', 'ADT', 'BT']), musteri: 'Örnek Müşteri', parca: 'ORN-FL-01 · Örnek flanş', adet: 'Koli içi 50 adet', koli: 'Koli 1/4', koliSira: '1/4', adetSayi: '50', adetBaslik: 'KOLİ İÇİ',
    emirNo: 'UE-004512', sevk: '30.10.2026 · Belge ORN-1',
  },
  'hatali-parca': {
    qr: ozetOrnegi('UE:4513', { HP: '7', OP: '20', ADT: '2', KRR: 'BEKLIYOR' }, ['UE', 'HP', 'OP', 'ADT', 'KRR', 'BT']), durum: 'KARAR BEKLİYOR', emirNo: 'UE-004512 · kol UE-004513', parca: 'ORN-FL-01 · Örnek flanş', islem: 'OP 20 Örnek frezeleme',
    adetNeden: '2 adet · Örnek ölçü dışı', ayiran: 'Ayıran Örnek Operatör · 18.10.2026 10:42', karar: null,
    kararSimge: 'cizgili:bekliyor', redCerceve: null,
  },
  // Deneme kodu genişletilmiş setin en uzunu kadardır (ORN- veri): yazıcı ve okuyucu en kötü durumda sınanır; ikinci kod eski QR'dır.
  deneme: {
    qr: ozetOrnegi('LOT:ORN-LT-2041', { TPN: 'ORN-TPN-77812', DKM: 'ORN-DKM-5531', SRT: 'ORN-SRT-310', SKT: '270526', MK: 'ORN-MK-0045', GT: '261118', TDR: 'ORN-TD-07', DRM: 'SRB' }),
    kimlik: `${KOD_ONEKI.konum}:DENEME`, yazici: null,
  },
};
