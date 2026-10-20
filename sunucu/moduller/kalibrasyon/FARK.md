# FARK: kalibrasyon vadesinin tek kuralı (kullanıcı kararı "Tek kural", kayıt hesaplar.md bölüm 7)

- Kural `paylasilan/sozlesme/kalibrasyon.ts` `kalibrasyonDurumu` (bu modülün sözleşmesi): vade = son kalibrasyon + periyot (gün ya da ay; ay sonu kısalır), elle girilmiş vade önce gelir; vadesine 30 gün ya da daha az kalan yaklaşandır.
- Davranış farkı yalnız burada: 30 gün kalan alet önceden "geçerli" sayılırdı, artık "yaklaşan" (KLB-06 sınırı; özet ve "30 gün içinde" sayısı da). Kalite Merkezi ve Denetim Hazırlığı zaten 30'u yaklaşan sayıyordu.
- `turet` kuralı çağırır; istemcide `disari.ts` `kalibrasyonKuraliBetigi()` kuralı Kalite Merkezi ve Denetim Hazırlığı çerçevelerine gömer.
- Cihaz kayıtları birleşmedi: üç ekran kendi cihaz listesini tutar (tek tanım ayrı karar). Şema, göç, işlem ve rol değişmedi.

# FARK: kalibrasyon (kart #247)

## 2. tur: tekrar koruması (kart #247 N8, dal 247-kalibrasyon-tekrar)

Taban: `main` dd5e886. Göç, paket, toplayıcı satırı yok; `disari.ts` imzaları değişmedi.
- Değişen: `POST /olcu-aletleri/:id/kalibrasyon-kaydet` tekrar korumalı (`tekrarKorumali: true`); `istek-kimligi` başlığı zorunlu, yoksa ya da UUID değilse 400.
  Aynı kişi aynı kimlikle yinelerse ikinci kayıt yazılmaz, ilk cevap döner; aynı kimlik başka gövdeyle reddedilir.
- Değişen: ekranda kalibrasyon formu kimliği açılışta bir kez üretir; `useKomut` kimlik verilince `tekrarKorumaliGonder` ile gönderir
  (cevabı gelmeyen istek aynı kimlikle yeniden denenir; hatadan sonra yeniden kaydetme de aynı kimliği kullanır).
- Eklenen testler: KLB-S8 (sunucu); "kalibrasyon kaydı istek kimliğiyle gider; ..." (ekran). Sunucu testi uygulamayı tekrar deposuyla kurar.
- Kullanıcı kararı (08.10.2026, K8): alet açma ucu (`POST /olcu-aletleri`, ilk kalibrasyonlu) korumasız kalır; tekil alet numarası çift kaydı 409 ile durdurur. Borçta.
- Kapanan borç: UYUM-BORCU 5.

## 1. tur (dal 247-tanim-modulleri)

Taban: `main` 1b74736. Göç yok, tablo değişmedi, `disari.ts` imzaları değişmedi.

## Eklenen
- `paylasilan/sayfalar/kalibrasyon.ts`: `KALIBRASYON_IKINCI_MENU` (maddeler `aletler` -> `/kalibrasyon`, `turler` -> `/kalibrasyon/turler`; işlem `sayfa.kalibrasyon`).
- `paylasilan/sayfalar.ts`: yalnız bu modülün ithali ve `IKINCI_MENULER`'deki adı (ayrı commit, kullanıcı kararı T1 a).
- `istemci/src/moduller/kalibrasyon/rotalar.tsx`: `/kalibrasyon/turler` rotası; `OlcuAletleri.tsx`: `AletTurleri` ekranı.
- Test: "yetki: sayfası olan rol kalibrasyon.oku olmadan okur ama yazamaz; ikisi de olmayan okuyamaz"; istemcide türler bölümü denetimi.
- Belgeler: `UYUM-BORCU.md`, `ORTAKLIK-kalibrasyon.md`, `GUVENLIK-DENETIMI.md`, bu dosya.

## Değişen
- `GET /olcu-aletleri`, `GET /olcu-aletleri/:id`, `GET /olcu-aleti-turleri`: `kalibrasyon.oku` -> `{ biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] }`.
- Ekran: kendi sekme şeridi kalktı; bölüm adresten gelir. `.tc-kal-icerik` üst boşluğu (sekme şeridinin altı için vardı) kalktı. Tablo, form ve düzen aynı.

## Silinen
- Ekrandaki `SEKMELER`, `Sekmeler` kullanımı ve sekme durumu.

