-- 2224-2 b: bakiyenin bu konuma gelişi. ilk_giris transferde kaynaktan taşınır (ilk giren ilk çıkar sırası, depoya ilk giriş);
-- konuma_gelis taşınmaz, "bu konumda ne kadardır" sorusunun cevabıdır. Değeri stok servisi her bakiye yazımında hareketlerden
-- yeniler: konuma giren hareketler yeniden eskiye toplanır, eldeki miktarı karşılayan giriş anı alınır. Aynı konumda kalan statü
-- ve kalite değişimi geliş sayılmaz, geri alınmış giriş sayılmaz.
-- Dolu tablo: var olan satırlar aynı kuralla hareketlerden doldurulur; giriş hareketi bulunmayan satır boş kalır (uydurulmaz,
-- ilk_giris'ten tahmin edilmez). Doldurma türetilmiş bir alandır, satır değişikliği değildir; değişiklik defterine yazılmaz.
-- Geri alma: ALTER TABLE stok_bakiye DROP COLUMN konuma_gelis; başka sütun ve satır değişmez.
ALTER TABLE stok_bakiye ADD COLUMN konuma_gelis timestamptz;

ALTER TABLE stok_bakiye DISABLE TRIGGER stok_bakiye_degisiklik;
UPDATE stok_bakiye b SET konuma_gelis = (
  SELECT z.zaman FROM (
    SELECT h.zaman, sum(h.miktar) OVER (ORDER BY h.zaman DESC, h.id DESC) AS toplam
    FROM stok_hareketi h
    WHERE h.hedef_konum_id = b.konum_id AND h.malzeme_id = b.malzeme_id AND h.parti_id IS NOT DISTINCT FROM b.parti_id
      AND h.tur IN ('giris', 'transfer', 'sayim_fazla') AND h.kaynak_konum_id IS DISTINCT FROM h.hedef_konum_id
      AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)
  ) z
  ORDER BY (z.toplam < b.miktar), CASE WHEN z.toplam >= b.miktar THEN z.toplam ELSE -z.toplam END
  LIMIT 1
);
ALTER TABLE stok_bakiye ENABLE TRIGGER stok_bakiye_degisiklik;

-- Yeni satır açıldığı anda gelmiştir; servis hemen ardından hareketten yeniler. Varsayılan doldurmadan sonra eklenir ki var olan
-- satırlar göçün zamanını almasın.
ALTER TABLE stok_bakiye ALTER COLUMN konuma_gelis SET DEFAULT now();
CREATE INDEX stok_bakiye_konuma_gelis_idx ON stok_bakiye (konuma_gelis, id);

DO $$
DECLARE dolu bigint; bos bigint;
BEGIN
  SELECT count(*) FILTER (WHERE konuma_gelis IS NOT NULL), count(*) FILTER (WHERE konuma_gelis IS NULL) INTO dolu, bos FROM stok_bakiye;
  RAISE NOTICE 'stok_bakiye_konuma_gelis: % satir hareketten dolduruldu, % satirin giris hareketi yok (bos kaldi).', dolu, bos;
END $$;
