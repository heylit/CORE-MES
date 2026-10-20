-- Plan bedeli müşteri sınıfıyla çarpılır (265 a): sınıf kartta tutulur, boş müşteri 1,0 sayılır; dolu tabloda sütun boş başlar.
ALTER TABLE musteri_tedarikci_firma ADD COLUMN musteri_sinifi text;
ALTER TABLE musteri_tedarikci_firma ADD CONSTRAINT musteri_tedarikci_firma_musteri_sinifi CHECK (musteri_sinifi IN ('A', 'B', 'C'));
