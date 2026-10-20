# Ön paket: idari-isler

Bu modül şunları varsaydı:
1. Talep konuları sabit sekiz kalem (elektrik, su, klima, bina, temizlik, yemekhane, kırtasiye, diğer).
2. Aciliyet iki kademe: Normal, Acil (iş duruyor).
3. Yer serbest metin; QR etiketin metni yer olur; son 6 yer önerilir.
4. Talebi yalnız açan ve yalnız yeniyken geri çeker.
5. Red nedeni zorunlu; kapatma notu isteğe bağlı.
6. Üstlenme geri alınabilir (bırak); kapatma ve red geri alınmaz.
7. Panoda kapananlar son 7 gün; geri çekilenler panoda görünmez.
8. Numara TT-yıl-sıra, yıl başında sıfırlanır.
9. Müdür yalnız okur (216 a).
10. Bildirim ve fotoğraf yok; durum Taleplerim'de görülür.

2. parça (periyodik kontroller) şunları varsaydı:
1. Üç tür: yasal kontrol, sözleşme / poliçe, atık.
2. Gruplar: süresi geçti, 30 gün içinde, daha sonra; Bugün'e 7 gün içindekiler düşer.
3. Sıklık gün, hafta, ay ya da yıl; boşsa her kayıtta yeni tarih elle girilir.
4. Sonraki tarih yapılma tarihinden hesaplanır (eski son tarihten değil).
5. Atıkta miktar ve birim zorunlu; birim sabit beş kalem.
6. Kayıt değişmez ve silinmez; dosya yok, belge no var.
7. Firma yalnız etkin tedarikçilerden seçilir.
8. Kalemi yalnız idari işler yazar; müdür okur.

3. parça (yemek sayısı) şunları varsaydı:
1. Kadro, vardiya kadrosunda olup o gün vardiyası başlayan kişilerdir; ofis personeli düzeltmeyle eklenir.
2. İzinli yalnız kadrodakilerden sayılır (İK onaylı izin).
3. Fazla mesai İK'dan gelir (onay bekleyen de sayılır, izindeki sayılmaz); ziyaretçi bağlamaya kadar elle girilir.
4. Düzeltme eksi olabilir, gerekçesi zorunludur.
5. Bugün ve sonraki 7 gün bildirilir; geçmiş güne yazılmaz.
6. Yeni bildirim öncekinin yerine geçer; eski kayıt silinmez.
7. Sistem sayıyı yemek firmasına göndermez; yalnız kim, ne zaman, kaç bildirdi tutulur.
8. Bildirimi yalnız idari işler yapar (yemek-yaz, onaya bağlı); müdür okur.

4. parça (filo araç kartı) şunları varsaydı:
1. Görev talebi ve masraf ayrı parçalarda gelir.
2. Plaka "34 ABC 123" biçimine çevrilir; il kodu 01-81; tekildir.
3. Km geriye yazılmaz.
4. Muayene ve sigorta 30 gün kala, bakım 1.000 km kala uyarır; Bugün'e 7 gün kala düşer.
5. Pasif araç uyarı vermez ve listenin sonundadır.
6. Durum elle seçilir; görev parçası gelince "görevde" görevden yazılır.
7. Sevkiyat'ın araç listesi bağlamaya kadar ayrı kalır.
8. Araç kartını yalnız idari işler yazar (filo-yaz, onaya bağlı); müdür okur.

5. parça (araç görev talebi) şunları varsaydı:
1. Her çalışan kendi adına araç ister (247 a); idari işler araç verip onaylar (246 a).
2. Planlama gün düzeyinde; saat, yolcu ve yük açıklamada.
3. Talep bugünden en çok 60 gün sonrasına; görev en çok 30 gün.
4. Pasif ya da serviste araç verilmez; aynı araç kesişen tarihlerde iki göreve verilmez.
5. Onaylı görev araç çıkmadan reddedilir ya da geri çekilir.
6. Çıkışta araç görevde olur, km'si çıkış km'sine çıkar; dönüşte km dönüş km'si olur, araç müsaite döner.
7. Talep numarası yok; Bugün'e düşmez, menü sayacında görünür.
8. Müdür görevleri okur, işlem yapmaz.

6. parça (araç masrafı) şunları varsaydı:
1. Masrafı idari işler girer ve iptal eder (filo-yaz); müdür ve okuyanlar tutarları görür (oku).
2. Kayıt değişmez; yanlışı gerekçeyle iptal edilir, silinmez.
3. Tutar TL, en çok iki kuruş basamağı; KDV ve döviz yok.
4. Masraf tarihi bugünden ileri olamaz; geçmiş tarih serbest.
5. Yıl toplamı bu yılın iptal edilmemiş kayıtlarıdır; kayıt yoksa boş, sıfır değil.
6. Pasif araca da geçmiş masraf yazılır.
7. Giriş araç satırından; ayrı menü maddesi yok.

7. parça (demirbaş ve zimmet) şunları varsaydı:
1. Demirbaşı ve zimmeti idari işler yazar (zimmet-yaz, 256 a); müdür ve okuyanlar görür.
2. Bir demirbaş aynı anda tek kişidedir; yalnız boştaki zimmetlenir.
3. İade sağlamsa boşa, hasarlıysa bakıma, kayıpsa kayba düşer; zimmetli durum elle değişmez, hurda son durumdur.
4. Demirbaş numarası kayıt numarasından (DB-00001); seri no tekil değil.
5. İK'daki her iptalsiz zimmet ayrı demirbaş ve zimmet olur; iptal edilmiş İK kaydı alınmaz.
6. Kişiye bağlı olmayan personelin zimmeti adla gelir, uyarıyla görünür, bir kez kişiye bağlanır.
7. İK'daki boş tür "Diğer", sıfır ya da eksi değer "değer yok" olur.
8. Veriliş ve iade gün düzeyinde; ileri tarih yazılmaz.
