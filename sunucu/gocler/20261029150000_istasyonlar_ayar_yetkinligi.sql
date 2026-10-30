-- 1303 a: ayar yetkinliği, kişinin hangi makinede ayar (hazırlık) yapabildiği. Yetkinlik tek kurgudur: kişi x kaynak x tür; çalışma
-- yetkinliği istasyon ve makine tablolarında kalır, ayar ayrı tabloda makine başınadır (istasyon seçilirse servis istasyonun bütün
-- makinelerini yazar). Plan ayarcıyı görev metninden değil buradan okuyacak (plan dalı ayrı). Yeni ve boş tablolar; dolu tabloya dokunulmaz.
-- Makine silinirse kaydı onunla gider, defter makinenin o günkü kodunu taşır (makine yetkinliğiyle aynı ilke).
CREATE TABLE istasyonlar_ayar_yetkinligi (
  kisi_id int NOT NULL CONSTRAINT istasyonlar_ayar_yetkinligi_kisi_fkey REFERENCES kisi,
  makine_id int NOT NULL CONSTRAINT istasyonlar_ayar_yetkinligi_makine_fkey REFERENCES makine ON DELETE CASCADE,
  veren_kisi_id int NOT NULL CONSTRAINT istasyonlar_ayar_yetkinligi_veren_fkey REFERENCES kisi,
  verilme timestamptz NOT NULL DEFAULT now(),
  gecerlilik_bitis date,
  dayanak text CONSTRAINT istasyonlar_ayar_yetkinligi_dayanak_dolu CHECK (dayanak IS NULL OR (btrim(dayanak) <> '' AND char_length(dayanak) <= 300)),
  surum int NOT NULL DEFAULT 1 CONSTRAINT istasyonlar_ayar_yetkinligi_surum_pozitif CHECK (surum > 0),
  CONSTRAINT istasyonlar_ayar_yetkinligi_pk PRIMARY KEY (kisi_id, makine_id)
);
CREATE INDEX istasyonlar_ayar_yetkinligi_makine ON istasyonlar_ayar_yetkinligi (makine_id);
CREATE INDEX istasyonlar_ayar_yetkinligi_veren ON istasyonlar_ayar_yetkinligi (veren_kisi_id);

-- Defter: verme, değiştirme ve kaldırma; satır değişmez, silinmez.
CREATE TABLE istasyonlar_ayar_yetkinligi_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT istasyonlar_ayar_yetkinligi_gecmisi_pk PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT istasyonlar_ayar_yetkinligi_gecmisi_kisi_fkey REFERENCES kisi,
  makine_id int NOT NULL,
  makine_kod text NOT NULL,
  islem text NOT NULL CONSTRAINT istasyonlar_ayar_yetkinligi_gecmisi_islem_secenek CHECK (islem IN ('ver', 'degistir', 'kaldir')),
  gecerlilik_bitis date,
  dayanak text,
  degistiren_kisi_id int NOT NULL CONSTRAINT istasyonlar_ayar_yetkinligi_gecmisi_degistiren_fkey REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX istasyonlar_ayar_yetkinligi_gecmisi_kisi ON istasyonlar_ayar_yetkinligi_gecmisi (kisi_id, zaman, id);
CREATE INDEX istasyonlar_ayar_yetkinligi_gecmisi_degistiren ON istasyonlar_ayar_yetkinligi_gecmisi (degistiren_kisi_id);
CREATE TRIGGER istasyonlar_ayar_yetkinligi_gecmisi_yalniz_ekleme BEFORE UPDATE OR DELETE ON istasyonlar_ayar_yetkinligi_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER istasyonlar_ayar_yetkinligi_gecmisi_bosaltma_yok BEFORE TRUNCATE ON istasyonlar_ayar_yetkinligi_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
