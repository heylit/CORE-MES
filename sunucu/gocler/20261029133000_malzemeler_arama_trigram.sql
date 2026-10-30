-- 1231 a, kart 1244: malzeme araması (üst arama, seçiciler) "içinde geçen" eşleşmeyle tam tarama yapıyordu. Aranan dört ifadeye
-- sadeleşmiş (public.arama_sade, Türkçe harf) trigram GIN indeksi; OR'lu koşul BitmapOr ile indekse düşer. Veri değişmez.
-- İfadeler `sorgular.ts` ARAMA_KOSULU ile birebir aynı olmalıdır, yoksa planlayıcı indeksi seçmez (arama-indeksi.test.ts bunu denetler).
-- Uzantı ve işlev 20261029125000 göçünde public şemasındadır; test şemalarının search_path'i public'i içermez, adlar nitelikli yazılır.
CREATE INDEX malzemeler_malzeme_katalog_karti_stok_kodu_trgm ON malzeme_katalog_karti
  USING gin (public.arama_sade(stok_kodu) public.gin_trgm_ops);
CREATE INDEX malzemeler_malzeme_katalog_karti_ad_trgm ON malzeme_katalog_karti
  USING gin (public.arama_sade(CASE WHEN jsonb_typeof(kayit -> 'com') = 'object' AND jsonb_typeof(kayit -> 'com' -> 'ad') = 'string'
                                    THEN NULLIF(btrim(kayit -> 'com' ->> 'ad'), '') END) public.gin_trgm_ops);
CREATE INDEX malzemeler_malzeme_katalog_karti_eski_kod_trgm ON malzeme_katalog_karti
  USING gin (public.arama_sade(CASE WHEN jsonb_typeof(kayit -> 'com' -> 'eskiKod') = 'string' THEN kayit -> 'com' ->> 'eskiKod' END) public.gin_trgm_ops);
CREATE INDEX malzemeler_malzeme_katalog_karti_tkod_trgm ON malzeme_katalog_karti
  USING gin (public.arama_sade(CASE WHEN jsonb_typeof(kayit -> 'com' -> 'tkod') = 'string' THEN kayit -> 'com' ->> 'tkod' END) public.gin_trgm_ops);
