-- Siparişin ödeme planı satırının kaynağı (kart 2132b, kararlar 2132-6 a, 2132-11 a): 'otomatik' tekliften kurulan plandır ve
-- beklenen teslim ya da mal kabul değişince yeniden kurulur; 'elle' satın almacının yazdığıdır ve değişmez. Dolu tabloya eklenir:
-- var olan satırlar 'elle' sayılır (kendiliğinden değişmezler), yalnız bundan sonra tekliften kurulan planlar 'otomatik' yazılır.
ALTER TABLE finans_siparis_odemesi ADD COLUMN kaynak text NOT NULL DEFAULT 'elle'
  CONSTRAINT finans_siparis_odemesi_kaynak CHECK (kaynak IN ('elle', 'otomatik'));
