# uretim-emirleri notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Emir no kimlikten türeyen üretilmiş sütundur (`UE-000123`): ayrı sayaç yok, yarışta çakışmaz. Kimlikte boşluk
  olabilir (geri alınan açış); emir no ardışık sayılmamalı.
- Makinede tek iş (kart #1143, kullanıcı kararı; #241'in istasyon kilidinin yerine): kilit `uretim_emirleri_makine_kullanimi`
  tablosundaki açık satırdır. Makineli işte makine başına, makinesiz işte istasyonun makinesiz yerinde bir açık satır olur
  (kısmi tekil dizinler `_makinede_tek`, `_istasyonda_tek`). Duraklatma, durdurma ve bitirme satırı kapatır (eski kuralda
  durmuş emir istasyonu tutuyordu); devam son kapanan makinelere döner. Servisteki ön denetim dolu cevabını (kim, hangi iş,
  kullanım kimliği) verir; yarışı kaybeden 23505 `MAKINE_DOLU` ya da `ISTASYON_DOLU` ile 409 olur. Devralma kullanım kimliğiyle
  tek işlemde kapatıp açar; öteki işin açık satırı kalmazsa o iş duraklatılır.
- `uretim_emri.calisma` olay defterinin gölgesidir: `uretim_olayi` AFTER INSERT tetikleyicisi yazar; tek istisna başlatmadır
  (`baslamayiYaz` 'calisiyor' yapar: iş emirli emirde önceki iş emrinden kalan hâl sıfırlanır). Bitmiş emirde sütun bayat kalabilir.
  Kural değişirse dizin ve tetikleyici birlikte değişir.
- Bilinen sınır: TMI terminal ekranı yeni kuralı bilmiyor (duraklamış varken "İşi Başlat" kapalı kalır; duraklamışta
  "Durdur" görünür ve 409 alır); ekran dışarıdaki yazımda.
- Başlat ve bitir emri `FOR UPDATE` ile kilitler; aynı emre eşzamanlı iki komut sıraya girer, ikincisi güncel
  durumu görüp 409 alır.
- Pasif istasyon: iş merkezi pasifse istasyon da pasif sayılır (`istasyonlar/disari.ts` aktif listesi).
- Defter (`uretim_kaydi`) çok seferli üretime hazırdır: (emir, olay) benzersiz DEĞİL. Tek başlat / tek bitir
  kuralını emir durumu taşır.
- Komutlar (başlat, bitir, sayım, duraklat, devam, durdur) ve kimlikle emir özeti `disari.ts`'te dışa açıktır: Arkon
  sayımının emre yansıması için (kart #211, kullanıcı istisnası). Dış teslimde korunmalı; kaldırılırsa Arkon derlenmez.
- Sayım uçları denetimde gövdesizdir (kart #189, kullanıcı kararı). Tekrar koruması bilerek yok: terminal ekranı
  istek kimliği başlığı göndermiyor, bayrak eklenirse ekran 400 alır; önce ekran, sonra bayrak.
- İş emirli emirde satır terminal kartıdır (ilk sistem): iş emirleri arasında emir yeniden `planli` olur, `baslama` silinir, istasyon
  sıradakinindir (boş olabilir). Ekran durumu iş emirlerinden türer (`gorunenDurum`). Sayaç, olay ve kontrol listesi `TERMINAL_IS_EMRI`
  kapsamında okunur; defter satırları iş emri bitmeden yazılmalıdır (kapsam çalışan iş emridir).
- Malzeme resmi (kart #688): liste ve ayrıntı küçük resmi istemcide çizim merkezinden alır (`cizimler/disari.ts` `useKucukResimler('malzemeler', malzemeNo)`, tek istek); emir cevabı değişmez, terminalin açık emir okuması büyümez. Resim okunamazsa ekran resimsiz çalışır.
