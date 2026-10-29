-- Genel arama (kart 1240, 1231 a): belge adı ve resim numarasında `LIKE '%x%'` araması tam taramadan trigram ifade indeksine
-- düşer. Uzantı ve `public.arama_sade` 20261029125000 göçündedir. Yalnız indeks eklenir; satır ve sütun değişmez.
CREATE INDEX cizimler_belge_ad_trgm ON cizimler_belge USING gin (public.arama_sade(ad) public.gin_trgm_ops);
CREATE INDEX cizimler_belge_resim_no_trgm ON cizimler_belge USING gin (public.arama_sade(resim_no) public.gin_trgm_ops);
