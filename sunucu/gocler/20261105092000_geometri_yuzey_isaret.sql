-- 3D Atölyesi yüzey işaretleri (kart 2144; 2144-1 a, 2140-3, 2140-4 a): revizyonun B-rep yüzlerine boya, kaplama ya da maske. Yeni boş
-- tablolar. Revizyon kimliği geometri_analiz'deki gibi yabancı anahtarsızdır (yön geometri -> cizimler); rota adımı da yabancı anahtarsız
-- tutulur (rota geometriyi okur, ters yönde bağ kurulmaz): adımın rotada hâlâ olup olmadığını okuma söyler.
-- Başlık sürüm denetiminin ve "son kayıt" bilgisinin yeridir; işaretler başlıkla birlikte silinir.
CREATE TABLE geometri_yuzey_isaret (
  revizyon_id int PRIMARY KEY,
  surum int NOT NULL DEFAULT 1 CONSTRAINT geometri_yuzey_isaret_surum CHECK (surum >= 1),
  guncelleyen_kisi_id int NOT NULL CONSTRAINT geometri_yuzey_isaret_kisi_fkey REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geometri_yuzey_isaret_kisi_fk_idx ON geometri_yuzey_isaret (guncelleyen_kisi_id);

-- Yüz başına tek satır: bir yüz tek işleme atanır (2144-1 a). oneri: önceki revizyondan taşınıp henüz onaylanmamış işaret (2140-4 a).
CREATE TABLE geometri_yuzey_islem (
  revizyon_id int NOT NULL CONSTRAINT geometri_yuzey_islem_baslik_fkey REFERENCES geometri_yuzey_isaret (revizyon_id) ON DELETE CASCADE,
  yuz_sira int NOT NULL CONSTRAINT geometri_yuzey_islem_yuz_sira CHECK (yuz_sira >= 1),
  islem text NOT NULL CONSTRAINT geometri_yuzey_islem_islem CHECK (islem IN ('maske', 'rota')),
  op_no int CONSTRAINT geometri_yuzey_islem_op_no CHECK (op_no IS NULL OR op_no >= 1),
  sartname_id int CONSTRAINT geometri_yuzey_islem_sartname CHECK (sartname_id IS NULL OR sartname_id >= 1),
  oneri boolean NOT NULL DEFAULT false,
  PRIMARY KEY (revizyon_id, yuz_sira),
  CONSTRAINT geometri_yuzey_islem_rota_dolu CHECK ((islem = 'rota') = (op_no IS NOT NULL AND sartname_id IS NOT NULL)),
  CONSTRAINT geometri_yuzey_islem_maske_bos CHECK (islem = 'rota' OR (op_no IS NULL AND sartname_id IS NULL))
);
