-- Genel arama (1242, 1231 a): satış siparişinde aranan sütunlara sadeleşmiş trigram ifade indeksi; `LIKE '%x%'` tam taramadan
-- indekse düşer. Uzantı ve arama_sade 125000 göçündedir. Yalnız indeks eklenir; satır ve sütun değişmez.
CREATE INDEX siparisler_siparis_no_trgm ON siparisler_siparis USING gin (public.arama_sade(no) public.gin_trgm_ops);
CREATE INDEX siparisler_siparis_musteri_siparis_no_trgm ON siparisler_siparis USING gin (public.arama_sade(musteri_siparis_no) public.gin_trgm_ops);
