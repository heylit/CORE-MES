-- İdari İşler 2: periyodik yasal kontroller, sözleşme ve poliçe bitişleri, atık teslimleri (188 a, 190 a). Yeni, boş tablolar.
-- Tezgah bakımı Arkon'da, ölçü aleti Kalibrasyon'da kalır; tutar ve ödeme Finans'tadır.

CREATE TABLE idari_isler_kontrol (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_kontrol_pk PRIMARY KEY,
  ad text NOT NULL CONSTRAINT idari_isler_kontrol_ad CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  tur text NOT NULL CONSTRAINT idari_isler_kontrol_tur CHECK (tur IN ('yasal', 'sozlesme', 'atik')),
  -- Sıklıksız kalem (sözleşme bitişi gibi) her kayıtta yeni tarihi elle alır.
  siklik_deger int CONSTRAINT idari_isler_kontrol_siklik_deger CHECK (siklik_deger BETWEEN 1 AND 120),
  siklik_birim text CONSTRAINT idari_isler_kontrol_siklik_birim CHECK (siklik_birim IN ('gun', 'hafta', 'ay', 'yil')),
  sonraki_tarih date NOT NULL,
  firma_id int CONSTRAINT idari_isler_kontrol_firma REFERENCES musteri_tedarikci_firma (id),
  aciklama text CONSTRAINT idari_isler_kontrol_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  aktif boolean NOT NULL DEFAULT true,
  bitiren_kisi_id int CONSTRAINT idari_isler_kontrol_bitiren REFERENCES kisi (id),
  bitis timestamptz,
  bitis_nedeni text CONSTRAINT idari_isler_kontrol_bitis_nedeni CHECK (bitis_nedeni IS NULL OR (btrim(bitis_nedeni) <> '' AND length(bitis_nedeni) <= 500)),
  olusturan_kisi_id int NOT NULL CONSTRAINT idari_isler_kontrol_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_kontrol_surum CHECK (surum > 0),
  CONSTRAINT idari_isler_kontrol_siklik_butun CHECK ((siklik_deger IS NULL) = (siklik_birim IS NULL)),
  -- IDR-15: biten kalemin bitireni ve zamanı vardır, etkin kalemin yoktur.
  CONSTRAINT idari_isler_kontrol_bitis_butun CHECK (
    (aktif AND bitis IS NULL AND bitiren_kisi_id IS NULL AND bitis_nedeni IS NULL) OR (NOT aktif AND bitis IS NOT NULL AND bitiren_kisi_id IS NOT NULL)
  )
);
CREATE INDEX idari_isler_kontrol_aktif_tarih ON idari_isler_kontrol (sonraki_tarih, id) WHERE aktif;

-- Her "yapıldı", "teslim edildi" ve "yenilendi" bir kayıttır; kayıt değişmez ve silinmez.
CREATE TABLE idari_isler_kontrol_kaydi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_kontrol_kaydi_pk PRIMARY KEY,
  kontrol_id int NOT NULL CONSTRAINT idari_isler_kontrol_kaydi_kontrol REFERENCES idari_isler_kontrol (id),
  yapilma date NOT NULL,
  onceki_tarih date NOT NULL,
  sonraki_tarih date NOT NULL,
  belge_no text CONSTRAINT idari_isler_kontrol_kaydi_belge_no CHECK (belge_no IS NULL OR (btrim(belge_no) <> '' AND length(belge_no) <= 60)),
  not_metni text CONSTRAINT idari_isler_kontrol_kaydi_not CHECK (not_metni IS NULL OR (btrim(not_metni) <> '' AND length(not_metni) <= 500)),
  miktar numeric(12, 3) CONSTRAINT idari_isler_kontrol_kaydi_miktar CHECK (miktar > 0),
  birim text CONSTRAINT idari_isler_kontrol_kaydi_birim CHECK (birim IN ('kg', 'ton', 'lt', 'm3', 'adet')),
  firma_id int CONSTRAINT idari_isler_kontrol_kaydi_firma REFERENCES musteri_tedarikci_firma (id),
  kaydeden_kisi_id int NOT NULL CONSTRAINT idari_isler_kontrol_kaydi_kaydeden REFERENCES kisi (id),
  kayit timestamptz NOT NULL DEFAULT now(),
  -- IDR-13: atık miktarı birimiyle yazılır; sonraki tarih yapılmadan sonradır.
  CONSTRAINT idari_isler_kontrol_kaydi_miktar_birim CHECK ((miktar IS NULL) = (birim IS NULL)),
  CONSTRAINT idari_isler_kontrol_kaydi_tarih_sirasi CHECK (sonraki_tarih > yapilma)
);
CREATE INDEX idari_isler_kontrol_kaydi_kontrol ON idari_isler_kontrol_kaydi (kontrol_id, yapilma, id);
CREATE TRIGGER idari_isler_kontrol_kaydi_yalniz_ekleme BEFORE UPDATE OR DELETE ON idari_isler_kontrol_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER idari_isler_kontrol_kaydi_bosaltma_yok BEFORE TRUNCATE ON idari_isler_kontrol_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
