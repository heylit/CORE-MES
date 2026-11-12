-- İrsaliyenin üstündeki tarih mal kabul zamanından ayrıdır (3142): kişi girer ya da fotoğraftan okunanı kullanır. Eski belgede bilinmez, boş kalır.
ALTER TABLE stok_mal_kabul ADD COLUMN irsaliye_tarihi date;
