-- Genel aramada kişi (kart #1236, karar 1231 a): ad, sicil no ve görevdeki "içinde geçen" araması tam tarama yerine trigram
-- indeksine düşer. Arama sadeleşmiş sütunda yapılır; indeks aynı ifadededir. public.arama_sade ve pg_trgm 20261029125000'de
-- public şemasına kurulur. Tablo dolu olabilir: yalnız indeks eklenir, veri değişmez.
CREATE INDEX kisiler_kisi_ad_trgm ON kisi USING gin (public.arama_sade(ad) public.gin_trgm_ops);
CREATE INDEX kisiler_kisi_sicil_no_trgm ON kisi USING gin (public.arama_sade(sicil_no) public.gin_trgm_ops);
CREATE INDEX kisiler_kisi_gorev_trgm ON kisi USING gin (public.arama_sade(gorev) public.gin_trgm_ops);
