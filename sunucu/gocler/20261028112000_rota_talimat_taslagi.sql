-- Talimat taslağı ve yayını (1194 b): ürünün OP talimatı önce taslakta yazılır, yayınlanınca rota_talimati'na yeni sürüm olarak eklenir.
-- Yayınlanmış sürümler yalnız eklenir (rota_talimati ve adımları değişmez); taslak ayrı tablodadır, böylece dolu tabloya dokunulmaz.
-- OP başına en çok bir taslak olur. taban_surum taslağın açıldığı andaki son yayın sürümüdür (yoksa null): arada başka sürüm
-- yayınlanmışsa taslak eski sürüme dayanır ve yayını reddedilir. surum taslağın kendi eşzamanlılık sayacıdır.
CREATE TABLE rota_talimat_taslagi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL,
  op_no int NOT NULL,
  taban_surum int CONSTRAINT rota_talimat_taslagi_taban_pozitif CHECK (taban_surum IS NULL OR taban_surum > 0),
  surum int NOT NULL DEFAULT 1 CONSTRAINT rota_talimat_taslagi_surum_pozitif CHECK (surum > 0),
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  yazma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_talimat_taslagi_op_kayitli FOREIGN KEY (malzeme_id, op_no) REFERENCES rota_op_numarasi,
  CONSTRAINT rota_talimat_taslagi_op_tekil UNIQUE (malzeme_id, op_no)
);
CREATE INDEX rota_talimat_taslagi_yazan_fk_idx ON rota_talimat_taslagi (yazan_kisi_id);

-- Taslağın adımları ve medyası kaydette bütün olarak yeniden yazılır; taslak silinince ya da yayınlanınca birlikte silinir.
CREATE TABLE rota_talimat_taslak_adimi (
  taslak_id int NOT NULL CONSTRAINT rota_talimat_taslak_adimi_taslak_bagi REFERENCES rota_talimat_taslagi (id) ON DELETE CASCADE,
  sira int NOT NULL CONSTRAINT rota_talimat_taslak_adimi_sira_pozitif CHECK (sira > 0),
  baslik text NOT NULL CONSTRAINT rota_talimat_taslak_adimi_baslik_dolu CHECK (btrim(baslik) <> '' AND length(baslik) <= 120),
  metin text CONSTRAINT rota_talimat_taslak_adimi_metin_boyu CHECK (metin IS NULL OR (btrim(metin) <> '' AND length(metin) <= 2000)),
  kontrol_turu text NOT NULL CONSTRAINT rota_talimat_taslak_adimi_kontrol_gecerli CHECK (kontrol_turu IN ('yok', 'onay', 'olcum', 'foto', 'secim')),
  kontrol_ayari jsonb NOT NULL DEFAULT '{}' CONSTRAINT rota_talimat_taslak_adimi_ayar_nesne CHECK (jsonb_typeof(kontrol_ayari) = 'object'),
  zorunlu boolean NOT NULL,
  PRIMARY KEY (taslak_id, sira),
  CONSTRAINT rota_talimat_taslak_adimi_zorunlu_kontrollu CHECK (NOT zorunlu OR kontrol_turu <> 'yok')
);

CREATE TABLE rota_talimat_taslak_adim_medyasi (
  taslak_id int NOT NULL,
  adim_sira int NOT NULL,
  sira int NOT NULL CONSTRAINT rota_talimat_taslak_adim_medyasi_sira_pozitif CHECK (sira > 0),
  ozet text NOT NULL CONSTRAINT rota_talimat_taslak_adim_medyasi_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  tur text NOT NULL CONSTRAINT rota_talimat_taslak_adim_medyasi_tur_gecerli CHECK (tur IN ('resim', 'video')),
  ad text NOT NULL CONSTRAINT rota_talimat_taslak_adim_medyasi_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  boyut bigint NOT NULL CONSTRAINT rota_talimat_taslak_adim_medyasi_boyut_pozitif CHECK (boyut > 0),
  PRIMARY KEY (taslak_id, adim_sira, sira),
  CONSTRAINT rota_talimat_taslak_adim_medyasi_adim_bagi FOREIGN KEY (taslak_id, adim_sira)
    REFERENCES rota_talimat_taslak_adimi (taslak_id, sira) ON DELETE CASCADE
);
CREATE INDEX rota_talimat_taslak_adim_medyasi_ozet_idx ON rota_talimat_taslak_adim_medyasi (ozet);
