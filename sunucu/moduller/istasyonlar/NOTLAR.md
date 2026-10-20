# İstasyonlar notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Karar (06.10.2026, kart #31): kod değişebilir, bağlar sayı kimlikledir; istasyon silinince makinesi
  istasyonsuz bırakılmaz. Kullanımdaki kayıt silinmez, pasife alınır; bunu yabancı anahtarlar tutar
  (silmede 23503 "kullanımda" iletisine çevrilir). Başka modüller kendi bağlarını kısıtla ekler.
- Kişi-iş merkezi kısıtı bu modülün tablosudur. Boş liste "kısıt yok" demektir; bu yüzden `disari.ts` boş dizi
  döner, null değil.
- Karar (06.10.2026, kart #95): kısıttan yalnız bütün işlemleri taşıyan rolü olan kişi muaftır; tesisi yönetme
  yetkisi muafiyet değildir. `disari.ts` uygulanan kısıtı döner (muafta boş); kayıtlı liste uçtan okunur ve
  muaf kişide de saklanır, bayrak kalkınca kendiliğinden geçerli olur.
- Karar (kart #95): kısıtı kişinin kendisi ve tesisi yöneten okur. Yetki varlıktan önce denetlenir; yetkisiz
  okuyan olmayan kişide de 403 alır. Uç `oturum` ister, ayrım serviste: çekirdek "kendisi ya da işlem" diyemiyor.
- Karar (kart #95): kısıtı olan kişi silinemez (silme zincirlemesi yok); pasif kişinin kısıtı okunur ve yazılır.
- Karar (kart #95): pasif iş merkezinin aktif istasyonu seçim listesinde ve `disari.ts` aktif listelerinde
  görünmez; kısıtında yalnız pasif iş merkezi kalan kişi hiç istasyon görmez (serbest kalmaz). Pasifler
  istenince hepsi döner; tekil getirme iş merkezinin durumuna bakmaz. Aynı sorgu `GET /istasyonlar` ucunu da besler.
- Kısıta yalnız aktif iş merkezi eklenir; kişide zaten kayıtlı pasif satır korunur, yoksa kişi sessizce serbest kalırdı.
- İstemci `paylasilan/sozlesme` değer ithal edemez (zod); tip ve bağlantı etiketleri `etiketler.ts` içindedir.
- Terminal tabletinin istasyonu (ARK-IST-14, 15) tarayıcıda tutulur; terminal modülüyle gelir. Bu modül yalnız
  `IstasyonSecimi` bileşenini ve `disari.ts` verir. Kişinin iş merkezi kısıtı
  Personel bölümünde kişi kartındadır (#1109); yalnız `istasyonlar.yaz` taşıyana görünür, kişi listesi bu modülün `GET /kisi-secenekleri` ucundan gelir.
- Ekran bölümü adresten okur; ikinci menü değeri istemciye ithal edilemez (`paylasilan/sayfalar/` alt dosyası zod listesinde değil), bölüm tablosu `Istasyonlar.tsx` içindedir.
- Test: yerleşik rollerde tesis yazma işlemi yalnız bayraklı rolde var; bayraksız sahibi için geçici rol kurulur.
  Kişi açma ve pasife alma `kisiler` uçlarıyladır (#105 testleri); kişi silme işlevi yok, yalnız IS1 silmeyi SQL'le dener (UYUM-BORCU 8).
- Karar (08.10.2026, kart #105): aynı gün ikinci atama değişikliği o günün satırına yazar (gün içi geçmiş yok); ataması olan istasyon, makine ve kişi
  silinmez (409), pasife alınır; pasif kişiye atama yapılmaz. Yüzde toplamı satırlar arası kuraldır: kişi bazında `pg_advisory_xact_lock` ile sıralanır.
- Karar (E3k): ileri tarihten çıkarma aynı hedefteki daha ileri planlı satırları iptal eder; yoksa kişi o satırın gününde sessizce geri gelir. İptal silme değildir.
