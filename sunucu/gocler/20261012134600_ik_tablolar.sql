-- İnsan Kaynakları tabloları (kullanıcı kararları 08.10.2026: her kayıt türü ayrı tabloda, her alan bir sütun, iç içe
-- listeler alt tabloda; personel ve pozisyonda zorunlu iş merkezi; personelde TMI kullanıcısı). Tablolar tek tanımdan üretildi
-- (sunucu/moduller/ik/sema.ts); sema.test.ts ikisinin aynı kaldığını sınar. Alt tablolar her yazmada ana kayıtla birlikte yenilenir.

-- Ana kayıtlar silinmez (iptal edilir); tür, açan ve açılış değişmez; sürüm her yazmada bir artar.
CREATE FUNCTION ik_kayit_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'İK kaydı silinmez; iptal edilir (%)', TG_TABLE_NAME USING ERRCODE = 'check_violation', CONSTRAINT = 'ik_kayit_silinmez';
  END IF;
  IF (NEW.kimlik, NEW.olusturan_kisi_id, NEW.olusturma) IS DISTINCT FROM (OLD.kimlik, OLD.olusturan_kisi_id, OLD.olusturma) THEN
    RAISE EXCEPTION 'Kaydın kimliği, açanı ve açılış zamanı değişmez (%)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'ik_kayit_degismez';
  END IF;
  IF NEW.surum <> OLD.surum + 1 THEN
    RAISE EXCEPTION 'Kayıt sürümü her yazmada bir artar (%)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'ik_kayit_surum_artar';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE ik_personel (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_personel_kimlik_tek UNIQUE CONSTRAINT ik_personel_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  ad text NOT NULL,
  soyad text NOT NULL,
  tckn text,
  dogum_tarihi date,
  dogum_yeri text,
  cinsiyet text,
  medeni_durum text,
  cocuk_sayisi int,
  kan_grubu text,
  uyruk text,
  engel_durumu text,
  askerlik text,
  egitim text,
  okul text,
  ehliyet text,
  yabanci_dil text,
  telefon text,
  eposta text,
  kisisel_eposta text,
  il text,
  ilce text,
  adres text,
  acil_kisi text,
  acil_yakinlik text,
  acil_telefon text,
  sicil_no text,
  pozisyon text,
  yaka_tipi text,
  kademe text,
  yonetici_no int REFERENCES ik_personel (no),
  ise_giris date,
  deneme_bitis date,
  sozlesme_turu text,
  sozlesme_bitis date,
  calisma_sekli text,
  lokasyon text,
  sgk_no text,
  durum text,
  brut_maas numeric(14,2),
  yan_hak_tutar numeric(14,2),
  yemek_yontem text,
  yemek_hesap text,
  yemek_deger numeric(14,4),
  yol_yontem text,
  yol_hesap text,
  yol_deger numeric(14,4),
  tesvik_kodu text,
  bes_katilim boolean,
  banka text,
  iban text,
  onceki_kullanilan_izin numeric(14,4),
  yan_haklar text,
  cikis_tarihi date,
  cikis_kodu text,
  cikis_notu text,
  kisi_id int REFERENCES kisi (id),
  is_merkezi_id int NOT NULL REFERENCES is_merkezi (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_personel_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_personel_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_personel_soyad_bos_degil CHECK (soyad <> ''),
  CONSTRAINT ik_personel_tckn_bos_degil CHECK (tckn <> ''),
  CONSTRAINT ik_personel_dogum_yeri_bos_degil CHECK (dogum_yeri <> ''),
  CONSTRAINT ik_personel_cinsiyet_secenek CHECK (cinsiyet IN ('Kadın', 'Erkek', 'Belirtilmemiş')),
  CONSTRAINT ik_personel_medeni_durum_secenek CHECK (medeni_durum IN ('Bekâr', 'Evli', 'Boşanmış', 'Dul')),
  CONSTRAINT ik_personel_kan_grubu_secenek CHECK (kan_grubu IN ('A Rh+', 'A Rh-', 'B Rh+', 'B Rh-', 'AB Rh+', 'AB Rh-', '0 Rh+', '0 Rh-')),
  CONSTRAINT ik_personel_uyruk_bos_degil CHECK (uyruk <> ''),
  CONSTRAINT ik_personel_engel_durumu_secenek CHECK (engel_durumu IN ('Yok', '1. derece (%80 ve üzeri)', '2. derece (%60–79)', '3. derece (%40–59)')),
  CONSTRAINT ik_personel_askerlik_secenek CHECK (askerlik IN ('Yapıldı', 'Muaf', 'Tecilli', 'Yapılmadı', 'Uygulanmaz')),
  CONSTRAINT ik_personel_egitim_secenek CHECK (egitim IN ('İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora')),
  CONSTRAINT ik_personel_okul_bos_degil CHECK (okul <> ''),
  CONSTRAINT ik_personel_ehliyet_bos_degil CHECK (ehliyet <> ''),
  CONSTRAINT ik_personel_yabanci_dil_bos_degil CHECK (yabanci_dil <> ''),
  CONSTRAINT ik_personel_telefon_bos_degil CHECK (telefon <> ''),
  CONSTRAINT ik_personel_eposta_bos_degil CHECK (eposta <> ''),
  CONSTRAINT ik_personel_kisisel_eposta_bos_degil CHECK (kisisel_eposta <> ''),
  CONSTRAINT ik_personel_il_bos_degil CHECK (il <> ''),
  CONSTRAINT ik_personel_ilce_bos_degil CHECK (ilce <> ''),
  CONSTRAINT ik_personel_adres_bos_degil CHECK (adres <> ''),
  CONSTRAINT ik_personel_acil_kisi_bos_degil CHECK (acil_kisi <> ''),
  CONSTRAINT ik_personel_acil_yakinlik_bos_degil CHECK (acil_yakinlik <> ''),
  CONSTRAINT ik_personel_acil_telefon_bos_degil CHECK (acil_telefon <> ''),
  CONSTRAINT ik_personel_sicil_no_bos_degil CHECK (sicil_no <> ''),
  CONSTRAINT ik_personel_pozisyon_bos_degil CHECK (pozisyon <> ''),
  CONSTRAINT ik_personel_yaka_tipi_secenek CHECK (yaka_tipi IN ('Beyaz yaka', 'Mavi yaka')),
  CONSTRAINT ik_personel_kademe_secenek CHECK (kademe IN ('Üst yönetim', 'Yönetici', 'Takım lideri / şef', 'Uzman', 'Asistan / yardımcı', 'Operasyon / teknik personel', 'Stajyer')),
  CONSTRAINT ik_personel_sozlesme_turu_secenek CHECK (sozlesme_turu IN ('Belirsiz süreli', 'Belirli süreli', 'Kısmi süreli', 'Çağrı üzerine', 'Stajyer')),
  CONSTRAINT ik_personel_calisma_sekli_secenek CHECK (calisma_sekli IN ('Ofis', 'Hibrit', 'Uzaktan', 'Saha', 'Vardiyalı')),
  CONSTRAINT ik_personel_lokasyon_bos_degil CHECK (lokasyon <> ''),
  CONSTRAINT ik_personel_sgk_no_bos_degil CHECK (sgk_no <> ''),
  CONSTRAINT ik_personel_durum_secenek CHECK (durum IN ('Aktif', 'Ücretsiz izinde', 'Ayrıldı')),
  CONSTRAINT ik_personel_yemek_yontem_secenek CHECK (yemek_yontem IN ('Genel ayar', 'Yok', 'Yemek kartı / çeki', 'Nakit', 'İşyerinde yemek')),
  CONSTRAINT ik_personel_yemek_hesap_secenek CHECK (yemek_hesap IN ('Günlük tutar × fiili gün', 'Aylık sabit tutar', 'Brüt ücretin yüzdesi')),
  CONSTRAINT ik_personel_yol_yontem_secenek CHECK (yol_yontem IN ('Genel ayar', 'Yok', 'Toplu taşıma kartı / bilet', 'Nakit', 'Servis')),
  CONSTRAINT ik_personel_yol_hesap_secenek CHECK (yol_hesap IN ('Günlük tutar × fiili gün', 'Aylık sabit tutar', 'Brüt ücretin yüzdesi')),
  CONSTRAINT ik_personel_tesvik_kodu_bos_degil CHECK (tesvik_kodu <> ''),
  CONSTRAINT ik_personel_banka_bos_degil CHECK (banka <> ''),
  CONSTRAINT ik_personel_iban_bos_degil CHECK (iban <> ''),
  CONSTRAINT ik_personel_yan_haklar_bos_degil CHECK (yan_haklar <> ''),
  CONSTRAINT ik_personel_cikis_kodu_secenek CHECK (cikis_kodu IN ('01 Deneme süreli sözleşmenin işverence feshi', '02 Deneme süreli sözleşmenin işçi tarafından feshi', '03 Belirsiz süreli sözleşmenin işçi tarafından feshi (istifa)', '04 Belirsiz süreli sözleşmenin işveren tarafından haklı sebep bildirilmeden feshi', '05 Belirli süreli sözleşmenin sona ermesi', '08 Emeklilik (yaşlılık) veya toptan ödeme', '09 Malulen emeklilik', '10 Ölüm', '12 Askerlik', '13 Kadın işçinin evlenmesi', '14 Emeklilik için yaş dışındaki şartların tamamlanması', '22 Diğer nedenler', '25 İşçi tarafından ahlak ve iyi niyet kurallarına aykırılık nedeniyle fesih', '29 İşveren tarafından ahlak ve iyi niyet kurallarına aykırılık nedeniyle fesih')),
  CONSTRAINT ik_personel_cikis_notu_bos_degil CHECK (cikis_notu <> ''),
  CONSTRAINT ik_personel_tckn_bicimi CHECK (tckn IS NULL OR tckn ~ '^[1-9][0-9]{10}$'),
  CONSTRAINT ik_personel_iban_bicimi CHECK (iban IS NULL OR replace(iban, ' ', '') ~ '^TR[0-9]{24}$')
);

