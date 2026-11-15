-- Proses mühendisi rolü (kart 3289, kullanıcı kararı 3277-4 a): rota taslağını, talimatı, şartnameyi ve CNC kurulumunu yazar,
-- gerçekleşen süreyi kabul eder (plan ve maliyet hesabını değiştirir), değişiklik talebi açar ve revizyon hazırlar; onaylamaz.
-- Rota onayı ve şartname yayını, CNC kurulum hazırlık onayı, Kalite yazma ve onayı, değişiklik kararı bu rolde yoktur: yapan ile
-- onaylayan ayrı kalır (dört göz ayardan bağımsız korunur). Göç kimseye rol atamaz, var olan rollere dokunmaz.

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('proses_muhendisi', 'Proses Mühendisi', true, false);

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'proses_muhendisi'), m.islem
  FROM (VALUES
    ('belge-merkezi.oku'), ('cnc-kurulum.oku'), ('cnc-kurulum.yaz'), ('degisiklik-yonetimi.revizyon-hazirla'),
    ('degisiklik-yonetimi.talep-ac'), ('geometri.hesapla'), ('geometri.oku'), ('idari-isler.arac-talebi-ac'),
    ('idari-isler.talep-ac'), ('ik.bordro-gordum'), ('ik.izin-talep'), ('kalite-merkezi.oku'), ('mesaj.oku'),
    ('mesaj.yaz'), ('plan.oku'), ('recete-rota.oku'), ('rota.onaya-gonder'), ('rota.revizyon-yaz'), ('rota.sablon-yaz'),
    ('rota.sartname-yaz'), ('rota.sure-kabul'), ('rota.talimat-yaz'), ('rota.taslak-ac'), ('satin-alma.talep-ac'),
    ('sayfa.adim-durumu'), ('sayfa.cizimler'), ('sayfa.cnc-kurulum'), ('sayfa.degisiklik-yonetimi'), ('sayfa.geometri'),
    ('sayfa.idari-isler'), ('sayfa.ik-islemlerim'), ('sayfa.kalite-merkezi'), ('sayfa.malzemeler'), ('sayfa.mesaj'),
    ('sayfa.ortak-dosyalar'), ('sayfa.profil'), ('sayfa.recete-rota'), ('sayfa.rota'), ('sayfa.taleplerim'),
    ('sayfa.uretim-emirleri'), ('stok.istek')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
