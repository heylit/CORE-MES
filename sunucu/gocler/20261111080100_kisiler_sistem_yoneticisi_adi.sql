-- Tam yetkili rolün görünen adı "Sistem Yöneticisi" olur (2899-1 a): kullanıcı rolü bu adla arıyordu. Kod, kimlik, bayrak ve
-- kişi atamaları aynı kalır; adı elle değiştirilmiş rol üstüne yazılmaz.
UPDATE rol SET ad = 'Sistem Yöneticisi' WHERE kod = 'yonetici' AND ad = 'Yönetici';
