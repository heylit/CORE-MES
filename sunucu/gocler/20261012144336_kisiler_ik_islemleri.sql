-- İK işlemleri onaylı rollere verilir (kullanıcı kararları 08.10.2026 ve 12.10.2026). "İnsan Kaynakları" sayfası yalnız İK ekibinde;
-- her rol "İK İşlemlerim" sayfasından kendi işlerini yürütür ve izin talep eder. Yönetici rolü bütün işlemleri zaten taşır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('insan_kaynaklari', 'sayfa.ik'), ('insan_kaynaklari', 'sayfa.ik-islemlerim'), ('insan_kaynaklari', 'ik.oku'),
    ('insan_kaynaklari', 'ik.personel-yaz'), ('insan_kaynaklari', 'ik.ucret-yaz'), ('insan_kaynaklari', 'ik.izin-yaz'),
    ('insan_kaynaklari', 'ik.izin-talep'), ('insan_kaynaklari', 'ik.izin-onay'), ('insan_kaynaklari', 'ik.devam-yaz'),
    ('insan_kaynaklari', 'ik.bordro-kesinlestir'), ('insan_kaynaklari', 'ik.bordro-kilit-ac'), ('insan_kaynaklari', 'ik.performans-yaz'),
    ('insan_kaynaklari', 'ik.egitim-yaz'), ('insan_kaynaklari', 'ik.zimmet-yaz'), ('insan_kaynaklari', 'ik.ise-alim-yaz'),
    ('insan_kaynaklari', 'ik.pozisyon-onay'), ('insan_kaynaklari', 'ik.ayar-yaz'),
    ('mudur', 'sayfa.ik-islemlerim'), ('mudur', 'ik.izin-talep'), ('mudur', 'ik.izin-onay'), ('mudur', 'ik.pozisyon-onay'),
    ('planlama_proje', 'sayfa.ik-islemlerim'), ('planlama_proje', 'ik.izin-talep'),
    ('operator', 'sayfa.ik-islemlerim'), ('operator', 'ik.izin-talep'),
    ('kalite', 'sayfa.ik-islemlerim'), ('kalite', 'ik.izin-talep'),
    ('satin_alma', 'sayfa.ik-islemlerim'), ('satin_alma', 'ik.izin-talep'),
    ('muhasebe_finans', 'sayfa.ik-islemlerim'), ('muhasebe_finans', 'ik.izin-talep'),
    ('idari_isler', 'sayfa.ik-islemlerim'), ('idari_isler', 'ik.izin-talep'),
    ('cam', 'sayfa.ik-islemlerim'), ('cam', 'ik.izin-talep'),
    ('depo', 'sayfa.ik-islemlerim'), ('depo', 'ik.izin-talep')
  ) AS m (kod, islem);