CREATE UNIQUE INDEX ik_personel_sicil_no_tek ON ik_personel (sicil_no) WHERE sicil_no IS NOT NULL AND NOT iptal;

CREATE UNIQUE INDEX ik_personel_kisi_id_tek ON ik_personel (kisi_id) WHERE kisi_id IS NOT NULL AND NOT iptal;

CREATE TRIGGER ik_personel_koru BEFORE UPDATE OR DELETE ON ik_personel FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_personel_bosaltilmaz BEFORE TRUNCATE ON ik_personel FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_departman (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_departman_kimlik_tek UNIQUE CONSTRAINT ik_departman_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  ad text NOT NULL,
  kod text,
  gider_hesabi text,
  yonetici_no int REFERENCES ik_personel (no),
  butce numeric(14,2),
  aciklama text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_departman_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_departman_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_departman_kod_bos_degil CHECK (kod <> ''),
  CONSTRAINT ik_departman_gider_hesabi_bos_degil CHECK (gider_hesabi <> ''),
  CONSTRAINT ik_departman_aciklama_bos_degil CHECK (aciklama <> '')
);

CREATE TRIGGER ik_departman_koru BEFORE UPDATE OR DELETE ON ik_departman FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_departman_bosaltilmaz BEFORE TRUNCATE ON ik_departman FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

ALTER TABLE ik_personel ADD COLUMN departman_no int REFERENCES ik_departman (no);

