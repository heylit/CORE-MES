-- İş emri ve adım notu, rotadaki operasyonun gizli kimliğini de taşır (3250 b aşama 1). Emir içi op_no değişmez; kimlik yalnız
-- rotadan gelen adımda dolar: tek katmanlı emirde adım emrin kaynak revizyonunda o numarayla bulunmalı, çok katmanlı emirde
-- düğüm malzemesi ve kaynak_op_no kullanılır. Rework, tamir ve ek adım kimliksizdir.
ALTER TABLE uretim_emirleri_is_emri ADD COLUMN operasyon_id int CONSTRAINT uretim_emirleri_is_emri_operasyon REFERENCES rota_op_numarasi (id);
ALTER TABLE emir_adim_notu ADD COLUMN operasyon_id int CONSTRAINT emir_adim_notu_operasyon REFERENCES rota_op_numarasi (id);

CREATE FUNCTION uretim_emirleri_is_emri_operasyonu(p_emir int, p_tur text, p_op int, p_dugum_malzeme int, p_kaynak_op int)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_tur <> 'rota' THEN NULL
    WHEN p_dugum_malzeme IS NOT NULL THEN
      (SELECT o.id FROM rota_op_numarasi o WHERE o.malzeme_id = p_dugum_malzeme AND o.op_no = p_kaynak_op)
    ELSE
      (SELECT o.id FROM uretim_emri e
         JOIN rota_adimi a ON a.revizyon_id = e.kaynak_rota_revizyonu_id AND a.op_no = p_op
         JOIN rota_op_numarasi o ON o.malzeme_id = a.malzeme_id AND o.op_no = a.op_no
        WHERE e.id = p_emir)
  END
$$;
CREATE FUNCTION uretim_emirleri_is_emri_operasyon_doldur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.operasyon_id := uretim_emirleri_is_emri_operasyonu(NEW.uretim_emri_id, NEW.tur, NEW.op_no, NEW.dugum_malzeme_id, NEW.kaynak_op_no);
  RETURN NEW;
END $$;

ALTER TABLE uretim_emirleri_is_emri DISABLE TRIGGER uretim_emirleri_is_emri_degisiklik;
UPDATE uretim_emirleri_is_emri i
   SET operasyon_id = uretim_emirleri_is_emri_operasyonu(i.uretim_emri_id, i.tur, i.op_no, i.dugum_malzeme_id, i.kaynak_op_no)
 WHERE i.tur = 'rota';
ALTER TABLE uretim_emirleri_is_emri ENABLE TRIGGER uretim_emirleri_is_emri_degisiklik;

ALTER TABLE emir_adim_notu DISABLE TRIGGER emir_adim_notu_degismez;
UPDATE emir_adim_notu n SET operasyon_id = o.id FROM rota_op_numarasi o WHERE o.malzeme_id = n.malzeme_no AND o.op_no = n.op_no;
ALTER TABLE emir_adim_notu ENABLE TRIGGER emir_adim_notu_degismez;

CREATE INDEX uretim_emirleri_is_emri_operasyon_idx ON uretim_emirleri_is_emri (operasyon_id);
CREATE INDEX emir_adim_notu_operasyon_idx ON emir_adim_notu (operasyon_id, adim_sira, id);

CREATE TRIGGER uretim_emirleri_is_emri_operasyon BEFORE INSERT OR UPDATE OF uretim_emri_id, tur, op_no, dugum_malzeme_id, kaynak_op_no
  ON uretim_emirleri_is_emri FOR EACH ROW EXECUTE FUNCTION uretim_emirleri_is_emri_operasyon_doldur();
CREATE TRIGGER emir_adim_notu_operasyon BEFORE INSERT ON emir_adim_notu
  FOR EACH ROW EXECUTE FUNCTION rota_operasyon_kimligi_doldur('malzeme_no', 'op_no', 'operasyon_id');
