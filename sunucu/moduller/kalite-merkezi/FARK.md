# FARK: balon yeri kalıcı (894 a, 913 a)

- Göç `20261027082000_kalite_merkezi_balon_yeri.sql`: `kalite_merkezi_balon`a boş olabilen `yer_x`, `yer_y`, `yer_kipi` ve kısıtları. Dolu satırlar değişmez; yeri olmayan balon ekranda kendiliğinden dizilir.
- Sözleşme: `kmBalon` ve `kmBalonGirdisi` `yer`, `yerKipi` taşır; yeni `kmBalonYeriGovdesi`, `kmBalonCevabi`.
- Yeni uç `POST /kalite-merkezi/studyo/balonlar/:balonId/yer` (`kalite-merkezi.onayla`, yeni işlem yok): balonun kendi sürümüyle yazılır, plan sürümü artmaz. Kontrol planı yazımı da yeri taşır; verilmeyen yer boşalır.
- Ekran: plan taslağı yokken taşınan balon yeni uca, taslak açıkken taslağa gider (`Resim` `yerYaz`). Arkon Hazırlık görünümü yeri `cizimBalonu` ile kendiliğinden gösterir.
- Testler: `balon-yeri.test.ts` (KM-S30..S33), `studyo/kurallar.test.ts`.

# FARK: Kalite Merkezi'nde ayrı PIN girişi yok, giriş TMI oturumu (kullanıcının yazılı onayı, 2026-10-16 06:37 UTC)

