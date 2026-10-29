-- 931 b: işi yola çıkaran plan onayını veren ve teslim sonucunu yazan kişi işin kendisinde durur; önceden yalnız çekirdek denetim kaydındaydı.
-- Dolu tabloya yalnız boş olabilen sütun eklenir; eski işlerde ikisi de boş kalır (geriye dönük doldurulmaz).
ALTER TABLE sevkiyat_isi
  ADD COLUMN onaylayan_kisi_id int CONSTRAINT sevkiyat_isi_onaylayan REFERENCES kisi (id),
  ADD COLUMN sonuc_kisi_id int CONSTRAINT sevkiyat_isi_sonuc_yazan REFERENCES kisi (id);

-- Onay kaldırma yoldaki işin, yeniden açma tamamlanmış işin kişisini siler: iki kişi alanı da durum alanı gibi değişebilir.
CREATE OR REPLACE FUNCTION sevkiyat_onayli_plandaki_is_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  durum_alanlari text[] := ARRAY['durum', 'durum_zamani', 'tarih', 'surum', 'tetiklendi', 'tetikleyen_kisi_id', 'onaylayan_kisi_id', 'sonuc_kisi_id'];
BEGIN
  IF OLD.durum IN ('yolda', 'tamamlandi') AND (to_jsonb(NEW) - durum_alanlari) <> (to_jsonb(OLD) - durum_alanlari) THEN
    RAISE EXCEPTION 'Yoldaki ya da tamamlanmış iş değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plandaki_is_degismez';
  END IF;
  RETURN NEW;
END $$;
