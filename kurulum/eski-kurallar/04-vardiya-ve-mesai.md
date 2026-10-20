# Vardiya, takvim ve mesai

Kural kodu: VAR. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| VAR-01 | Kapasite dört katmandan gelir ve üstteki alttakini ezer: güne özel takvim, resmî tatil, haftalık rutin, varsayılan şablon. | Tanım | onay bekliyor | |
| VAR-02 | Haftalık rutin hafta günü bazlıdır ve saat aralıklı bloklardan oluşur; bir tabandır, belirli güne girilen plan onu ezer. | Tanım | onay bekliyor | Örnek: her salı 08:00 ile 16:00. |
| VAR-03 | Gece yarısını geçen vardiyanın süresi doğru hesaplanır (22:00 ile 06:00 arası sekiz saattir). | Hesap | onay bekliyor | Süre kuralı tek yerde durur, ekran kopyalamaz. |
| VAR-04 | Tek kaynağın günlük kapasitesi ham saat çarpı kişi sayısıdır; pasif kaynağın kapasitesi sıfırdır. | Hesap | onay bekliyor | |
| VAR-05 | Üyeli kaynağın (ekip ya da havuz) kapasitesi üyelerin kapasite toplamı artı havuzun kendi mesaisidir. | Hesap | onay bekliyor | |
| VAR-06 | Kişi kaynağının vardiyası girilmemişse günlük 9 saate kırpılır (07:30 ile 17:30, bir saat mola); elle girilen vardiya kırpılmaz. | Hesap | onay bekliyor | |
| VAR-07 | Kişi tavanı bilinçle korunur; kaldırılırsa 28 günlük kapasite sessizce yaklaşık yüzde 22 şişer. | Değişmez | onay bekliyor | Eski sistem ölçümü. |
| VAR-08 | Ekip ya da havuz üyeleri kapasite tablosunda ayrı satır olarak sayılmaz. | Değişmez | onay bekliyor | Çift sayım. |
| VAR-09 | Çizelge, yük ve doluluk, pano aynı kapasite hesabını kullanır; üç yerde üç farklı sayı çıkmaz. | Değişmez | onay bekliyor | |
| VAR-10 | Ek mesai yaşam döngüsü: talep, onaylı, tamamlandı (ya da reddedildi, iptal). | Tanım | onay bekliyor | |
| VAR-11 | Kapasiteye yalnız onaylı ve tamamlanmış mesai girer; tamamlandıysa planlanan değil gerçekleşen saat geçerlidir. | Hesap | onay bekliyor | Sekiz saat planlanıp üç çalışıldıysa kapasite üçtür. |
| VAR-12 | Mesai kapasite tavanının üstüne eklenir; çarpan (1,0, 1,5, 2,0) yalnız maliyet içindir, kapasiteye çarpılmaz. | Hesap | onay bekliyor | |
| VAR-13 | Onaylı mesaiyi değiştirmek (süre, gün ya da kaynak) onayı düşürür ve kapasiteden çıkarır. | Değişmez | onay bekliyor | |
| VAR-14 | Aynı gün ve aynı kaynakta ikinci aktif mesai kaydı açılamaz. | Değişmez | onay bekliyor | Çift kapasite olmasın. |
| VAR-15 | Talep aşamasındaki mesai plana girmez. | Sınır | onay bekliyor | |
| VAR-16 | Havuz kaynağına haftalık rutin doğrudan girilmez; havuzun kendi mesaisi ile üyelerin kapasitesi birlikte sayılır. | Açık soru | onay bekliyor | Kaynakta bu iki cümle birbirini tam örtmüyor; havuzun kendi mesaisi olabilir mi? |
| VAR-17 | Eski sistemde varsayılan şablon tezgahlara haftada beş ya da altı gün, günde 20 saat veriyordu (kaynaklar hafta sonu konusunda çelişiyor). | Açık soru | onay bekliyor | Yeni sistemin varsayılan haftası ne olsun? |
| VAR-18 | Tatil, izin ve fazla mesai takvimi eski sistemde hiç elle girilmemişti, bütün kapasite varsayılandan geliyordu. | Açık soru | onay bekliyor | Resmî tatil günleri nereden gelsin? Elle mi, hazır liste mi? |
| VAR-19 | Kişi için 9 saat tavanı ve bir saat mola varsayımı. | Açık soru | onay bekliyor | Yeni sistemde de aynı mı kalsın? |