- Sunucu (`kurallar.ts`, `servis.ts`): "kullanici" ve "settings" kayıtlarını yalnız yönetici yazar ve siler (`kisiBayrakliMi`); öteki yazma yetkilisi 403 alır. "kullanici" kaydının `pin` alanı yazmada ve geri yüklemede saklanmaz. Yeni işlem ya da rol yok.
- Yeni uç `GET /kalite-merkezi/kimlik` (`kalite-merkezi.oku`): oturumdaki kişi, yönetici olup olmadığı; rol verilecek etkin kişiler yalnız yöneticiye.
- Göç `20261016070331_kalite_merkezi_pin_ozetleri_sil.sql`: kayıtlı "kullanici" gövdelerinden `pin` silinir, kayıt yeni sürüm alır; öteki alan ve kayıtlar aynı.
- Ekran (`sayfa.ts`, `acilis.ts`): PIN ekranı açılmaz; uygulamanın kullanıcısı oturumdaki kişidir. Rol "tmi-<kişi>" kimlikli kullanıcı kaydından gelir; kaydı olmayan ya da pasif kişi Muayeneci, TMI yöneticisi Kalite yöneticisidir. Yetki denetimi kullanıcı kaydı olmasa da açıktır (önce kayıt yokken herkes her işlemi yapabiliyordu). Kullanıcı formu PIN yerine TMI kişisini seçtirir. Çıkış düğmesi ve uygulamanın oturum zaman aşımı kalktı (TMI'nin). Kullanıcılar sayfasının PIN metinleri yenilendi.
- PIN dönemindeki "u_..." kayıtları kimseyle eşleşmez; listede durur, yönetici rolü "Kullanıcı ekle" ile yeniden verir.
- Testler: `pin-davranisi.test.ts` (çevrildi, kimlik ucu ve göç testi eklendi), `istemci/.../giris.test.ts` (giriş kapısı, yetki, kullanıcı formu; giriş kapısı yeri kaldırılınca beşi de kırılır).

# FARK: cihaz kalibrasyon durumu Kalibrasyon modülünün kuralıyla hesaplanır (kullanıcı kararı "Tek kural")

- `sayfa.ts` kurulumda uygulamanın `devStatus` hesabını Kalibrasyon kuralına bağlar (`CIHAZ_DURUMU_YERI`; paket değişmedi, yeniden üretilince yer bulunamazsa sayfa kurulmaz). Metinler, renkler ve "ölçümde kullanılabilir" bayrağı aynı.
- Davranış aynı: periyot ay, 30 gün ya da daha az kalan "Yaklaşıyor". Testler `hesaplar.test.ts` (çerçeveye kurulan sayfadan) ve `sayfa.test.ts`.

# FARK (kalite-merkezi) — taban baaf00c

Modül depoda yok; bütün dosyalar yeni. Var olan dosya ve kural değişmedi (toplayıcı satırları CEKIRDEK-ISTEKLERI'nde). Ekran yolu: **A**
(uygulama değiştirilmeden yalıtılmış çerçevede; menü kabukta). Kaynak: KaliteMerkezi_yerel.zip içindeki KaliteMerkezi.html.

## Eklenen dosyalar
- `paylasilan/sozlesme/kalite-merkezi.ts`, `paylasilan/islemler/kalite-merkezi.ts`, `paylasilan/sayfalar/kalite-merkezi.ts`
- `sunucu/gocler/20261012041036_kalite_merkezi.sql`: `kalite_merkezi_belge` (jsonb, tek sürüm dizisi), iz değişmezlik tetikleyicisi.
- `sunucu/moduller/kalite-merkezi/`: `kurallar.ts`, `sorgular.ts`, `servis.ts`, `uclar.ts`, `kurallar.test.ts`, `kalite-merkezi.test.ts`,
  `NOTLAR.md`, `UYUM-BORCU.md`, `ORTAKLIK-kalite-merkezi.md`, `PAKET-URETIMI.md` (paket üretim betiği).
- `istemci/src/moduller/kalite-merkezi/`: `KaliteMerkeziCercevesi.tsx`, `rotalar.tsx`, `sayfa.ts`, `acilis.ts`, `kopru.ts`, `kitapliklar.ts`,
  `kalite-merkezi.css`, `uygulama/paket.ts` (üretilmiş), `uygulama/ocr.ts` ve `uygulama/ocr-cekirdek.ts` (üretilmiş), `sayfa.test.ts`, `acilis.test.ts`, `kopru.test.ts`.

## Uygulamaya göre değişen
Uygulamanın kodu yok. Sayfa kurulurken: `fetch` ve `URL` ön betiği, sunucu kipini seçen tek koşul, `render` sarmalayıcısı, geniş
ekranda sol menünün gizlenmesi (NOTLAR.md). Python sunucusu, BAT/SH betikleri, SQLite ve `ornek/` alınmadı.

## Değişen ya da kaldırılan var olan kurallar
Yok.

## Yeni tabana oturtma (taban 640bebf, 12.10.2026; uygulama, kural ve ekran değişmedi)
- Göç yeni damgayla: `sunucu/gocler/20261012041036_kalite_merkezi.sql` -> `20261012081036_kalite_merkezi.sql` (içerik aynı). Eski ad
  640bebf'deki son göçten önce sıralanıyordu; sınır aracının göç damgası denetimi reddeder. Tabana yeni göç girerse yeniden damgalanır.
- `paylasilan/islem-adlari.ts`: üç işlem adı ve modül adı (CEKIRDEK-ISTEKLERI madde 1a). Tabana sonradan giren "her işlemin adı var"
  tip denetimi bunlar olmadan derlemiyor.
- Öteki bütün dosyalar teslimdekiyle bayt bayt aynı (`cmp` ile denendi).

## Depoya oturtma (main 5daeb55, 12.10.2026, kart #741)
- Göç yeniden damgalandı: `20261012081036_kalite_merkezi.sql` -> `20261012111000_kalite_merkezi.sql` (içerik aynı); birleştirme sırasındaki
  #721 (101500), #702 (103000) ve #748 (110000) göçlerinden sonra gelir.
- `cekirdek-1-toplayicilar.diff` olduğu gibi uygulandı, ayrı commit (yalnız bu modülün satırları; rol x işlem satırı yok).
- Teslimin kök belgeleri bu klasöre alındı; kökteki `NOTLAR.md` burada `TESLIM-NOTU.md` adıyla (modülün kendi `NOTLAR.md`'si ayrı).
- `GUVENLIK-DENETIMI.md` ve `UYGULA.md` teslimde yoktu; oturtmada yazıldı. Kod, ekran ve kural değişmedi.
- Yazı tanıma kitaplıkları (tesseract.js 5.1.1, `uygulama/ocr.ts`, `uygulama/ocr-cekirdek.ts`, 6,7 MB) kullanıcı onayıyla girdi
  (karar kartı, bu projede 12.10.2026 10:23, "Evet").

## Örnek veri (kart #906)
- `ornek-veri.ts`: `npm run ornek-veri` için 3 parça (malzemelerin örnek mamulleri, parça no stok kodu), 2 muayene (Mil final kabul,
  Flanş proses ret), 1 uygunsuzluk ve ona bağlı DÖF. Kayıtlar `servis.yaz` ile örnek kaliteci adına yazılır; kimlikler `ORN-` önekli
  (parça kimliği uygulamanın kuralıyla `p-<parça no>`). `sorgular.ts`: `ornekKaydiVarMi`.

## #1323: sürüm denetimi (iyimser kilit)
- `POST .../yaz` ve `POST .../sil` gövdesinde beklenen sürüm (`surum`) zorunlu: sayı ya da kayıt yok biliniyorsa `null`. Arada
  yazılmış ya da silinmiş kayıt 409 (`ESKI_SURUM_ILETISI`), hiç olmayan kayda sürümle yazma 404. Geri yükleme koşulsuz kalır.
- Değişiklik akışında her kaydın sürümü (`surum`) gelir. Köprü kayıt başına son sürümü tutar ve yazmaya ekler.
- Sayfa kurulurken uygulamanın `save` işlevinde tek yer değişir (`sayfa.ts` `KAYDET_YERI`): formun açıldığı `guncelleme` değeri ön
  betiğe bırakılır, ön betik onu aynı kaydın yazma adresine ekler (`?taban=`), köprü son gördüğü değerle karşılaştırır, farklıysa
  yazmayı göndermez ve 409 döner. Ekran ve akış değişmez.

## #1583: onay ve kapanış genel kayıt yazmasıyla değişmez
- `POST .../yaz` form onayını, uygunsuzluk ve DÖF kapanışını, tedarikçi onay durumunu değiştiren gövdeyi 403 ile reddeder
  (`alan: 'onay'`, `ayrinti.alanlar`); kayıt eski hâlinde kalır. Taslak, onaya gönderme ve kapanmamış durumlar arası geçiş serbesttir.
- Yeni uç `POST /kalite-merkezi/kayitlar/:koleksiyon/:kimlik/onayla` (gövde ve sürüm kuralı yazmayla aynı), yeni işlem
  `kalite-merkezi.onayla` (yalnız tanım). Formda onaylayan ve onay günü sunucudan. Köprü yalnız bu reddi onay ucuna yönlendirir.
- Onaylı form kilitlidir (kullanıcı kararı 16.10.2026, "Kilitle"): `yaz`, `onayla` ve `sil` onaylı formu değiştiremez (409);
  aynı gövdeyi yeniden yazmak serbest. Değişiklik onay ucundan durum "Onaylandı"dan çıkarılarak yapılır.
- Onay geri alma (kullanıcı kararı 17.10.2026, "Eklensin"): yeni uç `POST /kalite-merkezi/formlar/:kimlik/onay-geri-al`
  (`kalite-merkezi.onayla`, gövde `{ surum }`, tam denetim). Form taslağa döner; geri alan ve saat sunucudan. Kimlik cevabına
  `onaylayabilir` eklendi; uygulamanın form listesinde onaylı satıra "Onayı geri al" düğmesi yalnız ona görünür (sayfa.ts
  `ONAY_GERI_YERLERI`, acilis.ts `ONAY_GERI_BETIGI`, köprü `api/onay-geri-al/frm/:id`).
- Ekran sadeleştirme (kullanıcı kararı 17.10.2026, "Üçü de"): onay penceresinde "Onaylayan" alanı yok (sunucu oturumdaki
  kişiyi yazar), ayarlardaki işlemeyen "Örnek verileri yükle" düğmesi yok (sayfa.ts `SADE_YERLER`), onay geri alma penceresinin
  düğmesi "Onayı geri al" yazar (acilis.ts). İşlev değişmedi.
- Üç ekran düzeltmesi (kullanıcı kararı 17.10.2026): ayarlar penceresi kapanınca adres alttaki görünüme döner (acilis.ts `SON_BETIK`);
  dar ekranda uygulamanın alt şeridi gizli (sayfa.ts `GOMULU_STIL`); PDF görüntüleyici pdf.js 6.3.289 (sayfa.ts `PDF_YERLERI`,
  kitapliklar.ts). Fotoğraf küçültme isteği uygulamanın var olan küçültmesiyle karşılandı, kod değişmedi (`fotograf.test.ts`).

## İlk parça kararı tekrar korumalı (551 a)
- `POST /kalite-merkezi/ilk-parca/:uretimEmriId/karar` `tekrarKorumali`: istek kimliği zorunlu, kimliksiz istek 400; aynı kimlikle yinelenen karar deftere ikinci satır yazmaz, ilk cevabı alır.
- Bugün ekranı ve uygulama köprüsü kararı kimlikle gönderir; sonucu bilinmeyen gönderim aynı kimlikle yinelenir.

## Hatalı parça kararı (1034, 1038 a)
- Terminaldeki "Hatalı" girişi üretim emrinde kalite adımlı kol açar (uretim-emirleri). Kararı Kalite Merkezi verir: `GET /kalite-merkezi/hatali/bekleyenler`, `POST /kalite-merkezi/hatali/:kayitId/karar` (`kalite-merkezi.onayla`, tekrar korumalı).
- Karar rework, hurda ya da red; aynı işlemde uygunsuzluk kaydı (NCR, kaynak "Proses muayene") yazılır. Kalite kararını uretim-emirleri `disari.ts` ile yazar; NCR yazılamazsa karar da geri alınır.
- Bugün ekranında "Hatalı parça kararı" kartı (onaylayabilende): karar, ciddiyet (varsayılan Majör), gerekçe.
