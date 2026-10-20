-- İK zimmet alanı kalkar (244 a, dolu tablo göçü onaylı): zimmetin sahibi İdari İşler. Kopya göçünden (20261019110500) sonra İK'da
-- yazılan kayıtlar önce aynı işlevle taşınır; işlev ik_zimmet'i okuduğu için tabloyla birlikte düşer. Geçmiş satırları (ik_kayit_gecmisi,
-- tür 'asset') yalnız ekleme kuralıyla kalır.
SELECT idari_isler_zimmet_ik_kopyala();
DROP FUNCTION idari_isler_zimmet_ik_kopyala();
DROP TABLE ik_zimmet;
