-- 2966-1 b, 2972-1 b: "Logo'da beklet" Logo'daki siparişi öneri durumuna çeker, "serbest bırak" geri alır. İstek ve gönderim durumu
-- birlikte tutulur; yalnız Logo'da kaydı olan sipariş bekletilir. Var olan siparişler değişmez (hepsi boş başlar).
ALTER TABLE satin_alma_siparis
  ADD COLUMN logo_bekletme_istegi text CONSTRAINT satin_alma_siparis_logo_bekletme_istegi CHECK (logo_bekletme_istegi IN ('beklet', 'serbest')),
  ADD COLUMN logo_bekletme_durumu text CONSTRAINT satin_alma_siparis_logo_bekletme_durumu CHECK (logo_bekletme_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_bekletme_hata text CONSTRAINT satin_alma_siparis_logo_bekletme_hata CHECK (logo_bekletme_hata IS NULL OR (btrim(logo_bekletme_hata) <> '' AND length(logo_bekletme_hata) <= 2000)),
  ADD CONSTRAINT satin_alma_siparis_logo_bekletme_butun CHECK (
    (logo_bekletme_istegi IS NULL) = (logo_bekletme_durumu IS NULL)
    AND (logo_bekletme_durumu IS NULL OR logo_kayit_no IS NOT NULL)
    AND (logo_bekletme_hata IS NOT NULL) = (logo_bekletme_durumu IS NOT DISTINCT FROM 'hata')
  );

CREATE INDEX satin_alma_siparis_logo_bekletme_kuyrugu ON satin_alma_siparis (id) WHERE logo_bekletme_durumu IN ('bekliyor', 'hata');

-- Bekletme sütunları da teknik eşitleme sütunudur, planı etkilemez: değişiklik defterine girmez (20261103090700 ile aynı kural).
DROP TRIGGER satin_alma_siparis_degisiklik ON satin_alma_siparis;
CREATE TRIGGER satin_alma_siparis_degisiklik AFTER INSERT OR UPDATE OR DELETE ON satin_alma_siparis
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('talep_id,teklif_id',
    'logo_kayit_no', 'logo_gonderim_durumu', 'logo_gonderim_zamani', 'logo_hata', 'logo_iptal_durumu', 'logo_iptal_hata',
    'logo_guncelleme_durumu', 'logo_guncelleme_hata', 'logo_kaldirilan_satir_refleri', 'logo_kapatma_durumu', 'logo_kapatma_hata',
    'logo_bekletme_istegi', 'logo_bekletme_durumu', 'logo_bekletme_hata');

-- Logo bağlantısının çift gönderim izi bekletmeyi ayrı belge türüyle tutar (kapatma ve iptalle aynı yol). Kısıt genişler, satır değişmez.
ALTER TABLE logo_giden DROP CONSTRAINT logo_giden_belge_turu;
ALTER TABLE logo_giden ADD CONSTRAINT logo_giden_belge_turu CHECK (belge_turu IN (
  'malzeme', 'hizmet', 'malzeme-guncelleme', 'siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-bekletme', 'siparis-iptal', 'talep', 'karsilama',
  'satis-teklifi', 'satis-siparisi', 'siparisler-teklifi', 'siparisler-siparisi'
));
