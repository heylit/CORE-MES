# Stok ve teslim

Kural kodu: STK. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| STK-01 | Bakiye saklanmaz, hareketlerden hesaplanır; bir hareket silinince bakiye kendiliğinden düzelir. | Değişmez | onay bekliyor | Her okuma bütün hareketleri tarar, bedeli budur. |
| STK-02 | Giriş ve üretim hareketi hedef lokasyona artı yazar; sevk ve fire kaynak lokasyondan eksi yazar; sayım hedefe işaretli düzeltme yazar. | Hesap | onay bekliyor | |
| STK-03 | Sayımda kullanıcı sayılan mutlak adedi girer, saklanan fark (delta) olur. | Hesap | onay bekliyor | |
| STK-04 | Lokasyonlar arası aktarım ayrı bir hareket türü değildir; teslim ile yürür ve bakiye hesabı ikisini birleştirir. | Tanım | onay bekliyor | |
| STK-05 | Teslim (zimmet), parçanın bir kişiye ya da istasyona devredilmesidir; hedef yalnız kişi veya istasyon olabilir. | Tanım | onay bekliyor | |
| STK-06 | Teslim sayarak yapılır; bakiyeye alıcının saydığı adet yazılır, gönderilen adet değil. | Değişmez | onay bekliyor | |
| STK-07 | Onaylanmamış (yoldaki) teslim bakiyeyi etkilemez; yoldaki mal iki yerde birden sayılmaz. | Değişmez | onay bekliyor | |
| STK-08 | Teslimat kodu yalnız alıcıya görünür ve teslim edene dönen cevaptan çıkarılır; istasyona teslimde kod üretilmez. | Değişmez | onay bekliyor | |
| STK-09 | Teslim "bekliyor" açılır ve dört yoldan kapanır: alıcı sayıp onaylar, alıcı kodu söyler teslim eden girer, taraflardan biri elle kapatır, alıcı yoksa mal bir yere bırakılır. | Akış | onay bekliyor | Bırakılan yer haritada göz olarak yazılır. |
| STK-10 | Teslim hedeften eksik ya da fazla sayılabilir ve engellenmez; fark açıkça yazılır, fazlada ek onay istenir. | Sınır | onay bekliyor | |
| STK-11 | Negatif stok yasaklanmaz, onaya bağlanır: fazla çıkış "mevcut: X" uyarısı verir, kullanıcı onaylarsa hareket yazılır. | Sınır | onay bekliyor | Mal geldi ama kayıt girilmedi gibi saha gerçeğine uyum. |
| STK-12 | Negatif bakiye gizlenmez; hata saklanmaz. | Değişmez | onay bekliyor | |
| STK-13 | Ara yarı mamul kalemleri açılmaz; parça hammadde kalemiyle girer, operasyonlar ilerledikçe statüsü değişir. | Sınır | onay bekliyor | Çift sayım olmasın diye. |
| STK-14 | Bir operasyonda bekleyen miktar deftere yazılmaz, türetilir: o operasyonun sağlamı eksi (sonraki operasyonun sağlamı artı fire). | Hesap | onay bekliyor | |
| STK-15 | Mamul, depocu sayarak teslim alınca stoğa girer; iş bitince girmez. | Akış | onay bekliyor | |
| STK-16 | Üretim girilince reçete bileşenleri depodan otomatik düşer ve fire de bileşeni tüketir. | Akış | onay bekliyor | |
| STK-17 | Aynı operasyon numaralı birden çok adım varsa bileşen yalnız temsilci adımda düşer; adıma eşlenmiş reçete satırı varsa hammaddenin kendi tüketimi yapılmaz. | Değişmez | onay bekliyor | Çift sayım korumaları. |
| STK-18 | Her otomatik stok hareketi onu doğuran üretim kaydının kimliğini taşır; geri alma tam o hareketleri ters çevirir. | Değişmez | onay bekliyor | |
| STK-19 | Hammadde partisi bakiyeyi bölmez, yalnız iz tutar; bakiye eksen olarak parça ve lokasyondur. | Değişmez | onay bekliyor | |
| STK-20 | Sistem hammadde partisini tahmin etmez: tek aday ve kalan yeterliyse bağlar, aday yoksa ya da çoksa ya da kalan yetmiyorsa bağ boş kalır ve belirsizlik yazılır. | Değişmez | onay bekliyor | Uydurulmuş iz izsizlikten kötüdür. |
| STK-21 | Mamul girişi parti taşımaz. | Değişmez | onay bekliyor | Tükenmiş parti yeniden açık görünmesin. |
| STK-22 | Kullanım sırası (ilk giren ilk çıkar, son kullanma) uygulanmaz; sırayı depo belirler. | Sınır | onay bekliyor | Arayüzde karşılıksız vaat edilmemeli. |
| STK-23 | Sistem veri yoksa öneri ya da sayı uydurmaz; yetersiz veri "veri yetersiz" diye söylenir. | Sınır | onay bekliyor | |
| STK-24 | Eski sistem stok kalemi türleri (mamul, yarı mamul, hammadde, sarf, kimyasal) ve altı lokasyon (hammadde, üretim, kalite, sevk, fason, hurda) kullanıyordu. | Açık soru | onay bekliyor | Yeni sistemin ilk kapsamında hangi türler ve lokasyonlar olsun? |
| STK-25 | Mal kabul ve girdi kalite kararı ilk kapsamda yok; stok girişi nasıl olacak? | Açık soru | onay bekliyor | Hammadde girişi doğrudan depoya mı yazılsın? Teslim/zimmet ilk kapsamda mı? |
