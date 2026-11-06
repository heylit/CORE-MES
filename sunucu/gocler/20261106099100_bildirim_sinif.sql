-- 2174-2 a: bildirimin sınıfı (görev, hatırlatma, bilgi) ve görevin yapıldığı an. Önem (bilgi, uyari, acil) ayrı eksendir, değişmez.
-- Var olan satırlar bilgi sayılır: o güne kadar hiçbir satır "yapılınca kapanır" sözü vermedi.
-- Görev ve hatırlatma, kaynağın kararı ya da işi yapılınca bütün alıcılarda yapıldı olur; bilgi okununca biter, yapıldı taşımaz.
ALTER TABLE bildirim_kaydi
  ADD COLUMN sinif text NOT NULL DEFAULT 'bilgi' CONSTRAINT bildirim_kaydi_sinif_gecerli CHECK (sinif IN ('gorev', 'hatirlatma', 'bilgi')),
  ADD COLUMN yapildi timestamptz,
  ADD CONSTRAINT bildirim_kaydi_yapildi_sinif CHECK (yapildi IS NULL OR sinif <> 'bilgi');
