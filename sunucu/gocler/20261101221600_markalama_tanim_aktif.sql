-- Markalama (kart 1796, MRK-8): tanım pasif yapılabilir. Var olan tanımlar etkin kalır; pasif tanımda seri verilmez.
ALTER TABLE markalama_tanimi ADD COLUMN aktif boolean NOT NULL DEFAULT true;
