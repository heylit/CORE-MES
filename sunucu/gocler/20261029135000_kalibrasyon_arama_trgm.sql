-- Genel arama (Ctrl K) ölçü aletini numarasının, adının ya da yerinin içinden, kalibrasyon kaydını sertifika numarasından bulur
-- (kart #1243, 1231 a). `%x%` araması trigram indeksi olmadan tablonun tamamını tarar. Uzantıyı ve public.arama_sade işlevini
-- 20261029125000 kurar; burada yalnız indeks eklenir, hiçbir satır ya da sütun değişmez. İfade sorgudakiyle aynıdır
-- (`moduller/kalibrasyon/arama/sorgular.ts`); farklı olursa indeks kullanılmaz.
CREATE INDEX kalibrasyon_olcu_aleti_no_trgm ON olcu_aleti USING gin (public.arama_sade(no) public.gin_trgm_ops);
CREATE INDEX kalibrasyon_olcu_aleti_ad_trgm ON olcu_aleti USING gin (public.arama_sade(ad) public.gin_trgm_ops);
CREATE INDEX kalibrasyon_olcu_aleti_yer_trgm ON olcu_aleti USING gin (public.arama_sade(yer) public.gin_trgm_ops);
CREATE INDEX kalibrasyon_kalibrasyon_kaydi_sertifika_no_trgm ON kalibrasyon_kaydi USING gin (public.arama_sade(sertifika_no) public.gin_trgm_ops);
