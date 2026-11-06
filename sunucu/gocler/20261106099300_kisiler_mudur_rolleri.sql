-- Müdür rolleri (kart 2177, kullanıcı kararları 2177-1, 2177-2): genel müdür ve yardımcısı Müdür'ün yetkileriyle açılır;
-- alan müdürleri kendi ekip rolünün yetkileri, alanının onayları ve ekip onaylarıyla (izin, devam, pozisyon) açılır.
-- Mevcut Müdür rolü ve ona bağlı kişiler değişmez. Yönetici rollerin işlemlerini Sistem Ayarları'ndan değiştirebilir.
-- Her yerleşik rolün işlemleri açık listeyle yazılır: sonradan Müdür'e eklenen işlem genel müdüre kendiliğinden geçmez.

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES
  ('genel_mudur', 'Genel Müdür', true, false),
  ('genel_mudur_yardimcisi', 'Genel Müdür Yardımcısı', true, false),
  ('planlama_muduru', 'Planlama Müdürü', true, false),
  ('satin_alma_muduru', 'Satın Alma Müdürü', true, false),
  ('uretim_muduru', 'Üretim Müdürü', true, false);

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'genel_mudur'), m.islem
  FROM (VALUES
    ('sayfa.akis'), ('sayfa.arkon'), ('sayfa.atolye'), ('sayfa.cizelge'), ('sayfa.cizimler'), ('sayfa.cnc-kurulum'),
    ('sayfa.denetim'), ('sayfa.denetim-hazirlik'), ('sayfa.durus-nedenleri'), ('sayfa.emirler'), ('sayfa.etiket-merkezi'),
    ('sayfa.finans'), ('sayfa.idari-isler'), ('sayfa.ik-islemlerim'), ('sayfa.istasyonlar'), ('sayfa.kalibrasyon'),
    ('sayfa.kalite-merkezi'), ('sayfa.kuyruk'), ('sayfa.malzemeler'), ('sayfa.matris'), ('sayfa.mesai'), ('sayfa.mesaj'),
    ('sayfa.musteri-tedarikci'), ('sayfa.nizamiye'), ('sayfa.oee'), ('sayfa.ortak-dosyalar'), ('sayfa.personel'), ('sayfa.plan'),
    ('sayfa.portal'), ('sayfa.projeler'), ('sayfa.recete-rota'), ('sayfa.rota'), ('sayfa.satin-alma'), ('sayfa.sevkiyat'),
    ('sayfa.siparisler'), ('sayfa.smartes'), ('sayfa.stok'), ('sayfa.taleplerim'), ('sayfa.terminal'), ('sayfa.uretim-emirleri'),
    ('sayfa.uretim-terminali'), ('sayfa.vardiya'), ('arkon.amir'), ('arkon.yansima-oku'), ('arkon.yansima-yeniden'),
    ('belge-merkezi.oku'), ('cnc-kurulum.oku'), ('cnc-kurulum.takim-degistir'), ('cnc-kurulum.yaz'), ('denetim-hazirlik.oku'),
    ('denetim-hazirlik.yaz'), ('denetim.oku'), ('etiket-merkezi.bas'), ('etiket-merkezi.oku'),
    ('etiket-merkezi.sablon-yaz'), ('etiket-merkezi.yazici-yaz'), ('finans.maliyet-oku'), ('finans.oku'),
    ('idari-isler.arac-talebi-ac'), ('idari-isler.oku'), ('idari-isler.talep-ac'), ('ik.bordro-gordum'), ('ik.devam-onay'),
    ('ik.izin-onay'), ('ik.izin-talep'), ('ik.pozisyon-onay'), ('istasyonlar.makine-durumu'), ('istasyonlar.yaz'),
    ('kalite-merkezi.oku'), ('kalite-merkezi.onayla'), ('kisiler.oku'), ('malzemeler.onayla'), ('malzemeler.tanim-yaz'),
    ('malzemeler.yaz'), ('mesaj.oku'), ('mesaj.yaz'), ('musteri-tedarikci.oku'), ('nizamiye.kart-yonet'), ('nizamiye.oku'),
    ('oee.oku'), ('pano.sirket-ozeti'), ('plan.bedel-ayari'), ('plan.canliya-al'), ('plan.kilitle'), ('plan.motor-ayari'),
    ('plan.oku'), ('plan.planlama-oku'), ('plan.studyo'), ('plan.yaz'), ('portal.finans'), ('portal.kalite'), ('portal.oku'),
    ('portal.satinalma'), ('portal.satis'), ('portal.yaz'), ('profil.geri-bildirim-oku'), ('projeler.gorev-yaz'),
    ('projeler.oku'), ('projeler.statu-ayar'), ('projeler.statu-yaz'), ('projeler.yaz'), ('recete-rota.oku'),
    ('recete-rota.yaz'), ('rota.emre-kopyala'), ('rota.onayla'), ('saat.uyari-ustlen'), ('satin-alma.oku'),
    ('satin-alma.onayla'), ('satin-alma.talep-ac'), ('sevkiyat.oku'), ('siparisler.fiyat-oku'), ('siparisler.iskonto-onayla'),
    ('siparisler.maliyet-oku'), ('siparisler.oku'), ('siparisler.onayla'), ('siparisler.termin-dene'),
    ('siparisler.termin-onayla'), ('siparisler.yaz'), ('stok.cikis'), ('stok.eksi-onayla'), ('stok.geri-al'), ('stok.giris'),
    ('stok.istek'), ('stok.sayim'), ('stok.sayim-onayla'), ('stok.skt-onayla'), ('stok.statu-degistir'), ('stok.tanim'),
    ('stok.toplama'), ('stok.transfer'), ('terminal.uret'), ('uretim-emirleri.fason'), ('uretim-emirleri.hazirlik-muaf'),
    ('uretim-emirleri.kapanis-oku'), ('uretim-emirleri.kapanis-onay'), ('uretim-emirleri.yaz'), ('vardiya.durus-yaz'),
    ('vardiya.gecmis-yaz'), ('vardiya.yaz')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'genel_mudur_yardimcisi'), m.islem
  FROM (VALUES
    ('sayfa.akis'), ('sayfa.arkon'), ('sayfa.atolye'), ('sayfa.cizelge'), ('sayfa.cizimler'), ('sayfa.cnc-kurulum'),
    ('sayfa.denetim'), ('sayfa.denetim-hazirlik'), ('sayfa.durus-nedenleri'), ('sayfa.emirler'), ('sayfa.etiket-merkezi'),
    ('sayfa.finans'), ('sayfa.idari-isler'), ('sayfa.ik-islemlerim'), ('sayfa.istasyonlar'), ('sayfa.kalibrasyon'),
    ('sayfa.kalite-merkezi'), ('sayfa.kuyruk'), ('sayfa.malzemeler'), ('sayfa.matris'), ('sayfa.mesai'), ('sayfa.mesaj'),
    ('sayfa.musteri-tedarikci'), ('sayfa.nizamiye'), ('sayfa.oee'), ('sayfa.ortak-dosyalar'), ('sayfa.personel'), ('sayfa.plan'),
    ('sayfa.portal'), ('sayfa.projeler'), ('sayfa.recete-rota'), ('sayfa.rota'), ('sayfa.satin-alma'), ('sayfa.sevkiyat'),
    ('sayfa.siparisler'), ('sayfa.smartes'), ('sayfa.stok'), ('sayfa.taleplerim'), ('sayfa.terminal'), ('sayfa.uretim-emirleri'),
    ('sayfa.uretim-terminali'), ('sayfa.vardiya'), ('arkon.amir'), ('arkon.yansima-oku'), ('arkon.yansima-yeniden'),
    ('belge-merkezi.oku'), ('cnc-kurulum.oku'), ('cnc-kurulum.takim-degistir'), ('cnc-kurulum.yaz'), ('denetim-hazirlik.oku'),
    ('denetim-hazirlik.yaz'), ('denetim.oku'), ('etiket-merkezi.bas'), ('etiket-merkezi.oku'),
    ('etiket-merkezi.sablon-yaz'), ('etiket-merkezi.yazici-yaz'), ('finans.maliyet-oku'), ('finans.oku'),
    ('idari-isler.arac-talebi-ac'), ('idari-isler.oku'), ('idari-isler.talep-ac'), ('ik.bordro-gordum'), ('ik.devam-onay'),
    ('ik.izin-onay'), ('ik.izin-talep'), ('ik.pozisyon-onay'), ('istasyonlar.makine-durumu'), ('istasyonlar.yaz'),
    ('kalite-merkezi.oku'), ('kalite-merkezi.onayla'), ('kisiler.oku'), ('malzemeler.onayla'), ('malzemeler.tanim-yaz'),
    ('malzemeler.yaz'), ('mesaj.oku'), ('mesaj.yaz'), ('musteri-tedarikci.oku'), ('nizamiye.kart-yonet'), ('nizamiye.oku'),
    ('oee.oku'), ('pano.sirket-ozeti'), ('plan.bedel-ayari'), ('plan.canliya-al'), ('plan.kilitle'), ('plan.motor-ayari'),
    ('plan.oku'), ('plan.planlama-oku'), ('plan.studyo'), ('plan.yaz'), ('portal.finans'), ('portal.kalite'), ('portal.oku'),
    ('portal.satinalma'), ('portal.satis'), ('portal.yaz'), ('profil.geri-bildirim-oku'), ('projeler.gorev-yaz'),
    ('projeler.oku'), ('projeler.statu-ayar'), ('projeler.statu-yaz'), ('projeler.yaz'), ('recete-rota.oku'),
    ('recete-rota.yaz'), ('rota.emre-kopyala'), ('rota.onayla'), ('saat.uyari-ustlen'), ('satin-alma.oku'),
    ('satin-alma.onayla'), ('satin-alma.talep-ac'), ('sevkiyat.oku'), ('siparisler.fiyat-oku'), ('siparisler.iskonto-onayla'),
    ('siparisler.maliyet-oku'), ('siparisler.oku'), ('siparisler.onayla'), ('siparisler.termin-dene'),
    ('siparisler.termin-onayla'), ('siparisler.yaz'), ('stok.cikis'), ('stok.eksi-onayla'), ('stok.geri-al'), ('stok.giris'),
    ('stok.istek'), ('stok.sayim'), ('stok.sayim-onayla'), ('stok.skt-onayla'), ('stok.statu-degistir'), ('stok.tanim'),
    ('stok.toplama'), ('stok.transfer'), ('terminal.uret'), ('uretim-emirleri.fason'), ('uretim-emirleri.hazirlik-muaf'),
    ('uretim-emirleri.kapanis-oku'), ('uretim-emirleri.kapanis-onay'), ('uretim-emirleri.yaz'), ('vardiya.durus-yaz'),
    ('vardiya.gecmis-yaz'), ('vardiya.yaz')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'planlama_muduru'), m.islem
  FROM (VALUES
    ('sayfa.akis'), ('sayfa.arkon'), ('sayfa.atolye'), ('sayfa.cizelge'), ('sayfa.cizimler'), ('sayfa.cnc-kurulum'),
    ('sayfa.denetim-hazirlik'), ('sayfa.durus-nedenleri'), ('sayfa.emirler'), ('sayfa.etiket-merkezi'), ('sayfa.finans'),
    ('sayfa.geometri'), ('sayfa.idari-isler'), ('sayfa.ik-islemlerim'), ('sayfa.istasyonlar'), ('sayfa.kuyruk'),
    ('sayfa.malzemeler'), ('sayfa.matris'), ('sayfa.mesai'), ('sayfa.mesaj'), ('sayfa.musteri-tedarikci'), ('sayfa.oee'),
    ('sayfa.ortak-dosyalar'), ('sayfa.personel'), ('sayfa.plan'), ('sayfa.portal'), ('sayfa.projeler'), ('sayfa.recete-rota'),
    ('sayfa.rota'), ('sayfa.satin-alma'), ('sayfa.sevkiyat'), ('sayfa.siparisler'), ('sayfa.smartes'), ('sayfa.stok'),
    ('sayfa.taleplerim'), ('sayfa.terminal'), ('sayfa.uretim-emirleri'), ('sayfa.vardiya'), ('arkon.kuyruk-sirala'),
    ('arkon.planlama'), ('arkon.yansima-oku'), ('arkon.yansima-yeniden'), ('atolye.yaz'), ('belge-merkezi.oku'),
    ('belge-merkezi.yayinla'), ('belge-merkezi.yaz'), ('cnc-kurulum.oku'), ('cnc-kurulum.yaz'), ('denetim-hazirlik.oku'),
    ('etiket-merkezi.bas'), ('etiket-merkezi.oku'), ('geometri.oku'), ('idari-isler.arac-talebi-ac'),
    ('idari-isler.talep-ac'), ('ik.bordro-gordum'), ('ik.devam-onay'), ('ik.izin-onay'), ('ik.izin-talep'), ('ik.pozisyon-onay'),
    ('kisiler.oku'), ('malzemeler.tanim-yaz'), ('malzemeler.yaz'), ('mesaj.oku'), ('mesaj.yaz'), ('musteri-tedarikci.oku'),
    ('musteri-tedarikci.yaz'), ('oee.oku'), ('plan.bedel-ayari'), ('plan.canliya-al'), ('plan.kilitle'), ('plan.motor-ayari'),
    ('plan.oku'), ('plan.planlama-oku'), ('plan.studyo'), ('plan.yaz'), ('portal.oku'), ('projeler.gorev-yaz'), ('projeler.oku'),
    ('projeler.statu-yaz'), ('projeler.yaz'), ('recete-rota.oku'), ('recete-rota.yaz'), ('rota.emre-kopyala'), ('rota.onayla'),
    ('rota.talimat-yaz'), ('rota.yaz'), ('saat.uyari-ustlen'), ('satin-alma.oku'), ('satin-alma.talep-ac'), ('sevkiyat.is-yaz'),
    ('sevkiyat.oku'), ('sevkiyat.plan-yaz'), ('siparisler.oku'), ('siparisler.termin-dene'), ('siparisler.termin-onayla'),
    ('siparisler.yaz'), ('stok.istek'), ('stok.toplama'), ('uretim-emirleri.fason'), ('uretim-emirleri.hazirlik-muaf'),
    ('uretim-emirleri.kapanis-oku'), ('uretim-emirleri.kapanis-onay'), ('uretim-emirleri.yaz'), ('vardiya.durus-yaz'),
    ('vardiya.yaz')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'satin_alma_muduru'), m.islem
  FROM (VALUES
    ('sayfa.finans'), ('sayfa.idari-isler'), ('sayfa.ik-islemlerim'), ('sayfa.malzemeler'), ('sayfa.mesaj'),
    ('sayfa.musteri-tedarikci'), ('sayfa.ortak-dosyalar'), ('sayfa.personel'), ('sayfa.portal'), ('sayfa.projeler'),
    ('sayfa.satin-alma'), ('sayfa.sevkiyat'), ('sayfa.stok'), ('sayfa.taleplerim'), ('finans.kur-yaz'),
    ('idari-isler.arac-talebi-ac'), ('idari-isler.talep-ac'), ('ik.bordro-gordum'), ('ik.devam-onay'), ('ik.izin-onay'),
    ('ik.izin-talep'), ('ik.pozisyon-onay'), ('kisiler.oku'), ('malzemeler.yaz'), ('mesaj.oku'), ('mesaj.yaz'),
    ('musteri-tedarikci.oku'), ('musteri-tedarikci.yaz'), ('portal.oku'), ('portal.satinalma'), ('portal.yaz'), ('projeler.oku'),
    ('satin-alma.ayar'), ('satin-alma.fatura-bagla'), ('satin-alma.oku'), ('satin-alma.onayla'), ('satin-alma.talep-ac'),
    ('satin-alma.yaz'), ('sevkiyat.oku'), ('stok.istek'), ('uretim-emirleri.fason')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'uretim_muduru'), m.islem
  FROM (VALUES
    ('sayfa.akis'), ('sayfa.arkon'), ('sayfa.atolye'), ('sayfa.cizelge'), ('sayfa.cnc-kurulum'), ('sayfa.durus-nedenleri'),
    ('sayfa.emirler'), ('sayfa.etiket-merkezi'), ('sayfa.idari-isler'), ('sayfa.ik-islemlerim'), ('sayfa.istasyonlar'),
    ('sayfa.kalibrasyon'), ('sayfa.kalite-merkezi'), ('sayfa.kuyruk'), ('sayfa.malzemeler'), ('sayfa.matris'), ('sayfa.mesai'),
    ('sayfa.mesaj'), ('sayfa.oee'), ('sayfa.ortak-dosyalar'), ('sayfa.personel'), ('sayfa.plan'), ('sayfa.recete-rota'),
    ('sayfa.rota'), ('sayfa.smartes'), ('sayfa.stok'), ('sayfa.taleplerim'), ('sayfa.terminal'), ('sayfa.uretim-emirleri'),
    ('sayfa.uretim-terminali'), ('sayfa.vardiya'), ('arkon.amir'), ('arkon.yansima-oku'), ('arkon.yansima-yeniden'),
    ('cnc-kurulum.hazirlik-onayla'), ('cnc-kurulum.oku'), ('cnc-kurulum.takim-degistir'), ('cnc-kurulum.yaz'),
    ('etiket-merkezi.bas'), ('etiket-merkezi.oku'), ('idari-isler.arac-talebi-ac'),
    ('idari-isler.talep-ac'), ('ik.bordro-gordum'), ('ik.devam-onay'), ('ik.izin-onay'), ('ik.izin-talep'), ('ik.pozisyon-onay'),
    ('istasyonlar.makine-durumu'), ('istasyonlar.yaz'), ('kalite-merkezi.oku'), ('kisiler.oku'), ('mesaj.oku'), ('mesaj.yaz'),
    ('oee.oku'), ('plan.oku'), ('plan.planlama-oku'), ('recete-rota.oku'), ('rota.emre-kopyala'), ('saat.oku'),
    ('saat.uyari-ustlen'), ('satin-alma.talep-ac'), ('stok.istek'), ('terminal.uret'), ('uretim-emirleri.ara-istasyon'),
    ('uretim-emirleri.fason'), ('uretim-emirleri.hazirlik-muaf'), ('uretim-emirleri.kapanis-oku'),
    ('uretim-emirleri.kapanis-onay'), ('uretim-emirleri.sayim-duzelt'), ('uretim-emirleri.yaz'), ('vardiya.durus-yaz'),
    ('vardiya.gecmis-yaz'), ('vardiya.yaz')
  ) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
