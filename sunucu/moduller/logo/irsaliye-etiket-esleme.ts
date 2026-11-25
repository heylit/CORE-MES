// Logo irsaliye etiketleri ve ölçüm durumu: satın alma (kart 3665) ve satış/konsinye (kart 3684) için TEK dosya. Hiçbir etiket gerçek Logo
// dökümünden ölçülmedi (kart 3683); hepsi belgeden alınmış TAHMİNDİR. Döküm gelince yalnız bu dosya ve `OLCUM_DURUMU` değişir.

// Giden kutusundaki belge türleri (tablo logo_irsaliye_giden).
export const IRSALIYE_GIDEN_TURLERI = ['satin-alma-irsaliyesi', 'satis-irsaliyesi', 'konsinye-irsaliyesi'] as const;
export type IrsaliyeGidenTuru = (typeof IRSALIYE_GIDEN_TURLERI)[number];

export const SATIN_ALMA_IRSALIYESI_TRCODE = 1;
export const TOPTAN_SATIS_TRCODE = 8;
export const KONSINYE_CIKIS_TRCODE = 9;

export const SATIN_ALMA_ETIKETLERI = Object.freeze({
  tur: 'TYPE', no: 'NUMBER', tarih: 'DATE', belgeNo: 'DOC_NUMBER', cari: 'ARP_CODE', ambar: 'SOURCE_WH', maliyetGrubu: 'SOURCE_COST_GRP', proje: 'PROJECT_CODE',
  satirlar: 'TRANSACTIONS', kod: 'MASTER_CODE', miktar: 'QUANTITY', birim: 'UNIT_CODE', carpan1: 'UNIT_CONV1', carpan2: 'UNIT_CONV2',
  satirTuru: 'TYPE', aciklama: 'DESCRIPTION', siparisSatiri: 'ORDER_REFERENCE', notlar1: 'NOTES1', fiyat: 'PRICE', kdv: 'VAT_RATE',
});

export const SATIS_ETIKETLERI = Object.freeze({
  kok: 'SALES_DISPATCHES', tur: 'TYPE', no: 'NUMBER', tarih: 'DATE', cari: 'ARP_CODE', ambar: 'SOURCE_WH', maliyetGrubu: 'SOURCE_COST_GRP', notlar1: 'NOTES1',
  satirlar: 'TRANSACTIONS', satirTuru: 'TYPE', kod: 'MASTER_CODE', miktar: 'QUANTITY', birim: 'UNIT_CODE', carpan1: 'UNIT_CONV1', carpan2: 'UNIT_CONV2',
  siparisSatiri: 'ORDER_REFERENCE',
});

// Kapı koşulları. Tümü false kalır; ilgili iş gerçekten bitince bilerek true yapılır (kod incelemesinde görünür). Kapıyı atlatan parametre yoktur:
// kapı ve ayar komutu bu nesneyi doğrudan okur; testler bayrağı node:test mock.property ile geçici çevirir (nesne bilerek dondurulmaz).
// teyit: 28-29.09 kararı (Logo Connect ile alış e-irsaliyesi) kullanıcıca kaldırıldı (25.11, "ayar kapalı").
export interface OlcumDurumu {
  satinAlmaEtiketleriOlculdu: boolean;
  satisEtiketleriOlculdu: boolean;
  konsinyeOlculdu: boolean;
  durumKodlariOnaylandi: boolean;
  eIrsaliyeUreticisiBelli: boolean;
  teyitKalkti: boolean;
}
export const OLCUM_DURUMU: OlcumDurumu = {
  satinAlmaEtiketleriOlculdu: false,
  satisEtiketleriOlculdu: false,
  konsinyeOlculdu: false,
  durumKodlariOnaylandi: false,
  eIrsaliyeUreticisiBelli: false,
  teyitKalkti: true,
};

// DOĞRULANMADI: köprünün irsaliye yazma ucu ve belge arama türü adları yardımcıda yok (araclar/logo-yardimcisi yalnız okur). Kapı açılmadan
// hiçbir istek bu adlarla çıkmaz; dökümle birlikte yardımcıya ucu ekleyen kart bu iki tabloyu doğrular.
export const IRSALIYE_YAZMA_UCU = Object.freeze({
  'satin-alma-irsaliyesi': 'PurchaseDispatch', 'satis-irsaliyesi': 'SalesDispatch', 'konsinye-irsaliyesi': 'SalesDispatch',
} as const);
export const IRSALIYE_ARAMA_TURU = Object.freeze({
  'satin-alma-irsaliyesi': 'purchaseDispatch', 'satis-irsaliyesi': 'salesDispatch', 'konsinye-irsaliyesi': 'salesDispatch',
} as const);
