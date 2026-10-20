-- Malzeme kartındaki depo yerinin esası stoktur (A7, #516, kullanıcı kararı 3-b): malzeme başına boş olabilen varsayılan konum.
ALTER TABLE stok_malzeme_ayari
  ADD COLUMN varsayilan_konum_id int CONSTRAINT stok_malzeme_ayari_varsayilan_konum REFERENCES stok_konum (id);
