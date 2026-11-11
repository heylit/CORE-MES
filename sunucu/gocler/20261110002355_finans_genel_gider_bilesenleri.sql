-- 2594 b, 2612 a: genel gider aylık tutarı belgelerden bileşenleriyle kurulur. Eski satırlar 'elle' tek tutar olarak kalır (veri
-- dönüşmez). Belge satırında bileşenlerin hepsi bilinir ve aylık tutar onların toplamıdır; bilinmeyen bileşen sıfır sayılmaz,
-- satır kaydedilmez (2626 2/2 a). Gizli personel bileşenleri (2652 a) toplamda vardır, ayrı alanda yoktur.
ALTER TABLE finans_genel_gider_orani
  ADD COLUMN kaynak text NOT NULL DEFAULT 'elle' CONSTRAINT finans_genel_gider_orani_kaynak CHECK (kaynak IN ('elle', 'belge')),
  ADD COLUMN donem_baslangic date,
  ADD COLUMN donem_bitis date,
  ADD COLUMN kira numeric(18,2) CONSTRAINT finans_genel_gider_orani_kira CHECK (kira >= 0),
  ADD COLUMN amortisman numeric(18,2) CONSTRAINT finans_genel_gider_orani_amortisman CHECK (amortisman >= 0),
  ADD COLUMN dolayli_personel numeric(18,2) CONSTRAINT finans_genel_gider_orani_dolayli_personel CHECK (dolayli_personel >= 0),
  -- 2659 (2656 a): doğrudan işçilikte emilmeyen maaş; fazla emilimde eksidir, sıfıra kırpılmaz.
  ADD COLUMN emilmeyen_dogrudan numeric(18,2),
  ADD COLUMN diger numeric(18,2) CONSTRAINT finans_genel_gider_orani_diger CHECK (diger >= 0),
  ADD COLUMN projesiz_satin_alma numeric(18,2) CONSTRAINT finans_genel_gider_orani_projesiz_satin_alma CHECK (projesiz_satin_alma >= 0),
  ADD COLUMN elle_ek numeric(18,2) CONSTRAINT finans_genel_gider_orani_elle_ek CHECK (elle_ek >= 0),
  ADD COLUMN eksik text[],
  -- 2652 a: personel bileşenlerinden biri 3'ten az kişiyse ikisi de ayrı alan olarak tutulmaz; aylık tutar ve saat başı her yüzeyde gizlidir.
  ADD COLUMN personel_gizli boolean NOT NULL DEFAULT false;

ALTER TABLE finans_genel_gider_orani
  ADD CONSTRAINT finans_genel_gider_orani_donem CHECK (donem_baslangic IS NULL OR donem_bitis IS NULL OR donem_baslangic <= donem_bitis),
  ADD CONSTRAINT finans_genel_gider_orani_belge CHECK (kaynak <> 'belge' OR (
    donem_baslangic IS NOT NULL AND donem_bitis IS NOT NULL
    AND kira IS NOT NULL AND amortisman IS NOT NULL AND diger IS NOT NULL AND projesiz_satin_alma IS NOT NULL AND elle_ek IS NOT NULL
    AND (dolayli_personel IS NULL) = personel_gizli AND (emilmeyen_dogrudan IS NULL) = personel_gizli
    AND (personel_gizli OR aylik_genel_gider = kira + amortisman + dolayli_personel + emilmeyen_dogrudan + diger + projesiz_satin_alma + elle_ek)
    AND amortisman_dahil = (amortisman > 0))),
  ADD CONSTRAINT finans_genel_gider_orani_gizli CHECK (NOT personel_gizli OR kaynak = 'belge'),
  -- Elle ek yalnız belgesi olmayan kalemdir; açıklaması zorunludur (2612 a).
  ADD CONSTRAINT finans_genel_gider_orani_elle_ek_aciklama CHECK (coalesce(elle_ek, 0) = 0 OR aciklama IS NOT NULL);

-- 2643 b: bu andan önce oluşturulmuş siparişli belgeler genel gidere girmez ("dışarıda kalan: eski belge"). Yalnız yeni sütun dolar.
ALTER TABLE finans_ayar ADD COLUMN genel_gider_belge_esigi timestamptz;
UPDATE finans_ayar SET genel_gider_belge_esigi = now() WHERE id = 1;
