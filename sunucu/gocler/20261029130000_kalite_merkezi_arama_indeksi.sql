-- Ctrl K NCR araması (1238, 1231 a): `%metin%` araması tam tarama yerine trigram indeksine düşer. Yalnız indeks; veri değişmez.
-- İfade sorgular.ts NCR_ARAMA_METNI ile harfi harfine aynıdır. pg_trgm ve public.arama_sade 20261029125000 göçündedir; test
-- şemalarının arama yolunda public olmadığı için işlev ve işleç sınıfı şemasıyla yazılır.
CREATE INDEX kalite_merkezi_belge_ncr_arama_trgm ON kalite_merkezi_belge
  USING gin (public.arama_sade(coalesce(govde->>'no', '') || ' ' || coalesce(govde->>'parcaNo', '') || ' ' || coalesce(govde->>'parcaAdi', '') || ' ' || coalesce(govde->>'lot', '') || ' ' || coalesce(govde->>'emir', '')) public.gin_trgm_ops)
  WHERE koleksiyon = 'ncr' AND govde IS NOT NULL;
