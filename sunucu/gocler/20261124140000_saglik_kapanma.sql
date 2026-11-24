-- Sunucu kapanma kaydı (kart 3668, dilim A): sunucu düşüp bekçi yeniden açınca, açılışta tek satır yazılır (90 gün).
-- Yeni, boş tablo; başka tabloya bağlanmaz. Satırı yalnız saglik modülü yazar ve süresi geçeni siler.
-- Tanı ayrıntısı (son hata satırları, süren istekler, kapanmadan önceki dakikalık ölçüm) biçimi çok değişen ham iz olduğundan jsonb'dir
-- (UYUM-BORCU.md); sorgu yalnız zamana ve neden sınıfına göre yapılır.
CREATE TABLE saglik_kapanma (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT saglik_kapanma_pk PRIMARY KEY,
  -- Bekçinin "Sunucu kapandı" satırının zamanı; aynı satır bir kez kaydedilir.
  kapandi_an timestamptz NOT NULL CONSTRAINT saglik_kapanma_kapandi_benzersiz UNIQUE,
  acildi_an timestamptz NOT NULL,
  kapali_sn integer NOT NULL CONSTRAINT saglik_kapanma_kapali CHECK (kapali_sn >= 0),
  cikis_kodu integer,
  sinyal text,
  neden text NOT NULL CONSTRAINT saglik_kapanma_neden CHECK (neden IN (
    'bellek-tasmasi', 'yakalanmamis-hata', 'donma', 'ekrandan-yeniden-baslatma', 'guncelleme', 'bilinmiyor'
  )),
  -- Nedenin dayandığı kanıt, kısa metin ("rapor: heap out of memory"); neden bilinmiyorsa null.
  kanit text,
  yigin text,
  hata_satirlari jsonb NOT NULL DEFAULT '[]' CONSTRAINT saglik_kapanma_hata_satirlari CHECK (jsonb_typeof(hata_satirlari) = 'array'),
  suren_istekler jsonb NOT NULL DEFAULT '[]' CONSTRAINT saglik_kapanma_suren_istekler CHECK (jsonb_typeof(suren_istekler) = 'array'),
  bellek jsonb CONSTRAINT saglik_kapanma_bellek CHECK (bellek IS NULL OR jsonb_typeof(bellek) = 'object'),
  dakikalar jsonb NOT NULL DEFAULT '[]' CONSTRAINT saglik_kapanma_dakikalar CHECK (jsonb_typeof(dakikalar) = 'array')
);

CREATE INDEX saglik_kapanma_zaman ON saglik_kapanma (kapandi_an DESC);
