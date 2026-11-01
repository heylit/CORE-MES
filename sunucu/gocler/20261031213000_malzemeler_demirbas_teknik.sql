-- Demirbaş kartının teknik bilgisi (1596 b + teyit a, 1597 a): sorgulanacak sınırlar tipli sütunda, nadir alanlar serbest listede.
-- Kartın kimlik bilgisi (marka, model, seri, yıl, güç, ağırlık) kartın kaydında kalır; burada yalnız kayıtta olmayan alanlar vardır.
-- Fiyat ve amortisman finansın sabit kıymet kaydındadır (1598 a); kart ona makine üzerinden bağlanır. Bilinmeyen alan boştur, sıfır yazılmaz.
CREATE TABLE malzemeler_demirbas_teknik (
  kart_kimlik text CONSTRAINT malzemeler_demirbas_teknik_pk PRIMARY KEY
    CONSTRAINT malzemeler_demirbas_teknik_kart REFERENCES malzeme_katalog_karti (kimlik),
  -- Bir makine tek demirbaş kartına bağlanır.
  makine_id int CONSTRAINT malzemeler_demirbas_teknik_makine REFERENCES makine (id)
    CONSTRAINT malzemeler_demirbas_teknik_makine_tek UNIQUE,
  tezgah_turu text CONSTRAINT malzemeler_demirbas_teknik_tezgah_turu
    CHECK (tezgah_turu IN ('dik_isleme', 'yatay_isleme', 'bes_eksen', 'torna', 'torna_freze', 'taslama', 'erozyon', 'diger')),
  eksen_sayisi smallint CONSTRAINT malzemeler_demirbas_teknik_eksen_sayisi CHECK (eksen_sayisi BETWEEN 1 AND 12),
  x_kursu_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_x_kursu CHECK (x_kursu_mm > 0),
  y_kursu_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_y_kursu CHECK (y_kursu_mm > 0),
  z_kursu_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_z_kursu CHECK (z_kursu_mm > 0),
  tabla_en_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_tabla_en CHECK (tabla_en_mm > 0),
  tabla_boy_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_tabla_boy CHECK (tabla_boy_mm > 0),
  tabla_yuku_kg numeric(9, 1) CONSTRAINT malzemeler_demirbas_teknik_tabla_yuku CHECK (tabla_yuku_kg > 0),
  azami_devir int CONSTRAINT malzemeler_demirbas_teknik_azami_devir CHECK (azami_devir BETWEEN 1 AND 100000),
  is_mili_gucu_kw numeric(7, 2) CONSTRAINT malzemeler_demirbas_teknik_is_mili_gucu CHECK (is_mili_gucu_kw > 0),
  is_mili_konigi text CONSTRAINT malzemeler_demirbas_teknik_konik CHECK (btrim(is_mili_konigi) <> '' AND char_length(is_mili_konigi) <= 40),
  takim_cebi smallint CONSTRAINT malzemeler_demirbas_teknik_takim_cebi CHECK (takim_cebi BETWEEN 1 AND 999),
  tornalama_capi_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_tornalama_capi CHECK (tornalama_capi_mm > 0),
  tornalama_boyu_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_tornalama_boyu CHECK (tornalama_boyu_mm > 0),
  cubuk_gecis_capi_mm numeric(8, 1) CONSTRAINT malzemeler_demirbas_teknik_cubuk_gecis CHECK (cubuk_gecis_capi_mm > 0),
  konumlama_hassasiyeti_mm numeric(7, 4) CONSTRAINT malzemeler_demirbas_teknik_hassasiyet CHECK (konumlama_hassasiyeti_mm > 0),
  -- Enerji: çalışırken ve beklemede saatlik ortalama tüketim (kWh). Kurulu güç kartın kaydındaki güç alanıdır.
  calisma_tuketimi_kwh numeric(8, 2) CONSTRAINT malzemeler_demirbas_teknik_calisma_tuketimi CHECK (calisma_tuketimi_kwh >= 0),
  bekleme_tuketimi_kwh numeric(8, 2) CONSTRAINT malzemeler_demirbas_teknik_bekleme_tuketimi CHECK (bekleme_tuketimi_kwh >= 0),
  surum int NOT NULL DEFAULT 1 CONSTRAINT malzemeler_demirbas_teknik_surum CHECK (surum > 0),
  guncelleyen_kisi_id int NOT NULL CONSTRAINT malzemeler_demirbas_teknik_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now()
);

-- Tipli sütunu olmayan özellik (ör. soğutma basıncı, palet sayısı). Liste teknik kaydıyla birlikte yeniden yazılır.
CREATE TABLE malzemeler_demirbas_ozellik (
  kart_kimlik text NOT NULL CONSTRAINT malzemeler_demirbas_ozellik_teknik REFERENCES malzemeler_demirbas_teknik (kart_kimlik),
  sira smallint NOT NULL CONSTRAINT malzemeler_demirbas_ozellik_sira CHECK (sira BETWEEN 1 AND 50),
  ad text NOT NULL CONSTRAINT malzemeler_demirbas_ozellik_ad CHECK (btrim(ad) <> '' AND char_length(ad) <= 80),
  deger text NOT NULL CONSTRAINT malzemeler_demirbas_ozellik_deger CHECK (btrim(deger) <> '' AND char_length(deger) <= 200),
  birim text CONSTRAINT malzemeler_demirbas_ozellik_birim CHECK (btrim(birim) <> '' AND char_length(birim) <= 20),
  CONSTRAINT malzemeler_demirbas_ozellik_pk PRIMARY KEY (kart_kimlik, sira),
  CONSTRAINT malzemeler_demirbas_ozellik_ad_tek UNIQUE (kart_kimlik, ad)
);
