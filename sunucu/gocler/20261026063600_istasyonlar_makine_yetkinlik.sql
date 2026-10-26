-- 563 c: kişinin istasyon içinde hangi makinelere bakabildiği. Makine yetkinliği yalnız kişinin yetkin olduğu istasyonun makinesine verilir;
-- istasyon yetkinliği kalkınca o istasyonun makine kayıtları da kalkar (servis, defterle). İstasyon yetkinliğiyle aynı ilke: makine silinirse
-- kaydı onunla gider, defter makinenin o günkü kodunu taşır.
CREATE TABLE istasyonlar_makine_yetkinlik (
  kisi_id int NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_kisi_fkey REFERENCES kisi,
  makine_id int NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_makine_fkey REFERENCES makine ON DELETE CASCADE,
  veren_kisi_id int NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_veren_fkey REFERENCES kisi,
  verilme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT istasyonlar_makine_yetkinlik_pk PRIMARY KEY (kisi_id, makine_id)
);
CREATE INDEX istasyonlar_makine_yetkinlik_makine ON istasyonlar_makine_yetkinlik (makine_id);

-- Defter: verme ve kaldırma; satır değişmez, silinmez. `neden` kaldırmanın elle mi, istasyon yetkinliği kalktığı için mi olduğunu söyler.
CREATE TABLE istasyonlar_makine_yetkinlik_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT istasyonlar_makine_yetkinlik_gecmisi_pk PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_gecmisi_kisi_fkey REFERENCES kisi,
  makine_id int NOT NULL,
  makine_kod text NOT NULL,
  islem text NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_gecmisi_islem_secenek CHECK (islem IN ('ver', 'kaldir')),
  neden text NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_gecmisi_neden_secenek CHECK (neden IN ('elle', 'istasyon_yetkinligi_kalkti')),
  degistiren_kisi_id int NOT NULL CONSTRAINT istasyonlar_makine_yetkinlik_gecmisi_degistiren_fkey REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX istasyonlar_makine_yetkinlik_gecmisi_kisi ON istasyonlar_makine_yetkinlik_gecmisi (kisi_id, zaman, id);
CREATE TRIGGER istasyonlar_makine_yetkinlik_gecmisi_yalniz_ekleme BEFORE UPDATE OR DELETE ON istasyonlar_makine_yetkinlik_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER istasyonlar_makine_yetkinlik_gecmisi_bosaltma_yok BEFORE TRUNCATE ON istasyonlar_makine_yetkinlik_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- 563 2 a: bir kişinin aynı anda en çok kaç tezgâha baktığı, kişi başına tek sayı. Satırı olmayan kişi sınırsızdır (yalnız oran toplamı 1'i geçmez).
-- Değişiklik ortak değişiklik defterine düşer.
CREATE TABLE istasyonlar_kisi_tezgah_siniri (
  kisi_id int CONSTRAINT istasyonlar_kisi_tezgah_siniri_pk PRIMARY KEY CONSTRAINT istasyonlar_kisi_tezgah_siniri_kisi_fkey REFERENCES kisi,
  en_cok int NOT NULL CONSTRAINT istasyonlar_kisi_tezgah_siniri_aralik CHECK (en_cok BETWEEN 1 AND 20),
  degistiren_kisi_id int NOT NULL CONSTRAINT istasyonlar_kisi_tezgah_siniri_degistiren_fkey REFERENCES kisi,
  degisme timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER istasyonlar_kisi_tezgah_siniri_degisiklik AFTER INSERT OR UPDATE OR DELETE ON istasyonlar_kisi_tezgah_siniri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kisi_id', 'degisme');
