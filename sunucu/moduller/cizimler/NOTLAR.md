# NOTLAR: cizimler

- Dosya içeriği `dosya` modülünde, özetle tekildir; merkez yalnız revizyona bağlar. Aynı dosya iki belgede revizyon olabilir, bir belgede iki kez olamaz.
- Yayınlanmış revizyon veritabanında da değişmez (tetikleyici `cizimler_revizyon_degismez`): eski çizimle üretilmiş parçanın izi kaybolmasın.
- STEP ve IGES görüntüsü cihazda üretilir (occt wasm, ayrı iş parçacığı); sunucuda dönüşüm yok. Büyük modelde açılış cihaza bağlı.
- Tarayıcıda denendi (12.10.2026, Chromium, yazılım WebGL): PDF, STEP ve IGES yüklendi ve açıldı; 360 ve 1280 genişlikte düzen tam.
- Önizleme kareleri belgeyi değiştirmez: belge sürümü ilerlemez, kareler revizyon dosyasından ayrı kayıt anahtarında (`<belge>/onizleme/<revizyon>`) bağlanır. Kareleri tarayıcı üretir; sunucu yalnız PNG, 64 KiB ve 512 KiB sınırını denetler, içeriğin modele benzediğini denetleyemez.
- `yayindakiOnizleme` birden çok bağlı 3B modelden bağın eklenme sırasına göre ilkini seçer (eşitse belge kimliği); istasyonda zaten tek model vardır.
- Eskiye düşen revizyonun kareleri ve dosya bağları kalır; `disari.ts` yalnız yayındakini verir. Birikim revizyon başına en çok 512 KiB.
