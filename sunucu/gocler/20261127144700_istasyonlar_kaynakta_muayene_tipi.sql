-- 3809: fason adımının arkasına konan kaynağında muayene adımı tipini addan değil koddan (KYM) bulur; tip yoksa açılır. Yalnız ekleme: var olan tipe dokunmaz.
INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KYM', 'Kaynağında muayene', 'KAL') ON CONFLICT (kod) DO NOTHING;
