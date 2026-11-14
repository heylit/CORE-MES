-- 3173: "SmartES: sayım aktarımı" anahtarının açıldığını okuma turunun ilk gördüğü an. Anahtar kapalıyken başlamış SmartES satırı,
-- anahtar açılınca onaya girmesin diye saklanır; anahtar kapalıyken boştur. Tek satırlı tablo, yalnız ekleyen göç.
CREATE TABLE smartes_sayim_aktarimi (
  tek boolean CONSTRAINT smartes_sayim_aktarimi_pk PRIMARY KEY DEFAULT true CONSTRAINT smartes_sayim_aktarimi_tek CHECK (tek),
  acilis timestamptz
);
INSERT INTO smartes_sayim_aktarimi DEFAULT VALUES;
