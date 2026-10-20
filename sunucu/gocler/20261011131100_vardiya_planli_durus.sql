-- Planlı duruş (kart #519, yol haritası A6): tesis, iş merkezi ya da istasyon için saatli duruş; çalışma takviminden düşülür.
-- Tek sahip Vardiya'dır; Arkon planlı duruş takvimi bu tabloyu Vardiya üzerinden okur ve yazar. Yeni tablo; var olan tabloya dokunulmaz.
CREATE TABLE vardiya_planli_durus (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT vardiya_planli_durus_pk PRIMARY KEY,
  baslik text NOT NULL CONSTRAINT vardiya_planli_durus_baslik_dolu CHECK (btrim(baslik) <> '' AND char_length(baslik) <= 80),
  durus_nedeni_id int CONSTRAINT vardiya_planli_durus_neden_fk REFERENCES durus_nedeni,
  kapsam text NOT NULL CONSTRAINT vardiya_planli_durus_kapsam_degeri CHECK (kapsam IN ('tesis', 'is-merkezi', 'istasyon')),
  is_merkezi_id int CONSTRAINT vardiya_planli_durus_is_merkezi_fk REFERENCES is_merkezi,
  istasyon_id int CONSTRAINT vardiya_planli_durus_istasyon_fk REFERENCES istasyon,
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  tekrar text NOT NULL DEFAULT 'yok' CONSTRAINT vardiya_planli_durus_tekrar_degeri CHECK (tekrar IN ('yok', 'gunluk', 'haftalik')),
  -- ISO günler: 1 pazartesi ... 7 pazar; yalnız haftalık tekrarda dolu.
  gunler smallint[] NOT NULL DEFAULT '{}' CONSTRAINT vardiya_planli_durus_gun_degeri CHECK (gunler <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  tekrar_bitis timestamptz,
  aciklama text CONSTRAINT vardiya_planli_durus_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  aktif boolean NOT NULL DEFAULT true,
  surum integer NOT NULL DEFAULT 1,
  yazan_id int NOT NULL CONSTRAINT vardiya_planli_durus_yazan_fk REFERENCES kisi,
  yazildi timestamptz NOT NULL DEFAULT now(),
  -- Arkon'dan açılan kaydın Arkon belge kimliği: aynı belgenin yinelenen yazımı ikinci kayıt açmaz.
  kaynak_kimligi text CONSTRAINT vardiya_planli_durus_kaynak_bicimi CHECK (kaynak_kimligi IS NULL OR char_length(kaynak_kimligi) BETWEEN 1 AND 200),
  CONSTRAINT vardiya_planli_durus_kaynak_tekil UNIQUE (kaynak_kimligi),
  CONSTRAINT vardiya_planli_durus_hedef CHECK (
    (kapsam = 'tesis' AND is_merkezi_id IS NULL AND istasyon_id IS NULL)
    OR (kapsam = 'is-merkezi' AND is_merkezi_id IS NOT NULL AND istasyon_id IS NULL)
    OR (kapsam = 'istasyon' AND istasyon_id IS NOT NULL AND is_merkezi_id IS NULL)),
  CONSTRAINT vardiya_planli_durus_sure_var CHECK (bitis > baslangic),
  -- Tekrar eden duruş bir günden kısadır: ertesi günün tekrarıyla çakışmaz.
  CONSTRAINT vardiya_planli_durus_tekrar_suresi CHECK (tekrar = 'yok' OR bitis - baslangic < interval '24 hours'),
  CONSTRAINT vardiya_planli_durus_tekrar_alanlari CHECK (
    (tekrar = 'yok' AND gunler = '{}' AND tekrar_bitis IS NULL)
    OR (tekrar = 'gunluk' AND gunler = '{}')
    OR (tekrar = 'haftalik' AND cardinality(gunler) > 0)),
  CONSTRAINT vardiya_planli_durus_tekrar_bitisi CHECK (tekrar_bitis IS NULL OR tekrar_bitis >= baslangic)
);
CREATE INDEX vardiya_planli_durus_baslangic_idx ON vardiya_planli_durus (baslangic, id);
CREATE INDEX vardiya_planli_durus_is_merkezi_idx ON vardiya_planli_durus (is_merkezi_id);
CREATE INDEX vardiya_planli_durus_istasyon_idx ON vardiya_planli_durus (istasyon_id);
CREATE INDEX vardiya_planli_durus_neden_idx ON vardiya_planli_durus (durus_nedeni_id);
