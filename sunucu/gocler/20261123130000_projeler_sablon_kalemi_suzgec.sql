-- 3611-1: şablon kalemi hangi emir türlerinde ve hangi operasyon tiplerinde görev açacağını süzer. Boş dizi "hepsi" demektir;
-- var olan kalemler olduğu gibi çalışır. Göç yalnız ekler, veri dönüşmez.

ALTER TABLE projeler_gorev_sablon_kalemi
  ADD COLUMN emir_turleri text[] NOT NULL DEFAULT '{}'
    CONSTRAINT projeler_gorev_sablon_kalemi_emir_turleri_deger CHECK (
      emir_turleri <@ ARRAY['seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason']::text[]
    ),
  ADD COLUMN operasyon_tipleri int[] NOT NULL DEFAULT '{}'
    CONSTRAINT projeler_gorev_sablon_kalemi_operasyon_tipleri_sinir CHECK (cardinality(operasyon_tipleri) <= 50 AND array_position(operasyon_tipleri, NULL) IS NULL);
