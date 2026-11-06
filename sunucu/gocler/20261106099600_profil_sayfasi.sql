-- Profilim her rolün menü sayfasıdır (karar 2192-4 b): her hesap yalnız kendi profilini görür, uçlar kişiyi oturumdan alır.
-- Yönetici bayraklı roldür, kayıtlı her işlemi satırsız alır. Yetkiler ekranından önceden verilmiş satır atlanır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'sayfa.profil' FROM rol WHERE NOT yonetici
ON CONFLICT (rol_id, islem) DO NOTHING;
