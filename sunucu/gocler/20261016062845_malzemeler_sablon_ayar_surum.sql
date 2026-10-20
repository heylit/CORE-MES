-- Şablon ve ayarı iki kişi aynı anda açıp kaydedebilir; sürüm, sonra gelenin öncekini sessizce ezmesini engeller (kullanıcı onayı 16.10.2026).
ALTER TABLE malzeme_katalog_sablonu ADD COLUMN surum integer NOT NULL DEFAULT 1;
ALTER TABLE malzeme_katalog_ayari ADD COLUMN surum integer NOT NULL DEFAULT 1;
