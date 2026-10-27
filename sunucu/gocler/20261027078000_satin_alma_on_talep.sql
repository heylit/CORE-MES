-- 898 a: ön talep satın almanındır. Fason ön talep okumada türetilir (açık emrin, siparişe ve talebe bağlanmamış fason iş emri);
-- kayıt yalnız kullanıcının "gerekmiyor" kararıdır. Plan ihtiyacı (Dal 2) aynı tabloya malzeme numarasıyla yazar; yoksayıldığı andaki
-- miktar saklanır, ihtiyaç artarsa artan kısım yeniden düşer. İş emri silinince kararı da gider. Yeni ve boş tablo.
CREATE TABLE satin_alma_on_talep_yoksay (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kaynak text NOT NULL CONSTRAINT satin_alma_on_talep_yoksay_kaynak CHECK (kaynak IN ('fason', 'plan')),
  is_emri_id int CONSTRAINT satin_alma_on_talep_yoksay_is_emri REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  malzeme_no int CONSTRAINT satin_alma_on_talep_yoksay_malzeme REFERENCES malzeme_katalog_karti (no),
  miktar numeric(18,4) CONSTRAINT satin_alma_on_talep_yoksay_miktar CHECK (miktar > 0),
  neden text NOT NULL CONSTRAINT satin_alma_on_talep_yoksay_neden CHECK (btrim(neden) = neden AND neden <> '' AND length(neden) <= 200),
  kisi_id int NOT NULL CONSTRAINT satin_alma_on_talep_yoksay_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT satin_alma_on_talep_yoksay_anahtar CHECK (
    (kaynak = 'fason' AND is_emri_id IS NOT NULL AND malzeme_no IS NULL) OR (kaynak = 'plan' AND malzeme_no IS NOT NULL AND is_emri_id IS NULL)),
  CONSTRAINT satin_alma_on_talep_yoksay_is_emri_tekil UNIQUE (is_emri_id),
  CONSTRAINT satin_alma_on_talep_yoksay_malzeme_tekil UNIQUE (malzeme_no)
);