CREATE TABLE ik_pozisyon (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_pozisyon_kimlik_tek UNIQUE CONSTRAINT ik_pozisyon_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  baslik text NOT NULL,
  departman_no int REFERENCES ik_departman (no),
  adet int,
  gerekce text,
  yerine_no int REFERENCES ik_personel (no),
  talep_eden_no int REFERENCES ik_personel (no),
  sorumlu_no int REFERENCES ik_personel (no),
  durum text,
  acilis date,
  butce_notu text,
  ucret_min numeric(14,2),
  ucret_max numeric(14,2),
  ilan_baslik text,
  lokasyon text,
  calisma_sekli text,
  calisma_turu text,
  deneyim text,
  egitim_seviye text,
  ozet text,
  sorumluluklar text,
  nitelikler text,
  tercih text,
  yan_haklar text,
  ucret_goster boolean,
  son_basvuru date,
  ilan_kodu text,
  basvuru_eposta text,
  basvuru_baglanti text,
  mulakat_sorulari text,
  aciklama text,
  ozel_metin text,
  is_merkezi_id int NOT NULL REFERENCES is_merkezi (id),
  gonderen_kisi_id int REFERENCES kisi (id),
  onaylayan_kisi_id int REFERENCES kisi (id),
  onaylama timestamptz,
  dort_gozsuz_onay boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_pozisyon_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_pozisyon_baslik_bos_degil CHECK (baslik <> ''),
  CONSTRAINT ik_pozisyon_gerekce_secenek CHECK (gerekce IN ('Yeni kadro', 'Ayrılan çalışanın yerine', 'Geçici / proje', 'Stajyer')),
  CONSTRAINT ik_pozisyon_durum_secenek CHECK (durum IN ('Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı')),
  CONSTRAINT ik_pozisyon_butce_notu_bos_degil CHECK (butce_notu <> ''),
  CONSTRAINT ik_pozisyon_ilan_baslik_bos_degil CHECK (ilan_baslik <> ''),
  CONSTRAINT ik_pozisyon_lokasyon_bos_degil CHECK (lokasyon <> ''),
  CONSTRAINT ik_pozisyon_calisma_sekli_secenek CHECK (calisma_sekli IN ('Ofis', 'Hibrit', 'Uzaktan', 'Saha', 'Vardiyalı')),
  CONSTRAINT ik_pozisyon_calisma_turu_secenek CHECK (calisma_turu IN ('Tam zamanlı', 'Yarı zamanlı', 'Dönemsel / proje', 'Stajyer', 'Serbest')),
  CONSTRAINT ik_pozisyon_deneyim_secenek CHECK (deneyim IN ('Deneyimsiz', '1 yıl ve üzeri', '2–5 yıl', '5–10 yıl', '10 yıl ve üzeri', 'Belirtilmemiş')),
  CONSTRAINT ik_pozisyon_egitim_seviye_secenek CHECK (egitim_seviye IN ('İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Belirtilmemiş')),
  CONSTRAINT ik_pozisyon_ozet_bos_degil CHECK (ozet <> ''),
  CONSTRAINT ik_pozisyon_sorumluluklar_bos_degil CHECK (sorumluluklar <> ''),
  CONSTRAINT ik_pozisyon_nitelikler_bos_degil CHECK (nitelikler <> ''),
  CONSTRAINT ik_pozisyon_tercih_bos_degil CHECK (tercih <> ''),
  CONSTRAINT ik_pozisyon_yan_haklar_bos_degil CHECK (yan_haklar <> ''),
  CONSTRAINT ik_pozisyon_ilan_kodu_bos_degil CHECK (ilan_kodu <> ''),
  CONSTRAINT ik_pozisyon_basvuru_eposta_bos_degil CHECK (basvuru_eposta <> ''),
  CONSTRAINT ik_pozisyon_basvuru_baglanti_bos_degil CHECK (basvuru_baglanti <> ''),
  CONSTRAINT ik_pozisyon_mulakat_sorulari_bos_degil CHECK (mulakat_sorulari <> ''),
  CONSTRAINT ik_pozisyon_aciklama_bos_degil CHECK (aciklama <> ''),
  CONSTRAINT ik_pozisyon_ozel_metin_bos_degil CHECK (ozel_metin <> ''),
  CONSTRAINT ik_pozisyon_dort_goz CHECK (dort_gozsuz_onay OR onaylayan_kisi_id IS NULL OR gonderen_kisi_id IS NULL OR onaylayan_kisi_id <> gonderen_kisi_id),
  CONSTRAINT ik_pozisyon_ucret_araligi CHECK (ucret_min IS NULL OR ucret_max IS NULL OR ucret_max >= ucret_min)
);

CREATE UNIQUE INDEX ik_pozisyon_ilan_kodu_tek ON ik_pozisyon (ilan_kodu) WHERE ilan_kodu IS NOT NULL AND NOT iptal;

CREATE TRIGGER ik_pozisyon_koru BEFORE UPDATE OR DELETE ON ik_pozisyon FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_pozisyon_bosaltilmaz BEFORE TRUNCATE ON ik_pozisyon FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_aday (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_aday_kimlik_tek UNIQUE CONSTRAINT ik_aday_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  ad text NOT NULL,
  soyad text,
  eposta text,
  telefon text,
  pozisyon_no int REFERENCES ik_pozisyon (no),
  il text,
  kaynak text,
  referans_no int REFERENCES ik_personel (no),
  basvuru_tarihi date,
  asama text,
  kvkk_onayi boolean,
  mevcut_sirket text,
  mevcut_pozisyon text,
  tecrube_yil numeric(14,4),
  egitim text,
  okul text,
  yabanci_dil text,
  cv_baglanti text,
  ozet text,
  maas_beklentisi numeric(14,2),
  baslayabilir date,
  teklif_ucret numeric(14,2),
  teklif_tarihi date,
  teklif_yanit text,
  teklif_notu text,
  red_nedeni text,
  notlar text,
  personel_no int REFERENCES ik_personel (no),
  ise_alim_tarihi date,
  red_tarihi date,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_aday_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_aday_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_aday_soyad_bos_degil CHECK (soyad <> ''),
  CONSTRAINT ik_aday_eposta_bos_degil CHECK (eposta <> ''),
  CONSTRAINT ik_aday_telefon_bos_degil CHECK (telefon <> ''),
  CONSTRAINT ik_aday_il_bos_degil CHECK (il <> ''),
  CONSTRAINT ik_aday_kaynak_bos_degil CHECK (kaynak <> ''),
  CONSTRAINT ik_aday_asama_secenek CHECK (asama IN ('Başvuru', 'Ön görüşme', 'Mülakat', 'Teklif', 'İşe alındı', 'Reddedildi')),
  CONSTRAINT ik_aday_mevcut_sirket_bos_degil CHECK (mevcut_sirket <> ''),
  CONSTRAINT ik_aday_mevcut_pozisyon_bos_degil CHECK (mevcut_pozisyon <> ''),
  CONSTRAINT ik_aday_egitim_secenek CHECK (egitim IN ('İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora')),
  CONSTRAINT ik_aday_okul_bos_degil CHECK (okul <> ''),
  CONSTRAINT ik_aday_yabanci_dil_bos_degil CHECK (yabanci_dil <> ''),
  CONSTRAINT ik_aday_cv_baglanti_bos_degil CHECK (cv_baglanti <> ''),
  CONSTRAINT ik_aday_ozet_bos_degil CHECK (ozet <> ''),
  CONSTRAINT ik_aday_teklif_yanit_secenek CHECK (teklif_yanit IN ('Bekleniyor', 'Kabul etti', 'Reddetti', 'Pazarlık sürüyor')),
  CONSTRAINT ik_aday_teklif_notu_bos_degil CHECK (teklif_notu <> ''),
  CONSTRAINT ik_aday_red_nedeni_secenek CHECK (red_nedeni IN ('Yetkinlikler yetersiz', 'Deneyim yetersiz', 'Ücret beklentisi uyuşmadı', 'Aday teklifi reddetti', 'Aday süreçten çekildi', 'Kültürel uyum', 'Referans kontrolü olumsuz', 'Pozisyon kapandı / donduruldu', 'Diğer')),
  CONSTRAINT ik_aday_notlar_bos_degil CHECK (notlar <> '')
);

