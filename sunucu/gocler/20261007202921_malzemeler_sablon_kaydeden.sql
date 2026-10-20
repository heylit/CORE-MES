-- Şablonu kaldırma ve üstüne yazma hakkı kaydedene bağlanır; boş değer: kaydeden bilinmeyen eski şablon (yalnız onay yetkilisi kaldırır).
ALTER TABLE malzeme_katalog_sablonu ADD COLUMN kaydeden_kisi_id int REFERENCES kisi;
