-- Hammadde sertifikası mal kabulde stok partisine, fason dönüş raporu iş emrine bağlanır (kart #959): belge türüne "rapor",
-- bağ hedefine "stok" eklenir. İki liste yalnız genişler, satır değişmez.
ALTER TABLE cizimler_belge DROP CONSTRAINT cizimler_belge_tur_degeri;
ALTER TABLE cizimler_belge ADD CONSTRAINT cizimler_belge_tur_degeri
  CHECK (tur IN ('teknik-resim', '3b-model', 'makine', 'sertifika', 'rapor', 'kroki', 'diger'));
ALTER TABLE cizimler_bag DROP CONSTRAINT cizimler_bag_hedef_modul;
ALTER TABLE cizimler_bag ADD CONSTRAINT cizimler_bag_hedef_modul
  CHECK (hedef_modul IN ('malzemeler', 'istasyonlar', 'atolye', 'arkon', 'kalibrasyon', 'rota', 'uretim-emirleri', 'stok'));
