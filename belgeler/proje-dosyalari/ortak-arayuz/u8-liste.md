# U8: ikinci menü 768 px'ten itibaren solda (liste, yazım yok)

Kaynak: satın alma teslimi `CEKIRDEK-ISTEKLERI.md` Ç5 ve `tur4-raporlar/satin-alma-tani.md` (U8, Ç5 "ayrı kart, bu dalda yapılmaz").
Taban: main 959c15a. Dal açılmadı, commit yok. Ölçüm, Kabuk.tsx'e geçici tek satırla yerelde yapıldı, sonra dosya geri alındı (`git status` temiz).
Ölçümde veritabanı boştu (yönetici, kayıt yok). Chromium depo dışında, dokunmatik açık.

## 1. Teslimin önerisi (Ç5)
- Kip eşiği 1280'den 768'e iner: `genis-ekran.ts` içine `(min-width: 768px)` ölçütü gelir ve `Kabuk` `ikinciKip`'i bundan alır. Telefonda (<768) şerit kalır.
- Stilde değişiklik gerekmiyor, çünkü `.tc-kabuk[data-ikinci="sutun"]` tablet medya kuralından daha belirgin. DOĞRULANDI: geçici yamayla 768 ve 1024'te ızgara doğru kuruldu, taşma yok.
- Teslimin kabuk farkı alınmaz. Teslimden sonra kabuğa daraltma ve tam ekran geldi (#292). Değişiklik bu kartta depodaki kabuğa yazılır.

## 2. Kabukta değişecekler
1. `genis-ekran.ts`: `useIkinciSutun()` (`min-width: 768px`). `useGenisEkran` (1280) ana menü ve terminal için olduğu gibi kalır.
2. `Kabuk.tsx`: `ikinciKip` yeni ölçütten okunur. Daraltma düğmesi ve tam ekran sütun kipine bağlı olduğu için tablette de çalışır; ek kod gerekmez.
3. Varsayılan dar kuralı: bugün yalnız çerçeveli sayfada ve 1536 altında dar açılıyor. Tablet için soru 2.
4. B8 kaydırma işareti yalnız telefonda kalır; tablette şerit artık yok.
5. `kabuk.css`: yalnız başlık yorumu ("tablet 768-1279") güncellenir.

## 3. Etkilenen ekranlar (içerik genişliği x yüksekliği, px; DOĞRULANDI, ölçüm)

| Sayfa | 768x1024 önce (şerit) | 768 sonra: dar / geniş | 1024x768 önce | 1024 sonra: dar / geniş |
|---|---|---|---|---|
| Arkon (çerçeveli) | 696x907 | 624 / 448 x968 | 952x651, masaüstü düzen, zoom 0.565 | 880 / 704 x712; ikisi de Arkon'un mobil düzeni (900 altı) |
| Malzemeler (çerçeveli) | 696x907 | 624 / 448 x968 | 952x651 | 880 / 704 x712 |
| Satın alma, istasyonlar, personel, ayarlar, duruş nedenleri, kalibrasyon, denetim | 696x907 | 624 / 448 x968 | 952x651 | 880 / 704 x712 |

- Bugünkü kurala göre çerçeveli sayfa dar, ötekiler geniş açılır.
- Yükseklik kazancı: şerit satırı kalkıyor; 768'de 61 px, 1024'te 61 px.
- Taşma: dokuz sayfanın hiçbirinde sayfa ya da içerik taşması yok, iki halde de (DOĞRULANDI, boş veri). Dolu listelerde BİLMİYORUM.
- Arkon 1024: önce masaüstü düzeni 0.565 zoom'la küçülüyordu; sonra çerçeve 900'ün altında kalıyor ve Arkon kendi mobil düzenine geçiyor (`baslat.ts` useFit). Görüntü: `u8/k-arkon-1024.png`. Tam ekranda 1024 olur ve masaüstü düzen döner.
- Malzemeler (M3/M4 sonrası): prototip kendi kırılımlarını çerçeve genişliğine göre kurar (katalog.html: 620, 860, 900, 980, 1100).
  - 768 dar (624): 768 düzeni korunuyor, M3'ün beş öğesi (QR okut, Ayarlar, mm/kg, in/lb, not) üst satırda (`u8/k-mlz-768.png`).
  - 768 geniş (448): 620 altına iner, prototipin telefon düzeni.
  - 1024 dar (880): 900 kuralı devreye girer. M4 (çerçeve yüksekliği) etkilenmez, çerçeve içerik alanını dolduruyor.
- Satın alma: kendi `styles.css` kırılımları pencere genişliğine bakıyor (700, 900, 1100, 1180), içerik genişliğine değil. 768'de içerik 448 olduğu halde 700 üstü kuralları uygulanıyor. Boş ekranda taşma yok (`u8/k-sa-768.png`); dolu teklif tablolarında sıkışma riski VARSAYIM, ölçülmedi.
- Öteki altı modülün kendi kırılımı yok ya da 479'da (personel, ayarlar); etkisi yalnız genişlik.

## 4. Test ve ekran görüntüsü planı
- Birim (izinli ve reddedilen):
  - 768'de sütun; 767'de şerit (reddedilen).
  - Tablette varsayılan dar kuralı, soru 2'nin cevabına göre.
  - Tablette daraltma düğmesi var ve seçim kişi ve modül başına saklanır.
  - B8 okları yalnız 767 ve altında.
- Değişecek testler:
  - `ikinci-menu-daralt.test.tsx` "şerit kipinde (1280 altı)": 1024 yerine 767.
  - `IkinciMenu.test.tsx:158` ve `tam-ekran.test.tsx:112` ölçütlerine bakılır.
- Tarayıcı:
  - Ölçüm: 768x1024, 1024x768, 1279x800 ve 767x1024, dokuz modül kökü, dar ve geniş; içerik genişliği, taşma, Arkon düzeni ve zoom.
  - Görüntü: önce ve sonra, 768 ve 1024, Arkon, malzemeler ve satın alma.
- Kabul: kullanıcı tablette dener.

## 5. Kart önerisi
- Yeni kart: "İkinci menü tablette sol sütun (satın alma U8 / Ç5)". Şerit `istemci/src/ortak`, tek `cekirdek-yazari`. Dal `<kart>-ikinci-menu-tablet`.
- Bağımlılık yok, satın alma oturtmasından bağımsız. Satın alma teslimindeki kabuk farkı oraya girmez.
- Hafif yol: kabuk görünümü; yetki, şema ve uç yok.
