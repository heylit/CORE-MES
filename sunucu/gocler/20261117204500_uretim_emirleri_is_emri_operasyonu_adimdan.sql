-- İş emrinin operasyon kimliği rota adımının kendi kimliğinden alınır, ürünün numara defterinden (malzeme, op_no) değil (3250-2):
-- OP numarası revizyonda yeniden dizilince defterdeki aynı numara başka operasyonu gösterebilir. Tek katmanlı emirde adım emrin kaynak
-- revizyonunda o numarayla, çok katmanlı emirde düğüm adımı emrin patlatmasındaki satırla bulunur. Var olan satırlar değişmez.
CREATE OR REPLACE FUNCTION uretim_emirleri_is_emri_operasyonu(p_emir int, p_tur text, p_op int, p_dugum_malzeme int, p_kaynak_op int)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_tur <> 'rota' THEN NULL
    WHEN p_dugum_malzeme IS NOT NULL THEN
      (SELECT a.operasyon_id FROM uretim_emri e
         JOIN rota_patlamis_rota p ON p.patlatma_id = e.patlatma_id AND p.malzeme_id = p_dugum_malzeme AND p.kaynak_op_no = p_kaynak_op
         JOIN rota_adimi a ON a.id = p.rota_adimi_id
        WHERE e.id = p_emir
        ORDER BY p.sira LIMIT 1)
    ELSE
      (SELECT a.operasyon_id FROM uretim_emri e
         JOIN rota_adimi a ON a.revizyon_id = e.kaynak_rota_revizyonu_id AND a.op_no = p_op
        WHERE e.id = p_emir)
  END
$$;
