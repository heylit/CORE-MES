-- 3345 a: Logo irsaliyeleri (STFICHE/STLINE, sekiz tür) yalnız okunur ve burada aynası tutulur; Logo'ya yazılmaz, stoka işlenmez.
-- Anahtar (firma, dönem, Logo kayıt no): dönem tabloları ayrı olduğundan kayıt no yalnız dönem içinde tekildir (Risk K2).
-- Sevk adresi, taşıyıcı, plaka ve şoför okunmaz (onay maddesi 3). Yeni, boş tablolar; dolu tabloya dokunmaz.

CREATE TABLE logo_irsaliye (
  firma int NOT NULL CONSTRAINT logo_irsaliye_firma CHECK (firma >= 0),
  donem int NOT NULL CONSTRAINT logo_irsaliye_donem CHECK (donem >= 0),
  logical_ref bigint NOT NULL CONSTRAINT logo_irsaliye_ref CHECK (logical_ref > 0),
  tur smallint NOT NULL CONSTRAINT logo_irsaliye_tur CHECK (tur IN (1, 3, 4, 5, 6, 8, 9, 10)),
  fis_no text CONSTRAINT logo_irsaliye_fis_no CHECK (fis_no IS NULL OR (btrim(fis_no) <> '' AND length(fis_no) <= 64)),
  belge_no text CONSTRAINT logo_irsaliye_belge_no CHECK (belge_no IS NULL OR (btrim(belge_no) <> '' AND length(belge_no) <= 64)),
  tarih date NOT NULL,
  iptal boolean NOT NULL,
  ambar_no int,
  cari_kodu text CONSTRAINT logo_irsaliye_cari_kodu CHECK (cari_kodu IS NULL OR (btrim(cari_kodu) <> '' AND length(cari_kodu) <= 64)),
  cari_adi text CONSTRAINT logo_irsaliye_cari_adi CHECK (cari_adi IS NULL OR (btrim(cari_adi) <> '' AND length(cari_adi) <= 200)),
  fatura_no text CONSTRAINT logo_irsaliye_fatura_no CHECK (fatura_no IS NULL OR (btrim(fatura_no) <> '' AND length(fatura_no) <= 64)),
  e_irsaliye boolean NOT NULL,
  -- Logo'nun değişme zamanı, Logo sunucusunun yerel saati, bölge bilgisi yok: yalnız imleç karşılaştırması için metin tutulur.
  logo_degisme text CONSTRAINT logo_irsaliye_degisme CHECK (logo_degisme IS NULL OR logo_degisme ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$'),
  -- Logo'da artık bulunmayan (silinmiş) başlık; yeniden görülürse boşalır.
  logoda_yok timestamptz,
  okuma_zamani timestamptz NOT NULL,
  PRIMARY KEY (firma, donem, logical_ref)
);
CREATE INDEX logo_irsaliye_tarih_dizin ON logo_irsaliye (tarih DESC, logical_ref DESC);

CREATE TABLE logo_irsaliye_satiri (
  firma int NOT NULL,
  donem int NOT NULL,
  logical_ref bigint NOT NULL CONSTRAINT logo_irsaliye_satiri_ref CHECK (logical_ref > 0),
  irsaliye_ref bigint NOT NULL,
  sira smallint NOT NULL CONSTRAINT logo_irsaliye_satiri_sira CHECK (sira > 0),
  malzeme_kodu text CONSTRAINT logo_irsaliye_satiri_malzeme CHECK (malzeme_kodu IS NULL OR (btrim(malzeme_kodu) <> '' AND length(malzeme_kodu) <= 64)),
  malzeme_adi text CONSTRAINT logo_irsaliye_satiri_malzeme_adi CHECK (malzeme_adi IS NULL OR (btrim(malzeme_adi) <> '' AND length(malzeme_adi) <= 200)),
  miktar numeric,
  birim text CONSTRAINT logo_irsaliye_satiri_birim CHECK (birim IS NULL OR (btrim(birim) <> '' AND length(birim) <= 40)),
  -- Fiyat yalnız fiyat yetkisi olana gösterilir (ucun cevabında maskelenir).
  fiyat numeric,
  doviz_turu int,
  doviz_fiyati numeric,
  siparis_ref bigint,
  siparis_satir_ref bigint,
  siparis_no text CONSTRAINT logo_irsaliye_satiri_siparis_no CHECK (siparis_no IS NULL OR (btrim(siparis_no) <> '' AND length(siparis_no) <= 64)),
  PRIMARY KEY (firma, donem, logical_ref),
  CONSTRAINT logo_irsaliye_satiri_baslik FOREIGN KEY (firma, donem, irsaliye_ref) REFERENCES logo_irsaliye ON DELETE CASCADE
);
CREATE INDEX logo_irsaliye_satiri_baslik_dizin ON logo_irsaliye_satiri (firma, donem, irsaliye_ref, sira);
CREATE INDEX logo_irsaliye_satiri_siparis_dizin ON logo_irsaliye_satiri (siparis_satir_ref) WHERE siparis_satir_ref IS NOT NULL;

-- Dönem başına imleç: yeni başlıklar (son_ref), değişenler (degisme + degisme_ref) ve silinme denetimi zamanı. sira, turda hangi okumanın yapılacağıdır.
CREATE TABLE logo_irsaliye_imleci (
  firma int NOT NULL,
  donem int NOT NULL,
  son_ref bigint NOT NULL DEFAULT 0 CONSTRAINT logo_irsaliye_imleci_ref CHECK (son_ref >= 0),
  degisme text CONSTRAINT logo_irsaliye_imleci_degisme CHECK (degisme IS NULL OR degisme ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$'),
  degisme_ref bigint NOT NULL DEFAULT 0 CONSTRAINT logo_irsaliye_imleci_degisme_ref CHECK (degisme_ref >= 0),
  sira text NOT NULL DEFAULT 'yeni' CONSTRAINT logo_irsaliye_imleci_sira CHECK (sira IN ('yeni', 'degisen', 'refler')),
  son_okuma timestamptz NOT NULL,
  ref_denetimi timestamptz,
  PRIMARY KEY (firma, donem)
);

-- Onay maddesi 7: sayfa ve görme işlemi satın alma, depo, sevkiyat ve muhasebe rollerinde; yönetici bayrağıyla zaten alır.
-- Yalnız satır ekler; Yetkiler ekranından verilmiş ya da tek kişiden alınmış satıra dokunmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, i.islem
  FROM rol r CROSS JOIN (VALUES ('sayfa.logo-irsaliyeleri'), ('logo.irsaliye-oku')) AS i(islem)
 WHERE r.kod IN ('satin_alma', 'satin_alma_muduru', 'depo', 'sevkiyat', 'muhasebe_finans')
ON CONFLICT DO NOTHING;
