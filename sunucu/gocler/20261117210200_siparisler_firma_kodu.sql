-- 3399 a: teklifin ve siparişin firma kodu (Sistem Ayarları > Firma kodları); numara kalıbındaki {FIRMA} buradan gelir, teklif
-- siparişe, sipariş projeye taşır. Eski kayıtta boştur.
ALTER TABLE siparisler_teklif ADD COLUMN firma_kodu text REFERENCES ayar_firma_kodu (kod);
ALTER TABLE siparisler_siparis ADD COLUMN firma_kodu text REFERENCES ayar_firma_kodu (kod);
