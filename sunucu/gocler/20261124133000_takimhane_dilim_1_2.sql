-- 3613 Takımhane Dilim 1-2: kişi konumu (V5), iade durumu ve nedeni, takım özelliği, emrin takım listesi, sayfa işlemi.
-- Yalnız genişletir: var olan konum ve teslim satırı değişmez; veri silinmez ya da dönüşmez.

-- Kişi konumu (zimmet): kişiye bağlı, kişi başına tek. Konum türü listesi bugüne kadar hep DROP/ADD ile genişledi.
ALTER TABLE stok_konum
  DROP CONSTRAINT stok_konum_tur_degeri,
  ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon', 'ara_alan', 'hurda', 'yolda',
    'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet', 'kisi')),
  ADD COLUMN kisi_id int CONSTRAINT stok_konum_kisi_var REFERENCES kisi (id),
  ADD CONSTRAINT stok_konum_kisi_turu CHECK ((tur = 'kisi') = (kisi_id IS NOT NULL)),
  ADD CONSTRAINT stok_konum_kisi_tek UNIQUE (kisi_id);

-- İade durumu: iade eden taraf bildirir, depo alırken görür. Hedef konumla uyumu CHECK ile yazılamaz (konumun türü başka satırda);
-- kural sunucuda saf fonksiyondur (stok/kurallar.ts iadeHedefTuru). Kırık iade nedensiz olmaz.
ALTER TABLE stok_teslim
  ADD COLUMN iade_durumu text CONSTRAINT stok_teslim_iade_durumu CHECK (iade_durumu IN ('saglam', 'asinmis', 'kirik')),
  ADD COLUMN iade_nedeni text CONSTRAINT stok_teslim_iade_nedeni CHECK (btrim(iade_nedeni) <> '' AND length(iade_nedeni) <= 200),
  ADD CONSTRAINT stok_teslim_kirik_nedeni CHECK (iade_durumu IS DISTINCT FROM 'kirik' OR iade_nedeni IS NOT NULL),
  ADD CONSTRAINT stok_teslim_iade_nedeni_durumlu CHECK (iade_nedeni IS NULL OR iade_durumu IS NOT NULL);

-- Takıma özgü özellik; bakiye Stok'tadır (tek defter). Kart başına tek satır; boş alan null.
CREATE TABLE takimhane_ozellik (
  kart_no int PRIMARY KEY CONSTRAINT takimhane_ozellik_kart REFERENCES malzeme_katalog_karti (no) ON DELETE CASCADE,
  sinif text NOT NULL CONSTRAINT takimhane_ozellik_sinif CHECK (sinif IN ('kesici-uc', 'freze', 'matkap', 'rayba', 'tutucu', 'olcu-ucu', 'diger')),
  cap_mm numeric(7,3) CONSTRAINT takimhane_ozellik_cap CHECK (cap_mm > 0),
  kesici_sayisi int CONSTRAINT takimhane_ozellik_kesici CHECK (kesici_sayisi > 0),
  iso_kodu text CONSTRAINT takimhane_ozellik_iso CHECK (btrim(iso_kodu) <> '' AND length(iso_kodu) <= 40),
  malzeme_gruplari text[] NOT NULL DEFAULT '{}' CONSTRAINT takimhane_ozellik_gruplar CHECK (malzeme_gruplari <@ ARRAY['P', 'M', 'K', 'N', 'S', 'H']),
  yeniden_bilenir boolean NOT NULL DEFAULT false,
  izleme text NOT NULL DEFAULT 'adet' CONSTRAINT takimhane_ozellik_izleme CHECK (izleme IN ('adet', 'tekil')),
  surum int NOT NULL DEFAULT 1
);

-- Emrin takım listesi (cep, takım, adet). Listeyi CNC kurulum üretecek; bu ilk dilimde Takımhane yazar ve okur.
CREATE TABLE takimhane_emir_takimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL CONSTRAINT takimhane_emir_takimi_emir REFERENCES uretim_emri (id) ON DELETE CASCADE,
  cep text NOT NULL CONSTRAINT takimhane_emir_takimi_cep CHECK (btrim(cep) <> '' AND length(cep) <= 12),
  kart_no int NOT NULL CONSTRAINT takimhane_emir_takimi_kart REFERENCES malzeme_katalog_karti (no),
  adet int NOT NULL CONSTRAINT takimhane_emir_takimi_adet CHECK (adet > 0),
  CONSTRAINT takimhane_emir_takimi_tek UNIQUE (uretim_emri_id, cep, kart_no)
);
CREATE INDEX takimhane_emir_takimi_kart_fk_idx ON takimhane_emir_takimi (kart_no);

-- Sayfa görünürlüğü: stok sayfasını gören roller; bakım yalnız okur (yazma uçları stok işlemleriyle korunur).
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'sayfa.takimhane'
  FROM rol r
 WHERE r.kod IN ('depo', 'mudur', 'genel_mudur', 'genel_mudur_yardimcisi', 'uretim_muduru', 'bakim')
ON CONFLICT DO NOTHING;

-- Takım verme/alma (kullanıcı kararı 24.11, S2 "Yalnız takım ver/al"): takıma özgü işlem; genel stok.transfer'den ayrıdır. Daha önce takımhane uçlarını
-- stok.transfer ile kullanan roller (depo, müdür, genel müdür, yardımcısı) işlemi korur.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'takimhane.cikis-iade'
  FROM rol r
 WHERE r.kod IN ('depo', 'mudur', 'genel_mudur', 'genel_mudur_yardimcisi')
ON CONFLICT DO NOTHING;

-- Takımhane operatörü (kullanıcı kararı 24.11, S1): görme ve takım verme/alma; onay, tanım ve ayar işlemi yok. Başlangıç stoğu (stok.giris) ve
-- kart ayarı (stok.malzeme-ayari) verilmez. Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('takimhane_operatoru', 'Takımhane Operatörü', true, false);

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, m.islem
  FROM rol r
 CROSS JOIN (VALUES
    ('sayfa.takimhane'), ('sayfa.stok'), ('takimhane.cikis-iade'),
    ('sayfa.profil'), ('sayfa.bildirim-merkezi'), ('sayfa.ortak-dosyalar'),
    ('sayfa.ik-islemlerim'), ('ik.izin-talep'), ('ik.bordro-gordum'),
    ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz')
  ) AS m (islem)
 WHERE r.kod = 'takimhane_operatoru'
ON CONFLICT (rol_id, islem) DO NOTHING;
