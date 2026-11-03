-- 2009 b: sayım hangi makinede sayıldığını taşır; plandaki makine payının ilerlemesi bundan okunur. Boş: makinesiz iş, makinesi
-- seçilemeyen sayım ya da göç öncesi satır (eski satıra makine uydurulmaz).
ALTER TABLE uretim_sayimi ADD COLUMN makine_id int REFERENCES makine;
CREATE INDEX uretim_sayimi_makine_fk_idx ON uretim_sayimi (makine_id) WHERE makine_id IS NOT NULL;
