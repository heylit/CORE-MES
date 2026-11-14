-- Operasyon kimliğini bilen yazan (iş emrinden gelen adım notu gibi) onu açıkça verir; tetikleyici verileni ezmez. OP numarası
-- yeniden dizilince eski (malzeme, op_no) çifti başka operasyonu gösterebilir (3250 b). Kimlik verilmezse eskisi gibi doldurulur.
CREATE OR REPLACE FUNCTION rota_operasyon_kimligi_doldur() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  satir jsonb := to_jsonb(NEW);
  kimlik int;
BEGIN
  IF TG_OP = 'INSERT' AND satir ->> TG_ARGV[2] IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT o.id INTO kimlik FROM rota_op_numarasi o
   WHERE o.malzeme_id = (satir ->> TG_ARGV[0])::int AND o.op_no = (satir ->> TG_ARGV[1])::int;
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[2], kimlik));
  RETURN NEW;
END $$;
