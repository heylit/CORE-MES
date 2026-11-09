-- 2540 (2544 a, 2546 a): kalanı kapatılmış siparişte avans gerçekleşen teslim değerini aşarsa aşan kısım tedarikçi alacağı olarak
-- finansa yazılır. Sistem avansın ödendiğini bilmez (ödeme siparişe bağlı değil): kayıt "teyit bekliyor" başlar, finans açar ya da
-- düşürür. Tutar KDV dahil, sipariş dövizindedir. Yalnız ekleme: yeni tablo ve tetikler; dolu tabloya dokunulmaz, veri değişmez.
CREATE TABLE finans_tedarikci_alacagi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  satin_alma_talep_id uuid NOT NULL,
  satin_alma_teklif_id uuid NOT NULL,
  siparis_no text NOT NULL CONSTRAINT finans_tedarikci_alacagi_siparis_no CHECK (length(siparis_no) BETWEEN 1 AND 40),
  firma_id int NOT NULL CONSTRAINT finans_tedarikci_alacagi_firma REFERENCES musteri_tedarikci_firma (id),
  para_birimi char(3) NOT NULL CONSTRAINT finans_tedarikci_alacagi_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_tedarikci_alacagi_tutar CHECK (tutar > 0),
  durum text NOT NULL DEFAULT 'teyit_bekliyor'
    CONSTRAINT finans_tedarikci_alacagi_durum CHECK (durum IN ('teyit_bekliyor', 'acik', 'dusuldu', 'kapandi')),
  aciklama text CONSTRAINT finans_tedarikci_alacagi_aciklama CHECK (length(aciklama) <= 500),
  durum_degistiren_id int CONSTRAINT finans_tedarikci_alacagi_degistiren REFERENCES kisi (id),
  durum_zamani timestamptz,
  olusturan_id int NOT NULL CONSTRAINT finans_tedarikci_alacagi_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1 CONSTRAINT finans_tedarikci_alacagi_surum CHECK (surum >= 1),
  -- Düşürme ve kapatma gerekçesiz olamaz; durum değişikliği kişi ve zamanla birlikte yazılır.
  CONSTRAINT finans_tedarikci_alacagi_gerekce CHECK (durum NOT IN ('dusuldu', 'kapandi') OR length(btrim(aciklama)) > 0),
  CONSTRAINT finans_tedarikci_alacagi_durum_kisi CHECK ((durum = 'teyit_bekliyor') = (durum_degistiren_id IS NULL) AND (durum_degistiren_id IS NULL) = (durum_zamani IS NULL)),
  -- Para kaydı sessizce kaybolmaz: alacağı olan sipariş silinemez (satın alma 409 ile önceden reddeder).
  CONSTRAINT finans_tedarikci_alacagi_siparis FOREIGN KEY (satin_alma_talep_id, satin_alma_teklif_id)
    REFERENCES satin_alma_siparis (talep_id, teklif_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX finans_tedarikci_alacagi_siparis_tek ON finans_tedarikci_alacagi (satin_alma_talep_id, satin_alma_teklif_id);
CREATE INDEX finans_tedarikci_alacagi_durum_sirasi ON finans_tedarikci_alacagi (durum, id);

CREATE TRIGGER finans_tedarikci_alacagi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON finans_tedarikci_alacagi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
-- Plan satırı (talep, teklif, sıra) ile izlenir; kimlik dışarıda kalır (plan yazımı upsert'tir, yalnız değişen alan deftere düşer).
CREATE TRIGGER finans_siparis_odemesi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON finans_siparis_odemesi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('satin_alma_talep_id,satin_alma_teklif_id,sira', 'id');
