-- 3193 a: SmartES adetlerini onaylama Müdür ve Planlama-Proje rollerinde; yönetici bayrağıyla her işlemi zaten alır.
-- Yalnız satır ekler; Yetkiler ekranından verilmiş ya da tek kişiden alınmış (kisi_islem_kisiti) satıra dokunmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'smartes.adet-onayla'
  FROM rol r
 WHERE r.kod IN ('mudur', 'planlama_proje')
ON CONFLICT DO NOTHING;
