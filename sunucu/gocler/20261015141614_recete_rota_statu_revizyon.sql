-- Statü ürün + OP + rota revizyonudur: her rota revizyonu kendi statüsünü açar, yeni revizyonun parçası eskisiyle karışmaz (kullanıcı onayı 2026-10-15).
-- Var olan satırlar ürünün yürürlükteki revizyonuyla doldurulur; yürürlükte revizyonu olmayan (ya da eski kimlikli) satır revizyonsuz kalır.
ALTER TABLE recete_rota_statu ADD COLUMN rota_revizyonu_id int REFERENCES rota_revizyonu;

UPDATE recete_rota_statu s SET rota_revizyonu_id = r.id
  FROM rota_revizyonu r
 WHERE s.kaynak_adim ~ '^[0-9]+-o[0-9]+$' AND r.malzeme_id = substring(s.kaynak_adim FROM '^([0-9]+)-o')::int AND r.durum = 'yururlukte';

ALTER TABLE recete_rota_statu DROP CONSTRAINT recete_rota_statu_adim_tekil;
CREATE UNIQUE INDEX recete_rota_statu_adim_revizyon_tekil ON recete_rota_statu (kaynak_adim, (coalesce(rota_revizyonu_id, 0)));
