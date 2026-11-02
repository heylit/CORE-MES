import type { FinansHamVerisi } from './donustur.ts';

// Testlerin sunucu cevabı: bütün alanlar sözleşme biçimindedir (para ve kur metin). Firma adları uydurmadır.
const Z = '2026-09-01T09:00:00.000Z';
const firma = (id: number, ad: string, tur: 'musteri' | 'tedarikci' | 'ikisi', kod: string | null) => ({
  id, kod, ad, tur, fason: false, vergiNo: null, il: null, aktif: true, logoCariKodu: null, adresSayisi: 0, koordinatli: false,
});
const belge = (o: Partial<FinansHamVerisi['belgeler'][number]> & { id: number }): FinansHamVerisi['belgeler'][number] => ({
  yon: 'gelir', tur: 'fatura', kategori: 'urun_satisi', firmaId: 1, belgeNo: null, aciklama: null, belgeTarihi: '2026-09-10', vade: '2026-10-10',
  paraBirimi: 'TRY', kur: '1', tutar: '1000.00', kdvOrani: '20', tevkifatPay: null, tevkifatPayda: null, kdvTutari: '200.00', tevkifatTutari: '0.00',
  toplam: '1200.00', toplamTl: '1200.00', kapanan: '0.00', kalan: '1200.00', durum: 'acik', kaynak: 'elle', logoKayitNo: null, logoEsleme: null,
  duzenliOdemeId: null, iptalNedeni: null, siparisId: null, sevkiyatIsiId: null, iadeBelgeId: null, satinAlmaSiparisi: null, olusturma: Z, surum: 1, ...o,
});
const odeme = (o: Partial<FinansHamVerisi['odemeler'][number]> & { id: number }): FinansHamVerisi['odemeler'][number] => ({
  yon: 'gelir', firmaId: 1, tarih: '2026-09-20', yontem: 'banka', hesapId: 1, cekId: null, paraBirimi: 'TRY', kur: '1', tutar: '600.00', tutarTl: '600.00',
  dagitilan: '600.00', kalan: '0.00', aciklama: null, kaynak: 'elle', iptal: false, iptalNedeni: null, olusturma: Z, surum: 1, ...o,
});
const cek = (o: Partial<FinansHamVerisi['cekler'][number]> & { id: number }): FinansHamVerisi['cekler'][number] => ({
  yon: 'alinan', tur: 'cek', firmaId: 1, banka: 'Deneme Bankasi', seriNo: '0001', duzenlemeTarihi: '2026-09-15', vade: '2026-11-15', paraBirimi: 'TRY', kur: '1',
  tutar: '5000.00', tutarTl: '5000.00', durum: 'portfoy', sonucTarihi: null, sonucHesapId: null, odemeId: null, ciroOdemeId: null, surum: 1, ...o,
});

