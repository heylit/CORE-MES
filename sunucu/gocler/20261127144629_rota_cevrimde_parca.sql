-- Tezgah bir cevrimde birden fazla parca isleyebilir; birim sure parca basi kalir, cevrim = birim sure x cevrimde parca.
ALTER TABLE rota_adimi ADD COLUMN cevrimde_parca integer NOT NULL DEFAULT 1
  CONSTRAINT rota_adimi_cevrimde_parca CHECK (cevrimde_parca BETWEEN 1 AND 1000);
