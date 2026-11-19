-- 3448 (onay a): toplantı, katılımcıları, gündemi, kararları ve aksiyonları. Yalnız yeni tablolar; var olan veri değişmez.
-- Toplantı silinmez, nedenle iptal edilir. Konu bağı en çok birdir: proje, üretim emri, firma ya da hiçbiri (serbest konu).
CREATE TABLE toplantilar_toplanti (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  baslik text NOT NULL CONSTRAINT toplantilar_toplanti_baslik_bicim CHECK (btrim(baslik) = baslik AND length(baslik) BETWEEN 1 AND 200),
  tur text NOT NULL CONSTRAINT toplantilar_toplanti_tur_gecerli CHECK (tur IN ('uretim', 'musteri', 'proje', 'kalite', 'diger')),
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  yer text CONSTRAINT toplantilar_toplanti_yer_bicim CHECK (btrim(yer) = yer AND length(yer) BETWEEN 1 AND 120),
  proje_id int CONSTRAINT toplantilar_toplanti_proje REFERENCES projeler_proje (id),
  uretim_emri_id int CONSTRAINT toplantilar_toplanti_uretim_emri REFERENCES uretim_emri (id),
  firma_id int CONSTRAINT toplantilar_toplanti_firma REFERENCES musteri_tedarikci_firma (id),
  duzenleyen_kisi_id int NOT NULL CONSTRAINT toplantilar_toplanti_duzenleyen REFERENCES kisi (id),
  durum text NOT NULL DEFAULT 'planlandi' CONSTRAINT toplantilar_toplanti_durum_gecerli CHECK (durum IN ('planlandi', 'yapildi', 'iptal')),
  iptal_nedeni text CONSTRAINT toplantilar_toplanti_iptal_nedeni_bicim CHECK (btrim(iptal_nedeni) = iptal_nedeni AND length(iptal_nedeni) BETWEEN 1 AND 300),
  iptal_eden_kisi_id int CONSTRAINT toplantilar_toplanti_iptal_eden REFERENCES kisi (id),
  durum_zamani timestamptz,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int CONSTRAINT toplantilar_toplanti_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT toplantilar_toplanti_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT toplantilar_toplanti_sure CHECK (bitis > baslangic AND bitis - baslangic <= interval '24 hours'),
  CONSTRAINT toplantilar_toplanti_tek_konu CHECK (num_nonnulls(proje_id, uretim_emri_id, firma_id) <= 1),
  CONSTRAINT toplantilar_toplanti_iptal_butun CHECK ((durum = 'iptal') = (iptal_nedeni IS NOT NULL) AND (iptal_nedeni IS NULL) = (iptal_eden_kisi_id IS NULL)),
  CONSTRAINT toplantilar_toplanti_durum_zamani CHECK ((durum = 'planlandi') = (durum_zamani IS NULL))
);
CREATE INDEX toplantilar_toplanti_baslangic_idx ON toplantilar_toplanti (baslangic, id);

CREATE TABLE toplantilar_katilimci (
  toplanti_id int NOT NULL CONSTRAINT toplantilar_katilimci_toplanti REFERENCES toplantilar_toplanti (id),
  kisi_id int NOT NULL CONSTRAINT toplantilar_katilimci_kisi REFERENCES kisi (id),
  zorunlu boolean NOT NULL DEFAULT true,
  CONSTRAINT toplantilar_katilimci_pk PRIMARY KEY (toplanti_id, kisi_id)
);
CREATE INDEX toplantilar_katilimci_kisi_idx ON toplantilar_katilimci (kisi_id, toplanti_id);

-- Gündem değişince bütün maddeler yeniden yazılır (toplantının sürümü artar); sıra 1'den başlar.
CREATE TABLE toplantilar_gundem (
  toplanti_id int NOT NULL CONSTRAINT toplantilar_gundem_toplanti REFERENCES toplantilar_toplanti (id),
  sira int NOT NULL CONSTRAINT toplantilar_gundem_sira_pozitif CHECK (sira >= 1),
  metin text NOT NULL CONSTRAINT toplantilar_gundem_metin_bicim CHECK (btrim(metin) = metin AND length(metin) BETWEEN 1 AND 300),
  CONSTRAINT toplantilar_gundem_pk PRIMARY KEY (toplanti_id, sira)
);

-- Karar yalnız eklenir; yanlış karar yeni kararla düzeltilir.
CREATE TABLE toplantilar_karar (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  toplanti_id int NOT NULL CONSTRAINT toplantilar_karar_toplanti REFERENCES toplantilar_toplanti (id),
  metin text NOT NULL CONSTRAINT toplantilar_karar_metin_bicim CHECK (btrim(metin) = metin AND length(metin) BETWEEN 1 AND 1000),
  yazan_kisi_id int NOT NULL CONSTRAINT toplantilar_karar_yazan REFERENCES kisi (id),
  yazildi timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX toplantilar_karar_toplanti_idx ON toplantilar_karar (toplanti_id, id);
CREATE TRIGGER toplantilar_karar_yalniz_ekleme BEFORE UPDATE OR DELETE ON toplantilar_karar
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

-- Aksiyonun tek sorumlusu ve son tarihi vardır. Projeli toplantıda göreve çevrilince görevi Projeler'dedir (projeler_gorev.toplanti_aksiyon_id).
CREATE TABLE toplantilar_aksiyon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  toplanti_id int NOT NULL CONSTRAINT toplantilar_aksiyon_toplanti REFERENCES toplantilar_toplanti (id),
  metin text NOT NULL CONSTRAINT toplantilar_aksiyon_metin_bicim CHECK (btrim(metin) = metin AND length(metin) BETWEEN 1 AND 200),
  sorumlu_kisi_id int NOT NULL CONSTRAINT toplantilar_aksiyon_sorumlu REFERENCES kisi (id),
  son_tarih date NOT NULL,
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT toplantilar_aksiyon_durum_gecerli CHECK (durum IN ('acik', 'bitti', 'iptal')),
  yazan_kisi_id int NOT NULL CONSTRAINT toplantilar_aksiyon_yazan REFERENCES kisi (id),
  yazildi timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT toplantilar_aksiyon_surum_pozitif CHECK (surum >= 1)
);
CREATE INDEX toplantilar_aksiyon_toplanti_idx ON toplantilar_aksiyon (toplanti_id, id);
