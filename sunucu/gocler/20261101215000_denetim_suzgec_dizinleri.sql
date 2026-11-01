-- Süzgeç seçenekleri (modül ve komut listeleri) her açılışta denetim_kaydi'nı baştan sona tarıyordu; bu dizinlerle
-- liste farklı değer başına tek dizin adımıyla okunur. Modül dizini modül süzgeçli sayımı da daraltır.
-- Göç kendi transaction'ında koşar (CONCURRENTLY olamaz); güncellemede sunucu kapalıdır. Satır değişmez.
CREATE INDEX denetim_kaydi_modul ON denetim_kaydi (modul) WHERE modul IS NOT NULL;
CREATE INDEX denetim_kaydi_komut ON denetim_kaydi (yol, yontem);
