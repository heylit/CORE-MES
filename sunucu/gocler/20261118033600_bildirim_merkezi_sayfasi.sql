-- Bildirim Merkezi (3405-4 a) her rolün menü sayfasıdır: bildirim, gecikenler ve tercihler kişinin kendi satırlarıdır, uçlar
-- kişiyi oturumdan alır. Önceki adres (Profilim altı) hiçbir sayfaya bağlı değildi, herkes açardı; erişim değişmez.
-- Yönetici bayraklı roldür, kayıtlı her işlemi satırsız alır. Yetkiler ekranından önceden verilmiş satır atlanır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'sayfa.bildirim-merkezi' FROM rol WHERE NOT yonetici
ON CONFLICT (rol_id, islem) DO NOTHING;
