# Uyum borcu: dosya

Sahip: çekirdek konusu.

1. KAPANDI (#142): temizlik (bayat şerit 1 gün, bağsız dosya 7 gün) yüklemeden çıktı, `isler.ts` `dosya-temizlik` işinde saatte
   bir koşar; sorgu başına sınır aynı (10 şerit, 2 dosya), tur başına her sorgu en çok 10 kez. 200 MB'lık dosyaların silinmesinin
   10 sn sorgu sınırına sığdığı hâlâ ölçülmedi.
2. Bağlayan modül yok: malzemeler (#300), kalibrasyon (#301), Arkon (#302) kendi kartlarıyla bağlanır. Arkon'un "özetini bilen her
   rol dosyayı okur" açığı #302 ile kapanır.
3. KAPANDI (#144): bağ işlevleri `dosyaTutamagi(modul)` tutamağındadır, modül adı tutamakta sabittir; adı modül klasörü olmayan
   tutamak açılışta hata verir. Kalan: bir modülün başka modülün adıyla tutamak alması kodla engellenmez (sınır kuralı araç işidir).
4. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kullanıcı kararı DSb a (08.10.2026); ihtiyaç doğarsa ayrı ele alınır. Bağlı bir dosyanın, yeniden yüklenmeden başka bir kayda kopyalanması (b seçeneği) ihtiyacı doğarsa ayrıca ele alınır; Arkon deposunun
   taşınması (adım 4, #302) bu kurala takılırsa o adımın listesinde sorulur. (Kullanıcı kararı DSb a, 08.10.2026.)
| DSK-B1 | Diske alma bağlama isteğinde eşzamanlı yapılır (200 MB videoda istek uzar); arka plan işine alınması | Ölçümle, gerekirse ayrı iş |
| DSK-B2 | Canlıda disk deposu kapalı: yedek aynası ("Talimat medyasını yedeğe ekle") birleşince `diskeYazilabilir` canlı koşulu kaldırılır | Ayna birleşince |
