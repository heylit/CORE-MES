-- 885 a: demirbaş kartı ölçü aletini Kalibrasyon'daki aletle anar; kalibrasyon değerlerinin sahibi Kalibrasyon'dur, karttaki eski alanlar
-- salt okunur kalır. Bağ jsonb içinde (`kayit.g.aletNo`) yabancı anahtar taşıyamaz; ayrı sütunda alete bağlanır (tedarikçi firma bağıyla aynı kalıp).
-- Var olan kartlar boş kalır, veri taşınmaz. Alet silinirse kart bağsız kalır: kayıtsız alet silinebilir (Kalibrasyon KLB-S6), kart bunu engellemez.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN olcu_aleti_id int CONSTRAINT malzeme_katalog_karti_olcu_aleti REFERENCES olcu_aleti (id) ON DELETE SET NULL
    CONSTRAINT malzeme_katalog_karti_olcu_aleti_turu CHECK (olcu_aleti_id IS NULL OR tur = 'demirbas');

CREATE INDEX malzeme_katalog_karti_olcu_aleti ON malzeme_katalog_karti (olcu_aleti_id) WHERE olcu_aleti_id IS NOT NULL;
