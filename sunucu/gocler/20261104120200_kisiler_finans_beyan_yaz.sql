-- 1846 (TKV-2 a): vergi beyanını "verildi" işaretleme muhasebe ve finansındır (kullanıcı kararı 04.11.2026, karar kartı
-- "Evet, muhasebe_finans ve yönetici"); yönetici bayrakla zaten taşır. Yalnız ekleme.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'finans.beyan-yaz'
  FROM rol r
 WHERE r.kod = 'muhasebe_finans'
ON CONFLICT DO NOTHING;
