-- Adım Durumu (2893): iş emrinin elle yazılan statüsü ve hazırlık maddesinin elle onayı. İki yeni ve boş tablo; satır güncellenmez,
-- tablo boşaltılmaz: kaldırma da yeni satırdır (olay 'kaldir'). Açık kayıt iş emri (ve madde) başına en son satırdır; son satırı 'kaldir' olan açık değildir.
-- Bekleyen iş emri silinince onun satırları da gider (ON DELETE CASCADE): silinen iş emrine ait statü ve onay
-- başka iş emrine geçmez; başlamış iş emri silinmediği için üretimdeki adımın geçmişi kalır.
-- Elle statü, yazıldığı andaki sistem statüsünü saklar: sistem statüsü değişince okuma onu görmez (geri alma yok, düşme okumada).
-- Elle onay (2893-2 b) durduran maddede de başlatmayı açar; gerekçe orada zorunludur (sunucu kuralı). Onaylanan sürüm (çizim revizyonu
-- gibi) biliniyorsa yazılır; madde sonradan değişirse onay geçmez (Atölye görüşü, 2893).
CREATE TABLE uretim_emirleri_adim_statusu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  olay text NOT NULL CONSTRAINT uretim_emirleri_adim_statusu_olay CHECK (olay IN ('yaz', 'kaldir')),
  statu text CONSTRAINT uretim_emirleri_adim_statusu_statu CHECK (statu IS NULL OR (char_length(statu) BETWEEN 1 AND 40)),
  sistem_statusu text CONSTRAINT uretim_emirleri_adim_statusu_sistem CHECK (sistem_statusu IS NULL OR (char_length(sistem_statusu) BETWEEN 1 AND 40)),
  aciklama text CONSTRAINT uretim_emirleri_adim_statusu_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 500)),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_emirleri_adim_statusu_dolu CHECK ((olay = 'yaz') = (statu IS NOT NULL AND sistem_statusu IS NOT NULL))
);
CREATE INDEX uretim_emirleri_adim_statusu_is_emri ON uretim_emirleri_adim_statusu (is_emri_id, id);
CREATE INDEX uretim_emirleri_adim_statusu_kisi_fk_idx ON uretim_emirleri_adim_statusu (kisi_id);

CREATE TABLE uretim_emirleri_hazirlik_onayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  madde text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_onayi_madde CHECK (char_length(madde) BETWEEN 1 AND 40),
  olay text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_onayi_olay CHECK (olay IN ('onay', 'kaldir')),
  sistem_hali text CONSTRAINT uretim_emirleri_hazirlik_onayi_hal CHECK (sistem_hali IS NULL OR sistem_hali IN ('tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor')),
  gerekce text CONSTRAINT uretim_emirleri_hazirlik_onayi_gerekce CHECK (gerekce IS NULL OR (btrim(gerekce) <> '' AND char_length(gerekce) <= 500)),
  onaylanan_surum text CONSTRAINT uretim_emirleri_hazirlik_onayi_surum CHECK (onaylanan_surum IS NULL OR char_length(onaylanan_surum) <= 200),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_emirleri_hazirlik_onayi_dolu CHECK ((olay = 'onay') = (sistem_hali IS NOT NULL))
);
CREATE INDEX uretim_emirleri_hazirlik_onayi_is_emri ON uretim_emirleri_hazirlik_onayi (is_emri_id, madde, id);
CREATE INDEX uretim_emirleri_hazirlik_onayi_kisi_fk_idx ON uretim_emirleri_hazirlik_onayi (kisi_id);

CREATE TRIGGER uretim_emirleri_adim_statusu_degismez BEFORE UPDATE ON uretim_emirleri_adim_statusu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_adim_statusu_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_adim_statusu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_onayi_degismez BEFORE UPDATE ON uretim_emirleri_hazirlik_onayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_onayi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hazirlik_onayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Yazma işlemi (2893-1 a, rol matrisi kart 2898 a). Yalnız ekler; Yetkiler ekranından önceden verilmiş satır atlanır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), 'uretim-emirleri.adim-durumu-yaz'
  FROM (VALUES ('mudur'), ('genel_mudur'), ('genel_mudur_yardimcisi'), ('uretim_muduru'), ('planlama_muduru'), ('planlama_proje')) AS m (kod)
ON CONFLICT (rol_id, islem) DO NOTHING;

-- Sayfa görme işlemi (2893-5 a): Adım Durumu ana menüde ayrı sayfadır; Üretim Emirleri sayfasını gören rollere verilir. Yalnız ekler.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), 'sayfa.adim-durumu'
  FROM (VALUES ('mudur'), ('genel_mudur'), ('genel_mudur_yardimcisi'), ('planlama_muduru'), ('uretim_muduru'), ('planlama_proje'), ('kalite'), ('cam'), ('muhasebe_finans')) AS m (kod)
ON CONFLICT (rol_id, islem) DO NOTHING;
