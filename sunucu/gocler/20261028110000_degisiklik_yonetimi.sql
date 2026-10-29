-- Değişiklik yönetimi (1120 a, 1121 a, 1123 a, 1124 a): talep (ECR), değişiklik emri (ECO), geçerlilik, karar (disposition), ilk parça
-- şartı, imzalı geçmiş ve iç olay günlüğü. Yeni ve boş tablolar; dolu tabloya dokunulmaz. Parça, çizim ve rota revizyonu, üretim emri ve
-- stok kaydı sahibi modüllerde kalır; burada yalnız kimlikleriyle durur, yabancı anahtar bağlamada (Aşama 2) ayrı göçle gelir.

CREATE TABLE degisiklik_yonetimi_talep (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('ECR-' || lpad(id::text, 4, '0')) STORED CONSTRAINT degisiklik_yonetimi_talep_no_tek UNIQUE,
  baslik text NOT NULL CONSTRAINT degisiklik_yonetimi_talep_baslik_bicimi CHECK (btrim(baslik) <> '' AND char_length(baslik) <= 160),
  aciklama text CONSTRAINT degisiklik_yonetimi_talep_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 1000)),
  -- Açanın tahmini; sınıfı sınıflandırma verir.
  on_sinif text CONSTRAINT degisiklik_yonetimi_talep_on_sinif_degeri CHECK (on_sinif IN ('D1', 'D2', 'P1', 'P2')),
  sinif text CONSTRAINT degisiklik_yonetimi_talep_sinif_degeri CHECK (sinif IN ('D1', 'D2', 'P1', 'P2')),
  aciliyet text NOT NULL CONSTRAINT degisiklik_yonetimi_talep_aciliyet_degeri CHECK (aciliyet IN ('normal', 'yuksek', 'acil')),
  durum text NOT NULL DEFAULT 'gonderildi' CONSTRAINT degisiklik_yonetimi_talep_durum_degeri CHECK (
    durum IN ('gonderildi', 'analizde', 'ccb_bekliyor', 'musteri_onayi_bekliyor', 'onaylandi', 'emir_acildi', 'reddedildi')
  ),
  -- Sınıflandırma soru cevapları ve etki analizi (sözleşmedeki biçim; bağlı olmayan bölüm null).
  cevaplar jsonb CONSTRAINT degisiklik_yonetimi_talep_cevaplar_nesne CHECK (cevaplar IS NULL OR jsonb_typeof(cevaplar) = 'object'),
  etki jsonb CONSTRAINT degisiklik_yonetimi_talep_etki_nesne CHECK (etki IS NULL OR jsonb_typeof(etki) = 'object'),
  musteri_referansi text CONSTRAINT degisiklik_yonetimi_talep_musteri_referansi_bicimi CHECK (
    musteri_referansi IS NULL OR (btrim(musteri_referansi) <> '' AND char_length(musteri_referansi) <= 80)
  ),
  acan_kisi_id int NOT NULL REFERENCES kisi,
  acilis timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT degisiklik_yonetimi_talep_sinifli CHECK (durum = 'gonderildi' OR sinif IS NOT NULL),
  CONSTRAINT degisiklik_yonetimi_talep_analizli CHECK (durum IN ('gonderildi', 'analizde') OR etki IS NOT NULL)
);
CREATE INDEX degisiklik_yonetimi_talep_acan_idx ON degisiklik_yonetimi_talep (acan_kisi_id);
CREATE INDEX degisiklik_yonetimi_talep_durum_idx ON degisiklik_yonetimi_talep (durum, id);

-- Talebin parçaları (malzeme kartı kimliği).
CREATE TABLE degisiklik_yonetimi_talep_kalemi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  talep_id int NOT NULL REFERENCES degisiklik_yonetimi_talep,
  malzeme_id int NOT NULL,
  sira int NOT NULL CONSTRAINT degisiklik_yonetimi_talep_kalemi_sira_pozitif CHECK (sira > 0),
  CONSTRAINT degisiklik_yonetimi_talep_kalemi_tek UNIQUE (talep_id, malzeme_id),
  CONSTRAINT degisiklik_yonetimi_talep_kalemi_sira_tek UNIQUE (talep_id, sira)
);
CREATE INDEX degisiklik_yonetimi_talep_kalemi_malzeme_idx ON degisiklik_yonetimi_talep_kalemi (malzeme_id);

