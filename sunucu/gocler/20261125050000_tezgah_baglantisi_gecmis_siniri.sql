-- Kart 3680: değer geçmişi satır sınırı aşılınca en eski satırlar silinir; bu veri boşluğu "satir-siniri" nedeniyle kaydedilir (kısıt yalnız genişler, veri değişmez).
ALTER TABLE tezgah_veri_boslugu DROP CONSTRAINT tezgah_veri_boslugu_neden;
ALTER TABLE tezgah_veri_boslugu ADD CONSTRAINT tezgah_veri_boslugu_neden CHECK (neden IN ('tampon-asildi', 'servis-yeniden-basladi', 'satir-siniri'));