CREATE TRIGGER ik_aday_koru BEFORE UPDATE OR DELETE ON ik_aday FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_aday_bosaltilmaz BEFORE TRUNCATE ON ik_aday FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_gorusme (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_gorusme_kimlik_tek UNIQUE CONSTRAINT ik_gorusme_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  aday_no int NOT NULL REFERENCES ik_aday (no),
  tur text,
  tarih date,
  saat time,
  sure int,
  sekil text,
  yer text,
  durum text,
  oneri text,
  guclu text,
  zayif text,
  notlar text,
  degerlendirme_tarihi date,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_gorusme_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_gorusme_tur_secenek CHECK (tur IN ('Telefon ön görüşmesi', 'İK mülakatı', 'Teknik mülakat', 'Yönetici mülakatı', 'Panel mülakat', 'Vaka çalışması / test', 'Referans kontrolü')),
  CONSTRAINT ik_gorusme_sekil_secenek CHECK (sekil IN ('Yüz yüze', 'Video görüşme', 'Telefon')),
  CONSTRAINT ik_gorusme_yer_bos_degil CHECK (yer <> ''),
  CONSTRAINT ik_gorusme_durum_secenek CHECK (durum IN ('Planlandı', 'Tamamlandı', 'Aday gelmedi', 'İptal')),
  CONSTRAINT ik_gorusme_oneri_secenek CHECK (oneri IN ('Kesinlikle alınsın', 'Alınsın', 'Kararsız', 'Alınmasın')),
  CONSTRAINT ik_gorusme_guclu_bos_degil CHECK (guclu <> ''),
  CONSTRAINT ik_gorusme_zayif_bos_degil CHECK (zayif <> ''),
  CONSTRAINT ik_gorusme_notlar_bos_degil CHECK (notlar <> '')
);

