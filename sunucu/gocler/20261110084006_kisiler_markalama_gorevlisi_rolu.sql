-- Markalama, operatörden ayrılıp yeni Markalama Görevlisi rolüne geçer (kullanıcı 10.11.2026; kart 2730-1 a+c). 2030 a ve 2048 b'nin
-- yerine geçer. Görevli Markalama sayfasını görür, seri verir ve markalama tanımı yazar; birim durumu yazmaz, terminal ve Arkon almaz.
-- Terminaldeki markalama panelini de kullanacak kişiye ayrıca Operatör rolü verilir: kişi birden çok rol taşır.

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('markalama_gorevlisi', 'Markalama Görevlisi', true, false);

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'markalama_gorevlisi'), m.islem
  FROM (VALUES
    ('sayfa.markalama'), ('markalama.seri-ver'), ('markalama.tanim-yaz'),
    ('sayfa.ik-islemlerim'), ('ik.izin-talep'), ('ik.bordro-gordum'),
    ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz'),
    ('sayfa.idari-isler'), ('idari-isler.talep-ac'), ('idari-isler.arac-talebi-ac'),
    ('sayfa.ortak-dosyalar'), ('sayfa.profil'), ('stok.istek')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

-- Silinen satır sayısı göç günlüğünde kalır; yönetici bu satırları Yetkiler ekranından elle vermiş olsa da operatörden kalkar.
DO $$
DECLARE silinen bigint;
BEGIN
  DELETE FROM rol_islemi ri USING rol r
   WHERE r.id = ri.rol_id AND r.kod = 'operator' AND ri.islem IN ('sayfa.markalama', 'markalama.seri-ver');
  GET DIAGNOSTICS silinen = ROW_COUNT;
  RAISE NOTICE 'operatörden silinen markalama satırı: %', silinen;
END $$;
