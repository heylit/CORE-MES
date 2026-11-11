-- D7 (kartlar 2986 a, 2987 a): Logo'da CORE MES dışında açılmış satın alma siparişinin düzeltmesi Logo kuyruğuyla gider; bu tablo düzeltme işidir.
-- Yalnız yeni ve boş tablo ile yeni işlemin bir role verilmesi; var olan veri değişmez. İstek (duzeltme) ve gönderilen gövde fiyat taşır,
-- yalnız logo modülü okur; listede yalnız fiyatsız özet döner. Komut Logo'yu okumaz (transaction köprüyü beklemesin): iş gönderimden hemen önce
-- Logo'yu yeniden okur, okuma anının izi (iz) tutmazsa yazmaz; Logo kayıt numarası da istemciden değil bu okumadan gelir.
CREATE TABLE logo_dis_siparis_duzeltme (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fis_no text NOT NULL CONSTRAINT logo_dis_siparis_duzeltme_fis_no CHECK (fis_no = btrim(fis_no) AND char_length(fis_no) BETWEEN 1 AND 16),
  iz text NOT NULL CONSTRAINT logo_dis_siparis_duzeltme_iz CHECK (iz ~ '^[0-9a-f]{64}$'),
  duzeltme jsonb NOT NULL,
  -- İşin okumasından: Logo kayıt numarası, kurulan gövde ve fiyatsız özet; gövde kurulamadıysa boş.
  logo_kayit_no int CONSTRAINT logo_dis_siparis_duzeltme_kayit_no CHECK (logo_kayit_no IS NULL OR logo_kayit_no > 0),
  govde jsonb,
  ozet jsonb,
  durum text NOT NULL DEFAULT 'bekliyor'
    CONSTRAINT logo_dis_siparis_duzeltme_durum CHECK (durum IN ('bekliyor', 'gonderildi', 'reddedildi', 'hata')),
  hata text CONSTRAINT logo_dis_siparis_duzeltme_hata_metni CHECK (hata IS NULL OR (btrim(hata) <> '' AND char_length(hata) <= 500)),
  kisi_id int NOT NULL REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now(),
  sonuc_zamani timestamptz,
  CONSTRAINT logo_dis_siparis_duzeltme_sonuc CHECK ((durum = 'bekliyor') = (sonuc_zamani IS NULL)),
  CONSTRAINT logo_dis_siparis_duzeltme_hata CHECK ((durum IN ('reddedildi', 'hata')) = (hata IS NOT NULL)),
  CONSTRAINT logo_dis_siparis_duzeltme_gonderilen CHECK (durum <> 'gonderildi' OR (govde IS NOT NULL AND ozet IS NOT NULL AND logo_kayit_no IS NOT NULL))
);
-- Aynı Logo siparişine bekleyen ikinci düzeltme açılmaz: ikisi aynı okumaya dayanır, ikincisi birincinin yazdığını ezerdi.
CREATE UNIQUE INDEX logo_dis_siparis_duzeltme_tek_bekleyen ON logo_dis_siparis_duzeltme (fis_no) WHERE durum = 'bekliyor';
CREATE INDEX logo_dis_siparis_duzeltme_kuyruk ON logo_dis_siparis_duzeltme (durum, id);
CREATE INDEX logo_dis_siparis_duzeltme_fis ON logo_dis_siparis_duzeltme (fis_no, id);
CREATE INDEX logo_dis_siparis_duzeltme_kisi_fk_idx ON logo_dis_siparis_duzeltme (kisi_id);

-- Kart 2986 a: okuma ve düzeltme yalnız yönetici (bayraklı rol, satır taşımaz) ve Satın Alma Müdürü'nde. Yalnız ekler.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'satin_alma_muduru'), 'logo.siparis-duzelt'
ON CONFLICT (rol_id, islem) DO NOTHING;
