-- P6 ve ilk sistemin plan ayarları (T4, #415). Canlı plana yalnız canlıya alma yazar; planlama işlemleri taslağa (senaryo) yazılır.
-- Taslak canlının tam kopyasıdır: yerleşimler, ayar ve yapılan değişikliklerin defteri. Var olan üç tabloya sütun eklenir; bu tablolarda
-- satır varsa göç hiçbir şeyi değiştirmeden durur (bu göçten önce plan iş emrine bağlı değildi; tabloların boş olması beklenir).
DO $$
DECLARE
  y int;
  sy int;
  s int;
BEGIN
  SELECT count(*) INTO y FROM plan_yerlesimi;
  SELECT count(*) INTO sy FROM plan_senaryo_yerlesimi;
  SELECT count(*) INTO s FROM plan_senaryosu;
  IF y + sy + s > 0 THEN
    RAISE EXCEPTION 'Plan tablolarında satır var (yerleşim %, senaryo yerleşimi %, senaryo %); göç durdu, hiçbir şey değişmedi.', y, sy, s;
  END IF;
END $$;

-- Elle sıra (KY-03): Kanban'da ya da kuyrukta elle dizilen iş; boşsa kural sırası. Dondurulmuş iş (prototip "dondurulmuş bölge")
-- kilitli gibi yerinde kalır, ama "Dondurmayı kaldır" yalnız bunları çözer.
ALTER TABLE plan_yerlesimi
  ADD COLUMN elle_sira int CONSTRAINT plan_yerlesimi_elle_sira CHECK (elle_sira > 0),
  ADD COLUMN dondurulmus boolean NOT NULL DEFAULT false;

ALTER TABLE plan_senaryo_yerlesimi
  ADD COLUMN elle_sira int CONSTRAINT plan_senaryo_yerlesimi_elle_sira CHECK (elle_sira > 0),
  ADD COLUMN dondurulmus boolean NOT NULL DEFAULT false;

-- Taslağın sürümü: her taslak yazması artırır; eski sürümle gelen yazma reddedilir (iki sekme, iki kişi).
ALTER TABLE plan_senaryosu
  ADD COLUMN aciklama text CONSTRAINT plan_senaryosu_aciklama CHECK (char_length(aciklama) <= 500),
  ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT plan_senaryosu_surum CHECK (surum > 0);

-- Plan ayarı (PL-07): sıralama kuralı, yön, tampon, dondurma; personel kısıtı ve taslak emirlerin plana girmesi (ikinci tarama).
CREATE TABLE plan_ayari (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT plan_ayari_tek CHECK (tek),
  kural text NOT NULL DEFAULT 'oncelik' CONSTRAINT plan_ayari_kural CHECK (kural IN ('oncelik', 'edd', 'cr', 'spt')),
  yon text NOT NULL DEFAULT 'ileri' CONSTRAINT plan_ayari_yon CHECK (yon IN ('ileri', 'geri')),
  tampon_gun numeric(4, 1) NOT NULL DEFAULT 2 CONSTRAINT plan_ayari_tampon CHECK (tampon_gun BETWEEN 0 AND 30),
  dondurma_gun int NOT NULL DEFAULT 2 CONSTRAINT plan_ayari_dondurma CHECK (dondurma_gun BETWEEN 0 AND 30),
  personel_kisiti boolean NOT NULL DEFAULT false,
  taslak_emirler boolean NOT NULL DEFAULT false,
  degistiren_kisi_id int REFERENCES kisi,
  degisme timestamptz
);
INSERT INTO plan_ayari DEFAULT VALUES;

CREATE TABLE plan_senaryo_ayari (
  senaryo_id int PRIMARY KEY REFERENCES plan_senaryosu,
  kural text NOT NULL CONSTRAINT plan_senaryo_ayari_kural CHECK (kural IN ('oncelik', 'edd', 'cr', 'spt')),
  yon text NOT NULL CONSTRAINT plan_senaryo_ayari_yon CHECK (yon IN ('ileri', 'geri')),
  tampon_gun numeric(4, 1) NOT NULL CONSTRAINT plan_senaryo_ayari_tampon CHECK (tampon_gun BETWEEN 0 AND 30),
  dondurma_gun int NOT NULL CONSTRAINT plan_senaryo_ayari_dondurma CHECK (dondurma_gun BETWEEN 0 AND 30),
  personel_kisiti boolean NOT NULL,
  taslak_emirler boolean NOT NULL
);

-- Taslağın değişiklik defteri: "Tüm değişiklikler" listesi, tek tek kaldırma (o iş emirleri canlıdaki hâline döner) ve yeniden
-- temellendirme (defterde olmayan iş emirleri canlıdan kopyalanır). Başka modülün verisini değiştiren deneme (öncelik, teslim, acil
-- sipariş, arıza, kapalı gün) veride tutulur; canlıya alma sahibin komutuyla yazar.
CREATE TABLE plan_senaryo_degisikligi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  senaryo_id int NOT NULL REFERENCES plan_senaryosu,
  tur text NOT NULL CONSTRAINT plan_senaryo_degisikligi_tur CHECK (tur IN (
    'oner', 'yerlestir', 'tasi', 'kaldir', 'kilitle', 'kilidi_ac', 'sirala', 'dondur', 'dondurmayi_kaldir', 'elle_sira_sil', 'ayar',
    'oncelik', 'teslim', 'acil_emir', 'makine_ariza', 'gun_kapat')),
  ozet text NOT NULL CONSTRAINT plan_senaryo_degisikligi_ozet CHECK (btrim(ozet) <> '' AND char_length(ozet) <= 300),
  is_emri_idleri int[] NOT NULL DEFAULT '{}',
  veri jsonb,
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  yazma timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_senaryo_degisikligi_senaryo_idx ON plan_senaryo_degisikligi (senaryo_id, id);
