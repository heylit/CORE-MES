-- 1237 (1231 a): Ctrl K aramasının talep ve sipariş eşleşmesi `arama_sade(sütun) LIKE '%x%'`tir; B-ağacı dizini bunu
-- kullanamaz. Trigram ifade dizini ad içinde geçen metni de tam taramasız bulur. Uzantıyı ve işlevi 20261029125000 kurar.
CREATE INDEX satin_alma_talep_no_trgm ON satin_alma_talep USING gin (public.arama_sade(no) public.gin_trgm_ops);
CREATE INDEX satin_alma_talep_baslik_trgm ON satin_alma_talep USING gin (public.arama_sade(baslik) public.gin_trgm_ops);
CREATE INDEX satin_alma_talep_kalemi_ad_trgm ON satin_alma_talep_kalemi USING gin (public.arama_sade(ad) public.gin_trgm_ops);
CREATE INDEX satin_alma_siparis_no_trgm ON satin_alma_siparis USING gin (public.arama_sade(no) public.gin_trgm_ops);
CREATE INDEX satin_alma_siparis_siparis_no_trgm ON satin_alma_siparis USING gin (public.arama_sade(siparis_no) public.gin_trgm_ops);
