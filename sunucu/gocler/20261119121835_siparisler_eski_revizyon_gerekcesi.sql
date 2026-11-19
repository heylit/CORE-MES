-- 3438 a: kalem ailesinin yürürlükteki revizyonu dışında bir kartla açılırsa nedeni kalemde durur. Var olan satır boş kalır.
ALTER TABLE siparisler_siparis_satiri
  ADD COLUMN eski_revizyon_gerekcesi text
    CONSTRAINT siparisler_siparis_satiri_eski_revizyon_gerekcesi_bicimi
    CHECK (eski_revizyon_gerekcesi IS NULL OR (btrim(eski_revizyon_gerekcesi) <> '' AND length(eski_revizyon_gerekcesi) <= 300));
