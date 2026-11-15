-- 3296-3 a: kalem aynı üretim çeşidinden birden çok partiye bölünebilir (50 seri + 50 seri); her parti ayrı emir olur. Kısıt kalkar,
-- satır silinmez ve değişmez. Aynı türden iki parti yazıldıktan sonra kısıt geri konamaz (kart 3296-3 a bunu söyler).
ALTER TABLE siparisler_siparis_satiri_parti DROP CONSTRAINT siparisler_parti_tur_tek;

-- Partide isteğe bağlı rota: boşsa çeşidin rotası (3247 a). Rota silinmez (rota_tanimi_kilitli); ürün eşleşmesini ve yürürlüğü onayda
-- sahibi (rota) denetler, uymayan seçim türün rotasına düşer. Var olan partiler boş kalır.
ALTER TABLE siparisler_siparis_satiri_parti ADD COLUMN rota_id int CONSTRAINT siparisler_parti_rota REFERENCES rota_tanimi (id);
CREATE INDEX siparisler_parti_rota_dizini ON siparisler_siparis_satiri_parti (rota_id) WHERE rota_id IS NOT NULL;