CREATE TABLE degisiklik_yonetimi_emir (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('ECO-' || lpad(id::text, 4, '0')) STORED CONSTRAINT degisiklik_yonetimi_emir_no_tek UNIQUE,
  -- Bir talepten tek emir açılır.
  talep_id int CONSTRAINT degisiklik_yonetimi_emir_talep_tek UNIQUE REFERENCES degisiklik_yonetimi_talep,
  baslik text NOT NULL CONSTRAINT degisiklik_yonetimi_emir_baslik_bicimi CHECK (btrim(baslik) <> '' AND char_length(baslik) <= 160),
  sinif text NOT NULL CONSTRAINT degisiklik_yonetimi_emir_sinif_degeri CHECK (sinif IN ('D1', 'D2', 'P1', 'P2')),
  aciliyet text NOT NULL CONSTRAINT degisiklik_yonetimi_emir_aciliyet_degeri CHECK (aciliyet IN ('normal', 'yuksek', 'acil')),
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT degisiklik_yonetimi_emir_durum_degeri CHECK (
    durum IN ('acik', 'revizyon_hazirlaniyor', 'yayina_hazir', 'karar', 'uygulamada', 'dogrulama', 'kapandi')
  ),
  musteri_referansi text CONSTRAINT degisiklik_yonetimi_emir_musteri_referansi_bicimi CHECK (
    musteri_referansi IS NULL OR (btrim(musteri_referansi) <> '' AND char_length(musteri_referansi) <= 80)
  ),
  -- Geçerlilik yayında yazılır: seri (son ürün ve ilk seri), tarih ya da bütün açık emirler.
  gecerlilik_turu text CONSTRAINT degisiklik_yonetimi_emir_gecerlilik_turu_degeri CHECK (gecerlilik_turu IN ('seri', 'tarih', 'tum')),
  gecerlilik_son_urun_id int,
  gecerlilik_ilk_seri int CONSTRAINT degisiklik_yonetimi_emir_ilk_seri_pozitif CHECK (gecerlilik_ilk_seri > 0),
  gecerlilik_tarihi date,
  -- Etkilenen emir ve stoku veren kaynak yayında bağlı mıydı; bağlı değilse kararlar kapanış koşulu bilinmiyordur (Aşama 1).
  karar_kaynagi_bagli boolean,
  koordinator_kisi_id int NOT NULL REFERENCES kisi,
  acilis timestamptz NOT NULL DEFAULT now(),
  yayin_zamani timestamptz,
  kapanis date,
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT degisiklik_yonetimi_emir_gecerlilik_butun CHECK (
    (gecerlilik_turu IS NULL AND gecerlilik_son_urun_id IS NULL AND gecerlilik_ilk_seri IS NULL AND gecerlilik_tarihi IS NULL)
    OR (gecerlilik_turu = 'seri' AND gecerlilik_son_urun_id IS NOT NULL AND gecerlilik_ilk_seri IS NOT NULL AND gecerlilik_tarihi IS NULL)
    OR (gecerlilik_turu = 'tarih' AND gecerlilik_son_urun_id IS NULL AND gecerlilik_ilk_seri IS NULL AND gecerlilik_tarihi IS NOT NULL)
    OR (gecerlilik_turu = 'tum' AND gecerlilik_son_urun_id IS NULL AND gecerlilik_ilk_seri IS NULL AND gecerlilik_tarihi IS NULL)
  ),
  CONSTRAINT degisiklik_yonetimi_emir_yayinli CHECK (
    durum IN ('acik', 'revizyon_hazirlaniyor', 'yayina_hazir')
    OR (gecerlilik_turu IS NOT NULL AND yayin_zamani IS NOT NULL AND karar_kaynagi_bagli IS NOT NULL)
  ),
  CONSTRAINT degisiklik_yonetimi_emir_kapanisli CHECK ((durum = 'kapandi') = (kapanis IS NOT NULL))
);
CREATE INDEX degisiklik_yonetimi_emir_koordinator_idx ON degisiklik_yonetimi_emir (koordinator_kisi_id);
CREATE INDEX degisiklik_yonetimi_emir_durum_idx ON degisiklik_yonetimi_emir (durum, id);
CREATE INDEX degisiklik_yonetimi_emir_son_urun_idx ON degisiklik_yonetimi_emir (gecerlilik_son_urun_id) WHERE gecerlilik_son_urun_id IS NOT NULL;

