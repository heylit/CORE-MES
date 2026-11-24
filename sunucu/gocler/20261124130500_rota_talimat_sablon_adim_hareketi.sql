-- Talimat şablonu adımının 3B hareketi (3646): yön, mesafe, süre, sıralı ve beklenen parça sayısı. Parça ağ sırası modele özgü olduğundan
-- şablona yazılmaz. Hareketsiz adımın satırı yoktur; şablon adımları kaydette yeniden yazıldığı için satırlar adımla birlikte silinir.
-- Yalnız ekleme: mevcut tabloya ve verilere dokunulmaz.
CREATE TABLE rota_talimat_sablon_adim_hareketi (
  sablon_id int NOT NULL,
  adim_sira int NOT NULL,
  hareket jsonb NOT NULL CONSTRAINT rota_talimat_sablon_adim_hareketi_nesne CHECK (jsonb_typeof(hareket) = 'object' AND pg_column_size(hareket) <= 1024),
  PRIMARY KEY (sablon_id, adim_sira),
  CONSTRAINT rota_talimat_sablon_adim_hareketi_adim_bagi FOREIGN KEY (sablon_id, adim_sira)
    REFERENCES rota_talimat_sablon_adimi (sablon_id, sira) ON DELETE CASCADE
);
