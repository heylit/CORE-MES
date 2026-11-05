-- Elle bildirim (2147-1 a, 2147-2 c, 2147-3 a): yetkilinin hazırladığı uyarı, duyuru, bilgi ya da acil haber. Alıcılar
-- yayın anında çözülür ve her birine `bildirim_kaydi` satırı yazılır; sonradan role ya da istasyona giren görmez.
-- Yayın düzenlenmez ve silinmez; geri çekilir.
CREATE TABLE bildirim_yayini (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  yazan_kisi_id int NOT NULL CONSTRAINT bildirim_yayini_yazan_fk REFERENCES kisi,
  tur text NOT NULL CONSTRAINT bildirim_yayini_tur_gecerli CHECK (tur IN ('uyari', 'duyuru', 'bilgi', 'acil')),
  simge text NOT NULL CONSTRAINT bildirim_yayini_simge_gecerli CHECK (simge ~ '^[a-z0-9-]{1,40}$'),
  baslik text NOT NULL CONSTRAINT bildirim_yayini_baslik_gecerli CHECK (length(btrim(baslik)) BETWEEN 1 AND 200),
  metin text CONSTRAINT bildirim_yayini_metin_gecerli CHECK (metin IS NULL OR length(metin) <= 1000),
  -- Görsel dosya modülünün yerel deposundadır (bağ kaydı `yayin:<id>`); burada yalnız içerik özeti durur.
  gorsel_ozet text CONSTRAINT bildirim_yayini_gorsel_gecerli CHECK (gorsel_ozet IS NULL OR gorsel_ozet ~ '^[0-9a-f]{64}$'),
  gorsel_ad text CONSTRAINT bildirim_yayini_gorsel_ad_gecerli CHECK (gorsel_ad IS NULL OR length(gorsel_ad) BETWEEN 1 AND 255),
  hedef_turu text NOT NULL CONSTRAINT bildirim_yayini_hedef_gecerli CHECK (hedef_turu IN ('herkes', 'rol', 'istasyon', 'kisi')),
  ortada boolean NOT NULL,
  onay_istenir boolean NOT NULL,
  -- Yayın zamanı: alıcılara yazıldığı an. İleri tarihli yayın zamanlanmış işle yazılır; o zamana kadar `dagitildi` boştur.
  yayin_zamani timestamptz NOT NULL,
  -- Bitişten sonra ortada çıkmaz ve yeni yazılmaz; merkezdeki kayıt kalır.
  bitis timestamptz,
  dagitildi timestamptz,
  alici_sayisi int CONSTRAINT bildirim_yayini_alici_gecerli CHECK (alici_sayisi IS NULL OR alici_sayisi >= 0),
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  geri_cekildi timestamptz,
  geri_ceken_kisi_id int CONSTRAINT bildirim_yayini_geri_ceken_fk REFERENCES kisi,
  CONSTRAINT bildirim_yayini_gorsel_ciftli CHECK ((gorsel_ozet IS NULL) = (gorsel_ad IS NULL)),
  CONSTRAINT bildirim_yayini_bitis_sonra CHECK (bitis IS NULL OR bitis > yayin_zamani),
  CONSTRAINT bildirim_yayini_dagitim_sayili CHECK ((dagitildi IS NULL) = (alici_sayisi IS NULL)),
  CONSTRAINT bildirim_yayini_geri_cekme_ciftli CHECK ((geri_cekildi IS NULL) = (geri_ceken_kisi_id IS NULL))
);
CREATE INDEX bildirim_yayini_yazan ON bildirim_yayini (yazan_kisi_id, olusturuldu DESC, id DESC);
CREATE INDEX bildirim_yayini_bekleyen ON bildirim_yayini (yayin_zamani) WHERE dagitildi IS NULL AND geri_cekildi IS NULL;

-- Hedef kimlikleri hedef türüne göre rol, istasyon ya da kişidir; herkese yayında satır yoktur. Tek sütun birden çok tabloyu
-- gösterdiği için yabancı anahtar yoktur: kimlik yayın anında sahibinin `disari.ts` okumasıyla sınanır.
CREATE TABLE bildirim_yayin_hedefi (
  yayin_id int NOT NULL CONSTRAINT bildirim_yayin_hedefi_yayin_fk REFERENCES bildirim_yayini ON DELETE CASCADE,
  hedef_id int NOT NULL CONSTRAINT bildirim_yayin_hedefi_kimlik_gecerli CHECK (hedef_id > 0),
  CONSTRAINT bildirim_yayin_hedefi_pk PRIMARY KEY (yayin_id, hedef_id)
);

-- Kişinin satırı yayına bağlanır. Eklenen sütunlar boş ya da varsayılanlıdır: var olan otomatik bildirimler değişmez.
ALTER TABLE bildirim_kaydi
  ADD COLUMN yayin_id int CONSTRAINT bildirim_kaydi_yayin_fk REFERENCES bildirim_yayini,
  ADD COLUMN ortada boolean NOT NULL DEFAULT false,
  ADD COLUMN onay_istenir boolean NOT NULL DEFAULT false,
  ADD COLUMN onaylandi timestamptz,
  ADD CONSTRAINT bildirim_kaydi_onay_istenmis CHECK (onaylandi IS NULL OR onay_istenir),
  ADD CONSTRAINT bildirim_kaydi_onay_okunmus CHECK (onaylandi IS NULL OR okundu IS NOT NULL);
CREATE UNIQUE INDEX bildirim_kaydi_yayin_kisi ON bildirim_kaydi (yayin_id, kisi_id) WHERE yayin_id IS NOT NULL;
-- Ekran ortası: kişinin onay bekleyen ya da okunmamış ortadaki satırları.
CREATE INDEX bildirim_kaydi_ortada ON bildirim_kaydi (kisi_id, id) WHERE ortada AND arsivlendi IS NULL;
