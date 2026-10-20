-- Başka modüller malzeme kartına sayıyla (yabancı anahtar) bağlanır; metin `kimlik` birincil anahtar ve tekil kalır.
-- Dolu tabloda var olan satırlar da sırayla numaralanır. GENERATED ALWAYS açık değerli güncellemeyi reddeder, ama
-- `SET no = DEFAULT` yeni numara atar; bu yüzden numaranın değişmezliğini aşağıdaki tetikleyici sağlar.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN no integer GENERATED ALWAYS AS IDENTITY NOT NULL CONSTRAINT malzeme_katalog_karti_no_tek UNIQUE;

CREATE FUNCTION malzeme_katalog_karti_no_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Kartın sayı kimliği değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_no_degismez';
END $$;
CREATE TRIGGER malzeme_katalog_karti_no_degismez BEFORE UPDATE ON malzeme_katalog_karti
  FOR EACH ROW WHEN (OLD.no IS DISTINCT FROM NEW.no) EXECUTE FUNCTION malzeme_katalog_karti_no_degismez();
