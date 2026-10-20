-- Satın alma (sürüm 6): Satın Alma Merkezi'nin bütün veri modeli. Firma `firmalar`'da, kişi `kisiler`'de; katalog bu modülün
-- (ileride `malzeme` ile senkron için `malzeme_id`). Talep bütün olarak, sürümle kaydedilir; alt kayıt kimlikleri istemcide üretilen uuid'dir.

-- Ayarlar: tek satırlık tablo (serbest json yok).
CREATE TABLE satin_alma_ayar (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT satin_alma_ayar_tek CHECK (tek),
  sirket text NOT NULL DEFAULT '' CONSTRAINT satin_alma_ayar_sirket CHECK (length(sirket) <= 120),
  agirlik_maliyet smallint NOT NULL DEFAULT 50 CONSTRAINT satin_alma_ayar_agirlik_maliyet CHECK (agirlik_maliyet BETWEEN 0 AND 100),
  agirlik_termin smallint NOT NULL DEFAULT 20 CONSTRAINT satin_alma_ayar_agirlik_termin CHECK (agirlik_termin BETWEEN 0 AND 100),
  agirlik_tedarikci smallint NOT NULL DEFAULT 20 CONSTRAINT satin_alma_ayar_agirlik_tedarikci CHECK (agirlik_tedarikci BETWEEN 0 AND 100),
  agirlik_garanti smallint NOT NULL DEFAULT 10 CONSTRAINT satin_alma_ayar_agirlik_garanti CHECK (agirlik_garanti BETWEEN 0 AND 100),
  gecerlilik_gun int NOT NULL DEFAULT 15 CONSTRAINT satin_alma_ayar_gecerlilik CHECK (gecerlilik_gun BETWEEN 1 AND 365),
  en_az_teklif int NOT NULL DEFAULT 3 CONSTRAINT satin_alma_ayar_en_az_teklif CHECK (en_az_teklif BETWEEN 1 AND 20),
  fiyat_uyari_yuzdesi numeric(6,2) NOT NULL DEFAULT 10 CONSTRAINT satin_alma_ayar_fiyat_uyari CHECK (fiyat_uyari_yuzdesi BETWEEN 0 AND 1000),
  kur_tarihi date,
  surum integer NOT NULL DEFAULT 1,
  guncelleme timestamptz NOT NULL DEFAULT now()
);
INSERT INTO satin_alma_ayar DEFAULT VALUES;

-- Para birimi ve teklif günü dışındaki kur; aylık fırsat maliyeti net bugünkü maliyet içindir.
CREATE TABLE satin_alma_kur (
  para_birimi char(3) PRIMARY KEY CONSTRAINT satin_alma_kur_kod CHECK (para_birimi IN ('TRY', 'USD', 'EUR', 'GBP')),
  kur numeric(18,6) NOT NULL CONSTRAINT satin_alma_kur_pozitif CHECK (kur > 0),
  aylik_faiz_yuzdesi numeric(8,4) NOT NULL DEFAULT 0 CONSTRAINT satin_alma_kur_faiz CHECK (aylik_faiz_yuzdesi >= 0),
  sira smallint NOT NULL DEFAULT 0
);
-- TRY sabit 1'dir; diğer kurlar Ayarlar ekranından girilir (TCMB'den çekme yok: dış servis yasak).
INSERT INTO satin_alma_kur (para_birimi, kur, sira) VALUES ('TRY', 1, 0);

CREATE TABLE satin_alma_kategori (
  ad text PRIMARY KEY CONSTRAINT satin_alma_kategori_ad CHECK (btrim(ad) = ad AND ad <> '' AND length(ad) <= 60),
  sira smallint NOT NULL DEFAULT 0
);

