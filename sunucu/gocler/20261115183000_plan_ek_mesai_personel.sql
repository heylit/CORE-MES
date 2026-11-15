-- 3282 2a-2 (3282-7 b): ek mesai vardiya dışı ek kapasitedir ve o tezgâhı kimin çalıştıracağı (operatör) seçilir. Satıra boş olabilen kişi
-- sütunu eklenir; var olan satırlar değişmez (operatörsüz ek mesai bugünkü gibi motorun sanal kişisiyle kalır). Aynı kişi aynı gün ve
-- vardiyada iki ek mesaide olamaz: canlıda ve her taslakta ayrı ayrı tekildir. Kişi silinmez (kisi.aktif), yabancı anahtar kısıtlamaz.
ALTER TABLE plan_senaryo_ek_mesai
  ADD COLUMN personel_kisi_id int CONSTRAINT plan_senaryo_ek_mesai_personel REFERENCES kisi (id);

CREATE UNIQUE INDEX plan_senaryo_ek_mesai_personel_taslakta_tek ON plan_senaryo_ek_mesai (senaryo_id, personel_kisi_id, gun, vardiya_id)
  WHERE senaryo_id IS NOT NULL AND personel_kisi_id IS NOT NULL;
CREATE UNIQUE INDEX plan_senaryo_ek_mesai_personel_canlida_tek ON plan_senaryo_ek_mesai (personel_kisi_id, gun, vardiya_id)
  WHERE senaryo_id IS NULL AND personel_kisi_id IS NOT NULL;
