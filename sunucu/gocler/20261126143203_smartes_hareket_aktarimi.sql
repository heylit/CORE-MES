-- 3760: SmartES iş emri hareketleri (ACTIVITY), kullanıcı eşlemesi ve hurda türleri CORE'a aktarılır. Yalnız ekler: türler genişler,
-- yeni tablo açılır; var olan satır değişmez.

-- SmartES kullanıcısı (UsersList) CORE kişisine eşlenir: tmi_id kişi kimliğidir. Kullanıcı listesi öteki SmartES listeleriyle okunur.
ALTER TABLE smartes_esleme DROP CONSTRAINT smartes_esleme_tur;
ALTER TABLE smartes_esleme ADD CONSTRAINT smartes_esleme_tur CHECK (tur IN ('istasyon', 'is-merkezi', 'makine', 'operasyon-tipi', 'durus-nedeni', 'kullanici'));
ALTER TABLE smartes_liste_kaydi DROP CONSTRAINT smartes_liste_kaydi_tur;
ALTER TABLE smartes_liste_kaydi ADD CONSTRAINT smartes_liste_kaydi_tur CHECK (tur IN ('istasyon', 'makine', 'operasyon', 'fire', 'durus', 'kullanici'));
ALTER TABLE smartes_liste_okuma DROP CONSTRAINT smartes_liste_okuma_tur;
ALTER TABLE smartes_liste_okuma ADD CONSTRAINT smartes_liste_okuma_tur CHECK (tur IN ('istasyon', 'makine', 'operasyon', 'fire', 'durus', 'kullanici'));

-- Fire adının sonucu: hurda, hatalı parça (kalite kararı) ya da sağlamdan düşen sayım düzeltmesi ("Fazla M30").
ALTER TABLE smartes_ad_esleme DROP CONSTRAINT smartes_ad_esleme_sonuc;
ALTER TABLE smartes_ad_esleme ADD CONSTRAINT smartes_ad_esleme_sonuc CHECK (sonuc IS NULL OR sonuc IN ('hatali', 'hurda', 'sayim-duzeltme'));

-- Onay kuyruğu hurda satırlarını da taşır: hurda satırı SmartES red kaydından gelir (red_id), sağlam satırı iş emri durumundan (smartes_id).
-- Tür onaylanınca yazılacak kaydı söyler; fire adı eşlenmemişse satır türsüz değil "hurda" girer ve onay eşleme ister.
ALTER TABLE smartes_adet_onayi DROP CONSTRAINT smartes_adet_onayi_tur;
ALTER TABLE smartes_adet_onayi ADD CONSTRAINT smartes_adet_onayi_tur CHECK (tur IN ('saglam', 'red', 'hurda', 'sayim-duzeltme', 'hatali'));
ALTER TABLE smartes_adet_onayi ALTER COLUMN smartes_id DROP NOT NULL;
ALTER TABLE smartes_adet_onayi ADD COLUMN red_id bigint REFERENCES smartes_red;
ALTER TABLE smartes_adet_onayi ADD CONSTRAINT smartes_adet_onayi_kaynak CHECK ((smartes_id IS NULL) <> (red_id IS NULL));
-- Bir red kaydı kuyruğa bir kez girer; SmartES'te sonradan değişen adet ayrı düzeltme satırıdır.
CREATE INDEX smartes_adet_onayi_red ON smartes_adet_onayi (red_id, id) WHERE red_id IS NOT NULL;

-- Hareket izi: SmartES iş emri satırının okumalar arasındaki ACTIVITY değişiminden türetilen CORE komutları, sırasıyla. Aynı satırın aynı
-- sıradaki hareketi bir kez yazılır (birincil anahtar). Kişi eşlenmemişse "kisi-bekliyor": eşleme yapılınca aynı anla yazılır.
-- "hata": CORE komutu reddetti; ileti saklanır, sonraki hareketler o satırda bekler (sıra bozulmaz). "inceleme": SmartES'te zaten yazılmış
-- bir hareketin zamanı değişti; CORE kaydı kendiliğinden değişmez, izlemede görünür.
CREATE TABLE smartes_hareket (
  smartes_id bigint NOT NULL REFERENCES smartes_is_emri_durumu,
  sira int NOT NULL CONSTRAINT smartes_hareket_sira CHECK (sira > 0),
  tur text NOT NULL CONSTRAINT smartes_hareket_tur CHECK (tur IN ('ayar', 'baslat', 'duraklat', 'devam', 'durdur', 'bitir', 'zaman-degisti')),
  an timestamptz NOT NULL,
  aktivite int,
  aktivite_adi text CONSTRAINT smartes_hareket_aktivite_adi CHECK (aktivite_adi IS NULL OR length(aktivite_adi) <= 200),
  smartes_kullanici text CONSTRAINT smartes_hareket_smartes_kullanici CHECK (smartes_kullanici IS NULL OR length(smartes_kullanici) <= 200),
  durum text NOT NULL DEFAULT 'bekliyor'
    CONSTRAINT smartes_hareket_durum CHECK (durum IN ('bekliyor', 'kisi-bekliyor', 'yazildi', 'hata', 'inceleme')),
  kisi_id int REFERENCES kisi,
  -- Eşlenmemiş duruş adı sabit "Eşlenmemiş (SmartES)" nedeniyle yazılır; neden eşlenince kayıt düzeltilir.
  durus_nedeni_id int CONSTRAINT smartes_hareket_durus_nedeni_id CHECK (durus_nedeni_id IS NULL OR durus_nedeni_id > 0),
  durus_eslenmemis boolean NOT NULL DEFAULT false,
  hata text CONSTRAINT smartes_hareket_hata CHECK (hata IS NULL OR (btrim(hata) <> '' AND length(hata) <= 2000)),
  olusma timestamptz NOT NULL,
  yazilma timestamptz,
  PRIMARY KEY (smartes_id, sira),
  CONSTRAINT smartes_hareket_yazildi_butun CHECK ((durum = 'yazildi') = (yazilma IS NOT NULL) AND (durum <> 'yazildi' OR kisi_id IS NOT NULL)),
  CONSTRAINT smartes_hareket_hata_butun CHECK ((durum = 'hata') = (hata IS NOT NULL))
);
CREATE INDEX smartes_hareket_bekleyen ON smartes_hareket (smartes_id, sira) WHERE durum IN ('bekliyor', 'kisi-bekliyor');
CREATE INDEX smartes_hareket_eslenmemis_durus ON smartes_hareket (smartes_id, sira) WHERE durus_eslenmemis;