CREATE TABLE satin_alma_birim (
  ad text PRIMARY KEY CONSTRAINT satin_alma_birim_ad CHECK (btrim(ad) = ad AND ad <> '' AND length(ad) <= 60),
  yillik_butce numeric(18,2) NOT NULL DEFAULT 0 CONSTRAINT satin_alma_birim_butce CHECK (yillik_butce >= 0),
  sira smallint NOT NULL DEFAULT 0
);

-- Tutara göre gereken onay seviyesi; bilgi amaçlıdır (onayı satin-alma.onayla verir).
CREATE TABLE satin_alma_onay_limiti (
  sira smallint PRIMARY KEY,
  azami_tutar numeric(18,2) CONSTRAINT satin_alma_onay_limiti_tutar CHECK (azami_tutar IS NULL OR azami_tutar > 0),
  seviye text NOT NULL CONSTRAINT satin_alma_onay_limiti_seviye CHECK (btrim(seviye) <> '' AND length(seviye) <= 80)
);

-- Tedarikçi bir firmadır; satın almaya özgü durum, puan ve not burada. Firma tablosu henüz depoda yok: firma_id (ve malzeme_id) yabancı anahtarsız düz sayıdır, bağ ayrı göçle gelir.
CREATE TABLE satin_alma_tedarikci (
  firma_id int PRIMARY KEY,
  durum text NOT NULL DEFAULT 'onayli' CONSTRAINT satin_alma_tedarikci_durum CHECK (durum IN ('onayli', 'deneme', 'askida')),
  puan smallint NOT NULL DEFAULT 3 CONSTRAINT satin_alma_tedarikci_puan CHECK (puan BETWEEN 1 AND 5),
  notlar text NOT NULL DEFAULT '' CONSTRAINT satin_alma_tedarikci_notlar CHECK (length(notlar) <= 2000),
  surum integer NOT NULL DEFAULT 1,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE satin_alma_tedarikci_kategorisi (
  firma_id int NOT NULL REFERENCES satin_alma_tedarikci ON DELETE CASCADE,
  kategori text NOT NULL CONSTRAINT satin_alma_tedarikci_kategorisi_ad CHECK (btrim(kategori) <> '' AND length(kategori) <= 60),
  sira smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (firma_id, kategori)
);
CREATE TABLE satin_alma_tedarikci_degerlendirmesi (
  id uuid PRIMARY KEY,
  firma_id int NOT NULL REFERENCES satin_alma_tedarikci,
  tarih date NOT NULL,
  puan smallint NOT NULL CONSTRAINT satin_alma_degerlendirme_puan CHECK (puan BETWEEN 1 AND 5),
  metin text NOT NULL DEFAULT '' CONSTRAINT satin_alma_degerlendirme_metin CHECK (length(metin) <= 2000),
  -- Değerlendireni elle yazılan ad (prototipte serbest metin); kaydı giren kişi kisi_id'dir.
  degerlendiren text NOT NULL DEFAULT '' CONSTRAINT satin_alma_degerlendirme_degerlendiren CHECK (length(degerlendiren) <= 120),
  kisi_id int REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now()
);

-- Satın almanın kendi kataloğu (kullanıcı kararı 4). malzeme_id bugün boş kalır; malzemeler hazır olunca senkron içindir.
CREATE TABLE satin_alma_katalog (
  id uuid PRIMARY KEY,
  kod text NOT NULL CONSTRAINT satin_alma_katalog_kod CHECK (kod ~ '^M-[0-9]{4,}$'),
  ad text NOT NULL CONSTRAINT satin_alma_katalog_ad CHECK (btrim(ad) = ad AND ad <> '' AND length(ad) <= 160),
  kategori text NOT NULL DEFAULT '' CONSTRAINT satin_alma_katalog_kategori CHECK (length(kategori) <= 60),
  birim text NOT NULL DEFAULT 'adet' CONSTRAINT satin_alma_katalog_birim CHECK (btrim(birim) <> '' AND length(birim) <= 20),
  ozellik text NOT NULL DEFAULT '' CONSTRAINT satin_alma_katalog_ozellik CHECK (length(ozellik) <= 500),
  notlar text NOT NULL DEFAULT '' CONSTRAINT satin_alma_katalog_notlar CHECK (length(notlar) <= 2000),
  malzeme_id bigint,
  surum integer NOT NULL DEFAULT 1,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT satin_alma_katalog_kod_benzersiz UNIQUE (kod)
);
CREATE TABLE satin_alma_katalog_takma_adi (
  katalog_id uuid NOT NULL REFERENCES satin_alma_katalog ON DELETE CASCADE,
  takma_ad text NOT NULL CONSTRAINT satin_alma_takma_ad CHECK (btrim(takma_ad) <> '' AND length(takma_ad) <= 160),
  PRIMARY KEY (katalog_id, takma_ad)
);

-- Talep numarası: yıllık sayaç; üretim emri kalıbı, 999'dan sonra kesilmez.
CREATE TABLE satin_alma_talep_sayaci (
  yil smallint PRIMARY KEY CONSTRAINT satin_alma_talep_sayaci_yil CHECK (yil BETWEEN 2000 AND 2999),
  son_sira int NOT NULL DEFAULT 0 CONSTRAINT satin_alma_talep_sayaci_sira CHECK (son_sira >= 0)
);

CREATE TABLE satin_alma_talep (
  id uuid PRIMARY KEY,
  yil smallint NOT NULL,
  sira int NOT NULL CONSTRAINT satin_alma_talep_sira CHECK (sira > 0),
  no text GENERATED ALWAYS AS ('ST-' || yil::text || '-' || CASE WHEN sira < 1000 THEN lpad(sira::text, 3, '0') ELSE sira::text END) STORED,
  baslik text NOT NULL CONSTRAINT satin_alma_talep_baslik CHECK (btrim(baslik) = baslik AND baslik <> '' AND length(baslik) <= 160),
  birim text REFERENCES satin_alma_birim ON UPDATE CASCADE,
  talep_eden_kisi_id int NOT NULL REFERENCES kisi,
  acan_kisi_id int NOT NULL REFERENCES kisi,
  oncelik text NOT NULL DEFAULT 'normal' CONSTRAINT satin_alma_talep_oncelik CHECK (oncelik IN ('dusuk', 'normal', 'acil')),
  ihtiyac_tarihi date,
  notlar text NOT NULL DEFAULT '' CONSTRAINT satin_alma_talep_notlar CHECK (length(notlar) <= 4000),
  durum text NOT NULL DEFAULT 'taslak' CONSTRAINT satin_alma_talep_durum
    CHECK (durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda', 'siparis_verildi', 'teslim_alindi', 'iptal')),
  iptal_nedeni text NOT NULL DEFAULT '' CONSTRAINT satin_alma_talep_iptal_nedeni CHECK (length(iptal_nedeni) <= 500),
  -- Talebe özel ağırlıklar; dördü birlikte boş (ayarlardaki varsayılan) ya da birlikte dolu.
  agirlik_maliyet smallint, agirlik_termin smallint, agirlik_tedarikci smallint, agirlik_garanti smallint,
  surum integer NOT NULL DEFAULT 1,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT satin_alma_talep_no_benzersiz UNIQUE (yil, sira),
  CONSTRAINT satin_alma_talep_iptal_butun CHECK ((durum = 'iptal') = (iptal_nedeni <> '')),
  CONSTRAINT satin_alma_talep_agirlik_butun CHECK (
    (agirlik_maliyet IS NULL) = (agirlik_termin IS NULL) AND (agirlik_maliyet IS NULL) = (agirlik_tedarikci IS NULL)
    AND (agirlik_maliyet IS NULL) = (agirlik_garanti IS NULL)),
  CONSTRAINT satin_alma_talep_agirlik_aralik CHECK (
    agirlik_maliyet BETWEEN 0 AND 100 AND agirlik_termin BETWEEN 0 AND 100 AND agirlik_tedarikci BETWEEN 0 AND 100 AND agirlik_garanti BETWEEN 0 AND 100)
);

CREATE TABLE satin_alma_talep_kalemi (
  talep_id uuid NOT NULL REFERENCES satin_alma_talep ON DELETE CASCADE,
  id uuid NOT NULL,
  sira smallint NOT NULL CONSTRAINT satin_alma_kalem_sira CHECK (sira > 0),
  katalog_id uuid REFERENCES satin_alma_katalog,
  ad text NOT NULL CONSTRAINT satin_alma_kalem_ad CHECK (btrim(ad) <> '' AND length(ad) <= 160),
  ozellik text NOT NULL DEFAULT '' CONSTRAINT satin_alma_kalem_ozellik CHECK (length(ozellik) <= 500),
  -- Taslakta miktar henüz girilmemiş olabilir (prototip); teklif aşamasından sonra servis zorunlu tutar.
  miktar numeric(18,4) CONSTRAINT satin_alma_kalem_miktar_pozitif CHECK (miktar > 0),
  birim text NOT NULL DEFAULT 'adet' CONSTRAINT satin_alma_kalem_birim CHECK (btrim(birim) <> '' AND length(birim) <= 20),
  kategori text NOT NULL DEFAULT '' CONSTRAINT satin_alma_kalem_kategori CHECK (length(kategori) <= 60),
  PRIMARY KEY (talep_id, id),
  CONSTRAINT satin_alma_kalem_sira_benzersiz UNIQUE (talep_id, sira)
);

CREATE TABLE satin_alma_teklif_istegi (
  talep_id uuid NOT NULL REFERENCES satin_alma_talep ON DELETE CASCADE,
  firma_id int NOT NULL REFERENCES satin_alma_tedarikci,
  gonderim date NOT NULL,
  son_tarih date,
  PRIMARY KEY (talep_id, firma_id)
);

CREATE TABLE satin_alma_teklif (
  talep_id uuid NOT NULL REFERENCES satin_alma_talep ON DELETE CASCADE,
  id uuid NOT NULL,
  -- İstemcinin verdiği sıra (aynı işlemde eklenen tekliflerin zamanı aynıdır).
  sira smallint NOT NULL DEFAULT 0,
  firma_id int REFERENCES satin_alma_tedarikci,
  tedarikci_adi text NOT NULL DEFAULT '' CONSTRAINT satin_alma_teklif_tedarikci_adi CHECK (length(tedarikci_adi) <= 160),
  teklif_tarihi date NOT NULL,
  gecerlilik date,
  para_birimi char(3) NOT NULL REFERENCES satin_alma_kur,
  -- Teklif günündeki kur (TRY için 1); sipariş kesinleşince satin_alma_sabit_kur geçerlidir.
  kur numeric(18,6) CONSTRAINT satin_alma_teklif_kur CHECK (kur > 0),
  iskonto_yuzdesi numeric(6,3) NOT NULL DEFAULT 0 CONSTRAINT satin_alma_teklif_iskonto CHECK (iskonto_yuzdesi BETWEEN 0 AND 100),
  nakliye numeric(18,4) NOT NULL DEFAULT 0 CONSTRAINT satin_alma_teklif_nakliye CHECK (nakliye >= 0),
  diger_masraf numeric(18,4) NOT NULL DEFAULT 0 CONSTRAINT satin_alma_teklif_masraf CHECK (diger_masraf >= 0),
  teslim_sekli text NOT NULL DEFAULT '' CONSTRAINT satin_alma_teklif_teslim_sekli CHECK (length(teslim_sekli) <= 200),
  nakliye_dahil boolean NOT NULL DEFAULT true,
  termin_gun int CONSTRAINT satin_alma_teklif_termin CHECK (termin_gun BETWEEN 0 AND 3650),
  vade_gun int NOT NULL DEFAULT 0 CONSTRAINT satin_alma_teklif_vade CHECK (vade_gun BETWEEN 0 AND 3650),
  avans_yuzdesi numeric(6,3) NOT NULL DEFAULT 0 CONSTRAINT satin_alma_teklif_avans CHECK (avans_yuzdesi BETWEEN 0 AND 100),
  garanti_ay int CONSTRAINT satin_alma_teklif_garanti CHECK (garanti_ay BETWEEN 0 AND 600),
  teknik_uygun boolean NOT NULL DEFAULT true,
  notlar text NOT NULL DEFAULT '' CONSTRAINT satin_alma_teklif_notlar CHECK (length(notlar) <= 2000),
  ilk_toplam numeric(18,4) CONSTRAINT satin_alma_teklif_ilk_toplam CHECK (ilk_toplam >= 0),
  revizyon int NOT NULL DEFAULT 0 CONSTRAINT satin_alma_teklif_revizyon CHECK (revizyon >= 0),
  olusturma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talep_id, id),
  CONSTRAINT satin_alma_teklif_try_kuru CHECK (para_birimi <> 'TRY' OR kur IS NULL OR kur = 1)
);

-- Boş fiyat satır olarak yazılmaz: o kaleme teklif verilmemiştir, sıfır sayılmaz.
CREATE TABLE satin_alma_teklif_satiri (
  talep_id uuid NOT NULL,
  teklif_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  birim_fiyat numeric(18,4) NOT NULL CONSTRAINT satin_alma_teklif_satiri_fiyat CHECK (birim_fiyat >= 0),
  PRIMARY KEY (talep_id, teklif_id, kalem_id),
  CONSTRAINT satin_alma_teklif_satiri_teklif FOREIGN KEY (talep_id, teklif_id) REFERENCES satin_alma_teklif ON DELETE CASCADE,
  CONSTRAINT satin_alma_teklif_satiri_kalem FOREIGN KEY (talep_id, kalem_id) REFERENCES satin_alma_talep_kalemi ON DELETE CASCADE
);

-- SAT-13: teklif toplamı (teklif para biriminde) prototiple aynı formül: iskonto sonrası mal bedeli + nakliye (fiyata dahil değilse)
-- + diğer masraf. numeric ile hesaplanır (float yok). İlk toplam ve revizyon sayısı bununla sunucuda yazılır.
CREATE FUNCTION satin_alma_teklif_toplami(p_talep uuid, p_teklif uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT round(
    COALESCE((SELECT sum(s.birim_fiyat * k.miktar) FROM satin_alma_teklif_satiri s
               JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
              WHERE s.talep_id = q.talep_id AND s.teklif_id = q.id), 0) * (1 - q.iskonto_yuzdesi / 100)
    + CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf, 4)
  FROM satin_alma_teklif q WHERE q.talep_id = p_talep AND q.id = p_teklif
$$;

-- Karar: tek tedarikçi ya da kalem bazlı. Öğrenilenler karar satırında.
CREATE TABLE satin_alma_karar (
  talep_id uuid PRIMARY KEY REFERENCES satin_alma_talep ON DELETE CASCADE,
  mod text NOT NULL CONSTRAINT satin_alma_karar_mod CHECK (mod IN ('tek', 'bolunmus')),
  teklif_id uuid,
  gerekce text NOT NULL DEFAULT '' CONSTRAINT satin_alma_karar_gerekce CHECK (length(gerekce) <= 2000),
  karar_veren_kisi_id int REFERENCES kisi,
  karar_tarihi date NOT NULL,
  ogrenilenler text NOT NULL DEFAULT '' CONSTRAINT satin_alma_karar_ogrenilenler CHECK (length(ogrenilenler) <= 4000),
  CONSTRAINT satin_alma_karar_teklif FOREIGN KEY (talep_id, teklif_id) REFERENCES satin_alma_teklif,
  CONSTRAINT satin_alma_karar_tek_teklifli CHECK ((mod = 'tek') = (teklif_id IS NOT NULL))
);
CREATE TABLE satin_alma_karar_kalemi (
  talep_id uuid NOT NULL REFERENCES satin_alma_karar ON DELETE CASCADE,
  kalem_id uuid NOT NULL,
  teklif_id uuid NOT NULL,
  PRIMARY KEY (talep_id, kalem_id),
  CONSTRAINT satin_alma_karar_kalemi_kalem FOREIGN KEY (talep_id, kalem_id) REFERENCES satin_alma_talep_kalemi ON DELETE CASCADE,
  CONSTRAINT satin_alma_karar_kalemi_teklif FOREIGN KEY (talep_id, teklif_id) REFERENCES satin_alma_teklif ON DELETE CASCADE
);
-- Sipariş kesinleşince kullanılan kur (para birimi başına).
CREATE TABLE satin_alma_sabit_kur (
  talep_id uuid NOT NULL REFERENCES satin_alma_karar ON DELETE CASCADE,
  para_birimi char(3) NOT NULL REFERENCES satin_alma_kur,
  kur numeric(18,6) NOT NULL CONSTRAINT satin_alma_sabit_kur_pozitif CHECK (kur > 0),
  PRIMARY KEY (talep_id, para_birimi)
);
-- Sipariş tedarikçi teklifi başınadır (tek kararda bir satır); teslim ve kalite siparişte.
CREATE TABLE satin_alma_siparis (
  talep_id uuid NOT NULL REFERENCES satin_alma_karar ON DELETE CASCADE,
  teklif_id uuid NOT NULL,
  siparis_no text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_no CHECK (length(siparis_no) <= 40),
  siparis_tarihi date,
  beklenen_teslim date,
  teslim_tarihi date,
  kalite text CONSTRAINT satin_alma_siparis_kalite CHECK (kalite IN ('sorunsuz', 'kismi_sorun', 'red_iade')),
  teslim_alan_kisi_id int REFERENCES kisi,
  PRIMARY KEY (talep_id, teklif_id),
  CONSTRAINT satin_alma_siparis_teklif FOREIGN KEY (talep_id, teklif_id) REFERENCES satin_alma_teklif ON DELETE CASCADE,
  CONSTRAINT satin_alma_siparis_teslim_butun CHECK ((teslim_tarihi IS NULL) = (kalite IS NULL)),
  CONSTRAINT satin_alma_siparis_teslim_sonra CHECK (teslim_tarihi >= siparis_tarihi)
);

-- Onay ve ret: yalnız eklenir.
CREATE TABLE satin_alma_onay (
  id uuid PRIMARY KEY,
  talep_id uuid NOT NULL REFERENCES satin_alma_talep,
  zaman timestamptz NOT NULL DEFAULT clock_timestamp(),
  kisi_id int NOT NULL REFERENCES kisi,
  sonuc text NOT NULL CONSTRAINT satin_alma_onay_sonuc CHECK (sonuc IN ('onay', 'ret')),
  dort_gozsuz boolean NOT NULL DEFAULT false,
  notlar text NOT NULL DEFAULT '' CONSTRAINT satin_alma_onay_notlar CHECK (length(notlar) <= 2000),
  CONSTRAINT satin_alma_onay_ret_notlu CHECK (sonuc <> 'ret' OR notlar <> '')
);
CREATE TRIGGER satin_alma_onay_yalniz_ekleme BEFORE UPDATE OR DELETE ON satin_alma_onay FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

-- Talep geçmişi (insan diliyle): yalnız eklenir.
CREATE TABLE satin_alma_hareket (
  id uuid PRIMARY KEY,
  talep_id uuid NOT NULL REFERENCES satin_alma_talep ON DELETE CASCADE,
  zaman timestamptz NOT NULL DEFAULT clock_timestamp(),
  kisi_id int REFERENCES kisi,
  metin text NOT NULL CONSTRAINT satin_alma_hareket_metin CHECK (btrim(metin) <> '' AND length(metin) <= 1000)
);
CREATE TRIGGER satin_alma_hareket_yalniz_ekleme BEFORE UPDATE ON satin_alma_hareket FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
-- Tek istisna: taslak talep silinince geçmişi birlikte gider (talep satırı o anda artık yoktur). Doğrudan silme reddedilir.
CREATE FUNCTION satin_alma_hareket_silme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM satin_alma_talep WHERE id = OLD.talep_id) THEN
    RAISE EXCEPTION 'satin_alma_hareket tablosuna yalnız ekleme yapılır' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER satin_alma_hareket_silme BEFORE DELETE ON satin_alma_hareket FOR EACH ROW EXECUTE FUNCTION satin_alma_hareket_silme();

-- Dağıtım denemesi senaryoları: kararı etkilemez.
CREATE TABLE satin_alma_senaryo (
  talep_id uuid NOT NULL REFERENCES satin_alma_talep ON DELETE CASCADE,
  id uuid NOT NULL,
  ad text NOT NULL CONSTRAINT satin_alma_senaryo_ad CHECK (btrim(ad) <> '' AND length(ad) <= 80),
  kisi_id int REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (talep_id, id)
);
CREATE TABLE satin_alma_senaryo_payi (
  talep_id uuid NOT NULL,
  senaryo_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  teklif_id uuid NOT NULL,
  miktar numeric(18,4) NOT NULL CONSTRAINT satin_alma_senaryo_payi_miktar CHECK (miktar >= 0),
  PRIMARY KEY (talep_id, senaryo_id, kalem_id, teklif_id),
  CONSTRAINT satin_alma_senaryo_payi_senaryo FOREIGN KEY (talep_id, senaryo_id) REFERENCES satin_alma_senaryo ON DELETE CASCADE,
  CONSTRAINT satin_alma_senaryo_payi_kalem FOREIGN KEY (talep_id, kalem_id) REFERENCES satin_alma_talep_kalemi ON DELETE CASCADE,
  CONSTRAINT satin_alma_senaryo_payi_teklif FOREIGN KEY (talep_id, teklif_id) REFERENCES satin_alma_teklif ON DELETE CASCADE
);
CREATE TABLE satin_alma_senaryo_kalemi (
  talep_id uuid NOT NULL,
  senaryo_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  denge numeric(18,4),
  PRIMARY KEY (talep_id, senaryo_id, kalem_id),
  CONSTRAINT satin_alma_senaryo_kalemi_senaryo FOREIGN KEY (talep_id, senaryo_id) REFERENCES satin_alma_senaryo ON DELETE CASCADE,
  CONSTRAINT satin_alma_senaryo_kalemi_kalem FOREIGN KEY (talep_id, kalem_id) REFERENCES satin_alma_talep_kalemi ON DELETE CASCADE
);

-- SAT-66: yalnız taslak talep silinir (alt kayıtları birlikte); diğerleri gerekçeyle iptal edilir.
CREATE FUNCTION satin_alma_talep_silme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.durum <> 'taslak' THEN
    RAISE EXCEPTION 'Yalnız taslak talep silinir (talep %, durum %)', OLD.no, OLD.durum USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER satin_alma_talep_silme BEFORE DELETE ON satin_alma_talep FOR EACH ROW EXECUTE FUNCTION satin_alma_talep_silme();

-- SAT-67: karar verilmiş talepte teklif silinmez.
CREATE FUNCTION satin_alma_teklif_silme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM satin_alma_karar WHERE talep_id = OLD.talep_id)
     AND EXISTS (SELECT 1 FROM satin_alma_talep WHERE id = OLD.talep_id) THEN
    RAISE EXCEPTION 'Karar verilmiş talepte teklif silinmez' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER satin_alma_teklif_silme BEFORE DELETE ON satin_alma_teklif FOR EACH ROW EXECUTE FUNCTION satin_alma_teklif_silme();
