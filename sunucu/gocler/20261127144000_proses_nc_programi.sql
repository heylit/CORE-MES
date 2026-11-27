-- 3800 (kullanıcı kararı A): parçanın NC/CAM program kaydı, takım listesi ve bağlama aparatı Proses modülünde tutulur; kayıt
-- teknik resim revizyonuna özel olabilir (revizyon kodu boşsa tüm revizyonlar, 3788 markalama tanımıyla aynı kural). Yalnız ekler:
-- yeni boş tablolar ve tek rol satırı; var olan hiçbir satır değişmez.
CREATE TABLE proses_nc_programi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL,
  op_no int NOT NULL,
  -- Belge Merkezi'nin gösterdiği revizyon kodu, kayıt anında kopyalanır (3755 gibi); boş: tüm revizyonlar.
  cizim_revizyon_kodu text
    CONSTRAINT proses_nc_programi_revizyon_bicimi CHECK (cizim_revizyon_kodu IS NULL OR (btrim(cizim_revizyon_kodu) <> '' AND char_length(cizim_revizyon_kodu) <= 20)),
  -- Tezgâhtaki dosya adı (3790 program listesiyle eşleşme için); içerik tutulmaz.
  ad text NOT NULL CONSTRAINT proses_nc_programi_ad_bicimi CHECK (btrim(ad) = ad AND ad <> '' AND char_length(ad) <= 120),
  kontrol text CONSTRAINT proses_nc_programi_kontrol CHECK (kontrol IN ('heidenhain', 'iso')),
  makine_id int REFERENCES makine,
  cam_yazilimi text CONSTRAINT proses_nc_programi_cam_yazilimi CHECK (cam_yazilimi IS NULL OR (btrim(cam_yazilimi) <> '' AND char_length(cam_yazilimi) <= 80)),
  cam_dosyasi text CONSTRAINT proses_nc_programi_cam_dosyasi CHECK (cam_dosyasi IS NULL OR (btrim(cam_dosyasi) <> '' AND char_length(cam_dosyasi) <= 255)),
  sifir_noktasi text CONSTRAINT proses_nc_programi_sifir_noktasi CHECK (sifir_noktasi IS NULL OR (btrim(sifir_noktasi) <> '' AND char_length(sifir_noktasi) <= 200)),
  cevrim_suresi_dk numeric(10, 2) CONSTRAINT proses_nc_programi_cevrim_suresi CHECK (cevrim_suresi_dk > 0),
  durum text NOT NULL DEFAULT 'taslak' CONSTRAINT proses_nc_programi_durum CHECK (durum IN ('taslak', 'dogrulandi', 'onayli', 'eski')),
  aciklama text CONSTRAINT proses_nc_programi_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 500)),
  surum int NOT NULL DEFAULT 1 CONSTRAINT proses_nc_programi_surum CHECK (surum > 0),
  olusturan_kisi_id int NOT NULL REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  -- Operasyon ürünün bir kez verilmiş OP numarasıdır (rota yeniden dizse de numara kaydı durur).
  CONSTRAINT proses_nc_programi_operasyon FOREIGN KEY (malzeme_id, op_no) REFERENCES rota_op_numarasi
);
-- Aynı operasyon ve revizyon kapsamında aynı adla iki geçerli program olmaz; eski program adını bırakır.
CREATE UNIQUE INDEX proses_nc_programi_ad_tekil
  ON proses_nc_programi (malzeme_id, op_no, (coalesce(upper(btrim(cizim_revizyon_kodu)), '')), lower(ad)) WHERE durum <> 'eski';
CREATE INDEX proses_nc_programi_makine_idx ON proses_nc_programi (makine_id);
CREATE INDEX proses_nc_programi_olusturan_idx ON proses_nc_programi (olusturan_kisi_id);
CREATE INDEX proses_nc_programi_guncelleyen_idx ON proses_nc_programi (guncelleyen_kisi_id);

-- Programın takım listesi: takım kartı Malzemeler kataloğundandır (Takımhane kütüphanesi, 3762); kopya kütüphane yok.
-- Liste programla birlikte yeniden yazılır; programın sürümü artar.
CREATE TABLE proses_nc_takimi (
  program_id int NOT NULL REFERENCES proses_nc_programi,
  sira int NOT NULL CONSTRAINT proses_nc_takimi_sira CHECK (sira > 0),
  t_no text NOT NULL CONSTRAINT proses_nc_takimi_t_no CHECK (t_no ~ '^T[0-9]{1,4}$'),
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  tutucu text CONSTRAINT proses_nc_takimi_tutucu CHECK (tutucu IS NULL OR (btrim(tutucu) <> '' AND char_length(tutucu) <= 80)),
  cikinti_mm numeric(8, 2) CONSTRAINT proses_nc_takimi_cikinti CHECK (cikinti_mm > 0),
  islem text CONSTRAINT proses_nc_takimi_islem CHECK (islem IS NULL OR (btrim(islem) <> '' AND char_length(islem) <= 40)),
  PRIMARY KEY (program_id, sira),
  CONSTRAINT proses_nc_takimi_t_no_tekil UNIQUE (program_id, t_no)
);
CREATE INDEX proses_nc_takimi_malzeme_idx ON proses_nc_takimi (malzeme_id);

-- Programın bağlama aparatları: aparat kartı Malzemeler'in demirbaş kartıdır.
CREATE TABLE proses_nc_aparati (
  program_id int NOT NULL REFERENCES proses_nc_programi,
  sira int NOT NULL CONSTRAINT proses_nc_aparati_sira CHECK (sira > 0),
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  aciklama text CONSTRAINT proses_nc_aparati_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 200)),
  PRIMARY KEY (program_id, sira),
  CONSTRAINT proses_nc_aparati_kart_tekil UNIQUE (program_id, malzeme_id)
);
CREATE INDEX proses_nc_aparati_malzeme_idx ON proses_nc_aparati (malzeme_id);

-- Yazma işlemi yalnız üretim müdürüne verilir (3800 A); yönetici bayraklı rol olarak zaten alır. Bilinmeyen rol kodu NOT NULL'a takılır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'uretim_muduru'), 'proses.nc-yaz'
ON CONFLICT (rol_id, islem) DO NOTHING;
