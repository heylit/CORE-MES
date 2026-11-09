-- Kart 2417: siparişin vadesi teslimattan mı (varsayılan, 2132-6 a ile aynı) siparişten mi sayılır. Var olan siparişler
-- varsayılanla "teslim" olur; veri dönüşmez, satır silinmez.
ALTER TABLE satin_alma_siparis
  ADD COLUMN vade_baslangici text NOT NULL DEFAULT 'teslim'
    CONSTRAINT satin_alma_siparis_vade_baslangici CHECK (vade_baslangici IN ('teslim', 'siparis'));
