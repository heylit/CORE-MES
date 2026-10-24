-- Malzeme fişi eşitleme (233, okuma teyidi 23.10.2026; sütunlar 269 a): emrin sarf ve üretimden giriş fişi hazırlıkta TMI'de boş açılır,
-- her sağlam ve hurda sayımı fişi "değişti" işaretler; Logo işi fişi silip aynı numarayla yeniden açarak, miktar sıfırsa silerek eşitler.
-- bekleyen_degisiklik: Logo'ya yansımamış değişiklik sayısı (sayaç, işaret değil: istek sürerken gelen sayım kaybolmasın).
-- son_satir_ozeti: Logo'daki fişin satırları (aynı satırlar yeniden gönderilmez); fiş Logo'da yoksa boş.
ALTER TABLE logo_malzeme_fisi_giden
  ADD COLUMN bekleyen_degisiklik int NOT NULL DEFAULT 0 CONSTRAINT logo_malzeme_fisi_giden_bekleyen CHECK (bekleyen_degisiklik >= 0),
  ADD COLUMN son_satir_ozeti text CONSTRAINT logo_malzeme_fisi_giden_son_satir_ozeti CHECK (son_satir_ozeti IS NULL OR length(son_satir_ozeti) <= 20000);

-- 'silindi': fiş Logo'da silindi (değiştiği ya da sıfıra indiği için); yeniden açmanın niyeti bu sonuçla yazılır. Silme reddedilirse fiş Logo'da durur:
-- başarısız sonuçta kayıt no kalabilir.
ALTER TABLE logo_malzeme_fisi_giden
  DROP CONSTRAINT logo_malzeme_fisi_giden_son_sonuc,
  DROP CONSTRAINT logo_malzeme_fisi_giden_butun,
  ADD CONSTRAINT logo_malzeme_fisi_giden_son_sonuc CHECK (
    son_sonuc IN ('gonderildi', 'zaten-vardi', 'silindi', 'reddedildi', 'yetkisiz', 'ulasilamadi', 'belirsiz', 'yazilamadi')),
  ADD CONSTRAINT logo_malzeme_fisi_giden_butun CHECK (
    (son_sonuc IS NULL) = (son_deneme IS NULL)
    AND (son_sonuc NOT IN ('gonderildi', 'zaten-vardi') OR logo_kayit_no IS NOT NULL)
    AND (son_sonuc IS DISTINCT FROM 'silindi' OR (logo_kayit_no IS NULL AND son_satir_ozeti IS NULL))
    AND (son_hata IS NOT NULL) = (son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi', 'silindi'))
    AND (son_sonuc NOT IN ('gonderildi', 'zaten-vardi') OR son_sonuc IS NULL OR niyet_zamani IS NULL)
  );

-- Logo'ya henüz gitmemiş eski fişler (emir bitince kuyruğa girmiş) bekleyen sayılır: gönderimleri bugünkü gibi sürer.
UPDATE logo_malzeme_fisi_giden SET bekleyen_degisiklik = 1 WHERE logo_kayit_no IS NULL;
