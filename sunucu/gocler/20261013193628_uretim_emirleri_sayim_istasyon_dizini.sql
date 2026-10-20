-- Anomali okumaları istasyon başına zaman aralığında sayım toplar ve son girişi arar (kart #1145).
CREATE INDEX uretim_sayimi_istasyon_zaman_idx ON uretim_sayimi (istasyon_id, zaman);
