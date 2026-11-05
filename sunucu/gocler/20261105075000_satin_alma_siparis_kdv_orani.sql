-- Satın alma ödeme planı KDV dahildir (kart 2132b, kararlar 2132-2 a, 2132-7 teyit). Oran sipariş başına elle seçilir; boşsa
-- finansın o gün geçerli en yüksek KDV oranı kullanılır. Boş olabilen sütundur: var olan siparişlerde boş kalır, değer yazılmaz.
ALTER TABLE satin_alma_siparis ADD COLUMN kdv_orani numeric(5,2)
  CONSTRAINT satin_alma_siparis_kdv_orani CHECK (kdv_orani >= 0 AND kdv_orani <= 100);
