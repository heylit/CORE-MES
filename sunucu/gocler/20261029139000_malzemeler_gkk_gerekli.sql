-- 1247 d (kullanıcı teyidi 30.10.2026): kartın giriş kalite kontrolü (GKK) ayarı. Satın alma kabulünde ayarı açık kartın lotu
-- karantinaya karar bekliyor girer. Boş değer türün varsayılanıdır (hammadde, yarı mamul, ticari mal açık; öteki türler kapalı):
-- var olan kartlar yazılmaz, değişiklik defterine göç satırı düşmez. Demirbaş ve hizmet lot almaz, GKK'ya giremez.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN gkk_gerekli boolean
    CONSTRAINT malzeme_katalog_karti_gkk_turu CHECK (gkk_gerekli IS NOT TRUE OR tur NOT IN ('demirbas', 'hizmet'));
