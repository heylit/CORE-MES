-- Hammadde sertifikası satın alma sipariş satırına da bağlanır (kart #1015): bağ hedefine "satin-alma" eklenir. Liste yalnız genişler, satır değişmez.
ALTER TABLE cizimler_bag DROP CONSTRAINT cizimler_bag_hedef_modul;
ALTER TABLE cizimler_bag ADD CONSTRAINT cizimler_bag_hedef_modul
  CHECK (hedef_modul IN ('malzemeler', 'istasyonlar', 'atolye', 'arkon', 'kalibrasyon', 'rota', 'uretim-emirleri', 'stok', 'satin-alma'));
