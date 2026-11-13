-- Canlı makine panosu (kart 3176): SmartES'ten makine başına anlık bilgi okunur ve yalnız gösterilir.
-- Yalnız yeni boş tablolar; var olan tablolara dokunulmaz.

-- Makine başına SON okuma: her okumada üstüne yazılır, her okumanın kaydı tutulmaz (dakikada bir, makine başına satır gereksiz büyür).
-- durum_kodu SmartES'in gönderdiği haliyledir; durum onun CORE'daki karşılığıdır (karşılığı bilinmeyen kod 'bilinmiyor').
CREATE TABLE smartes_makine_durumu (
  makine_kodu text PRIMARY KEY CONSTRAINT smartes_makine_durumu_makine_kodu CHECK (btrim(makine_kodu) <> '' AND length(makine_kodu) <= 200),
  smartes_makine_id int NOT NULL,
  makine_adi text,
  durum text NOT NULL CONSTRAINT smartes_makine_durumu_durum CHECK (durum IN ('calisiyor', 'bekliyor', 'alarm', 'kapali', 'baglanti-yok', 'bilinmiyor')),
  durum_kodu text,
  durum_baslangic timestamptz NOT NULL,
  mod text,
  alarm text,
  uyari text,
  program_no text,
  program_adi text,
  sayac int,
  sayac_toplam int,
  eksen_hizi int,
  eksen_orani int,
  spindle_yuku int,
  spindle_orani int,
  spindle_hizi int,
  takim_cebi int,
  okundu timestamptz NOT NULL
);

-- Yalnız durum değişimleri: bugünkü durum şeridi ve ayrıntıdaki liste bundan çıkar. Satır silinmez.
CREATE TABLE smartes_makine_durum_degisimi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  makine_kodu text NOT NULL CONSTRAINT smartes_makine_durum_degisimi_makine_kodu CHECK (btrim(makine_kodu) <> '' AND length(makine_kodu) <= 200),
  zaman timestamptz NOT NULL,
  eski text CONSTRAINT smartes_makine_durum_degisimi_eski CHECK (eski IS NULL OR eski IN ('calisiyor', 'bekliyor', 'alarm', 'kapali', 'baglanti-yok', 'bilinmiyor')),
  yeni text NOT NULL CONSTRAINT smartes_makine_durum_degisimi_yeni CHECK (yeni IN ('calisiyor', 'bekliyor', 'alarm', 'kapali', 'baglanti-yok', 'bilinmiyor')),
  aciklama text CONSTRAINT smartes_makine_durum_degisimi_aciklama CHECK (aciklama IS NULL OR length(aciklama) <= 400)
);
CREATE INDEX smartes_makine_durum_degisimi_makine_zaman ON smartes_makine_durum_degisimi (makine_kodu, zaman, id);

-- Okuma turunun izi, tek satır. Tur yarıda kesilirse (süre tavanı, ağ hatası) sonraki tur kaldığı makineden sürer.
CREATE TABLE smartes_makine_okuma (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT smartes_makine_okuma_tek CHECK (tek),
  son_deneme timestamptz NOT NULL,
  son_sonuc text NOT NULL CONSTRAINT smartes_makine_okuma_son_sonuc CHECK (son_sonuc IN ('tamam', 'hata')),
  son_hata text CONSTRAINT smartes_makine_okuma_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  son_basarili timestamptz,
  okunan int NOT NULL CONSTRAINT smartes_makine_okuma_okunan CHECK (okunan >= 0),
  makine_sayisi int NOT NULL CONSTRAINT smartes_makine_okuma_makine_sayisi CHECK (makine_sayisi >= 0),
  tur_suresi_ms int NOT NULL CONSTRAINT smartes_makine_okuma_tur_suresi CHECK (tur_suresi_ms >= 0),
  CONSTRAINT smartes_makine_okuma_butun CHECK ((son_hata IS NOT NULL) = (son_sonuc = 'hata'))
);

-- İş emrinin SmartES'teki ilerlemesi (WorkordersList): adetçe tamamlanma yüzdesi ve tahmini bitiş; her okumada üstüne yazılır.
CREATE TABLE smartes_is_emri_ilerleme (
  is_emri_no text PRIMARY KEY CONSTRAINT smartes_is_emri_ilerleme_is_emri_no CHECK (btrim(is_emri_no) <> '' AND length(is_emri_no) <= 200),
  tamamlanan_yuzde numeric,
  tahmini_bitis timestamptz,
  okundu timestamptz NOT NULL
);
CREATE TABLE smartes_ilerleme_okuma (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT smartes_ilerleme_okuma_tek CHECK (tek),
  son_deneme timestamptz NOT NULL,
  son_sonuc text NOT NULL CONSTRAINT smartes_ilerleme_okuma_son_sonuc CHECK (son_sonuc IN ('tamam', 'hata')),
  son_hata text CONSTRAINT smartes_ilerleme_okuma_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  son_basarili timestamptz,
  CONSTRAINT smartes_ilerleme_okuma_butun CHECK ((son_hata IS NOT NULL) = (son_sonuc = 'hata'))
);
