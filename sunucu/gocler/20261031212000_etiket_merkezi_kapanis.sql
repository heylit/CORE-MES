-- Etiket Merkezi'ne taşınan baskı yolları kapandı (kart 1525; 1288 teyitli, 1531 a): stok konum ve lot etiketi, malzeme katalog
-- etiketi ve Kalite Merkezi ürün durum etiketi (KF-19) artık yalnız Etiket Merkezi'nden basılır. Katalog satırlarıdır, gerçek veri
-- değildir; yalnız bu dört satırın "dışarıda basıldığı yer" bilgisi boşalır. Seri no etiketi (ikinci tur) dışarıda kalır.
UPDATE etiket_merkezi_etiket_turu
   SET disaridaki_yol = NULL
 WHERE kod IN ('konum', 'lot', 'malzeme', 'kalite-durum');
