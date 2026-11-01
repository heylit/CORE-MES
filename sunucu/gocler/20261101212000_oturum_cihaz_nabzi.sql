-- Cihaz nabzı (kart 1666; kararlar 1619 a, 1621 a): oturumlu cihaz beş dakikada bir istemci sürümünü, çevrimdışı kuyruğunu, son
-- eşitlemesini ve JS hata sayısını bildirir; sessiz ve kuyruğu biriken cihaz panelde görünür. Kişi kimliği ve konum tutulmaz: cihaz
-- oturumla (ve kayıtlıysa ortak cihazla) tanınır. Zaman yalnız sunucudan. Yalnız yeni, boş tablolar.

-- Oturum başına son durum. Ortak cihazın oturumları aynı cihaz kimliğinde birleşir; kişisel cihaz oturumuyla tanınır.
CREATE TABLE oturum_cihaz_nabzi (
  oturum_id bigint PRIMARY KEY CONSTRAINT oturum_cihaz_nabzi_oturum_fk REFERENCES oturum ON DELETE CASCADE,
  ortak_cihaz_id bigint CONSTRAINT oturum_cihaz_nabzi_ortak_cihaz_fk REFERENCES oturum_ortak_cihaz ON DELETE SET NULL,
  ilk timestamptz NOT NULL,
  son timestamptz NOT NULL,
  istemci_surumu text CONSTRAINT oturum_cihaz_nabzi_surum CHECK (istemci_surumu IS NULL OR length(istemci_surumu) BETWEEN 1 AND 64),
  -- Kuyruğu olmayan istemcide (Arkon dışı) bilinmez: null.
  kuyruk int CONSTRAINT oturum_cihaz_nabzi_kuyruk CHECK (kuyruk IS NULL OR kuyruk >= 0),
  son_esitleme timestamptz,
  js_hata int NOT NULL CONSTRAINT oturum_cihaz_nabzi_js_hata CHECK (js_hata >= 0),
  CONSTRAINT oturum_cihaz_nabzi_sira CHECK (ilk <= son)
);
CREATE INDEX oturum_cihaz_nabzi_son ON oturum_cihaz_nabzi (son);
CREATE INDEX oturum_cihaz_nabzi_ortak_cihaz ON oturum_cihaz_nabzi (ortak_cihaz_id) WHERE ortak_cihaz_id IS NOT NULL;

-- Gün başına özet (1619 a: 30 gün). Nabız satırı tutulmaz; gün içindeki her nabız bu satırı günceller.
CREATE TABLE oturum_cihaz_nabzi_gunluk (
  gun date NOT NULL,
  oturum_id bigint NOT NULL CONSTRAINT oturum_cihaz_nabzi_gunluk_oturum_fk REFERENCES oturum ON DELETE CASCADE,
  ortak_cihaz_id bigint CONSTRAINT oturum_cihaz_nabzi_gunluk_ortak_cihaz_fk REFERENCES oturum_ortak_cihaz ON DELETE SET NULL,
  nabiz int NOT NULL CONSTRAINT oturum_cihaz_nabzi_gunluk_nabiz CHECK (nabiz >= 1),
  azami_kuyruk int CONSTRAINT oturum_cihaz_nabzi_gunluk_kuyruk CHECK (azami_kuyruk IS NULL OR azami_kuyruk >= 0),
  js_hata int NOT NULL CONSTRAINT oturum_cihaz_nabzi_gunluk_js_hata CHECK (js_hata >= 0),
  istemci_surumu text CONSTRAINT oturum_cihaz_nabzi_gunluk_surum CHECK (istemci_surumu IS NULL OR length(istemci_surumu) BETWEEN 1 AND 64),
  PRIMARY KEY (gun, oturum_id)
);
