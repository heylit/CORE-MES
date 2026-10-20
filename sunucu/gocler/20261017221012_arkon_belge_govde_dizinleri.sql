-- Emir numarasıyla paket ve paketle istek aramaları gövde alanına bakar; depo büyüdükçe tarama olmasın. Satır değişmez, kapsanan sayı bildirilir.
DO $$
DECLARE
  paketler bigint;
  istekler bigint;
BEGIN
  SELECT count(*) FILTER (WHERE depo = 'pkgs'), count(*) FILTER (WHERE depo = 'requests') INTO paketler, istekler FROM arkon_belge;
  RAISE NOTICE 'arkon_belge: % paket, % istek dizine girer; hiçbir satır değişmez', paketler, istekler;
END $$;

CREATE INDEX arkon_belge_paket_no_idx ON arkon_belge ((govde->>'no')) WHERE depo = 'pkgs';
CREATE INDEX arkon_belge_istek_paket_idx ON arkon_belge ((govde->>'pkgId')) WHERE depo = 'requests';
