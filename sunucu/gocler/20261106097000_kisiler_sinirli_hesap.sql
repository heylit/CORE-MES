-- Sınırlı hesap (kart 2158, kararlar 2158-1 a, 2158-5 a): denetçi, misafir, finansçı gibi dış ya da geçici kişi. Hesap yalnız okur;
-- yazması çekirdekte yalnız oturum modülüne açıktır. Bitiş tarihi ve hesaptan sorumlu iç kişi zorunludur; bitişten sonra kişi
-- kullanıcı sayılmaz. Gizlilik taahhüdü onaylanmadan oturum modülü dışına girilmez.
-- Var olan satırlar 'ic' olur, öteki sütunlar boş kalır: dolu tablonun verisi değişmez.
ALTER TABLE kisi
  ADD COLUMN hesap_turu text NOT NULL DEFAULT 'ic' CONSTRAINT kisi_hesap_turu_secenek CHECK (hesap_turu IN ('ic', 'sinirli')),
  ADD COLUMN sinirli_bitis date,
  ADD COLUMN sinirli_sorumlu_id int CONSTRAINT kisi_sinirli_sorumlu_fk REFERENCES kisi,
  ADD COLUMN gizlilik_taahhudu timestamptz,
  ADD CONSTRAINT kisi_sinirli_butun CHECK (
    (hesap_turu = 'ic' AND sinirli_bitis IS NULL AND sinirli_sorumlu_id IS NULL AND gizlilik_taahhudu IS NULL)
    OR (hesap_turu = 'sinirli' AND sinirli_bitis IS NOT NULL AND sinirli_sorumlu_id IS NOT NULL AND sinirli_sorumlu_id <> id)
  );
