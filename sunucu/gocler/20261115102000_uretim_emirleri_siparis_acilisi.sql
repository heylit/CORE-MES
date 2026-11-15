-- 3272: sipariş onayıyla kendiliğinden açılan emir işaretlenir (işi başlamamışken siparişi kilitlemez, 3272-3 a); yürürlükte rotası
-- olmayan kalemin emri "rota bekliyor" diye adımsız açılır, planlanmaz ve rota gelince dolar (3272-2 a). Var olan satırlar değişmez.
ALTER TABLE uretim_emri
  ADD COLUMN acilis_kaynagi text CONSTRAINT uretim_emri_acilis_kaynagi CHECK (acilis_kaynagi IN ('siparis_onayi')),
  ADD COLUMN rota_bekliyor boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT uretim_emri_rota_bekliyor_rotasiz CHECK (NOT rota_bekliyor OR kaynak_rota_revizyonu_id IS NULL);
