-- 3771 a: kartı olmayan operatör yetkiliyi çağırır, yetkili telefondan gerekçeyle izin verir ya da reddeder; izin tek iş ve tek operatör
-- içindir, bir kez kullanılır. İstek ve izin 10 dakika geçerlidir (süre kayıttaki anlardan hesaplanır, ayrı durum yazılmaz). Yeni boş tablo.
CREATE TABLE uretim_emirleri_kartsiz_izin (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emri (id),
  -- İş emri anahtarı BİLİNÇLİ YOK (uretim_emirleri_sira_disi_baslatma ile aynı gerekçe: adım satırına KEY SHARE kilidi).
  is_emri_id int CONSTRAINT uretim_emirleri_kartsiz_izin_adim CHECK (is_emri_id IS NULL OR is_emri_id > 0),
  isteyen_kisi_id int NOT NULL REFERENCES kisi (id),
  istek_an timestamptz NOT NULL,
  durum text NOT NULL DEFAULT 'bekliyor'
    CONSTRAINT uretim_emirleri_kartsiz_izin_durum CHECK (durum IN ('bekliyor', 'izin', 'ret', 'iptal', 'kullanildi')),
  karar_veren_kisi_id int REFERENCES kisi (id),
  karar_gerekce text CONSTRAINT uretim_emirleri_kartsiz_izin_gerekce CHECK (karar_gerekce IS NULL OR (btrim(karar_gerekce) <> '' AND length(karar_gerekce) <= 500)),
  karar_an timestamptz,
  kullanildi_an timestamptz,
  CONSTRAINT uretim_emirleri_kartsiz_izin_karar CHECK (
    (durum IN ('bekliyor', 'iptal')) = (karar_an IS NULL)
    AND (karar_an IS NULL) = (karar_veren_kisi_id IS NULL)
    AND (karar_an IS NULL) = (karar_gerekce IS NULL)
  ),
  CONSTRAINT uretim_emirleri_kartsiz_izin_kullanim CHECK ((durum = 'kullanildi') = (kullanildi_an IS NOT NULL))
);
-- Kişinin bir işte tek açık isteği olur: yeniden çağırma eskisini iptal edip yenisini açar.
CREATE UNIQUE INDEX uretim_emirleri_kartsiz_izin_tek_bekleyen ON uretim_emirleri_kartsiz_izin (isteyen_kisi_id, uretim_emri_id, coalesce(is_emri_id, 0))
  WHERE durum = 'bekliyor';
CREATE INDEX uretim_emirleri_kartsiz_izin_emir_idx ON uretim_emirleri_kartsiz_izin (uretim_emri_id, id);
