-- 2157-1 a: satın almanın elle verdiği tedarikçi puanı verilmemiş olabilir; boş "puan yok" demektir ve hesaplara girmez.
-- Varsayılan 3 kalkar, çünkü puanlanmamış tedarikçiyi 3 verilmiş tedarikçiden ayırmayı imkânsız kılıyordu. Var olan satırlar
-- değişmez (hangisinin gerçekten 3 verildiği bilinemez); 1-5 kısıtı dolu değer için geçerli kalır.
ALTER TABLE satin_alma_tedarikci
  ALTER COLUMN puan DROP DEFAULT,
  ALTER COLUMN puan DROP NOT NULL;