## Onaylı kararlar
- Değişmedi: #76 (geçmiş kalibrasyon ölçümü engellemez), #97 (durumu en yeni tarihli kayıt belirler, kişi satırı silinmez, dışa aktarma ayrı kart).
- Yeni (kullanıcı, 08.10.2026, #247): sayfa yetkisi okumaya yeter, `kalibrasyon.oku` kalır; rol satırı şimdilik yok; sürüm denetimi, tekrar koruması ve tablo adları borçta.

## Varsayımlar
- Ölçü aletlerini HTTP ile okuyan başka ekran yok (grep). Geri alma: tek satır.

## Arkon aletleri buradan okur (A7, kart #518)
- `disari.aletlerVeKayitlari(db, adet)` (KAL-A7): bütün aletler, vadeye göre sıralı, alet başına en yeni `adet` kayıt eskiden yeniye, kişi adıyla (tek sorgu).
- Göç `20261011134500_kalibrasyon_arkon_kopyasi.sql` (kullanıcı kararı 4-a): Arkon `gauges` belgeleri ve kalibrasyon geçmişi bir kez kopyalanır; aynı numara varsa buradaki kalır. Test: `arkon-kopya-goc.test.ts`.

## CSV dışa aktarma (B1 K1, kart #544)
- Eklenen: Ölçü aletleri listesinde "CSV" düğmesi; ekrandaki (aramaya uyan) aletleri iner. Okuma yetkisi yeter.
  Sütunlar Arkon ölçü aletleri sekmesindeki dışa aktarmanın karşılığı; ad ve ölçme aralığı ayrı sütun. Noktalı virgül ayırıcı, UTF-8 BOM, tarih GG.AA.GGGG.
- Uç, göç, yetki değişmedi; #97'deki "dışa aktarma ayrı kart" bununla kapanır.

## Kopya göçü NULL düzeltmesi (KD-022, kart #544)
- Değişen: `20261011134500_kalibrasyon_arkon_kopyasi.sql` yerinde düzeltildi. `status` alanı olmayan Arkon alet belgesinde `kullanim_disi` NULL kalıyor,
  NOT NULL kısıtı göçü ve arkasındaki zinciri durduruyordu; `at` alanı olmayan kalibrasyon kaydı da tarihsiz eklenmeye çalışıyordu. Şimdi durumsuz alet kullanımda sayılır, tarihsiz kayıt atlanır.
- Neden yeni göç değil: hata bu göçün içinde, ondan önce koşar; sonraki bir göç zinciri açamaz. Göç başarısız olduğu yerde kaydı yoktur, düzeltilmiş hali koşar.
- Eski hali başarıyla uygulanmış veritabanında (yani durumsuz belge yoktu, sonuç aynıdır) koşucu "Uygulanmış göç değiştirilmiş: 20261011134500_kalibrasyon_arkon_kopyasi.sql" der.
  O durumda göç sahibi rolüyle tek satır yeter: `UPDATE goc_kaydi SET ozet = '08757107dbf919bf8028227a8cd832c3579a38499e5943a7cc612186fcad77b8' WHERE ad = '20261011134500_kalibrasyon_arkon_kopyasi.sql';`
- Test: "durum alanı ya da kayıt tarihi olmayan belge zinciri durdurmaz" (düzeltmeden önce NOT NULL hatasıyla kırmızıydı).

## Ölçü aleti simgeleri (kart #843)
- Eklenen: her alet türü kendi çizgi simgesini alır (`istemci/src/moduller/kalibrasyon/alet-simgeleri.tsx`): kumpas, mikrometre, iç çap mikrometresi, komparatör,
  tampon ve halka mastar, diş ve radyüs mastarı, yükseklik mihengiri, CMM, tork anahtarı, kaplama kalınlık ölçer; tanınmayan tür genel ölçü simgesi alır.
- Görünür yerler: alet listesi Tür sütunu, alet ayrıntısı Tür satırı (pencere başlığı düz metin), Türler tablosu.
- Eşleme tür adından yapılır (büyük-küçük harf, Türkçe harf ve boşluk fark etmez). Uç, göç, yetki değişmedi.

## Örnek veri (kart #906)
- Eklenen: `ornek-veri.ts` (`npm run ornek-veri` ile, kisiler'den sonra). 8 ölçü aleti `ORN-` numaralı, 7 türde; kayıtlar `ornek.kalite` adına, sertifika no `ORN-SRT-`.
  Örnek günden sayılarak: 2 alet 15 gün içinde doluyor (yaklaşan), 1 alet 15 gün geçmiş, 5 geçerli; bir alette iki kayıtlık geçmiş var.
- Yazım servis üzerinden (tür ve gelecek tarih kuralları geçer); kişi `kisiler/disari.ts` `kisiNoKullaniciAdindan` ile bulunur. `ORN-` numaralı alet varsa yüklü sayılır.
- Uç, göç, yetki değişmedi.
