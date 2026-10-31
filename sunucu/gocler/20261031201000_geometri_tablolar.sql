-- 3D Atölyesi Aşama 1 (kart 1441, 1427 a): yayındaki 3B model revizyonlarının geometri analizi ve analiz kuyruğu. Yeni boş tablolar.
-- Revizyon ve belge Çizim Merkezi'nindir; yön geometri -> cizimler olduğu için kimlikler yabancı anahtarsız tutulur (revizyon silinse de
-- analiz kalır, okuma sırasında merkezde yoksa gösterilmez). Hesabı ayrı süreç yapar; kuyruk yalnız burada durur.
CREATE TABLE geometri_is (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revizyon_id int NOT NULL CONSTRAINT geometri_is_revizyon_tek UNIQUE,
  belge_id int NOT NULL,
  -- Çizim Merkezi'nin dosya özeti: dosya bu özetle okunur, analiz hangi içeriğin olduğunu bununla söyler.
  ozet text NOT NULL CONSTRAINT geometri_is_ozet CHECK (ozet ~ '^[0-9a-f]{64}$'),
  dosya_turu text NOT NULL CONSTRAINT geometri_is_dosya_turu CHECK (dosya_turu IN ('step', 'iges')),
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT geometri_is_durum CHECK (durum IN ('bekliyor', 'calisiyor', 'bitti', 'hata')),
  deneme_sayisi int NOT NULL DEFAULT 0 CONSTRAINT geometri_is_deneme CHECK (deneme_sayisi >= 0),
  hata_metni text CONSTRAINT geometri_is_hata_metni CHECK (hata_metni IS NULL OR length(hata_metni) <= 500),
  olusturma timestamptz NOT NULL DEFAULT now(),
  baslama timestamptz,
  bitis timestamptz,
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT geometri_is_hata_durumu CHECK (durum <> 'hata' OR hata_metni IS NOT NULL)
);
CREATE INDEX geometri_is_bekleyen_idx ON geometri_is (olusturma, id) WHERE durum = 'bekliyor';

CREATE TABLE geometri_analiz (
  revizyon_id int PRIMARY KEY,
  belge_id int NOT NULL,
  ozet text NOT NULL CONSTRAINT geometri_analiz_ozet CHECK (ozet ~ '^[0-9a-f]{64}$'),
  motor text NOT NULL CONSTRAINT geometri_analiz_motor CHECK (btrim(motor) <> ''),
  -- Ölçüler mm; kutu eksenlere hizalı, obb döndürülmüş en küçük kutu (büyükten küçüğe). Yön 3x3 satır dizisi (obb eksenleri).
  kutu_x_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_kutu_x CHECK (kutu_x_mm >= 0),
  kutu_y_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_kutu_y CHECK (kutu_y_mm >= 0),
  kutu_z_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_kutu_z CHECK (kutu_z_mm >= 0),
  obb_a_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_obb_a CHECK (obb_a_mm >= 0),
  obb_b_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_obb_b CHECK (obb_b_mm >= 0),
  obb_c_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_obb_c CHECK (obb_c_mm >= 0),
  -- Uzun eksen çevresinde parçayı kapsayan en küçük daire çapı (çubuk hamı için).
  cap_mm numeric(14, 4) NOT NULL CONSTRAINT geometri_analiz_cap CHECK (cap_mm >= 0),
  obb_yon numeric(10, 8)[] NOT NULL CONSTRAINT geometri_analiz_obb_yon CHECK (cardinality(obb_yon) = 9),
  -- Ağ kapalı değilse hacim bilinemez: null (sıfır uydurulmaz).
  hacim_mm3 numeric(20, 4) CONSTRAINT geometri_analiz_hacim CHECK (hacim_mm3 IS NULL OR hacim_mm3 > 0),
  alan_mm2 numeric(20, 4) NOT NULL CONSTRAINT geometri_analiz_alan CHECK (alan_mm2 >= 0),
  govde_sayisi int NOT NULL CONSTRAINT geometri_analiz_govde CHECK (govde_sayisi >= 1),
  kapali boolean NOT NULL,
  ucgen_sayisi int NOT NULL CONSTRAINT geometri_analiz_ucgen CHECK (ucgen_sayisi >= 1),
  hesap_suresi_ms int NOT NULL CONSTRAINT geometri_analiz_sure CHECK (hesap_suresi_ms >= 0),
  hesap_zamani timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geometri_analiz_kapali_hacim CHECK (kapali OR hacim_mm3 IS NULL)
);
