-- 3438 a: emir kart ailesinin yürürlükteki revizyonu dışında bir kartla açılırsa nedeni emirde durur. Var olan emir boş kalır.
ALTER TABLE uretim_emri
  ADD COLUMN eski_revizyon_gerekcesi text
    CONSTRAINT uretim_emri_eski_revizyon_gerekcesi_bicimi
    CHECK (eski_revizyon_gerekcesi IS NULL OR (btrim(eski_revizyon_gerekcesi) <> '' AND length(eski_revizyon_gerekcesi) <= 300));
