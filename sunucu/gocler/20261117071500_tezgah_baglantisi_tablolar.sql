-- Tezgah bağlantısı denemesi (kart 3373, ADR 0033): tezgahların ortak MTConnect servisinden okunan son değerler ve durum örnekleri.
-- Yalnız yeni boş tablolar; üretim kaydına, sayıma ve stoğa bağ yoktur.

-- Tezgah başına son okuma (tek satır). Tezgahın yayınlamadığı alan boştur; sıfır uydurulmaz.
CREATE TABLE tezgah_okuma (
  cihaz_adi text PRIMARY KEY CONSTRAINT tezgah_okuma_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  durum text NOT NULL CONSTRAINT tezgah_okuma_durum CHECK (durum IN ('calisiyor', 'bekliyor', 'alarm', 'baglanti-yok', 'bilinmiyor')),
  calisma text,
  mod text,
  program text,
  sayac int,
  takim text,
  is_mili_hizi numeric,
  is_mili_yuku numeric,
  ilerleme numeric,
  alarm text,
  -- Tezgahın yayınladığı bütün öğeler, geldiği adla.
  ogeler jsonb NOT NULL CONSTRAINT tezgah_okuma_ogeler CHECK (jsonb_typeof(ogeler) = 'array'),
  okundu timestamptz NOT NULL
);

-- Durum değiştikçe bir satır; deneme süresince iki kaynağın geçmişi karşılaştırılabilsin diye. Otuz günden eski satırı okuma işi siler.
CREATE TABLE tezgah_ornek (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_adi text NOT NULL CONSTRAINT tezgah_ornek_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  zaman timestamptz NOT NULL,
  durum text NOT NULL CONSTRAINT tezgah_ornek_durum CHECK (durum IN ('calisiyor', 'bekliyor', 'alarm', 'baglanti-yok', 'bilinmiyor')),
  sayac int
);
CREATE INDEX tezgah_ornek_zaman ON tezgah_ornek (zaman, id);
