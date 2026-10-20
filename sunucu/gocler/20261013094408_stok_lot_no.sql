-- Her partinin kendi lot numarası olur (kullanıcı kararı 13.10.2026, #1018): mal kabulde numara otomatik verilir, tedarikçi
-- parti ya da döküm no girilmese de parti açılır. Var olan partiler kayıt sırasıyla numaralanır; yeni numarayı servis
-- `ayarlar` numara kuralıyla (`stok.lot-no`) alır ve dolu numarayı atlar.
ALTER TABLE stok_parti ADD COLUMN lot_no text;

-- Parti satırı yalnız eklenir (stok_parti_degismez); yeni sütunun ilk dolumu bu göçte bir kez, tetik kapalıyken yapılır.
ALTER TABLE stok_parti DISABLE TRIGGER stok_parti_degismez;
UPDATE stok_parti p SET lot_no = 'LT-' || lpad(s.sira::text, 6, '0')
  FROM (SELECT id, row_number() OVER (ORDER BY kayit_zamani, id) AS sira FROM stok_parti) s
 WHERE s.id = p.id;
ALTER TABLE stok_parti ENABLE TRIGGER stok_parti_degismez;

ALTER TABLE stok_parti
  ALTER COLUMN lot_no SET NOT NULL,
  ADD CONSTRAINT stok_parti_lot_bicimi CHECK (btrim(lot_no) <> '' AND length(lot_no) <= 40),
  ADD CONSTRAINT stok_parti_lot_tek UNIQUE (lot_no),
  -- Numarasız teslimat da parti açar: kimliği lot numarasıdır.
  DROP CONSTRAINT stok_parti_tanimli,
  -- Aynı tedarikçi parti/döküm no ya da aynı emir yeniden gelirse aynı partiye eklenir; numarasız her teslimat ayrı partidir.
  DROP CONSTRAINT stok_parti_tek;

CREATE UNIQUE INDEX stok_parti_tek ON stok_parti (malzeme_id, tedarikci_parti_no, dokum_no, uretim_emri_id) NULLS NOT DISTINCT
  WHERE tedarikci_parti_no IS NOT NULL OR dokum_no IS NOT NULL OR uretim_emri_id IS NOT NULL;
