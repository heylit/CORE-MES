-- 3244 b: siparişin kaleminden açılan emrin teslimi kalemin terminine bağlı olabilir; bağlı ve başlamamış emirde termin kayınca teslim de kayar.
-- Emir bir kalem partisinden açılabilir (örnek 10 FAI + 90 seri, her parti ayrı emir). Yalnız ekler: var olan emirler bağsız ve partisizdir.
-- Partinin yabancı anahtarı kısıtlayıcıdır: emre bağlı parti silinmez.
ALTER TABLE uretim_emri
  ADD COLUMN teslim_bagli boolean NOT NULL DEFAULT false,
  ADD COLUMN siparis_parti_id int CONSTRAINT uretim_emri_siparis_parti REFERENCES siparisler_siparis_satiri_parti (id);
CREATE INDEX uretim_emri_siparis_parti_dizini ON uretim_emri (siparis_parti_id) WHERE siparis_parti_id IS NOT NULL;
