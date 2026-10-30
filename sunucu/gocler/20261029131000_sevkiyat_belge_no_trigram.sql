-- 1239 (1231 a): Ctrl K irsaliye araması sevk işinin belge numarasında `%x%` ile arar; trigram ifade indeksi bunu tablo taramasından
-- indekse indirir. pg_trgm ve public.arama_sade 20261029125000'dedir. Yalnız indeks eklenir; satırlar ve sütunlar değişmez.
CREATE INDEX sevkiyat_sevkiyat_isi_belge_no_trgm ON sevkiyat_isi USING gin (public.arama_sade(belge_no) public.gin_trgm_ops);
