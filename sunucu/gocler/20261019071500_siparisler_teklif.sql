-- Satış teklifi de Siparişler'indir (soru 148, kullanıcı kuralı: asıl sahip Siparişler, Portal iki yönlü çalışır).
-- Talep satırları, fiyatlı teklif sürümleri ve kabul edilen sürümden açılan sipariş bağı. Yeni tablolar; dolu tabloya dokunmaz.

CREATE TABLE siparisler_teklif_sayaci (
  yil smallint PRIMARY KEY CONSTRAINT siparisler_teklif_sayaci_yil CHECK (yil BETWEEN 2000 AND 2999),
  son_sira int NOT NULL DEFAULT 0 CONSTRAINT siparisler_teklif_sayaci_sira CHECK (son_sira >= 0)
);

CREATE TABLE siparisler_teklif (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text NOT NULL CONSTRAINT siparisler_teklif_no_bicim CHECK (no ~ '^TK-[0-9]{4}-[0-9]{3,}$'),
  durum text NOT NULL DEFAULT 'yeni'
    CONSTRAINT siparisler_teklif_durum CHECK (durum IN ('yeni', 'verildi', 'revizyon', 'kabul', 'red', 'siparis')),
  firma_id int NOT NULL CONSTRAINT siparisler_teklif_firma REFERENCES musteri_tedarikci_firma (id),
  baslik text NOT NULL CONSTRAINT siparisler_teklif_baslik CHECK (btrim(baslik) = baslik AND length(baslik) BETWEEN 1 AND 200),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT siparisler_teklif_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  -- Müşterinin istediği teslim tarihi; bilgi içindir.
  istenen_tarih date,
  aciklama text CONSTRAINT siparisler_teklif_aciklama CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 1000),
  -- Son revizyon isteğinin ya da reddin notu.
  not_metni text CONSTRAINT siparisler_teklif_not CHECK (btrim(not_metni) = not_metni AND length(not_metni) BETWEEN 1 AND 500),
  kabul_surumu smallint,
  siparis_id int CONSTRAINT siparisler_teklif_siparis REFERENCES siparisler_siparis (id),
  olusturan_id int NOT NULL CONSTRAINT siparisler_teklif_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT siparisler_teklif_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT siparisler_teklif_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT siparisler_teklif_no_tek UNIQUE (no),
  CONSTRAINT siparisler_teklif_siparis_tek UNIQUE (siparis_id),
  CONSTRAINT siparisler_teklif_kabul_butun CHECK ((durum IN ('kabul', 'siparis')) = (kabul_surumu IS NOT NULL)),
  CONSTRAINT siparisler_teklif_siparis_butun CHECK ((durum = 'siparis') = (siparis_id IS NOT NULL)),
  CONSTRAINT siparisler_teklif_red_notlu CHECK (durum <> 'red' OR not_metni IS NOT NULL)
);
CREATE INDEX siparisler_teklif_olusturma_sirasi ON siparisler_teklif (olusturma, id);
CREATE INDEX siparisler_teklif_firma_dizini ON siparisler_teklif (firma_id, id);

-- Talep satırı: müşterinin istediği parça. Kartı henüz açılmamış parça tanımla girilir; siparişe dönüşmeden kart bağlanmalıdır.
CREATE TABLE siparisler_teklif_satiri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teklif_id int NOT NULL CONSTRAINT siparisler_teklif_satiri_teklif REFERENCES siparisler_teklif (id),
  sira smallint NOT NULL CONSTRAINT siparisler_teklif_satiri_sira CHECK (sira BETWEEN 1 AND 200),
  malzeme_no int CONSTRAINT siparisler_teklif_satiri_malzeme REFERENCES malzeme_katalog_karti (no),
  tanim text NOT NULL CONSTRAINT siparisler_teklif_satiri_tanim CHECK (btrim(tanim) = tanim AND length(tanim) BETWEEN 1 AND 200),
  miktar numeric(14,3) NOT NULL CONSTRAINT siparisler_teklif_satiri_miktar CHECK (miktar > 0),
  CONSTRAINT siparisler_teklif_satiri_sira_tek UNIQUE (teklif_id, sira)
);

-- Müşteriye giden her fiyat bir sürümdür; verilen sürüm değişmez (yalnız eklenir).
CREATE TABLE siparisler_teklif_surumu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teklif_id int NOT NULL CONSTRAINT siparisler_teklif_surumu_teklif REFERENCES siparisler_teklif (id),
  surum_no smallint NOT NULL CONSTRAINT siparisler_teklif_surumu_no CHECK (surum_no BETWEEN 1 AND 99),
  iskonto_orani numeric(5,2) NOT NULL DEFAULT 0 CONSTRAINT siparisler_teklif_surumu_iskonto CHECK (iskonto_orani >= 0 AND iskonto_orani < 100),
  teslim_gun smallint CONSTRAINT siparisler_teklif_surumu_teslim_gun CHECK (teslim_gun BETWEEN 1 AND 365),
  odeme_kosulu text CONSTRAINT siparisler_teklif_surumu_odeme CHECK (btrim(odeme_kosulu) = odeme_kosulu AND length(odeme_kosulu) BETWEEN 1 AND 200),
  gecerlilik date,
  aciklama text CONSTRAINT siparisler_teklif_surumu_aciklama CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 1000),
  olusturan_id int NOT NULL CONSTRAINT siparisler_teklif_surumu_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siparisler_teklif_surumu_tek UNIQUE (teklif_id, surum_no)
);
CREATE TRIGGER siparisler_teklif_surumu_yalniz_ekleme BEFORE UPDATE OR DELETE ON siparisler_teklif_surumu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE siparisler_teklif_fiyati (
  surum_id int NOT NULL CONSTRAINT siparisler_teklif_fiyati_surum REFERENCES siparisler_teklif_surumu (id),
  satir_id int NOT NULL CONSTRAINT siparisler_teklif_fiyati_satir REFERENCES siparisler_teklif_satiri (id),
  birim_fiyat numeric(17,4) NOT NULL CONSTRAINT siparisler_teklif_fiyati_birim_fiyat CHECK (birim_fiyat >= 0),
  CONSTRAINT siparisler_teklif_fiyati_pkey PRIMARY KEY (surum_id, satir_id)
);
CREATE TRIGGER siparisler_teklif_fiyati_yalniz_ekleme BEFORE UPDATE OR DELETE ON siparisler_teklif_fiyati
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
