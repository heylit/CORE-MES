-- Firma araması (liste, seçim ve Ctrl K, kart 1235) adın, kodun ve vergi numarasının içinde arar; düz B-ağacı "içinde geçen"
-- aramasını hızlandırmaz, her harfte tablo baştan taranır. Trigram GIN indeksi bu aramayı indeksle karşılar (1231 a).
-- İfade sorgulardakinin aynısıdır (sorgular.ts): public.arama_sade Türkçe harfi dil ayarından bağımsız sadeleştirir. Uzantı ve
-- işlev göç 20261029125000'de public şemasına kurulur; şemayla yazılır, test şemasının arama yolunda public yoktur.
CREATE INDEX musteri_tedarikci_firma_ad_trgm ON musteri_tedarikci_firma USING gin (public.arama_sade(ad) public.gin_trgm_ops);
CREATE INDEX musteri_tedarikci_firma_kod_trgm ON musteri_tedarikci_firma USING gin (public.arama_sade(kod) public.gin_trgm_ops);
CREATE INDEX musteri_tedarikci_firma_vergi_no_trgm ON musteri_tedarikci_firma USING gin (public.arama_sade(vergi_no) public.gin_trgm_ops);
