// Logo irsaliye etiketleri ve ölçüm durumu: satın alma (kart 3665) ve satış/konsinye (kart 3684) için TEK dosya. Hiçbir etiket gerçek Logo
// dökümünden ölçülmedi (kart 3683); hepsi belgeden alınmış TAHMİNDİR. Döküm gelince yalnız bu dosya ve `OLCUM_DURUMU` değişir.

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

// Kapı koşulları. Tümü false kalır; ilgili iş gerçekten bitince bilerek true yapılır (kod incelemesinde görünür).
// teyit: 28-29.09 kararı (Logo Connect ile alış e-irsaliyesi) kullanıcıca kaldırıldı (25.11, "ayar kapalı").
export const OLCUM_DURUMU = Object.freeze({
  satinAlmaEtiketleriOlculdu: false,
  satisEtiketleriOlculdu: false,
  konsinyeOlculdu: false,
  durumKodlariOnaylandi: false,
  eIrsaliyeUreticisiBelli: false,
  teyitKalkti: true,
});
export type OlcumDurumu = { -readonly [K in keyof typeof OLCUM_DURUMU]: boolean };
