-- Adım bağı ve giren statüsü rota revizyonuna bağlanır (kullanıcı onayı 16.10.2026): taslak revizyonda yapılan değişiklik yürürlüğe alınana
-- kadar üretim sayımını etkilemez; statü de ürün, OP ve revizyona bağlıdır. Revizyonsuz yazılmış satır ürünün iptal olmayan her revizyonuna
-- kopyalanır, böylece bugünkü sayım değişmez. Revizyonu olmayan ürünün satırı silinmez, revizyonsuz kalır (sayım onu okumaz; satır silmek
-- onaydan ayrı sorulur) ve sayısı bildirilir.
ALTER TABLE recete_rota_adim_bagi DROP CONSTRAINT recete_rota_adim_bagi_pkey;
ALTER TABLE recete_rota_adim_bagi ADD COLUMN rota_revizyonu_id int;
ALTER TABLE recete_rota_giren_statusu DROP CONSTRAINT recete_rota_giren_statusu_pkey;
ALTER TABLE recete_rota_giren_statusu ADD COLUMN rota_revizyonu_id int;

DO $$
DECLARE
  bag_kalan int;
  giren_kalan int;
BEGIN
  -- Kopyası açılan satırın revizyonsuz aslı kaldırılır (veri kopyalarda durur); revizyonu olmayan ürünün satırına dokunulmaz.
  WITH asil AS (
    SELECT b.ctid AS c, b.* FROM recete_rota_adim_bagi b
     WHERE EXISTS (SELECT 1 FROM rota_revizyonu r WHERE r.malzeme_id = b.malzeme_id AND r.durum <> 'iptal')),
  kopya AS (
    INSERT INTO recete_rota_adim_bagi (malzeme_id, op_no, cikti_malzeme_id, cikti_statu, surum, guncelleyen_kisi_id, guncellendi, rota_revizyonu_id)
    SELECT a.malzeme_id, a.op_no, a.cikti_malzeme_id, a.cikti_statu, a.surum, a.guncelleyen_kisi_id, a.guncellendi, r.id
      FROM asil a JOIN rota_revizyonu r ON r.malzeme_id = a.malzeme_id AND r.durum <> 'iptal')
  DELETE FROM recete_rota_adim_bagi WHERE ctid IN (SELECT c FROM asil);
  SELECT count(*) INTO bag_kalan FROM recete_rota_adim_bagi WHERE rota_revizyonu_id IS NULL;

  WITH asil AS (
    SELECT g.ctid AS c, g.* FROM recete_rota_giren_statusu g
     WHERE EXISTS (SELECT 1 FROM rota_revizyonu r WHERE r.malzeme_id = g.malzeme_id AND r.durum <> 'iptal')),
  kopya AS (
    INSERT INTO recete_rota_giren_statusu (malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no, guncelleyen_kisi_id, guncellendi, rota_revizyonu_id)
    SELECT a.malzeme_id, a.op_no, a.giren_malzeme_id, a.statu, a.giren_op_no, a.guncelleyen_kisi_id, a.guncellendi, r.id
      FROM asil a JOIN rota_revizyonu r ON r.malzeme_id = a.malzeme_id AND r.durum <> 'iptal')
  DELETE FROM recete_rota_giren_statusu WHERE ctid IN (SELECT c FROM asil);
  SELECT count(*) INTO giren_kalan FROM recete_rota_giren_statusu WHERE rota_revizyonu_id IS NULL;

  IF bag_kalan + giren_kalan > 0 THEN
    RAISE NOTICE 'Reçete ve Rota: revizyonu olmayan üründe % adım bağı ve % giren statüsü satırı revizyonsuz kaldı; sayım bunları okumaz.', bag_kalan, giren_kalan;
  END IF;
END $$;

-- Revizyon ürünün revizyonudur: bileşik yabancı anahtar başka ürünün revizyonuna bağlanmayı reddeder. Revizyonsuz kalan eski satır ürün ve
-- OP'siyle tekildir (eski anahtar).
ALTER TABLE recete_rota_adim_bagi
  ADD CONSTRAINT recete_rota_adim_bagi_revizyon_fkey FOREIGN KEY (rota_revizyonu_id, malzeme_id) REFERENCES rota_revizyonu (id, malzeme_id),
  ADD CONSTRAINT recete_rota_adim_bagi_revizyon_op_tekil UNIQUE (rota_revizyonu_id, op_no);
CREATE UNIQUE INDEX recete_rota_adim_bagi_revizyonsuz_tekil ON recete_rota_adim_bagi (malzeme_id, op_no) WHERE rota_revizyonu_id IS NULL;
ALTER TABLE recete_rota_giren_statusu
  ADD CONSTRAINT recete_rota_giren_statusu_revizyon_fkey FOREIGN KEY (rota_revizyonu_id, malzeme_id) REFERENCES rota_revizyonu (id, malzeme_id),
  ADD CONSTRAINT recete_rota_giren_statusu_revizyon_tekil UNIQUE (rota_revizyonu_id, op_no, giren_malzeme_id);
CREATE UNIQUE INDEX recete_rota_giren_statusu_revizyonsuz_tekil ON recete_rota_giren_statusu (malzeme_id, op_no, giren_malzeme_id) WHERE rota_revizyonu_id IS NULL;
