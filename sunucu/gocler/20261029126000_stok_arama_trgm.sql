-- Kart 1234 (1231 a): Ctrl K parti ve konum araması sadeleşmiş sütunda `LIKE '%x%'` ile çalışır; düz B-ağacı dizin ortadan
-- eşleşmeyi kullanamaz, trigram dizini kullanır. Uzantı ve public.arama_sade 20261029125000 göçüyle kurulur; dizin ifadesi
-- sorgudakiyle aynı olmalıdır. Dizin satır değiştirmez; silinirse arama eski hızına döner. Tablo adı modülle başladığından
-- ad <tablo>_<sutun>_trgm.
CREATE INDEX stok_parti_lot_no_trgm ON stok_parti USING gin (public.arama_sade(lot_no) public.gin_trgm_ops);
CREATE INDEX stok_parti_tedarikci_parti_no_trgm ON stok_parti USING gin (public.arama_sade(tedarikci_parti_no) public.gin_trgm_ops);
CREATE INDEX stok_parti_dokum_no_trgm ON stok_parti USING gin (public.arama_sade(dokum_no) public.gin_trgm_ops);
CREATE INDEX stok_konum_kod_trgm ON stok_konum USING gin (public.arama_sade(kod) public.gin_trgm_ops);
CREATE INDEX stok_konum_ad_trgm ON stok_konum USING gin (public.arama_sade(ad) public.gin_trgm_ops);
