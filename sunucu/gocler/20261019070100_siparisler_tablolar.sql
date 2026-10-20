-- Satış siparişi ilişkisel tutulur (soru 144 a, karar 56): üretim emri ve sevk satırı sipariş satırına yabancı anahtarla bağlanır.
-- Yeni tablolardır, dolu tabloya dokunmaz. Portal'daki JSON siparişler taşınmaz (soru 148 bekliyor).

-- Numara SS-yıl-sıra; yıl sipariş tarihinden. Sayaç satın almanın SP kalıbıyla aynıdır: yıl başına son sıra.
CREATE TABLE siparisler_numara_sayaci (
  yil smallint PRIMARY KEY CONSTRAINT siparisler_numara_sayaci_yil CHECK (yil BETWEEN 2000 AND 2999),
  son_sira int NOT NULL DEFAULT 0 CONSTRAINT siparisler_numara_sayaci_sira CHECK (son_sira >= 0)
);

CREATE TABLE siparisler_siparis (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text NOT NULL CONSTRAINT siparisler_siparis_no_bicim CHECK (no ~ '^SS-[0-9]{4}-[0-9]{3,}$'),
  durum text NOT NULL DEFAULT 'taslak' CONSTRAINT siparisler_siparis_durum CHECK (durum IN ('taslak', 'onayli', 'kapandi', 'iptal')),
  firma_id int NOT NULL CONSTRAINT siparisler_siparis_firma REFERENCES musteri_tedarikci_firma (id),
  -- Müşterinin kendi sipariş numarası (satın alma sipariş no'su); TMI üretmez.
  musteri_siparis_no text CONSTRAINT siparisler_siparis_musteri_no_bicim CHECK (btrim(musteri_siparis_no) = musteri_siparis_no AND length(musteri_siparis_no) BETWEEN 1 AND 40),
  siparis_tarihi date NOT NULL,
  termin date NOT NULL,
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT siparisler_siparis_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  kdv_orani numeric(5,2) NOT NULL CONSTRAINT siparisler_siparis_kdv_orani CHECK (kdv_orani BETWEEN 0 AND 100),
  odeme_kosulu text CONSTRAINT siparisler_siparis_odeme_kosulu CHECK (btrim(odeme_kosulu) = odeme_kosulu AND length(odeme_kosulu) BETWEEN 1 AND 200),
  aciklama text CONSTRAINT siparisler_siparis_aciklama CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 1000),
  iptal_nedeni text CONSTRAINT siparisler_siparis_iptal_nedeni_bicim CHECK (btrim(iptal_nedeni) = iptal_nedeni AND length(iptal_nedeni) BETWEEN 1 AND 500),
  olusturan_id int NOT NULL CONSTRAINT siparisler_siparis_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT siparisler_siparis_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  onaylayan_id int CONSTRAINT siparisler_siparis_onaylayan REFERENCES kisi (id),
  onay_zamani timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT siparisler_siparis_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT siparisler_siparis_no_tek UNIQUE (no),
  CONSTRAINT siparisler_siparis_tarih_sirasi CHECK (termin >= siparis_tarihi),
  -- Onaylanmış (sonra kapanmış ya da iptal edilmiş olabilir) siparişte onaylayan ve zaman birlikte durur.
  CONSTRAINT siparisler_siparis_onay_butun CHECK ((onaylayan_id IS NULL) = (onay_zamani IS NULL)),
  CONSTRAINT siparisler_siparis_onay_durumu CHECK (durum = 'taslak' OR durum = 'iptal' OR onay_zamani IS NOT NULL),
  CONSTRAINT siparisler_siparis_taslak_onaysiz CHECK (durum <> 'taslak' OR onay_zamani IS NULL),
  CONSTRAINT siparisler_siparis_iptal_nedeni CHECK ((durum = 'iptal') = (iptal_nedeni IS NOT NULL))
);
-- SIP-08: aynı müşterinin aynı sipariş numarası iptal edilmemiş iki siparişte olamaz.
CREATE UNIQUE INDEX siparisler_siparis_musteri_no_tekil ON siparisler_siparis (firma_id, musteri_siparis_no)
  WHERE musteri_siparis_no IS NOT NULL AND durum <> 'iptal';
CREATE INDEX siparisler_siparis_tarih_sirasi_dizini ON siparisler_siparis (siparis_tarihi, id);
CREATE INDEX siparisler_siparis_termin_sirasi ON siparisler_siparis (termin, id);
CREATE INDEX siparisler_siparis_firma_dizini ON siparisler_siparis (firma_id, id);

CREATE TABLE siparisler_siparis_satiri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  siparis_id int NOT NULL CONSTRAINT siparisler_siparis_satiri_siparis REFERENCES siparisler_siparis (id),
  sira smallint NOT NULL CONSTRAINT siparisler_siparis_satiri_sira CHECK (sira BETWEEN 1 AND 200),
  malzeme_no int NOT NULL CONSTRAINT siparisler_siparis_satiri_malzeme REFERENCES malzeme_katalog_karti (no),
  miktar numeric(14,3) NOT NULL CONSTRAINT siparisler_siparis_satiri_miktar CHECK (miktar > 0),
  birim_fiyat numeric(17,4) NOT NULL CONSTRAINT siparisler_siparis_satiri_birim_fiyat CHECK (birim_fiyat >= 0),
  termin date,
  aciklama text CONSTRAINT siparisler_siparis_satiri_aciklama CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 500),
  CONSTRAINT siparisler_siparis_satiri_sira_tek UNIQUE (siparis_id, sira)
);
CREATE INDEX siparisler_siparis_satiri_malzeme_dizini ON siparisler_siparis_satiri (malzeme_no);
