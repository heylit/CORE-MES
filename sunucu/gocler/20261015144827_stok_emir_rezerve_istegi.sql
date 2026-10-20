-- Açılışta "Stoktan rezerve et" denen emir: girdisinin yetmeyen kısmı mal kabulde öncelik sırasıyla bu emre ayrılır (kullanıcı kararı 2026-10-15).
CREATE TABLE stok_emir_rezerve_istegi (
  uretim_emri_id int PRIMARY KEY REFERENCES uretim_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
