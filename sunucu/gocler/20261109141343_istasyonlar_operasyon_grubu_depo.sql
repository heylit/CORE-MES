-- Kart 2518: rotaya depo adımları (kit çıkarma, ara stok, mamul depoya giriş, transfer) ve sevkiyat girsin. Grup kısıtı yalnız genişler;
-- var olan satırın değeri değişmez. Kod kullanıcı tarafından önceden açılmışsa onun satırı korunur (ON CONFLICT), tohum üzerine yazmaz.
ALTER TABLE istasyonlar_operasyon_tipi DROP CONSTRAINT istasyonlar_operasyon_tipi_grup_degeri;
ALTER TABLE istasyonlar_operasyon_tipi ADD CONSTRAINT istasyonlar_operasyon_tipi_grup_degeri
  CHECK (grup IN ('KES', 'SKL', 'TAL', 'KYN', 'ISL', 'YZY', 'KAP', 'BOY', 'MRK', 'MON', 'KAL', 'DEP', 'PAK', 'FAS'));

INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES
  ('KIT', 'Malzeme hazırlama (kit çıkarma)', 'DEP'),
  ('ASG', 'Ara stoka giriş', 'DEP'),
  ('ASC', 'Ara stoktan çıkış', 'DEP'),
  ('MDG', 'Mamul depoya giriş', 'DEP'),
  ('DTR', 'Depolar arası transfer', 'DEP'),
  ('SVK', 'Sevkiyat / yükleme', 'PAK'),
  ('VCI', 'Koruyucu yağlama / VCI ambalaj', 'PAK')
ON CONFLICT (kod) DO NOTHING;
