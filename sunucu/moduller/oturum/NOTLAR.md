# oturum notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.
- Bekleme sırasında reddedilen deneme kaydedilmez ve sayılmaz (kullanıcı kararı, 06.10.2026): sayılsaydı
  sabırsız kullanıcının beklemesi kendi kendine uzardı. Şemadaki üçüncü sonuç değeri kullanılmıyor;
  kaldırmak şema kararıdır.
- Aynı kullanıcı adı + IP'den aynı anda tek deneme yürür; ötekiler beklemeden 429 alır (kullanıcı
  kararı, 06.10.2026). Vazgeçildi: sıraya sokan (bekleyen) kilit; bekleyen her istek bir bağlantı
  tutuyor, tek çift havuzu doldurup herkesin girişini kesiyordu. Kilitsiz denemeler beklemeyi atlatır.
- 429 kullanıcıya ve parolaya bakılmadan, hiçbir şey yazılmadan döner; yazarsa ya da sayarsa eşzamanlı istek
  gönderen biri başkasının adına bekleme üretir. Eski kayıt temizliği yalnız parolaya bakılan denemede koşar.
- Vazgeçildi: kilit anahtarını veritabanının 32 bit metin özetiyle üretmek; çakışan ad dakikalar içinde
  bulunuyor, adını ve cihazını bildiği birinin girişini başka cihazdan 429'a düşürmeye yetiyordu.
- Kilit veritabanı genelindedir, anahtara şema katılır: paralel test şemaları birbirine 429 verdiriyordu.
- Test: 429 yolunun parolaya bakmadığı, kişi tablosu kilitliyken de hemen dönmesiyle ölçülür.
- Sıfırlama aynı ad + IP çiftine özeldir; başka cihazdaki doğru giriş bu cihazın sayacını silmez.
- Kimlik çözücü okuma isteğinde de transaction dışında yazar (son görülme); oturum zaman aşımı buna dayanır.
- Bastırma seçeneği yalnız girişte kullanılır; yayılırsa bastırılan 401 gerçek oturum bitişini gizler.
- Test: saat uç fabrikasından verilir, üretimde boştur (veritabanı saati). Gerçek saat beklenmez.
- Silme yalnız 30 günden eski satırda serbest (kullanıcı kararı, 06.10.2026). Varsayım: koruma veritabanı saatine bakar.
  Test: eski satırı veritabanı, genç satırı test saatine göre kur; test saati genç satırı 30 günü aşırırsa girişler 500 olur.
- Test: başarısız giriş yapan test aynı kullanıcıyla sonraki testleri bekletir; her teste ayrı kullanıcı.
- Test: eşzamanlı giriş testinde önce havuzu ısıt; soğuk havuzda kilit kaldırılınca da yeşil kalır.
  Serbest yarışan 20 istek bekleyen kilitle de yeşildir (hepsi sırayla biter); beklemeyi yalnız
  kilidi testin kendisinin tuttuğu ve cevapları süre sınırıyla beklediği test yakalar.
- Test: art arda kurulan iki hatalı serinin ikincisi saati ilerletip ilkinin beklemesini bitirir.
- GET /oturum'da kimlik iki kez çözülebilir: txDisi uçta çekirdek veritabanı hatasını yutup null verir, işleyici
  çerez varsa yeniden çözer; veritabanı hâlâ yoksa 503, böylece çerezli istek giriş ekranına düşmez.
- Vazgeçilen yol: çekirdekte "txDisi uçta çerez varsa 503". Çekirdek çerez adını bilmez; aynı kural sağlık
  uçlarını da kapsar, girişli tarayıcı /saglik'ten 503 alırdı.