-- Emirdeki her parça için eski ve yeni revizyon bağı (1121 a): yeni çizim ve rota revizyonu sahibi modülde açılır, burada kimliğiyle durur.
CREATE TABLE degisiklik_yonetimi_emir_kalemi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES degisiklik_yonetimi_emir,
  malzeme_id int NOT NULL,
  sira int NOT NULL CONSTRAINT degisiklik_yonetimi_emir_kalemi_sira_pozitif CHECK (sira > 0),
  eski_cizim_revizyonu_id int,
  yeni_cizim_revizyonu_id int,
  eski_rota_revizyonu_id int,
  yeni_rota_revizyonu_id int,
  eski_yeniye_uyar text CONSTRAINT degisiklik_yonetimi_emir_kalemi_eski_yeniye_degeri CHECK (eski_yeniye_uyar IN ('evet', 'hayir')),
  yeni_eskiye_uyar text CONSTRAINT degisiklik_yonetimi_emir_kalemi_yeni_eskiye_degeri CHECK (yeni_eskiye_uyar IN ('evet', 'hayir')),
  yeni_parca_no text CONSTRAINT degisiklik_yonetimi_emir_kalemi_parca_no_bicimi CHECK (
    yeni_parca_no IS NULL OR (btrim(yeni_parca_no) <> '' AND char_length(yeni_parca_no) <= 60)
  ),
  yeni_parca_adi text CONSTRAINT degisiklik_yonetimi_emir_kalemi_parca_adi_bicimi CHECK (
    yeni_parca_adi IS NULL OR (btrim(yeni_parca_adi) <> '' AND char_length(yeni_parca_adi) <= 160)
  ),
  ozet text NOT NULL DEFAULT '' CONSTRAINT degisiklik_yonetimi_emir_kalemi_ozet_bicimi CHECK (char_length(ozet) <= 1000),
  CONSTRAINT degisiklik_yonetimi_emir_kalemi_tek UNIQUE (emir_id, malzeme_id),
  CONSTRAINT degisiklik_yonetimi_emir_kalemi_sira_tek UNIQUE (emir_id, sira)
);
CREATE INDEX degisiklik_yonetimi_emir_kalemi_malzeme_idx ON degisiklik_yonetimi_emir_kalemi (malzeme_id);

