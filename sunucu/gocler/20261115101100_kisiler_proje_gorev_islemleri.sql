-- 3269-2 a (kullanıcı kartı, 15.11.2026): proje görevi işlemleri. Kişi yalnız kendisine ya da rolüne atanan görevi işler ve
-- kontrolü onaylar (kayıt düzeyi kural sunucuda); işlem tek başına başkasının görevini açmaz. Yönetici her işlemi bayrakla taşır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, m.islem
  FROM (VALUES ('projeler.gorev-isle'), ('sayfa.proje-gorevlerim')) AS m (islem)
  CROSS JOIN rol r
 WHERE r.kod IN (
   'bakim', 'cam', 'depo', 'genel_mudur', 'genel_mudur_yardimcisi', 'idari_isler', 'insan_kaynaklari', 'kalite', 'markalama_gorevlisi', 'mudur',
   'muhasebe_finans', 'operator', 'planlama_muduru', 'planlama_proje', 'satin_alma', 'satin_alma_muduru', 'satis', 'sevkiyat', 'uretim_muduru',
   'vardiya_sorumlusu')
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'projeler.gorev-kontrol'
  FROM rol r
 WHERE r.kod IN (
   'kalite', 'operator', 'vardiya_sorumlusu', 'planlama_proje', 'planlama_muduru', 'uretim_muduru', 'satin_alma_muduru', 'mudur',
   'genel_mudur_yardimcisi', 'genel_mudur')
ON CONFLICT (rol_id, islem) DO NOTHING;

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'projeler.sablon-yaz'
  FROM rol r
 WHERE r.kod IN ('mudur', 'planlama_proje', 'planlama_muduru', 'uretim_muduru')
ON CONFLICT (rol_id, islem) DO NOTHING;
