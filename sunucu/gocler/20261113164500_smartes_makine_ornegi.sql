-- Makine okumalarının geçmişi (kart 3192): sayım eğrisi ve sonraki adımda yük ve ilerleme oranı bundan çizilir. Yalnız yeni boş tablo.
-- Satır silinmez (3200 c: süresiz saklanır).
CREATE TABLE smartes_makine_ornegi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  makine_kodu text NOT NULL CONSTRAINT smartes_makine_ornegi_makine_kodu CHECK (btrim(makine_kodu) <> '' AND length(makine_kodu) <= 200),
  zaman timestamptz NOT NULL,
  durum text NOT NULL CONSTRAINT smartes_makine_ornegi_durum CHECK (durum IN ('calisiyor', 'bekliyor', 'alarm', 'kapali', 'baglanti-yok', 'bilinmiyor')),
  sayac int,
  sayac_toplam int,
  eksen_orani int,
  spindle_yuku int,
  takim_cebi int,
  program_no text CONSTRAINT smartes_makine_ornegi_program_no CHECK (program_no IS NULL OR length(program_no) <= 200)
);
CREATE INDEX smartes_makine_ornegi_makine_zaman ON smartes_makine_ornegi (makine_kodu, zaman, id);
