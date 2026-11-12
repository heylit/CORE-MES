-- Mal kabul irsaliyesi Çizim ve Dosya Merkezi'nde belge olarak durur ve mal kabule bağlanır (3055 a+b): tür listesine "irsaliye",
-- bağ hedeflerine "stok-mal-kabul" eklenir ("stok" hedefi parti kimliğidir, karışmasın). Listeler yalnız genişler, satır değişmez.
ALTER TABLE belge_merkezi_belge DROP CONSTRAINT belge_merkezi_belge_tur_degeri;
ALTER TABLE belge_merkezi_belge ADD CONSTRAINT belge_merkezi_belge_tur_degeri
  CHECK (tur IN ('teknik-resim', '3b-model', 'fotograf', 'makine', 'sertifika', 'rapor', 'kroki', 'diger', 'irsaliye'));

ALTER TABLE belge_merkezi_bag DROP CONSTRAINT belge_merkezi_bag_hedef_modul;
ALTER TABLE belge_merkezi_bag ADD CONSTRAINT belge_merkezi_bag_hedef_modul
  CHECK (hedef_modul IN ('malzemeler', 'istasyonlar', 'atolye', 'arkon', 'kalibrasyon', 'rota', 'uretim-emirleri', 'stok', 'satin-alma', 'cnc-kurulum', 'stok-mal-kabul'));