CREATE TRIGGER ik_gorusme_koru BEFORE UPDATE OR DELETE ON ik_gorusme FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_gorusme_bosaltilmaz BEFORE TRUNCATE ON ik_gorusme FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_izin (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_izin_kimlik_tek UNIQUE CONSTRAINT ik_izin_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  personel_no int NOT NULL REFERENCES ik_personel (no),
  tur text NOT NULL,
  baslangic date NOT NULL,
  bitis date NOT NULL,
  gun numeric(14,4),
  durum text NOT NULL,
  vekil_no int REFERENCES ik_personel (no),
  aciklama text,
  talep_tarihi date,
  karar_tarihi date,
  karar_veren_personel_no int REFERENCES ik_personel (no),
  kaynak text,
  karar_veren_kisi_id int REFERENCES kisi (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_izin_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_izin_tur_secenek CHECK (tur IN ('Yıllık izin', 'Mazeret izni', 'Hastalık / rapor', 'Ücretsiz izin', 'Doğum izni', 'Babalık izni', 'Evlilik izni', 'Ölüm izni', 'Süt izni', 'Resmi görev', 'Diğer')),
  CONSTRAINT ik_izin_durum_secenek CHECK (durum IN ('Beklemede', 'Onaylandı', 'Reddedildi', 'İptal')),
  CONSTRAINT ik_izin_aciklama_bos_degil CHECK (aciklama <> ''),
  CONSTRAINT ik_izin_kaynak_secenek CHECK (kaynak IN ('Çalışan')),
  CONSTRAINT ik_izin_tarih_sirasi CHECK (bitis >= baslangic)
);

CREATE TRIGGER ik_izin_koru BEFORE UPDATE OR DELETE ON ik_izin FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_izin_bosaltilmaz BEFORE TRUNCATE ON ik_izin FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_devam (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_devam_kimlik_tek UNIQUE CONSTRAINT ik_devam_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  personel_no int NOT NULL REFERENCES ik_personel (no),
  tarih date NOT NULL,
  tur text NOT NULL,
  saat numeric(14,4),
  onay text,
  aciklama text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_devam_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_devam_tur_secenek CHECK (tur IN ('Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması', 'Geç kalma', 'Erken çıkış', 'Devamsızlık', 'Görevlendirme')),
  CONSTRAINT ik_devam_onay_secenek CHECK (onay IN ('Onaylandı', 'Beklemede')),
  CONSTRAINT ik_devam_aciklama_bos_degil CHECK (aciklama <> '')
);

CREATE TRIGGER ik_devam_koru BEFORE UPDATE OR DELETE ON ik_devam FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_devam_bosaltilmaz BEFORE TRUNCATE ON ik_devam FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_performans (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_performans_kimlik_tek UNIQUE CONSTRAINT ik_performans_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  personel_no int NOT NULL REFERENCES ik_personel (no),
  donem text,
  degerlendiren_no int REFERENCES ik_personel (no),
  tarih date,
  hedefler text,
  guclu text,
  gelisim text,
  aksiyon text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_performans_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_performans_donem_bos_degil CHECK (donem <> ''),
  CONSTRAINT ik_performans_hedefler_bos_degil CHECK (hedefler <> ''),
  CONSTRAINT ik_performans_guclu_bos_degil CHECK (guclu <> ''),
  CONSTRAINT ik_performans_gelisim_bos_degil CHECK (gelisim <> ''),
  CONSTRAINT ik_performans_aksiyon_bos_degil CHECK (aksiyon <> '')
);

CREATE TRIGGER ik_performans_koru BEFORE UPDATE OR DELETE ON ik_performans FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_performans_bosaltilmaz BEFORE TRUNCATE ON ik_performans FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_egitim (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_egitim_kimlik_tek UNIQUE CONSTRAINT ik_egitim_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  ad text NOT NULL,
  tur text,
  kurum text,
  durum text,
  tarih date,
  sure numeric(14,4),
  maliyet numeric(14,2),
  gecerlilik date,
  aciklama text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_egitim_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_egitim_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_egitim_tur_secenek CHECK (tur IN ('İSG (zorunlu)', 'Oryantasyon', 'Teknik', 'Kişisel gelişim', 'Yönetim / liderlik', 'Mevzuat', 'Diğer')),
  CONSTRAINT ik_egitim_kurum_bos_degil CHECK (kurum <> ''),
  CONSTRAINT ik_egitim_durum_secenek CHECK (durum IN ('Planlandı', 'Tamamlandı', 'İptal')),
  CONSTRAINT ik_egitim_aciklama_bos_degil CHECK (aciklama <> '')
);

CREATE TRIGGER ik_egitim_koru BEFORE UPDATE OR DELETE ON ik_egitim FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_egitim_bosaltilmaz BEFORE TRUNCATE ON ik_egitim FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_zimmet (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_zimmet_kimlik_tek UNIQUE CONSTRAINT ik_zimmet_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  personel_no int NOT NULL REFERENCES ik_personel (no),
  tur text,
  marka text,
  seri_no text,
  verilis date,
  iade date,
  deger numeric(14,2),
  aciklama text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_zimmet_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_zimmet_tur_secenek CHECK (tur IN ('Dizüstü bilgisayar', 'Masaüstü bilgisayar', 'Monitör', 'Cep telefonu', 'Hat / SIM', 'Araç', 'Giriş kartı', 'Anahtar', 'İş kıyafeti / KKD', 'Diğer')),
  CONSTRAINT ik_zimmet_marka_bos_degil CHECK (marka <> ''),
  CONSTRAINT ik_zimmet_seri_no_bos_degil CHECK (seri_no <> ''),
  CONSTRAINT ik_zimmet_aciklama_bos_degil CHECK (aciklama <> ''),
  CONSTRAINT ik_zimmet_iade_sirasi CHECK (iade IS NULL OR verilis IS NULL OR iade >= verilis)
);

CREATE TRIGGER ik_zimmet_koru BEFORE UPDATE OR DELETE ON ik_zimmet FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_zimmet_bosaltilmaz BEFORE TRUNCATE ON ik_zimmet FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE TABLE ik_bordro (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_bordro_kimlik_tek UNIQUE CONSTRAINT ik_bordro_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  personel_no int NOT NULL REFERENCES ik_personel (no),
  donem date NOT NULL,
  girdi_brut numeric(14,2),
  gun int,
  girdi_ek numeric(14,2),
  mesai_saat numeric(14,4),
  tatil_saat numeric(14,4),
  girdi_kesinti numeric(14,2),
  toplam numeric(14,2),
  net numeric(14,2),
  gelir_vergisi numeric(14,2),
  damga_vergisi numeric(14,2),
  sgk_isci numeric(14,2),
  issizlik_isci numeric(14,2),
  maliyet numeric(14,2),
  parametre_donemi_kodu text,
  parametre_donemi_adi text,
  kesinlesme timestamptz,
  h_aylik numeric(20,6),
  h_gun int,
  h_brut numeric(20,6),
  h_ek numeric(20,6),
  h_mesai_ucreti numeric(20,6),
  h_ucret numeric(20,6),
  h_yan_hak numeric(20,6),
  h_toplam numeric(20,6),
  h_sgk_matrahi numeric(20,6),
  h_sgk_isci numeric(20,6),
  h_issizlik_isci numeric(20,6),
  h_engelli_indirimi numeric(20,6),
  h_gv_matrahi numeric(20,6),
  h_kumulatif_matrah_once numeric(20,6),
  h_gv_hesaplanan numeric(20,6),
  h_gv_istisnasi numeric(20,6),
  h_gelir_vergisi numeric(20,6),
  h_dv_hesaplanan numeric(20,6),
  h_dv_istisnasi numeric(20,6),
  h_damga_vergisi numeric(20,6),
  h_bes numeric(20,6),
  h_diger_kesinti numeric(20,6),
  h_net numeric(20,6),
  h_ayni_odeme numeric(20,6),
  h_bankaya_odenecek numeric(20,6),
  h_isveren_brut numeric(20,6),
  h_tesvik_indirimi numeric(20,6),
  h_isveren_sgk numeric(20,6),
  h_isveren_issizlik numeric(20,6),
  h_maliyet numeric(20,6),
  h_asgari_matrah numeric(20,6),
  h_parametre_donemi_adi text,
  h_yemek_var boolean NOT NULL DEFAULT false,
  h_yemek_tutar numeric(20,6),
  h_yemek_gv_istisnasi numeric(20,6),
  h_yemek_sgk_istisnasi numeric(20,6),
  h_yemek_ayni boolean,
  h_yemek_yontem text,
  h_yemek_fiili_gun numeric(14,4),
  h_yemek_hizmet boolean,
  h_yol_var boolean NOT NULL DEFAULT false,
  h_yol_tutar numeric(20,6),
  h_yol_gv_istisnasi numeric(20,6),
  h_yol_sgk_istisnasi numeric(20,6),
  h_yol_ayni boolean,
  h_yol_yontem text,
  h_yol_fiili_gun numeric(14,4),
  h_yol_hizmet boolean,
  h_tesvik_var boolean NOT NULL DEFAULT false,
  h_tesvik_kodu text,
  h_tesvik_adi text,
  h_tesvik_turu text,
  h_tesvik_degeri numeric(14,4),
  h_tesvik_kanun_no text,
  parametre_donemi_no int,
  kesinlestiren_kisi_id int REFERENCES kisi (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_bordro_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_bordro_donem_ay_basi CHECK (extract(day FROM donem) = 1),
  CONSTRAINT ik_bordro_parametre_donemi_kodu_bos_degil CHECK (parametre_donemi_kodu <> ''),
  CONSTRAINT ik_bordro_parametre_donemi_adi_bos_degil CHECK (parametre_donemi_adi <> ''),
  CONSTRAINT ik_bordro_h_parametre_donemi_adi_bos_degil CHECK (h_parametre_donemi_adi <> ''),
  CONSTRAINT ik_bordro_h_yemek_yontem_bos_degil CHECK (h_yemek_yontem <> ''),
  CONSTRAINT ik_bordro_h_yol_yontem_bos_degil CHECK (h_yol_yontem <> ''),
  CONSTRAINT ik_bordro_h_tesvik_kodu_bos_degil CHECK (h_tesvik_kodu <> ''),
  CONSTRAINT ik_bordro_h_tesvik_adi_bos_degil CHECK (h_tesvik_adi <> ''),
  CONSTRAINT ik_bordro_h_tesvik_turu_bos_degil CHECK (h_tesvik_turu <> ''),
  CONSTRAINT ik_bordro_h_tesvik_kanun_no_bos_degil CHECK (h_tesvik_kanun_no <> '')
);

CREATE TRIGGER ik_bordro_koru BEFORE UPDATE OR DELETE ON ik_bordro FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();

CREATE TRIGGER ik_bordro_bosaltilmaz BEFORE TRUNCATE ON ik_bordro FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

CREATE UNIQUE INDEX ik_bordro_ayda_tek ON ik_bordro (personel_no, donem) WHERE NOT iptal;

CREATE INDEX ik_izin_personel ON ik_izin (personel_no);

CREATE INDEX ik_personel_is_merkezi ON ik_personel (is_merkezi_id);

CREATE INDEX ik_pozisyon_is_merkezi ON ik_pozisyon (is_merkezi_id);

CREATE TABLE ik_personel_ucret (
  personel_no int NOT NULL REFERENCES ik_personel (no),
  sira int NOT NULL CONSTRAINT ik_personel_ucret_sira_pozitif CHECK (sira > 0),
  yururluk date NOT NULL,
  brut numeric(14,2) NOT NULL,
  neden text,
  notu text,
  CONSTRAINT ik_personel_ucret_neden_bos_degil CHECK (neden <> ''),
  CONSTRAINT ik_personel_ucret_notu_bos_degil CHECK (notu <> ''),
  CONSTRAINT ik_personel_ucret_anahtar PRIMARY KEY (personel_no, sira)
);

CREATE TABLE ik_personel_hareket (
  personel_no int NOT NULL REFERENCES ik_personel (no),
  sira int NOT NULL CONSTRAINT ik_personel_hareket_sira_pozitif CHECK (sira > 0),
  zaman timestamptz,
  tarih date,
  alan text,
  eski text,
  yeni text,
  CONSTRAINT ik_personel_hareket_alan_bos_degil CHECK (alan <> ''),
  CONSTRAINT ik_personel_hareket_eski_bos_degil CHECK (eski <> ''),
  CONSTRAINT ik_personel_hareket_yeni_bos_degil CHECK (yeni <> ''),
  CONSTRAINT ik_personel_hareket_anahtar PRIMARY KEY (personel_no, sira)
);

CREATE TABLE ik_personel_belge (
  personel_no int NOT NULL REFERENCES ik_personel (no),
  belge_adi text NOT NULL CONSTRAINT ik_personel_belge_belge_adi_bos_degil CHECK (belge_adi <> ''),
  tamam boolean,
  tarih date,
  CONSTRAINT ik_personel_belge_anahtar PRIMARY KEY (personel_no, belge_adi)
);

CREATE TABLE ik_personel_notu (
  personel_no int NOT NULL REFERENCES ik_personel (no),
  sira int NOT NULL CONSTRAINT ik_personel_notu_sira_pozitif CHECK (sira > 0),
  zaman timestamptz,
  metin text NOT NULL,
  CONSTRAINT ik_personel_notu_metin_bos_degil CHECK (metin <> ''),
  CONSTRAINT ik_personel_notu_anahtar PRIMARY KEY (personel_no, sira)
);

CREATE TABLE ik_personel_cikis_adimi (
  personel_no int NOT NULL REFERENCES ik_personel (no),
  adim text NOT NULL CONSTRAINT ik_personel_cikis_adimi_adim_bos_degil CHECK (adim <> ''),
  tarih date,
  CONSTRAINT ik_personel_cikis_adimi_anahtar PRIMARY KEY (personel_no, adim)
);

CREATE TABLE ik_personel_primi (
  personel_no int NOT NULL REFERENCES ik_personel (no),
  prim_kodu text NOT NULL CONSTRAINT ik_personel_primi_prim_kodu_bos_degil CHECK (prim_kodu <> ''),
  aktif boolean,
  deger numeric(14,4),
  CONSTRAINT ik_personel_primi_anahtar PRIMARY KEY (personel_no, prim_kodu)
);

CREATE TABLE ik_pozisyon_yayini (
  pozisyon_no int NOT NULL REFERENCES ik_pozisyon (no),
  kanal_kodu text NOT NULL CONSTRAINT ik_pozisyon_yayini_kanal_kodu_bos_degil CHECK (kanal_kodu <> ''),
  durum text,
  yayin_tarihi date,
  bitis date,
  baglanti text,
  notu text,
  kapanis date,
  CONSTRAINT ik_pozisyon_yayini_durum_bos_degil CHECK (durum <> ''),
  CONSTRAINT ik_pozisyon_yayini_baglanti_bos_degil CHECK (baglanti <> ''),
  CONSTRAINT ik_pozisyon_yayini_notu_bos_degil CHECK (notu <> ''),
  CONSTRAINT ik_pozisyon_yayini_anahtar PRIMARY KEY (pozisyon_no, kanal_kodu)
);

CREATE TABLE ik_gorusmeci (
  gorusme_no int NOT NULL REFERENCES ik_gorusme (no),
  personel_no int REFERENCES ik_personel (no),
  CONSTRAINT ik_gorusmeci_anahtar PRIMARY KEY (gorusme_no, personel_no)
);

CREATE TABLE ik_gorusme_puani (
  gorusme_no int NOT NULL REFERENCES ik_gorusme (no),
  kriter text NOT NULL CONSTRAINT ik_gorusme_puani_kriter_bos_degil CHECK (kriter <> ''),
  puan int,
  CONSTRAINT ik_gorusme_puani_anahtar PRIMARY KEY (gorusme_no, kriter)
);

CREATE TABLE ik_performans_puani (
  performans_no int NOT NULL REFERENCES ik_performans (no),
  kriter text NOT NULL CONSTRAINT ik_performans_puani_kriter_bos_degil CHECK (kriter <> ''),
  puan int,
  CONSTRAINT ik_performans_puani_anahtar PRIMARY KEY (performans_no, kriter)
);

CREATE TABLE ik_egitim_katilimcisi (
  egitim_no int NOT NULL REFERENCES ik_egitim (no),
  personel_no int REFERENCES ik_personel (no),
  CONSTRAINT ik_egitim_katilimcisi_anahtar PRIMARY KEY (egitim_no, personel_no)
);

CREATE TABLE ik_bordro_primi (
  bordro_no int NOT NULL REFERENCES ik_bordro (no),
  sira int NOT NULL CONSTRAINT ik_bordro_primi_sira_pozitif CHECK (sira > 0),
  ad text NOT NULL,
  tutar numeric(20,6),
  CONSTRAINT ik_bordro_primi_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_bordro_primi_anahtar PRIMARY KEY (bordro_no, sira)
);


-- Ayarlar: genel ayar ve maliyet planı tek satır; listeler sıralı satırlar. Ayar sürümü genel ayar satırındadır.

CREATE TABLE ik_genel_ayar (
  anahtar text PRIMARY KEY CONSTRAINT ik_genel_ayar_tek_satir CHECK (anahtar = 'genel'),
  sirket text,
  cumartesi_is_gunu boolean,
  deneme_suresi_ay int,
  engelli_esik int,
  engelli_oran numeric(14,4),
  sgk_tesvik_puan numeric(14,4),
  sirket_tanitim text,
  kariyer_eposta text,
  kariyer_sayfasi text,
  ilan_lokasyon text,
  kvkk_baglanti text,
  ilan_yan_haklari text,
  hesap_personel text,
  hesap_sgk text,
  hesap_vergi text,
  hesap_gider text,
  hesap_diger text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_genel_ayar_surum_pozitif CHECK (surum > 0),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_genel_ayar_sirket_bos_degil CHECK (sirket <> ''),
  CONSTRAINT ik_genel_ayar_sirket_tanitim_bos_degil CHECK (sirket_tanitim <> ''),
  CONSTRAINT ik_genel_ayar_kariyer_eposta_bos_degil CHECK (kariyer_eposta <> ''),
  CONSTRAINT ik_genel_ayar_kariyer_sayfasi_bos_degil CHECK (kariyer_sayfasi <> ''),
  CONSTRAINT ik_genel_ayar_ilan_lokasyon_bos_degil CHECK (ilan_lokasyon <> ''),
  CONSTRAINT ik_genel_ayar_kvkk_baglanti_bos_degil CHECK (kvkk_baglanti <> ''),
  CONSTRAINT ik_genel_ayar_ilan_yan_haklari_bos_degil CHECK (ilan_yan_haklari <> ''),
  CONSTRAINT ik_genel_ayar_hesap_personel_bos_degil CHECK (hesap_personel <> ''),
  CONSTRAINT ik_genel_ayar_hesap_sgk_bos_degil CHECK (hesap_sgk <> ''),
  CONSTRAINT ik_genel_ayar_hesap_vergi_bos_degil CHECK (hesap_vergi <> ''),
  CONSTRAINT ik_genel_ayar_hesap_gider_bos_degil CHECK (hesap_gider <> ''),
  CONSTRAINT ik_genel_ayar_hesap_diger_bos_degil CHECK (hesap_diger <> '')
);

CREATE TABLE ik_parametre_donemi (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL CONSTRAINT ik_parametre_donemi_kod_tek UNIQUE CONSTRAINT ik_parametre_donemi_kod_bicimi CHECK (kod ~ '^[A-Za-z0-9_-]{1,80}$'),
  ad text NOT NULL CONSTRAINT ik_parametre_donemi_ad_bos_degil CHECK (ad <> ''),
  baslangic date NOT NULL CONSTRAINT ik_parametre_donemi_baslangic_tek UNIQUE CONSTRAINT ik_parametre_donemi_ay_basi CHECK (extract(day FROM baslangic) = 1),
  notu text,
  asgari_brut numeric(14,2),
  sgk_tavani numeric(14,2),
  sgk_isci_orani numeric(14,4),
  issizlik_isci_orani numeric(14,4),
  sgk_isveren_orani numeric(14,4),
  issizlik_isveren_orani numeric(14,4),
  damga_orani numeric(14,4),
  kidem_tavani numeric(14,2),
  mesai_katsayisi numeric(14,4),
  aylik_saat numeric(14,4),
  yillik_mesai_siniri numeric(14,4),
  fazla_sure_katsayisi numeric(14,4),
  hafta_tatili_katsayisi numeric(14,4),
  resmi_tatil_katsayisi numeric(14,4),
  haftalik_saat numeric(14,4),
  bes_orani numeric(14,4),
  rapor_kesintisi boolean,
  engelli_indirimi_1 numeric(14,2),
  engelli_indirimi_2 numeric(14,2),
  engelli_indirimi_3 numeric(14,2),
  yemek_yontem text,
  yemek_hesap text,
  yemek_deger numeric(14,4),
  yemek_gv_kart numeric(14,2),
  yemek_gv_nakit numeric(14,2),
  yemek_sgk_kart text,
  yemek_sgk_limit numeric(14,2),
  yemek_sgk_nakit numeric(14,2),
  yol_yontem text,
  yol_hesap text,
  yol_deger numeric(14,4),
  yol_gv_kart numeric(14,2),
  yol_sgk_kart text,
  varsayilan_tesvik text,
  ihbar_1 numeric(14,4),
  ihbar_2 numeric(14,4),
  ihbar_3 numeric(14,4),
  ihbar_4 numeric(14,4),
  izin_1 numeric(14,4),
  izin_2 numeric(14,4),
  izin_3 numeric(14,4),
  izin_yas_alt_siniri numeric(14,4),
  CONSTRAINT ik_parametre_donemi_yemek_yontem_secenek CHECK (yemek_yontem IN ('Yok', 'Yemek kartı / çeki', 'Nakit', 'İşyerinde yemek')),
  CONSTRAINT ik_parametre_donemi_yemek_hesap_secenek CHECK (yemek_hesap IN ('Günlük tutar × fiili gün', 'Aylık sabit tutar', 'Brüt ücretin yüzdesi')),
  CONSTRAINT ik_parametre_donemi_yemek_sgk_kart_secenek CHECK (yemek_sgk_kart IN ('tamami', 'limit', 'tabi')),
  CONSTRAINT ik_parametre_donemi_yol_yontem_secenek CHECK (yol_yontem IN ('Yok', 'Toplu taşıma kartı / bilet', 'Nakit', 'Servis')),
  CONSTRAINT ik_parametre_donemi_yol_hesap_secenek CHECK (yol_hesap IN ('Günlük tutar × fiili gün', 'Aylık sabit tutar', 'Brüt ücretin yüzdesi')),
  CONSTRAINT ik_parametre_donemi_yol_sgk_kart_secenek CHECK (yol_sgk_kart IN ('tamami', 'limit', 'tabi')),
  CONSTRAINT ik_parametre_donemi_varsayilan_tesvik_bos_degil CHECK (varsayilan_tesvik <> '')
);

CREATE TABLE ik_gelir_vergisi_dilimi (
  donem_no int NOT NULL REFERENCES ik_parametre_donemi (no),
  sira int NOT NULL CONSTRAINT ik_gelir_vergisi_dilimi_sira_pozitif CHECK (sira > 0),
  ust_sinir numeric(14,2) CONSTRAINT ik_gelir_vergisi_dilimi_sinir_pozitif CHECK (ust_sinir IS NULL OR ust_sinir > 0),
  oran numeric(7,4) NOT NULL CONSTRAINT ik_gelir_vergisi_dilimi_oran_araligi CHECK (oran >= 0 AND oran <= 100),
  CONSTRAINT ik_gelir_vergisi_dilimi_anahtar PRIMARY KEY (donem_no, sira)
);

CREATE TABLE ik_prim_tanimi (
  donem_no int NOT NULL REFERENCES ik_parametre_donemi (no),
  sira int NOT NULL CONSTRAINT ik_prim_tanimi_sira_pozitif CHECK (sira > 0),
  kod text NOT NULL,
  ad text,
  tur text,
  deger numeric(14,4),
  siklik text,
  aylar text,
  atama text,
  kideme_dahil boolean,
  CONSTRAINT ik_prim_tanimi_anahtar PRIMARY KEY (donem_no, sira),
  CONSTRAINT ik_prim_tanimi_kod_tek UNIQUE (donem_no, kod),
  CONSTRAINT ik_prim_tanimi_kod_bos_degil CHECK (kod <> ''),
  CONSTRAINT ik_prim_tanimi_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_prim_tanimi_tur_secenek CHECK (tur IN ('sabit', 'oran', 'maas')),
  CONSTRAINT ik_prim_tanimi_siklik_secenek CHECK (siklik IN ('her', 'ceyrek', 'yarim', 'yillik', 'ozel')),
  CONSTRAINT ik_prim_tanimi_aylar_bos_degil CHECK (aylar <> ''),
  CONSTRAINT ik_prim_tanimi_atama_secenek CHECK (atama IN ('yok', 'herkes', 'beyaz', 'mavi'))
);

CREATE TABLE ik_tesvik_tanimi (
  donem_no int NOT NULL REFERENCES ik_parametre_donemi (no),
  sira int NOT NULL CONSTRAINT ik_tesvik_tanimi_sira_pozitif CHECK (sira > 0),
  kod text NOT NULL,
  ad text,
  tur text,
  deger numeric(14,4),
  kanun_no text,
  CONSTRAINT ik_tesvik_tanimi_anahtar PRIMARY KEY (donem_no, sira),
  CONSTRAINT ik_tesvik_tanimi_kod_tek UNIQUE (donem_no, kod),
  CONSTRAINT ik_tesvik_tanimi_kod_bos_degil CHECK (kod <> ''),
  CONSTRAINT ik_tesvik_tanimi_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_tesvik_tanimi_tur_secenek CHECK (tur IN ('yok', 'puan', 'asgari', 'sabit')),
  CONSTRAINT ik_tesvik_tanimi_kanun_no_bos_degil CHECK (kanun_no <> '')
);

CREATE TABLE ik_resmi_tatil (
  sira int PRIMARY KEY CONSTRAINT ik_resmi_tatil_sira_pozitif CHECK (sira > 0),
  -- Yıl boşsa her yıl tekrarlar (ör. 23 Nisan).
  yil int CONSTRAINT ik_resmi_tatil_yil_araligi CHECK (yil IS NULL OR yil BETWEEN 1900 AND 2200),
  ay int NOT NULL CONSTRAINT ik_resmi_tatil_ay_araligi CHECK (ay BETWEEN 1 AND 12),
  gun int NOT NULL CONSTRAINT ik_resmi_tatil_gun_araligi CHECK (gun BETWEEN 1 AND 31),
  ad text NOT NULL DEFAULT ''
);

CREATE TABLE ik_ozluk_belge_tanimi (sira int PRIMARY KEY CONSTRAINT ik_ozluk_belge_tanimi_sira_pozitif CHECK (sira > 0), ad text NOT NULL CONSTRAINT ik_ozluk_belge_tanimi_ad_bos_degil CHECK (ad <> ''));

CREATE TABLE ik_degerlendirme_kriteri (
  kullanim text NOT NULL CONSTRAINT ik_degerlendirme_kriteri_kullanim CHECK (kullanim IN ('performans', 'mulakat')),
  sira int NOT NULL CONSTRAINT ik_degerlendirme_kriteri_sira_pozitif CHECK (sira > 0),
  ad text NOT NULL CONSTRAINT ik_degerlendirme_kriteri_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_degerlendirme_kriteri_anahtar PRIMARY KEY (kullanim, sira)
);

CREATE TABLE ik_soru_seti (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sira int NOT NULL CONSTRAINT ik_soru_seti_sira_tek UNIQUE CONSTRAINT ik_soru_seti_sira_pozitif CHECK (sira > 0),
  kod text NOT NULL,
  ad text,
  kategori text,
  odak text,
  CONSTRAINT ik_soru_seti_kod_tek UNIQUE (kod),
  CONSTRAINT ik_soru_seti_kod_bos_degil CHECK (kod <> ''),
  CONSTRAINT ik_soru_seti_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_soru_seti_kategori_bos_degil CHECK (kategori <> ''),
  CONSTRAINT ik_soru_seti_odak_bos_degil CHECK (odak <> '')
);

CREATE TABLE ik_soru (
  set_no int NOT NULL REFERENCES ik_soru_seti (no) ON DELETE CASCADE,
  sira int NOT NULL CONSTRAINT ik_soru_sira_pozitif CHECK (sira > 0),
  metin text NOT NULL CONSTRAINT ik_soru_metin_bos_degil CHECK (metin <> ''),
  CONSTRAINT ik_soru_anahtar PRIMARY KEY (set_no, sira)
);

CREATE TABLE ik_ilan_kanali (
  sira int PRIMARY KEY CONSTRAINT ik_ilan_kanali_sira_pozitif CHECK (sira > 0),
  kod text NOT NULL,
  ad text,
  adres text,
  ek_kod text,
  aktif boolean,
  CONSTRAINT ik_ilan_kanali_kod_tek UNIQUE (kod),
  CONSTRAINT ik_ilan_kanali_kod_bos_degil CHECK (kod <> ''),
  CONSTRAINT ik_ilan_kanali_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_ilan_kanali_adres_bos_degil CHECK (adres <> ''),
  CONSTRAINT ik_ilan_kanali_ek_kod_bos_degil CHECK (ek_kod <> '')
);

CREATE TABLE ik_gorev_durumu (
  anahtar text PRIMARY KEY CONSTRAINT ik_gorev_durumu_anahtar_bos_degil CHECK (anahtar <> ''),
  ertele date,
  gizli boolean,
  tarih date
);

CREATE TABLE ik_maliyet_plani (
  anahtar text PRIMARY KEY CONSTRAINT ik_maliyet_plani_tek_satir CHECK (anahtar = 'genel'),
  yil int,
  ocak_zammi numeric(14,4),
  temmuz_zammi numeric(14,4),
  acik_pozisyon_dahil boolean
);

CREATE TABLE ik_maliyet_plani_kadrosu (
  sira int PRIMARY KEY CONSTRAINT ik_maliyet_plani_kadrosu_sira_pozitif CHECK (sira > 0),
  pozisyon text,
  departman_no int REFERENCES ik_departman (no),
  brut numeric(14,2),
  ay int,
  adet int,
  CONSTRAINT ik_maliyet_plani_kadrosu_pozisyon_bos_degil CHECK (pozisyon <> '')
);

ALTER TABLE ik_bordro ADD CONSTRAINT ik_bordro_parametre_donemi FOREIGN KEY (parametre_donemi_no) REFERENCES ik_parametre_donemi (no);


-- Değişiklik geçmişi: alan alan önce ve sonra (değer metni; liste ve nesne alanında JSON yazımı). Yalnız eklenir.
CREATE TABLE ik_kayit_gecmisi (
  no bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT ik_kayit_gecmisi_tur CHECK (tur IN ('emp', 'dept', 'leave', 'att', 'pay', 'perf', 'train', 'job', 'cand', 'intv', 'asset', 'ayarlar')),
  kimlik text,
  islem text NOT NULL CONSTRAINT ik_kayit_gecmisi_islem CHECK (islem IN ('ekle', 'guncelle', 'sil', 'geri', 'ayarlar', 'toplu')),
  etiket text NOT NULL DEFAULT '',
  notu text,
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ik_kayit_gecmisi_zaman ON ik_kayit_gecmisi (zaman DESC, no DESC);
CREATE TABLE ik_kayit_gecmisi_alani (
  gecmis_no bigint NOT NULL REFERENCES ik_kayit_gecmisi (no),
  sira int NOT NULL CONSTRAINT ik_kayit_gecmisi_alani_sira_pozitif CHECK (sira > 0),
  alan text NOT NULL,
  onceki text,
  sonraki text,
  -- Büyük değer yalnız adıyla yazılır (geri alınamaz).
  buyuk boolean NOT NULL DEFAULT false,
  CONSTRAINT ik_kayit_gecmisi_alani_anahtar PRIMARY KEY (gecmis_no, sira)
);
CREATE TRIGGER ik_kayit_gecmisi_yalniz_ekleme BEFORE UPDATE OR DELETE ON ik_kayit_gecmisi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER ik_kayit_gecmisi_bosaltilmaz BEFORE TRUNCATE ON ik_kayit_gecmisi FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER ik_kayit_gecmisi_alani_yalniz_ekleme BEFORE UPDATE OR DELETE ON ik_kayit_gecmisi_alani FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER ik_kayit_gecmisi_alani_bosaltilmaz BEFORE TRUNCATE ON ik_kayit_gecmisi_alani FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

