-- 3458-4 a: atanan kişi görevi gerekçeyle geri çevirir; üstlenilmiş rol görevi role döner. Üstlenince rol yapan_rol_id'den
-- silindiği için (tek yapan kısıtı) üstlenilen rol ayrıca tutulur. Yalnız ekler: eski satırlarda boştur, olay listesi genişler.
ALTER TABLE projeler_gorev
  ADD COLUMN ustlenilen_rol_id int CONSTRAINT projeler_gorev_ustlenilen_rol REFERENCES rol (id),
  ADD CONSTRAINT projeler_gorev_ustlenilen_rol_kisili CHECK (ustlenilen_rol_id IS NULL OR (sorumlu_kisi_id IS NOT NULL AND yapan_rol_id IS NULL));

ALTER TABLE projeler_gorev_olayi
  DROP CONSTRAINT projeler_gorev_olayi_olay,
  ADD CONSTRAINT projeler_gorev_olayi_olay CHECK (olay IN ('ustlen', 'basla', 'bitti', 'onay', 'geri', 'cevir')),
  DROP CONSTRAINT projeler_gorev_olayi_geri_gerekceli,
  ADD CONSTRAINT projeler_gorev_olayi_geri_gerekceli CHECK (olay NOT IN ('geri', 'cevir') OR gerekce IS NOT NULL);
