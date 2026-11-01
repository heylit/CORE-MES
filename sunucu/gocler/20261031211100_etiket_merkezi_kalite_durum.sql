-- Kalite durum etiketi artık Etiket Merkezi'nden basılır (kart 1525; 1286 a, 1530 a). Katalog satırıdır, gerçek veri değildir;
-- yalnız bu satır değişir. Defter tür kısıtı 20261031211000'de açıldı.
UPDATE etiket_merkezi_etiket_turu
   SET durum = 'hazir', sablon_turu = 'kalite-durum', kayit_turleri = '{kalite-durum}'
 WHERE kod = 'kalite-durum';
