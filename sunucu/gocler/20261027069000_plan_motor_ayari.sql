-- Plan motoru ayarları (kart 811; kullanıcı kararları 773 a, 774 a, 775 b ve yer kararı a: plan modülünde, kendi yetkisiyle; 27.10.2026). Ayar değişince sonraki planlar etkilenir, mevcut plan
-- bozulmaz: her değişiklik yeni bir sürüm satırıdır, eskisi değişmez. Güncel ayar en son sürümdür; hiç sürüm yoksa koddaki varsayılan geçer.
-- Taslak açıldığı andaki sürümle çalışır; planlamacı "Güncel ayarları uygula" deyince bağ satırı yazılır (774 a). Dolu tabloya dokunulmaz.

CREATE TABLE plan_motor_ayar_surumu (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT plan_motor_ayar_surumu_tekil PRIMARY KEY,
  degerler jsonb NOT NULL CONSTRAINT plan_motor_ayar_surumu_degerler CHECK (jsonb_typeof(degerler) = 'object'),
  yazan_kisi_id int NOT NULL CONSTRAINT plan_motor_ayar_surumu_yazan REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_motor_ayar_surumu_zaman_idx ON plan_motor_ayar_surumu (zaman, id);

CREATE TRIGGER plan_motor_ayar_surumu_degismez BEFORE UPDATE OR DELETE ON plan_motor_ayar_surumu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_motor_ayar_surumu_bosaltilmaz BEFORE TRUNCATE ON plan_motor_ayar_surumu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Taslağın açılıştaki sürümden başka bir sürüme bağlanması. Kapanmış senaryonun bağı değişmez (servis reddeder). Sürüm boşsa taslak koddaki
-- varsayılandadır: sürüm yazılmadan açılmış taslak çoğaltılınca kopya da varsayılanda kalsın.
CREATE TABLE plan_senaryo_motor_ayari (
  senaryo_id int CONSTRAINT plan_senaryo_motor_ayari_tekil PRIMARY KEY CONSTRAINT plan_senaryo_motor_ayari_senaryo REFERENCES plan_senaryosu (id),
  surum_id int CONSTRAINT plan_senaryo_motor_ayari_surum REFERENCES plan_motor_ayar_surumu (id),
  kisi_id int NOT NULL CONSTRAINT plan_senaryo_motor_ayari_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);

-- 775 b: motor ayarlarını yönetici (bütün işlemler), müdür ve planlama (planlama_proje) değiştirir.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('mudur', 'plan.motor-ayari'), ('planlama_proje', 'plan.motor-ayari')) AS m (kod, islem)
 WHERE EXISTS (SELECT 1 FROM rol WHERE kod = m.kod)
ON CONFLICT (rol_id, islem) DO NOTHING;
