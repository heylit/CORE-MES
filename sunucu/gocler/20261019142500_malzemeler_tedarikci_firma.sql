-- 312 b: kartın tedarikçisi jsonb içinde (`kayit.com.tedId`) yabancı anahtar taşıyamaz; bağ ayrı sütunda firmaya bağlanır.
-- Eski satırlar doldurulmaz (314: veri aktarılmaz); yeni kayıtlar sütunu kartın tedarikçi kimliğiyle yazar.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN tedarikci_firma_id int CONSTRAINT malzeme_katalog_karti_tedarikci_firma REFERENCES musteri_tedarikci_firma (id);