export function ornekHamVeri(): FinansHamVerisi {
  return {
    firmalar: [firma(1, 'Deneme Musteri', 'musteri', 'M1'), firma(2, 'Deneme Tedarik', 'tedarikci', 'T1'), firma(3, 'Deneme Musteri', 'ikisi', null)],
    belgeler: [
      belge({ id: 1, kalan: '600.00', kapanan: '600.00', belgeNo: 'S-1' }),
      belge({ id: 2, yon: 'gider', kategori: 'mal_alimi', firmaId: 2, belgeTarihi: '2026-08-05', vade: '2026-09-05', aciklama: 'Hammadde', satinAlmaSiparisi: { talepId: 't', teklifId: 'k' } }),
      belge({ id: 3, paraBirimi: 'EUR', kur: '35.5', tutar: '100.00', toplam: '120.00', toplamTl: '4260.00', kalan: '120.00', firmaId: 3 }),
      belge({ id: 4, tur: 'iade', kategori: 'satis_iadesi', yon: 'gider', iadeBelgeId: 1, aciklama: 'Hatali parca', tutar: '100.00', toplam: '120.00', toplamTl: '120.00', kalan: '120.00' }),
      belge({ id: 5, tur: 'acilis', kalan: '0.00', kapanan: '1200.00', durum: 'kapandi' }),
      belge({ id: 6, durum: 'iptal' }),
      belge({ id: 7, yon: 'gider', kategori: 'kira', firmaId: null, tur: 'faturasiz', tutar: '8000.00', kdvOrani: '0', kdvTutari: '0.00', toplam: '8000.00', toplamTl: '8000.00', kalan: '0.00', kapanan: '8000.00', durum: 'kapandi' }),
      belge({ id: 8, tevkifatPay: 5, tevkifatPayda: 10, kdvTutari: '200.00', tevkifatTutari: '100.00', toplam: '1100.00', toplamTl: '1100.00', kalan: '1100.00' }),
    ],
    odemeler: [
      odeme({ id: 1 }),
      odeme({ id: 2, yon: 'gider', firmaId: null, tutar: '8000.00', tutarTl: '8000.00', dagitilan: '8000.00' }),
      odeme({ id: 3, yontem: 'cek', hesapId: null, cekId: 1, tutar: '5000.00', tutarTl: '5000.00', dagitilan: '0.00', kalan: '5000.00' }),
      odeme({ id: 4, tutar: '300.00', tutarTl: '300.00', dagitilan: '0.00', kalan: '300.00', firmaId: 2, yon: 'gider' }),
      odeme({ id: 5, iptal: true, kalan: '50.00' }),
    ],
    dagitimlar: [
      { id: 1, odemeId: 1, belgeId: 1, belgeTutari: '600.00', odemeTutari: '600.00', caprazKur: '1', kurFarkiTl: '0', tarih: '2026-09-20', iptal: false },
      { id: 2, odemeId: 2, belgeId: 7, belgeTutari: '8000.00', odemeTutari: '8000.00', caprazKur: '1', kurFarkiTl: '0', tarih: '2026-09-05', iptal: false },
      { id: 3, odemeId: 1, belgeId: 2, belgeTutari: '100.00', odemeTutari: '100.00', caprazKur: '1', kurFarkiTl: '0', tarih: '2026-09-21', iptal: true },
    ],
    mahsuplar: [{ id: 1, firmaId: 3, satisBelgeId: 3, alisBelgeId: 2, satisTutari: '10.00', alisTutari: '355.00', caprazKur: '35.5', tarih: '2026-09-25', iptal: false, surum: 1 }],
    cekler: [
      cek({ id: 1 }),
      cek({ id: 2, yon: 'verilen', firmaId: 2, durum: 'bekliyor', vade: '2026-10-20', tutar: '2000.00', tutarTl: '2000.00', banka: null, seriNo: null }),
      cek({ id: 3, durum: 'tahsil', sonucTarihi: '2026-09-30', vade: '2026-10-01', tur: 'senet' }),
      cek({ id: 4, durum: 'iptal' }),
      cek({ id: 5, paraBirimi: 'USD', kur: '33', tutar: '100.00', tutarTl: '3300.00' }),
    ],
    hesaplar: [
      { id: 1, ad: 'Ana banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: '0', acilisTarihi: '2026-01-01', bankaAdi: null, logoKodu: null, aktif: true, bakiye: '150000.00', surum: 1 },
      { id: 2, ad: 'Kasa', tur: 'kasa', paraBirimi: 'TRY', acilisBakiyesi: '0', acilisTarihi: '2026-01-01', bankaAdi: null, logoKodu: null, aktif: true, bakiye: '2500.50', surum: 1 },
      { id: 3, ad: 'Doviz', tur: 'banka', paraBirimi: 'EUR', acilisBakiyesi: '0', acilisTarihi: '2026-01-01', bankaAdi: null, logoKodu: null, aktif: true, bakiye: '1000.00', surum: 1 },
      { id: 4, ad: 'Sterlin', tur: 'banka', paraBirimi: 'GBP', acilisBakiyesi: '0', acilisTarihi: '2026-01-01', bankaAdi: null, logoKodu: null, aktif: true, bakiye: '10.00', surum: 1 },
    ],
    virmanlar: [],
    kurlar: [
      { paraBirimi: 'EUR', tarih: '2026-10-01', kur: '36.10', surum: 1 },
      { paraBirimi: 'EUR', tarih: '2026-09-01', kur: '35.00', surum: 1 },
      { paraBirimi: 'EUR', tarih: '2026-12-01', kur: '40.00', surum: 1 },
    ],
    kdvOranlari: [{ oran: '20', gecerlilikBaslangic: '2023-07-10', gecerlilikBitis: null, surum: 1 }],
    faizler: [
      { id: 1, paraBirimi: 'TRY', gecerlilikBaslangic: '2026-01-01', aylikYuzde: '3.5', olusturma: Z },
      { id: 2, paraBirimi: 'TRY', gecerlilikBaslangic: '2026-01-01', aylikYuzde: '3.2', olusturma: Z },
      { id: 3, paraBirimi: 'TRY', gecerlilikBaslangic: '2027-01-01', aylikYuzde: '2.0', olusturma: Z },
    ],
    duzenliOdemeler: [
      { id: 1, ad: 'Kira', kategori: 'kira', firmaId: null, hesapId: 1, paraBirimi: 'TRY', tutar: '8000.00', kdvOrani: '0', ayinGunu: 5, aktif: true, surum: 1 },
      { id: 2, ad: 'Eski', kategori: 'enerji', firmaId: null, hesapId: null, paraBirimi: 'TRY', tutar: '100.00', kdvOrani: '20', ayinGunu: 1, aktif: false, surum: 1 },
    ],
    butce: [
      { kategori: 'kira', baslangicAyi: '2026-01-01', aylikTutar: '7000.00', surum: 1 },
      { kategori: 'kira', baslangicAyi: '2026-09-01', aylikTutar: '8000.00', surum: 1 },
      { kategori: 'kira', baslangicAyi: '2027-01-01', aylikTutar: '9000.00', surum: 1 },
      { kategori: 'satis_hedefi', baslangicAyi: '2026-01-01', aylikTutar: '50000.00', surum: 1 },
    ],
    esitlemeler: [],
    oneriler: [{ bulguKimligi: 'dso', durum: 'ertelendi', erteleBitis: '2026-10-22' }, { bulguKimligi: 'conc', durum: 'kapatildi', erteleBitis: null }],
    kapanis: [{ donem: '2026-09', madde: 'banka', isaretli: true }, { donem: '2026-09', madde: 'kasa', isaretli: false }],
    skorlar: [{ gun: '2026-10-01', skor: 71, nakit: '120000.00' }, { gun: '2026-10-02', skor: 72, nakit: null }],
    sabitKiymetler: [],
    ayar: {
      sirketAdi: 'Deneme AS', sektor: 'uretim', nakitEsigi: '20000', beklenenAylikSatis: null, beklenenTahsilGunu: null, riskToleransi: 5, simulasyonSayisi: 400,
      cekKarsiliksizOlasiligi: '3', batikGunu: 180, anomaliEsigi: '3.5', agirlikLikidite: 20, agirlikNakit: 25, agirlikKarlilik: 20, agirlikVerimlilik: 15,
      agirlikBorcluluk: 20, bilancoDonen: null, bilancoStok: '1000', bilancoKvb: null, bilancoToplamBorc: null, bilancoOzkaynak: null, bilancoBirikmisKar: null,
      kurulumTamam: true, caprazKurPayi: '2', faizBirimi: 'aylik', surum: 3,
    },
    amortisman: [{ ay: '2026-09', tutarTl: '1500.00' }],
    kurOzeti: { bugun: '2026-10-15', kurlar: [], faizler: [], gunlukFaizler: [], faizBirimi: 'aylik', sonGiris: null, gecmis: [] },
    beklenenOdemeler: [],
    sirketAdi: 'Deneme Sirketi',
  };
}
