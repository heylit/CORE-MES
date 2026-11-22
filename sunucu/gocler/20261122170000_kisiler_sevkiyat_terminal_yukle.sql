-- Kullanıcı kararı 22.11.2026: "sevkiyat rolüne terminal ve stok.cikis yetkisi ekle". Sevkiyat çalışanı Üretim Terminali'nde yalnız Yükle bölümünü
-- kullanır (depo istasyonu yükleme işi). Arkon rolü (arkon.operator) ve terminal.uret verilmez; Toplama ve Mal kabul açılmaz (stok.giris yok).
-- stok.cikis Stok Merkezi'ndeki çıkış uçlarını da açar; sevkiyat rolü sayfa.stok'u zaten taşır.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod = 'sevkiyat' AND ri.islem IN ('sayfa.uretim-terminali', 'stok.cikis');
  RAISE NOTICE 'rol_islemi: sevkiyatta % satır var; göç yalnız satır ekler', satir;
END $$;

-- Yönetici Yetkiler ekranından aynı satırı önceden vermiş olabilir; o satır olduğu gibi kalır, göç durmaz (depo göçüyle aynı).
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'sevkiyat'), m.islem
  FROM (VALUES ('sayfa.uretim-terminali'), ('stok.cikis')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
