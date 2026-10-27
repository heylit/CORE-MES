-- İlk parça onayı adımın seçimidir (kart 744, karar 744 a): "yok" ya da "her kurulumda". Arkon'un ilk parça kapısı emir yerine adım
-- başına çalışır ve seçimi buradan okur; paket kuralının varsayılanı da budur. Var olan adımlar "her kurulumda" olur: bugünkü davranış
-- (talaşlı pakette ilk parça açık) değişmez. Yayındaki revizyon değişmez (tetikleyici taslağı denetler); sütun eklemek satır yazmaz.
ALTER TABLE rota_adimi
  ADD COLUMN ilk_parca text NOT NULL DEFAULT 'her_kurulum' CONSTRAINT rota_adimi_ilk_parca CHECK (ilk_parca IN ('yok', 'her_kurulum'));