-- Karar (disposition, 1123 a): hedef üretim emri ya da stok kaydıdır. Öneri ve izinli kodlar yayında kurallardan yazılır; karar bir kez verilir.
CREATE TABLE degisiklik_yonetimi_karar (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES degisiklik_yonetimi_emir,
  hedef text NOT NULL CONSTRAINT degisiklik_yonetimi_karar_hedef_degeri CHECK (hedef IN ('emir', 'stok')),
  hedef_id int NOT NULL CONSTRAINT degisiklik_yonetimi_karar_hedef_pozitif CHECK (hedef_id > 0),
  onerilen_kod text NOT NULL,
  mod text NOT NULL CONSTRAINT degisiklik_yonetimi_karar_mod_degeri CHECK (mod IN ('otomatik', 'onayli', 'mrb')),
  gerekce text NOT NULL CONSTRAINT degisiklik_yonetimi_karar_gerekce_bicimi CHECK (btrim(gerekce) <> '' AND char_length(gerekce) <= 300),
  izinli_kodlar text[] NOT NULL CONSTRAINT degisiklik_yonetimi_karar_izinli_dolu CHECK (cardinality(izinli_kodlar) > 0),
  verilen_kod text,
  veren_kisi_id int REFERENCES kisi,
  verilme timestamptz,
  sapma_referansi text CONSTRAINT degisiklik_yonetimi_karar_sapma_bicimi CHECK (
    sapma_referansi IS NULL OR (btrim(sapma_referansi) <> '' AND char_length(sapma_referansi) <= 80)
  ),
  not_metni text CONSTRAINT degisiklik_yonetimi_karar_not_bicimi CHECK (not_metni IS NULL OR (btrim(not_metni) <> '' AND char_length(not_metni) <= 1000)),
  CONSTRAINT degisiklik_yonetimi_karar_tek UNIQUE (emir_id, hedef, hedef_id),
  CONSTRAINT degisiklik_yonetimi_karar_kod_degeri CHECK (
    onerilen_kod IN ('yeniden_olustur', 'kalanlari_gecir', 'eskiyle_tamamla', 'eskiyle_tamamla_sapma', 'rework', 'eski_yedek', 'hurda', 'beklet', 'islem_yok')
    AND izinli_kodlar <@ ARRAY['yeniden_olustur', 'kalanlari_gecir', 'eskiyle_tamamla', 'eskiyle_tamamla_sapma', 'rework', 'eski_yedek', 'hurda', 'beklet', 'islem_yok']
  ),
  -- Beklet karar değildir (MRB'ye ertelemedir): verilen kod olamaz.
  CONSTRAINT degisiklik_yonetimi_karar_verilen_izinli CHECK (verilen_kod IS NULL OR (verilen_kod <> 'beklet' AND verilen_kod = ANY (izinli_kodlar))),
  CONSTRAINT degisiklik_yonetimi_karar_alanlari CHECK ((verilen_kod IS NULL) = (veren_kisi_id IS NULL) AND (verilen_kod IS NULL) = (verilme IS NULL)),
  CONSTRAINT degisiklik_yonetimi_karar_sapmali CHECK ((verilen_kod = 'eskiyle_tamamla_sapma') = (sapma_referansi IS NOT NULL))
);
CREATE INDEX degisiklik_yonetimi_karar_veren_idx ON degisiklik_yonetimi_karar (veren_kisi_id);
CREATE INDEX degisiklik_yonetimi_karar_bekleyen_idx ON degisiklik_yonetimi_karar (emir_id) WHERE verilen_kod IS NULL;

-- Değişiklikten doğan ilk parça şartı (FAI): D1'de yeni parça numarasında tam, revizyonda kısmi; P1'de kısmi.
CREATE TABLE degisiklik_yonetimi_ilk_parca (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES degisiklik_yonetimi_emir,
  kalem_id int NOT NULL CONSTRAINT degisiklik_yonetimi_ilk_parca_kalem_tek UNIQUE REFERENCES degisiklik_yonetimi_emir_kalemi,
  tur text NOT NULL CONSTRAINT degisiklik_yonetimi_ilk_parca_tur_degeri CHECK (tur IN ('tam', 'kismi')),
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT degisiklik_yonetimi_ilk_parca_durum_degeri CHECK (durum IN ('bekliyor', 'onaylandi')),
  onaylayan_kisi_id int REFERENCES kisi,
  onay_zamani timestamptz,
  CONSTRAINT degisiklik_yonetimi_ilk_parca_onay_alanlari CHECK (
    (durum = 'onaylandi') = (onaylayan_kisi_id IS NOT NULL) AND (durum = 'onaylandi') = (onay_zamani IS NOT NULL)
  )
);
CREATE INDEX degisiklik_yonetimi_ilk_parca_emir_idx ON degisiklik_yonetimi_ilk_parca (emir_id);
CREATE INDEX degisiklik_yonetimi_ilk_parca_onaylayan_idx ON degisiklik_yonetimi_ilk_parca (onaylayan_kisi_id);

-- İmzalı geçmiş: her adım bir satır; imzalı olayda imzanın anlamı da yazılır. Yalnız eklenir.
CREATE TABLE degisiklik_yonetimi_gecmis (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  talep_id int REFERENCES degisiklik_yonetimi_talep,
  emir_id int REFERENCES degisiklik_yonetimi_emir,
  olay text NOT NULL CONSTRAINT degisiklik_yonetimi_gecmis_olay_degeri CHECK (olay IN (
    'talep_gonderildi', 'siniflandirildi', 'etki_analizi', 'ccb_onay', 'ccb_ret', 'musteri_onayi', 'emir_acildi', 'taslak_acildi',
    'kalem_kaydedildi', 'yayina_gonderildi', 'geri_gonderildi', 'yayinlandi', 'karar', 'mrb_karar', 'toplu_karar', 'karar_ertelendi',
    'kararlar_tamam', 'fai_onaylandi', 'fai_tamam', 'kapandi'
  )),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  imza_anlami text CONSTRAINT degisiklik_yonetimi_gecmis_imza_bicimi CHECK (imza_anlami IS NULL OR btrim(imza_anlami) <> ''),
  aciklama text CONSTRAINT degisiklik_yonetimi_gecmis_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 1000)),
  ozet text NOT NULL CONSTRAINT degisiklik_yonetimi_gecmis_ozet_bicimi CHECK (btrim(ozet) <> '' AND char_length(ozet) <= 300),
  CONSTRAINT degisiklik_yonetimi_gecmis_tek_kayit CHECK ((talep_id IS NULL) <> (emir_id IS NULL))
);
CREATE INDEX degisiklik_yonetimi_gecmis_talep_idx ON degisiklik_yonetimi_gecmis (talep_id) WHERE talep_id IS NOT NULL;
CREATE INDEX degisiklik_yonetimi_gecmis_emir_idx ON degisiklik_yonetimi_gecmis (emir_id) WHERE emir_id IS NOT NULL;
CREATE INDEX degisiklik_yonetimi_gecmis_kisi_idx ON degisiklik_yonetimi_gecmis (kisi_id);
CREATE INDEX degisiklik_yonetimi_gecmis_zaman_idx ON degisiklik_yonetimi_gecmis (zaman, id);
CREATE TRIGGER degisiklik_yonetimi_gecmis_yalniz_ekleme BEFORE UPDATE OR DELETE ON degisiklik_yonetimi_gecmis
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER degisiklik_yonetimi_gecmis_bosaltma_yok BEFORE TRUNCATE ON degisiklik_yonetimi_gecmis
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- İç olay günlüğü (1124 a): salt okunur, dışarı gönderilmez. `ilgili`, Aşama 2'de olayı işleyecek modüldür. Yalnız eklenir.
CREATE TABLE degisiklik_yonetimi_olay (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  tur text NOT NULL CONSTRAINT degisiklik_yonetimi_olay_tur_degeri CHECK (tur IN (
    'talep_gonderildi', 'etki_analizi', 'musteri_onayi_istendi', 'emir_acildi', 'revizyon_yayinlandi', 'gecerlilik', 'karar_onerildi',
    'emir_karari', 'stok_karari', 'emir_karantinada', 'rework_istendi', 'sapma_acildi', 'fai_onaylandi', 'emir_kapandi'
  )),
  ilgili text CONSTRAINT degisiklik_yonetimi_olay_ilgili_degeri CHECK (
    ilgili IN ('uretim-emirleri', 'rota', 'cizimler', 'malzemeler', 'stok', 'plan', 'kalite-merkezi', 'sevkiyat')
  ),
  kayit_no text NOT NULL CONSTRAINT degisiklik_yonetimi_olay_kayit_no_bicimi CHECK (btrim(kayit_no) <> ''),
  alanlar jsonb NOT NULL DEFAULT '{}' CONSTRAINT degisiklik_yonetimi_olay_alanlar_nesne CHECK (jsonb_typeof(alanlar) = 'object')
);
CREATE INDEX degisiklik_yonetimi_olay_zaman_idx ON degisiklik_yonetimi_olay (zaman, id);
CREATE INDEX degisiklik_yonetimi_olay_ilgili_idx ON degisiklik_yonetimi_olay (ilgili, id);
CREATE TRIGGER degisiklik_yonetimi_olay_yalniz_ekleme BEFORE UPDATE OR DELETE ON degisiklik_yonetimi_olay
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER degisiklik_yonetimi_olay_bosaltma_yok BEFORE TRUNCATE ON degisiklik_yonetimi_olay
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
