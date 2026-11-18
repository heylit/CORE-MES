-- 3399 a: projenin firma kodu (Sistem Ayarları > Firma kodları); üretim emri numarasındaki {FIRMA} buradan gelir. Eski projede boştur.
ALTER TABLE projeler_proje ADD COLUMN firma_kodu text REFERENCES ayar_firma_kodu (kod);
