# UYUM BORCU: malzemeler (kart #163, teslim olduğu gibi alındı)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İddia işaretleri: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Açık borç (19.10.2026 sayımı: 20 madde, tavan 30; bayat satırlar 19.10.2026'da güncellendi)
Sayım yöntemi borç yeniden değerlendirmesindeki gibi (`/mnt/project-files/inceleme/borc/2026-10-17-borc-yeniden-degerlendirme.md`): kısmen kapalı maddenin kalan parçası ayrı sayılır; "KAPANDI" ve "BİLGİ NOTU" sayılmaz.
- Dondurma sonrası (13): madde 1 (jsonb sütuna), 2 (ekran stili, lint), 4 (ekran kuralları sunucuya; ad/açıklama kalıbı dahil), 5 (belge yükleme), 7 (`unsafe-inline`), 10 B9 (kılavuz yazısı),
  Denetim madde 7 sınırları (rev notu, ham alan yolu), Çekirdek kalıpları: kart listesi sayfalama (#169) ve YM/MM/DB anahtarı, tedarik: kart birimi JSON ve dizinsiz arama, hizmet türü rengi, hizmet standart önerileri.
- Bağlamada (5): madde 6 bilinen sınır (iç görünüm değişimi adrese yansımaz), Logo birim seti listesi (#339), birimi boş eski kartlar, tedarikçi metni eşleme, tedarikçi yabancı anahtarı.
- Kullanıcıda (1): madde 7 cihaz denemesi (indirme, etiket, QR/kamera, pano).
- Bekleyen (1): Denetim "Ekran borcu" (onay akışı anahtarı bağlıyken herkese kilitli); 18.10.2026'da kullanıcıya sorulmadı, önerilen "böyle kalsın" ile bugünkü gibi kalıyor. Elle stok kodu alanı ve ret nedeni #234 madde 10 ve 18 ile kapandı (Bilinen sınırlar).

1. Serbest jsonb yok / üç sütun jsonb nesne / `malzeme_katalog_karti.kayit`, `malzeme_katalog_sablonu.sablon`, `malzeme_katalog_ayari.deger`
   (göç `20261007120000_malzemeler_katalog_kartlari.sql`) / kullanıcı kararı. Uyum: kartın denetlenen alanları ayrı sütun ve kısıt olur, jsonb yalnız ekran
   biçimi kalır. DOĞRULANDI: sunucu `kayit` içeriğini doğrulamaz, yalnız nesne olduğunu ve `kayit.id` = adres kimliğini denetler (`servis.ts` `katalogKartiKaydet`).
   Kartın türü, onay durumu ve stok kodu öneki kartın kendisinden (`kayit.tur`, `kayit.onay.durum`, `kayit.com.kod`) okunur; özet bunları taşırsa kartla aynı olmalı, yoksa 400 (Aşama 1 tur 2, `kurallar.ts` `katalogKaydiAlanlari`).
   Benzersiz anahtar ve mükerrer gerekçesi hâlâ özetten gelir (ekranın ürettiği değer; sunucu türetemez).
   Maliyet için ayrı sütunlar (19.10.2026, #1832, kullanıcı kararları 208 a ve 214 a, dolu tablo göçü onaylı): hammaddede `birim_agirlik_kg`, `kalite_adi`, `form_adi` (özetten, ekranın hesabı; sunucu ağırlığı yeniden hesaplamaz),
   mamul ve yarı mamulde `net_agirlik_kg` (`kayit.g.net`'ten, `kurallar.ts` `katalogNetAgirlikKg`). Kartın öteki alanları jsonb'de kalır.
2. Ortak arayüz ve tasarım değişkeni kullanılır / ekran kendi stilini, rengini ve bileşenlerini taşır / `istemci/src/moduller/malzemeler/katalog/katalog.html`
   (~800 KB, stil+işaretleme+betik tek dosya). Lint taramaz (stylelint yalnız `.css`, ESLint yalnız `.ts/.tsx`). Uyum: sayfa ortak bileşenlerle ve `tokens.css` ile
   yeniden kurulur ya da `eslint`/`stylelint` kapsamına bilinçli eklenir (çekirdek kararı, Ç1). Ekran 360/768/1280 kuralı yalnız teslimin kendi ölçümüne dayanır.
3. localStorage'da veri yok / prototip taslağı ve tercihleri tarayıcıda tutar / `katalog.html` `mk-*` anahtarları: `mk-units`, `mk-recent`, `mk-sablon`, `mk-ayar`,
   `mk-ayar-kaydi`, `mk-malzeme-ayar`, `mk-op`, `mk-opdef`, `mk-roller` + yarım kalan taslak (DKEY/LKEY). Gömülü modda kart, şablon ve ayar sunucudan gelir.
   Gömülü modda `localStorage` bellek içi depodur (madde 7, ön betik): yazılan her şey sayfa yenilenince gider.
   Kapandı (17.10.2026, iki kullanıcı onayı): bağlıyken ortak genel ayarlar `mk-ayar`'dan okunmaz ve ona yazılmaz; yalnız bu tarayıcıya ait `onayYetkisi` ve `yerelRol` güncellenir
   (#1622). Sunucuya bağlanınca `mk-sablon`, `mk-malzeme-ayar`, `mk-opdef`, `mk-op`, `mk-roller`, `mk-ayar-kaydi` geri dönüşsüz silinir ve bağlıyken rol listesi tarayıcıya yazılmaz.
   KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): #1622 ve #1630 kullanıcı onayları kalan kopyaları bilinçli tuttu, "yalnız `mk-units` ve taslak" yönü aşıldı (test `katalog-kurallari.test.tsx` "yalnız onaylanan altı kopya silinir"). Kalanlar: `mk-ayar` (iki kişisel ayar), `mk-units`, `mk-recent`, yarım taslak ve çevrimdışı kart listesi; bağlantısız kullanımda bu kopyalar yeniden oluşabilir.
4. Ekranda (prototip betiğinde) kalan kurallar: sunucuda olanlar MKK-1..MKK-10 ve MKK-12..MKK-15 (kod sırası ve biçimi, onay geçişi, dört göz, pasife alma, iptal, sürüm, rol, onay akışı ayarı, mükerrer anahtar, geri çekme, içerik, tutarlılık, damga/talep/geçmiş); kimlik denetimi (`kayit.id` = adres) `servis.ts`'te, MKK etiketi yok.
   Yalnız ekranda olduğu görülenler: alan doğrulamaları, kalite/sınıf/form tanım listeleri (prototipin sabit tabloları), ağırlık ve ölçü hesabı, stok kodu öneki üretimi,
   benzersiz anahtar üretimi, şablon içeriği, operasyon tanımları. Uyum: kural kural sunucuya taşınır, ekran yalnız gösterir.
   Tarama (20.10.2026; kartın kayıt ve ilerleme kuralları satır satır okundu, `katalog.html`'nin tamamı okunmadı; şablon, ayar ve operasyon tanımı ekranlarının doğrulamaları doğrulanmadı):
   - Sunucuda da olan: tür geçerliliği ve hizmet yönü (`katalogKaydiAlanlari`); ayarda zorunlu işaretli alanlar, yalnız onaya gönderme ve aktifte (`katalogOnayEksigi`); birim (`katalogOnayEksigi`, `birimSecilebilirMi`);
     kategori yalnız doluysa açık listede mi (`kategoriAcikMi`); stok kodu biçimi, önek-tür uyumu, firma kodu ve sıra (`katalogKodOneki`, `katalogOnekiTureUyarMi`, `katalogFirmaOneki`, `katalogFirmaKoduGecerliMi`, `katalogStokKodu`);
     mükerrer anahtar ve gerekçe (sunucu daha katı: en az 10 karakter, `mukerrerGerekcesiKisaMi`; ama yalnız anahtar eşitliğine bakar, ekranın ölçü toleransı ve eşdeğer kalite eşleşmesi yok); net ağırlık (`katalogNetAgirlikKg`); rota numaralama (`kartOperasyonlari`).
     Hammadde formu ve ölçüleri (`hammaddeOlcuHatasi`, ekranın `dimsErr` ve `FORMS.*.chk` kuralıyla aynı: form listede, her ölçü sayı ve > 0, et kalınlığı sınırları); yalnız yeni kartta ve form ya da ölçü değişince, kayıtlı veri kilitlenmez.
   - Yalnız ekranda: hammadde aile/kalite/ölçü adımları ve ileri düğmesi engeli (`stepOk`, `gStepOk`, `gEksik`); ayarda zorunlu işaretli olmayan yerleşik zorunlu alanlar (ör. ad) ve kategori seçimi;
     GTIN biçimi ve kontrol hanesi (`gtinGecerli`); açıklama uzunluğu ve büyük harf (`aciklamaOtomatik`); ölçü aralığı uyarıları (`DIMRULES`),
     form/seçenek uyumu (`compatIssues`); kart uyarıları (net > brüt, ATEX belgesi, SDS ve raf ömrü, maks. devir, demirbaş tarihleri, kalibrasyon, hurda çıkışı; `gUyarilar`);
     hammadde otomatik ve teknik kodu (`autoKod`, `teknikKod`), kod grubu türetmesi; benzersiz anahtarın içeriği (`kartAnahtari`; sunucu yalnız hammadde ve sarfta zorunluluğuna bakar); birim ağırlık, reçete, maliyet ve amortisman hesabı;
     Excel içe aktarma denetimlerinin hepsi (`xlSatirdanKart` 12 hata ve 14 uyarı satırı, `xlPlan` 4 hata satırı; sunucuda içe aktarma yolu yok, kart kaydet ucundan geçer).
   - Yalnız sunucuda: aktif tedarikçi firma, hizmet ve ticari malın reçeteye girmemesi (`katalogBilesenOlamayanKodlar`), alan uzunlukları (sözleşme), stok kodu en çok 24 karakter (`STOK_KODU_EN_COK`), MKK geçiş, talep, sürüm ve iptal kuralları.
   - Açık kalan borç (ölçü kuralı, koordinatör kararı b, 20.10.2026): formu ve ölçüsü olmayan hammadde API'den kaydolur (ekran ölçü adımında durdurur); aile ve kalite sunucuda zorunlu değil. GTIN sunucuya alınmadı (ekranda yalnız uyarı).
5. Kapalı özellik: belge yükleme `kopru.ts` içinde hata verir (dosya saklama yok). Uyum: dosya saklama önkoşul (Ç4).
   DOĞRULANDI (19.10.2026, `grep -c -E "jsdelivr|cdnjs" katalog.html` = 0): ekran dosyasında dış kitaplık adresi kalmadı. Çerçeve politikası
   `default-src 'none'; script-src 'unsafe-inline'; ... connect-src 'none'` (`MalzemeKatalogu.tsx` `POLITIKA`); test `MalzemeKatalogu.test.tsx`.
   QR kapandı (15.10.2026): depodaki jsqr 1.4.0 çerçeveye gömülür (`MalzemeKatalogu.tsx` `qrKitapligi`), prototip dış adrese gitmez; test `MalzemeKatalogu.test.tsx` "QR çözücü depodan". Excel kapandı (#1525, yazılı onay 16.10.2026): depodaki exceljs 4.4.0 köprüden verilir, içe aktarma da ExcelJS ile okur; SheetJS ve dış adresler kalktı. Belge yükleme açık.
6. İkinci menü (Aşama 1 tur 2): modül menüyü bildirir (`paylasilan/sayfalar/malzemeler.ts` `MALZEMELER_IKINCI_MENU`, çerçeveli, altı madde: prototipin görünüm şeridiyle aynı sıra ve ad);
   adres görünümü seçer (`/malzemeler/yeni`, `/malzemeler`, `/sablonlar`, `/operasyonlar`, `/ayarlar`, `/kilavuz`), köprü `hazir` cevabında `gorunum` ve adres değişince `gorunum` olayı gönderir, çerçeve yeniden yüklenmez.
   Prototipin kendi şeridi (`.top .views`) çerçeveye eklenen stille gizlenir, dosyasına dokunulmadı. QR okut ve Ayarlar düğmeleri prototipin üst şeridinde kalır (görünüm değil, işlem).
   Ekran ölçümü N7 (tur 3): prototipin gömülü moddaki kendi yan menüsü (901 px ve üstü, `html.yanmenu`) kapatıldı (kullanıcı kararı B3 = a, 08.10.2026); QR okut, Ayarlar, iki birim düğmesi ve not prototipin dar ekran
   düzeniyle üst satırda kalır (`MalzemeKatalogu.tsx` `YAN_MENU_KAPAT`, test `MalzemeKatalogu.test.tsx` "yan menu (B3)"). Çerçeve kabuğun içerik alanını doldurur (B4).
   Toplayıcı kaydı bu dalda ayrı commit (kullanıcı kararı T1 a); kabuk menüyü çizer.
   Bilinen sınır (bağlamada kapanacak): prototip kendi içinden görünüm değiştirince (ör. katalogda "Düzenle" yeni kart görünümünü açar) adres ve menüdeki etkin madde değişmez; prototip görünüm değişimini köprüye bildirmiyor.
   KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kök adres ve "Yeni kart" yetkisi `paylasilan/sayfalar/malzemeler.ts` `kok: '/malzemeler'`, `'Yeni kart' ... islem: 'malzemeler.yaz'`. VARSAYIM (geri alma ucuz, tek dosya): kök adres katalogdur (prototip ilk açılışta yeni kart görünümündeydi); "Yeni malzeme" maddesini yalnız `malzemeler.yaz` taşıyan görür, öteki maddeler `sayfa.malzemeler`.
7. İçerik politikası (Ç2): çerçeve satır içi betik çalıştırır (`script-src 'unsafe-inline'`). Sunucu bugün politika göndermiyor; dağıtımdaki ters vekil `script-src` kısıtlarsa
   sayfa açılmaz (BİLMİYORUM: dağıtım yapılandırması).
   Yalıtım kapandı (kart #236, kullanıcı kararı 07.10.2026: gerçek yalıtım, ekran dosyası değişmez): çerçeve `sandbox="allow-scripts allow-downloads allow-modals"`, `allow="camera; clipboard-write"`,
   aynı-kök ve üst gezinme izni yok (köken opak); köprü yalnız kendi çerçevesinden ve opak kökenden gelen iletiyi işler; `kopru.ts` boş, `.` ve `..` kimliği reddeder; yazı tipleri veri olarak gömülür;
   prototipin `localStorage`'ı bellek içi depoya döner (ön betik). Testler `istemci/src/ortak/arayuz/YalitilmisCerceve.test.tsx`, `MalzemeKatalogu.test.tsx`, `kopru.test.ts`. Kalan `script-src 'unsafe-inline'` (dağıtımda bakılır).
   Çerçeve bileşeni ortak arayüzden ithal edilir (`istemci/src/ortak/arayuz`, #264); bileşenin kendi testleri orada.
   Dışarıdaki ekrandan farklı: tercihler ve yarım taslak sayfa yenilenince silinir (#227 madde 16 ile uyumlu); `allow-popups` yok, belge bağlantısı yeni pencerede açılmaz;
   cihazda indirme, etiket yazdırma, QR/kamera ve pano denenmedi (BİLMİYORUM; kullanıcı cihazda denemeden kabul sayılmaz).
8. Kapandı: `test:modul` Linux'ta da sunucu testlerini bulur (tırnak sorunu #1348 ile düzeldi); desen hiç dosya bulamazsa koşu kırmızı olur (#1557).
9. Roller: kapandı (Ç5); rol dağılımı verildi, aşağıda.
10. Ekran ölçümü N7 bulguları, kod yok (kullanıcı kararı 08.10.2026, `tur3-raporlar/ekran-olcumu.md`; prototipin ekranı, dosyasına dokunulmaz):
   B2: Operasyonlar görünümünde 96 operasyonun her satırı düzenlenebilir (797 etkileşimli öğe; 13x13 px onay kutusu, 21x28 px sil düğmesi); tür seçimi daralıp kesik görünür, "Yeni operasyon" formunda etiket ve kutu karışık akar.
   Aşama 2'de operasyon listesi istasyonlar kataloğuna bağlanınca bu tablo kalkar. DOĞRULANDI (ölçüm raporu, görüntü).
   Kapandı: görünüm kalktı, liste istasyonlarda düzenlenir (kart #544).
   KAPANDI (borç azaltma 18.10.2026, test): boş operasyon listesinde yerel düzenlemenin kapalı kalması (`katalog.html` `operasyonKaynagi` koşulu); test `katalog-kurallari.test.tsx` "istasyonlardan gelen boş operasyon listesi" (kaynaklı boş liste salt okunur ve yerel listeye dönmez; kaynaksız boş liste yerel listeyi bırakır; koşuldan `operasyonKaynagi` çıkarılınca test kırılıyor).
   KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): ikinci menüde operasyonlar maddesi yok (`paylasilan/sayfalar/malzemeler.ts` `gruplar`), liste istasyonlardan salt okunur (`kopru.ts` "MKK-18", kart #544). A7 (#515): liste artık istasyonlardan gelir ve salt okunur; düzenleme öğeleri görünmez. Görünümün kalkıp kalkmayacağı B adımında seçilir.
   B9: Kılavuz görünümünde 29 örnek satırı 11.5 px (`small`). Prototipin kendi metni; bağlamada ekranla birlikte ele alınır. DOĞRULANDI (ölçüm raporu).

## Denetimde bulunan açıklar (07.10.2026; kart #163, denetim turu 1 sonrası durum, tur 2 dahil)

Kurallar `kurallar.ts` (MKK-1..MKK-15), testleri `katalog-onay-baglama.test.ts`. Rol dağılımı verildi (göç `20261007192028_kisiler_malzemeler_islemleri.sql`, kullanıcı kararı 07.10.2026; test `rol-dagilimi.test.ts`):
sayfa: planlama_proje, cam, satin_alma, depo, mudur, kalite, operator; `yaz`: operator dışında aynı roller; `onayla`: mudur, kalite; `tanim-yaz`: hiçbir rol (yalnız bayraklı yönetici).
Onay akışını (`genel.onayAkisi`) açıp kapatmak yalnız bayraklı yöneticide (#227 madde 1 "ayarı yalnız yönetici değiştirebilir", kalsın; `servis.ts` `katalogAyariKaydet`, `kisiBayrakliMi`). `tanim-yaz` müdür ve planlamaya verilince (kart #229, M1; rol satırı çekirdek dalında) müdür onay akışını kapatıp dört gözü dolanamasın diye.
Ekran borcu (bağlamada kapanacak): ekran ayar sayfasını kendi 'yonetici' rolüne bağlar (`katalog.html` `YETKI.ayar`); sunucu bu rolü `tanim-yaz` + `onayla` birleşiminden verir, müdür onay akışı anahtarını açık görür ve değiştirince 403 alır.
KULLANICI KARARI (08.10.2026, M4 = b): bu turda yazılmaz, ekran isteği #234'e kalır. Sunucu kuralı değişmedi (anahtarı yalnız bayraklı yönetici değiştirir); yalnız ekranın anahtarı müdüre göstermesi açık.
KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): onay rolleri `yaz` da taşıyor (`rol-dagilimi.test.ts` `ONAYCI = { sayfa: true, yaz: 200, onayla: 200`, müdür ve kalite). Rol notu: `malzemeler.onayla` tek başına verilirse ekran onay düğmesini gösterir ama kaydetme ucu `malzemeler.yaz` ister (sunucu 403 verir); onay rolüne `yaz` da verilmeli.

1. Kapandı (kart #163): aktif ya da onaydaki kartı taslağa çekmek ve aktif kartı onaya düşürmek (akış açık ya da kapalı) onay yetkisi ister. Ekran aktif kartı kendi başına onaya düşürmez
   (akış açıkken `talepOlustur`, kapalıyken `onayAta` durumu korur). İptal (`/iptal`): onay yetkisi olmayan yalnız kendi açtığı ve hiç onaylanmamış taslağı iptal eder; başkasının açtığı ya da bir zamanlar
   aktif olmuş taslak 403. Prototipte "Sil" yalnız `sil` yetkili (sorumlu, yönetici) rollere görünür (`YETKI.sil`): yazma yetkili rol düğmeyi zaten görmez. Onay akışı ayarını açıp kapatmak da onay yetkisi ister
   (`tanim-yaz` tek başına yetmez).
2. Kısmen kapandı: onay akışı açıkken onay yetkisi olmayan, aktif kartın içeriğini, benzersiz anahtarını ya da gerekçesini değiştirip aktif bırakamaz; ekranın değişiklik talebi
   (`kayit.talep`; kart aktif kalır) geçer, `talep`, `rev`, `updatedAt` içerik sayılmaz. Pasif kartın içeriği de onay yetkisi ister. Onay akışı kapalıyken aktif kart yazma yetkisiyle değişir (MKK-9).
   KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kullanıcı kararı "kalır"; 16.10.2026 dört göz talep kararı da "kalsın" (Denetim bölümü madde 7 son satır). Kullanıcı kararı: kalır (2c): dört göz açıkken onay yetkilisi aktif kartın içeriğini tek başına değiştirebilir (aktif -> aktif).
3. Kapandı: `kayit.onay.durum` özetle aynı olmak zorunda (yoksa ya da tutarsızsa 400); `kayit.tur` özetle aynı olmak zorunda.
4. Kısmen kapandı: onay akışı açıkken aktife yalnız `onayda`dan geçilir; dört göz açıkken kartı açan ve onaya gönderen onaylayamaz; onaylayan, onaydaki kartın içeriğini
   (`onay`, `rev`, `updatedAt` dışında) ya da anahtarını değiştiremez; onaydayken içeriği değiştiren kişi kartın göndereni olur. Onay akışı ya da dört göz kapalıyken eskisi gibi. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): 2c madde 2'deki "kalır" kararıyla kapandı.
5. Kapandı: `POLITIKA`'ya `form-action 'none'; base-uri 'none'`. `sandbox` ve aynı kök kapandı (kart #236, madde 7); `script-src 'unsafe-inline'` madde 7'de açık.
6. Kapandı: MKK-2 tür, açan ve önek tetikleyici testleri, MKK-10 dizin ve yarış testi, MKK-7 eşzamanlı yazma testi, geçişlerin red testleri.
7. Kısmen: "kim onayladı, gönderdi, reddetti, pasife aldı" (`kayit.onay.{onay,talep,red,pasif}.{by,byAd,t}`) ve değişiklik talebinin sahibi (`kayit.talep.{by,byAd,t}`) ilgili geçişte
   sunucudan basılır; geçiş olmayan yazmada kayıtlı değer korunur. Değişiklik geçmişi (`rev`) yalnız sona TEK kayıt eklenebilir (ekran her kaydetmede tek kayıt ekler: `withRev`, `onayUygula`, `talepOlustur`, `talepUygula`; 30 kayıtlık pencere:
   baştan en çok eklenen kadar düşer); eklenen kaydın `by`, `byAd`, `t` alanını sunucu basar, kayıtlı kayıtlar korunur. Gerekçeli mükerrer kartta anahtar aynıysa kayıtlı gerekçe korunur
   (ekranın `talepUygula`'sı `mukerrerOnay`'ı geri koymaz).
   Kapandı (kart #226). KULLANICI KARARI (07.10.2026, #227 madde 3): sunucu farkı doğrulasın. DOĞRULANDI (`katalog.html` `talepPanelHTML`, `talepOlustur`, `talepUygula`): ekran onaycıya SAKLANAN `talep.farklar`'ı gösterir
   (yeniden hesaplamaz, en çok 30 satır) ve `talep.yeni`'yi uygular. Sunucu kuralı (`kurallar.ts` `katalogFarki`, `katalogTalebiBas`, `katalogTalepUygulamaDenetle`): (a) yeni ya da değişen talepte `farklar` istemcininkinden
   bağımsız sunucuda yazılır (önerilen kart ile bu yazmadan sonraki kart; ham alan yolu, `{ f: 'com.not', a: 'eski', b: 'yeni' }`; 30 satırı aşarsa fazlası son satırda adı, eski ve yeni değeriyle: `a` = `alan: eski; ...`, `b` = `alan: yeni; ...`, Aşama 1 tur 2); değişmeyen talepte kayıtlı fark korunur;
   (b) talep uygulanırken (aktif kart talepsiz, içerik değişik yazılıyor) uygulanan içerik `talep.yeni` ile aynı olmalı, yoksa 422; ayrıca talep açıldığı günkü karta göre geçerli olmalı (bugünkü kartın farkı kayıtlı farkla aynı), yoksa 409.
   VARSAYIM (geri alma maliyeti düşük, yalnız `kurallar.ts`): ekranın biçimlenmiş farkı (etiket, birim, sınıf adı) sunucuda yeniden üretilemez (tanım tabloları ekrandadır); bu yüzden onaycı artık ham alan yolu görür.
   Sınır: `kayit.rev[].ch` (geçmiş notu) ve `kayit.rev[].not` hâlâ istemci metnidir; benzersiz anahtar ve mükerrer gerekçesi (özet) uygulamada istemciden gelir, önerilen içerikten sunucuda türetilemez;
   talep uygulanırken `mukerrerOnay`/`yerine` dışarıdan kurulamaz; talep varken onaycının talebi düşürüp içeriği başka yazması artık 422 (önce talep reddedilir ya da talep tutularak düzenlenir; talep bayatlar, 409).
   Kayıtlı eski biçimli (ekran farklı) talep uygulanamaz (409), reddedilir ya da yeniden açılır. Onaycının gördüğü kayıtlı fark bugünkü farktan (değerli son satır dahil) farklıysa da 409: taşan alanları yalnız adıyla anan tur 1 talepleri değer görülmeden onaylanamaz.
   Denetim bulguları kapandı (Aşama 1 tur 1): alan yolu dizi olarak anahtarlanır, `"com.ad"` üst anahtarı `com.ad` yaprağını ezemez (gösterimde nokta içeren parça `[com.ad]`);
   bayat denetimi kesilmiş farka değil sunucunun bastığı `talep.farkOzeti`'ne (kesilmemiş farkın sha256'sı) bakar, 30 satırda yalnız adıyla anılan alanın tabanı değişse de 409;
   `talep: null` "talep yok" sayılır ve uygulama denetimini atlatmaz. Testler `talep-fark-dogrulama.test.ts`, `kurallar.test.ts`.
   Bilinen sınır (ekran davranışı, belgelenir): talep ile onay arasında açıklama ya da kod ayarı değişirse ekran türetilen alanları (açıklama, ad) yeniden hesaplar,
   uygulanan içerik talepteki önerilenden ayrılır ve meşru uygulama 422 alır; talep reddedilip yeniden açılır. Onaycının ham alan yolu görmesi (etiketli fark yerine) dışarıdaki ekrandan farklıdır.
   KAPANDI (kullanıcı kararıyla kalsın, 16.10.2026; 2c ile tutarlı): dört göz ekranın değişiklik talebinde yalnız ekrandadır (`talepYetkili`); onaycının kendi açtığı talebi sunucuda kendisi uygulaması bugünkü gibi kalır.

Bilinen sınırlar (ekranın kabul ettiği girdiyi sunucunun reddettiği yerler; ret iletisi kullanıcıya "Kayıt yapılamadı" diye görünür, bu yüzden kullanıcı kilitlenebilir):
- KAPANDI (kart #234 madde 10, kullanıcı kararı 07.10.2026; 18.10.2026): TMI'ye bağlıyken kod alanı salt okunurdur, "Otomatik" düğmesi çizilmez; kodu sunucu verir (test `katalog-kurallari.test.tsx` "madde 10"). Bağlantısız açılışta prototip eskisi gibi. Sunucu kuralı değişmedi: elle yazılan stok kodu: yalnız `TÜR-GRUP(3)-SAYI` biçimi geçer (önek alınır, sayı yok sayılır); serbest önek ("ABC-00001"), "ÖZEL KOD", türe ters önek 400 alır (kart #230, bkz. Logo bölümü madde 5). Kilitli kartta (onayda, aktif, pasif) kodu ya da türü değiştirmek 422 alır.
- Başka yazarın bekleyen değişiklik talebi olan kartı ikinci bir yazar düzenlerse 403 alır; talebi yalnız sahibi ya da onaycı değiştirir.
  KAPANDI (kart #234 madde 18, kullanıcı kararı 07.10.2026; 18.10.2026): sunucunun ret iletisi (403, 409, 400, 422) genel "Kayıt yapılamadı" yerine olduğu gibi gösterilir; köprü yalnız sunucunun kendi iletisini işaretler (`MalzemeKatalogu.tsx` `sunucuIletisiMi`), köprünün iç hatası ve zaman aşımı genel iletide kalır (testler `katalog-kurallari.test.tsx` "madde 18", `MalzemeKatalogu.test.tsx`). Kısa gerekçe kodu da artık çerçeveye geçer.
  Kapandı (kullanıcı kartı 17.10.2026, "Şimdi düzelt"): "Talebi geri çek" gömülü modda yalnız talebin sahibine ve onay yetkilisine görünür; sunucu kuralı değişmedi.
- Kapandı (kullanıcı kartı 17.10.2026, "Şimdi düzelt"): pasif kart onay yetkisi olmayana salt okunur açılır (Düzenle yok); onaycı sunucuda olduğu gibi düzenleyebilir. Aktif kartın toplu ekran işlemleri ("Kod yapısı geçişi", birleştirme) onay akışı
  açıkken onay yetkisi ister.
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): eylemsiz bilgi notu; sunucu kuralı kapalı (Çekirdek bölümü MKK-10 "kapandı, kart #163"). Hammadde ve sarf kartında benzersiz anahtar zorunlu: ekran bu türlerde her zaman üretir (`stepOk`), ihlal yalnız elle hazırlanmış istekte olur.

### Çekirdek kalıplarıyla uyum
- Kapandı, gerekçeyle (17.10.2026, koordinatör kararı): sürüm denetimi çekirdek `surumluGuncelle` ile değil (#90), çünkü servisin kuralları kayıtlı kartı okur; kart önce kilitlenir (`katalogKartiKilitle`), sonra sürüm karşılaştırılır. Eşzamanlı iki yazmadan birinin 409 aldığını MKK-7 testi sınar (`katalog-onay-baglama.test.ts`).
- Kart listesi ucu sayfalı (`sayfa`, `sayfaBoyu`, `sonra`); köprü bütün sayfaları okur (200'lük sayfa, değişenler önbellekle), çünkü ekran arama ve süzgeci kartların hepsi üstünde yapar ve listeyi tek parça çizer. Ekranın sayfa sayfa çizmesi yeni düğme ister; sorulacak (#169).
- Kapandı (17.10.2026): kart kaydı `kisitKorumali` ile yazılır (#168). Kullanıcının karşılaşabildiği tek yol anahtar dizini yarışıdır (iki kişi aynı malzemeyi aynı anda açar, ön denetim kaydedilmemiş kartı göremez): kaybeden genel "aynı bilgilerle kayıt var" yerine kartın iletisini ve `ozet.benzersiz_anahtar` alanını alır (test `katalog-onay-baglama.test.ts` "anahtar dizinine takılan"). Dört göz ve kod kilidi kısıtları servisin önceki denetimiyle (403/422, kendi iletisiyle) zaten tutulur; kısıt yalnız servisi atlayan yolda tetiklenir, iletisi yine eşlendi.
- MKK-10: hammadde ve sarfta anahtar zorunlu (kapandı, kart #163); gerekçe en az 10 karakter (kapandı, kullanıcı kararı 16.10.2026: kısa gerekçe 400 ve ekranda nedeniyle; kuraldan önce kaydolmuş kısa gerekçe değişmedikçe kalır). Kalan: yarı mamul, mamul ve demirbaşta ekran resim, müşteri ya da seri girilmemişse anahtar üretemez (null), mükerrer denetimi o kartlarda çalışmaz.
- Uydurma önek, `kayit.com` nesne değil ve doğrudan `pasif` açılış kapandı (kart #163).
- Şablon ve ayar sürümle yazılır (kapandı, #1474, yazılı onay 16.10.2026): ikinci eşzamanlı kayıt 409. Şablonu yalnız kaydeden ya da onay yetkilisi kaldırır (kullanıcı kararı 07.10.2026, kart #227 madde 4; `kaydeden_kisi_id`, göç `20261007202921_*`, kart #228);
  kaydeden bilgisi olmayan eski şablonu yalnız onay yetkilisi kaldırır. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): varsayımla ilerleme kuralı (CLAUDE.md temel kural 2), itiraz yok; silme kısmı 16.10.2026 kullanıcı isteğiyle kapandı (aşağıdaki madde). VARSAYIM (şef önerisiyle ilerledi, kart #228): kayıtlı şablonun üstüne (kaldırılmış olanın kimliği dahil) yazma kısıtı,
  sahipsiz şablonun üstüne yazmanın yalnız onay yetkilisine açık olması ve okuma uçlarının sayfa denetiminin işleyicide (serviste) yapılması; kullanıcı yalnız kaldırmayı onayladı.
- Kapandı (2026-10-16): şablon silme düğmesi yalnız kaydedene ve onay yetkilisine görünür; şablon listesi `kaldirabilir` kimliklerini verir, kaldırma ucu aynı kuralla 403 vermeyi sürdürür (ekran isteği #234 madde 18).
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): gövdesiz denetim kullanıcı kararı (#227 madde 23, kart #231); talep kapanış türü ve içerik farkının denetimden okunamaması bilinçli, fark `rev` geçmişindedir. Denetim kaydı: kart kaydet ve şablon kaydet uçları `denetim: 'govdesiz'` (kart #231, kullanıcı kararı 07.10.2026, #227 madde 23): gövde yerine `_ozet {boyut, sha256}`; kim, ne zaman, uç ve kart kimliği yazılır, içerik yazılmaz. Küçük komutlar (iptal, şablon kaldır) ve ayar kaydet tam denetimde.
  Kart kaydet özetin yanına `_secilen {tur, onay_durumu, surum, talep}` yazar (kullanıcı kararı 07.10.2026, çekirdek `denetimOzeti` seçicisi): onaya gönderme, onay, ret ve pasife alma ayrı uç olmadığı için kimin neye çevirdiği buradan okunur. `surum` gövdedeki taban sürümdür (yeni kartta null), yazmadan sonraki sürüm değil. Şablon kaydet seçici taşımaz.
  `talep`: gövde bekleyen değişiklik talebi (`kayit.talep` nesnesi) taşıyor mu; içeriği yazılmaz. Aktif kartın satır dizisinde false→true "talep açıldı", true→false "talep kapandı" okunur. Kalan belirsizlik: kapanışın uygulama mı, ret mi, sahibinin geri çekmesi mi olduğu satırdan anlaşılmaz (üçü de `aktif`, `talep: false`; fark yalnız içerik değişiminde ve yazan kişide); talep açıkken talebin değiştirilmesi de true→true kalır; talepsiz düz aktif düzenleme false→false'tur.
  VARSAYIM (kart #231): ayar kaydet gövdesiz değil; onay akışı ve dört göz bayrakları o gövdededir, denetimde görünmeleri istenir. Kalan: kart içeriğinde neyin değiştiği denetim kaydından okunamaz (kayıt `rev` geçmişinde tutulur, istemciden gelir).
- Okuma uçları (kartlar, şablonlar, ayarlar) `sayfa.malzemeler` ister (kart #228); kapandı (Aşama 1 tur 2, kullanıcı kararı Ç1 = A): uç tanımında `yetki: { biri: ['sayfa.malzemeler'] }`, servisteki denetim kalktı. `disari.ts` etkilenmez.
- Kapandı (17.10.2026): `NOTLAR.md` ve sözleşmedeki yanıltıcı cümleler düzeltildi; hangi alanın karttan, hangisinin özetten geldiği yazıldı.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `servis.ts` `malzemeKullanilabilirMi` `onayDurumu === 'aktif'`, `sorgular.ts` `onay_durumu AS "onayDurumu"`. Başka modüllere verilen kullanılabilirlik (`malzemeKullanilabilirMi`, `malzemeOzeti.onayDurumu`) `onay_durumu` sütununa dayanır; sütun kartın `kayit.onay.durum` alanından yazılır (Aşama 1 tur 2).

## Logo (ERP) alanları (kart #205)
Kullanıcı kararı: malzeme kartı Logo'ya gidebilecek alanları taşımalı; bağlantı kodu şimdi yazılmaz. Aşağıdakiler göçe (`20261007120000_*`, `20261007143403_*`), sözleşmeye ve `kurallar.ts` MKK-1/MKK-2'ye bakılarak yazıldı.
1. Logo kart türü karşılığı: KAPANDI (kart #232, göç `20261008122500_*`). Karşılık `malzeme_logo_karsiligi` (`cesit = 'tur'`), boş gelir, tanım yazan doldurur (Logo gönderimi sayfası). Kartta `logo_kart_turu`: gönderim sonucu gelince o anki karşılık yazılır, sonra değişmez.
2. Logo birim seti karşılığı: KAPANDI (kart #232). Karşılık `malzeme_logo_karsiligi` (`cesit = 'birim'`, TMI birimi `kayit.com.birim`); kartta `logo_birim_seti` aynı kuralla. Birim hâlâ kartın JSON alanıdır (ayrı sütun yok).
3. Logo kayıt numarası: KAPANDI (kart #232). `logo_kayit_no` boş olabilir, doluysa tekil (`malzeme_katalog_karti_logo_kayit_no_tek`); yalnız `disari.ts` `malzemeLogoSonucu` yazar. Gönderim durumu, zamanı ve son hatası da sütun (MKL-1..MKL-5, `KURAL-TEST.md`).
4. Stok kodu en çok 24 karakter: KAPANDI (kart #232, LG4 = a). Veritabanı kısıtı `malzeme_katalog_karti_stok_kodu_24`; göç önce aşan kartları sayar, varsa hiçbir şeyi değiştirmeden sayıyla durur (geliştirme veritabanında 0 kart; sunucudaki gerçek sayı göç koşunca görülür). Sunucu kodundaki önek sınırı (kart #230) yerinde. `onek` kısıtı 30 karakterde kaldı; uzun önekli kod artık kısıtla reddedilir.
Bağlantı işinde (kart #232 kapsamı dışı, kullanıcı kararı 08.10.2026; kod yok):
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): gönderim akışı logo modülünde var, varsayılan kapalı (`logo/servis.ts` `malzemeHazirla`, `ortam-degiskeni-yok`; kart #339 kapalı). Gönderimin kendisi: köprü, giden kutusu, ortam değişkeni. Bağlantı modülü yalnız `logoyaGidecekMalzemeler` ve `malzemeLogoSonucu` çağırır (NOTLAR.md "Logo bağlantısı").
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): Logo bağlantı işi kullanıcı açıkça isteyene kadar kapsam dışı; gerçek veri yok. Bugün aktif olan kartlar: durumu boş kaldı (LG1 = a); Logo'daki karşılıklarıyla kayıt numarası üzerinden eşlenmeleri bağlantı işinde.
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): aynı kapsam kararı (LG3 = a). Pasife alınan ya da iptal edilen kartın Logo'ya ne göndereceği (LG3 = a); bu işte yalnız alanlar var.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): ad güncellemesi yazıldı ve testli (`disari.ts` `logoyaGuncellemeGidecekMalzemeler`, `malzemeLogoGuncellemeSonucu`; `logo/isler.ts` `malzemeGuncelleme`; test `logo-ad-guncelleme.test.ts`, kart #783). Logo'ya gönderilmiş kartın adı ya da başka alanı sonradan (değişiklik talebiyle) değişirse Logo'daki kaydın güncellenmesi. Bugün kilitli olan yalnız stok kodu, tür ve birim (MKL-3).
- Logo kart türü ve birim seti değerlerinin kümesi: KISMEN KAPANDI (kart #232, kullanıcı kararı LB7 a, LB2 a, LB9 a; istek kart #207 logo `BASKA-MODUL-ISTEKLERI.md`).
  Tür karşılığı yalnız `10` hammadde, `11` yarı mamul, `12` mamul, `13` tüketim malı; demirbaş (Logo `4`) gönderilmez, karşılığı boş kalır. Birim karşılığı boşluksuz kod.
  Hem uçta (422/400) hem veritabanında (kısıt `malzeme_logo_karsiligi_izinli`, göç `20261008164500_*`; bozan satır varsa göç sayı ve listeyle durur, veri değişmez).
  Açık (#339'a bağlı): birim karşılığının Logo modülünün birim seti listesinden seçilmesi ve listede olmayan kayıtlı değerde "geçersiz" rozeti; sunucu yalnız biçime bakar
  (bağımlılık yönü logo -> malzemeler, ADR 0006). Uymayan kartı gönderimde Logo modülü "hata: geçersiz karşılık" yapar (LB9 a).
5. Stok kodu kuralları (kart #230). KULLANICI KARARI (07.10.2026, #227 madde 10, 11, 25): kodu her zaman sunucu verir (önek + sıra); aktif olunca kod ve tür kilitlenir; en çok 24 karakter.
   VARSAYIM (şef önerisiyle ilerledi, kart #230): (a) KAPANDI (borç azaltma 18.10.2026, tekrar): "Bilinen sınırlar" bölümündeki elle stok kodu maddesiyle aynı iş, orada izlenir. Elle kod alanı ekranda duruyor; yazılan kodun yalnız geçerli öneki kullanılır, sayı yok sayılır; alanın kalkması ekran isteği #234 madde 10.
   (b) KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kod yapısı seçimi gömülü modda kilitli (`katalog.html` `name="kodYapisi"` radyosu `|| kilit ? 'disabled'`, `kilit` `onayAyarKilit`'ten). Kabul edilen önek tam olarak ekranın standart yapısıdır (`katalog.html` `kodOnek`, `KOD_DESEN`): `(HM|YM|MM|SF|DB)-[A-Z0-9]{3}-`; tür kısmı kartın türüyle aynı olmalı; serbest önek 400. Ekranın teknik kod yapısı (`kodYapisi: 'teknik'`, ör. `MET-PAS-316L-...`) bu desene uymaz ve reddedilir
   (önceki kural sayıyla biten teknik kodları, ör. `MET-PAS-316L-CB-20` ya da `MM-1001`, kabul ediyordu; bu kart onları 400 yapar, uyumsuzluk bilinen bir sonuçtur). Gömülü modda kod yapısı seçimi kilitli
   (`Host.ayar.kod`, koddan okundu, tarayıcıda denenmedi: VARSAYIM) ve varsayılan standarttır, bu yüzden pratik etkisi yok sayılır. `_g3`/tablo kodlarının ürettiği her grup 3 karakterdir (DOĞRULANDI: kodlar `katalog.html` satır 4855-5619).
   (c) "Taslakta kod değişebilsin" = hiç aktif olmamış taslakta tür değişince yeni türün önekiyle yeni kod; tür aynıyken gelen kod yok sayılır (kayıtlı kod kalır, içerik kaydedilir). İstisna, KULLANICI KARTI 17.10.2026 ("Yenilensin"): hiç aktif olmamış taslakta gelen kodun geçerli ve türe uyan öneki kayıtlıdan farklıysa (grup, çeşit, kategori değişimi) o önekle yeni kod verilir; geçersiz ya da türe ters önek kodu değiştirmez, firma kodlu türde önek ayardan gelir; aktif olmuş kartın kodu değişmez (`kurallar.ts` `katalogYeniOnek`, test `stok-kodu-kurallari.test.ts` "Kural 1a"). Boşalan eski kod yeniden verilmez, sırada delik kalır; aynı kod iki karta verilmez (eşzamanlı test).
   (d) Onayda, aktif, pasif ve bir kez aktif olmuş kartta (taslağa çekilse de) tür değişimi 422. "Aktif olmuş" bilgisi yeni sütun `aktif_oldu` (göç, trigger yükseltir, geri düşürmez). Taslaktan çıkarken aynı yazımda tür değişimi serbest: eski durum taslaktır (ekran taslağı hep `onayda` ya da `aktif` olarak kaydeder).
   (e) KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): gerçek veriyle sunucu yok, geliştirme kartları için etkisiz (VARSAYIM: canlı veriden önce eski kart sorunu doğmaz). Var olan kartlar için `aktif_oldu`: aktif/pasif olanlar ve sunucunun bastığı onay ya da pasife alma damgası (`onaylama`, `kayit.onay.onay`, `kayit.onay.pasif`) taşıyanlar doğru; hiç iz taşımayan taslak ve onaydaki kartlar yanlış (iz bırakmadan aktif olmuş eski kart bilinemez). Ekranın "kod yapısı geçişi" (toplu kod değiştirme) kilitli kartta kodu değiştiremez, istek yok sayılır.
   (f) 24 sınırı önek kabulünde uygulanır (önek + en büyük `int` sıra, 7 + 10 = 17); sıra aşamasında ayrı denetim yok (erişilemezdi). Önek deseni genişletilirse sınır aynı yerde tutulur.
   KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): (e) ile aynı gerekçe. Bilinen sınır: iz bırakmadan aktif olmuş eski kart bilinemez; yanlış işaretlenen satır ancak yeni göçle düzelir (tetikleyici işareti düşürmeye izin vermez). `aktif_oldu` aktif ya da pasif durumda yükselir (doldurma, ekleme ve güncelleme tetikleyicisi aynı tanım); şema ve doldurma kullanıcı onaylı (07.10.2026).
   Göç `20261007210434_malzemeler_taslak_kodu.sql`: `aktif_oldu` sütunu, var olan kartların doldurulması ve koruma işlevi (hiç aktif olmamış taslakta tür, önek, sıra serbest; açan kişi ve sayı kimliği hep kilitli).

## Bağlama tur 1, tedarik (kart #163, kullanıcı kararları SH4 a, ML1 a, ML2 b, 09.10.2026)
Kapandı:
- Birim listesi sunucuda: `malzeme_birimi` (göç `20261009011000_*`); kart kaydı listede olmayan birimi 422 ile reddeder (birimi değişmeyen eski kart hariç). Logo birim karşılığı listeye anahtarla bağlı (ML1 a).
- Kategori listesi sunucuda: `malzeme_kategorisi`; özet kategoriyi adıyla verir. Kategori Logo'ya gitmez.
- Liste düzenleme yeri prototipin Ayarlar ekranı (ML2 b); ayar kaydı tabloları aynı işlemde hesaplar, yetki uçta (`malzemeler.tanim-yaz`). Ekran dosyası değişmedi.
- Stok ve rota istekleri: `malzemeOzetleri`, `malzemeAra` (tek imza), özette birim; rota'nın `malzemeBirimleri(db, nolar)` isteği özetle karşılanır.
Açık:
- Kart birimi hâlâ `kayit.com.birim` JSON alanı; sütuna taşımak dolu tabloyu değiştirir, sorulmadı.
- ~~Kategori kart kaydında denetlenmez~~ kapandı (#1474, kullanıcı kararı "reddedilsin ve kategori açmaya yönlendirsin"): listede olmayan ya da kapalı kategori 400; kategorisi sonradan kapanan kayıtlı kart yeniden kaydedilir.
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): gerçek veri yok; ilk ayar kaydı hesaplar (VARSAYIM). Ayarda gizlenen birim göç anında hesaplanmaz, ilk `malzeme` ayar kaydında hesaplanır (göç yalnız ekleneni alır; geri alma: ayarı bir kez kaydetmek).
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): ucu başka ekran çağırmıyor (`istemci/src` içinde test dışı "malzeme-birimleri" yok), birim özetle gidiyor; satın alma ve depo zaten sayfa rolünde (`rol-dagilimi.test.ts`). `GET /malzeme-birimleri` malzemeler sayfasının okuma işlemini ister; satın alma ve stok ekranları birimi kendi uçlarından vermeli ya da rol satırı gerekir (rol tablosu, ST5/CK1).
- Arama dizinsiz (`ILIKE`); katalog büyürse dizin ayrı iş (dizin şema değişikliğidir).

## Bağlama tur 1: hizmet türü (kart #163, kullanıcı kararları MH1-MH5, 09.10.2026)
Kapandı:
- Hizmet altıncı tür (`HZ-<grup>-00001`); yön `hizmet_yonu` adlı kısıtlı, hizmette zorunlu, hiç aktif olmamış taslak dışında değişmez (servis 422, tetikleyici de tutar).
- Hizmet grupları kategori listesinde (FSN, YZY, ISL, MYT, BKM, NAK, DNS, DGR; test `katalog-kurallari.test.tsx` "sekiz grup"); hizmet birimleri (adet, saat, gün, sefer, ay, kg, m², km) birim listesinde, Ayarlar'dan genişler.
- Hizmet reçete bileşeni ve operasyon sarfı olamaz (422, testli); tür karşılığı tablosuna giremez (kısıt değişmedi, testli).
- Sayfa adı "Malzemeler ve Hizmetler", menü maddesi "Yeni kart"; hizmet kartına etiket basılmaz.
Açık:
- BİLGİ NOTU (borç azaltma 18.10.2026; borç değil, istenirse ayrı iş): hizmet grupları yerleşik sekiz grup; Ayarlar'dan grup ekleme yok (sarf ve demirbaş kategorisi gibi).
- BİLGİ NOTU (borç azaltma 18.10.2026; borç değil, istenirse ayrı iş): Excel şablonu ve toplu giriş/çıkış beş türle sınırlı (`katalog.html` `xlCalismaKitabi` `turler = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas']`); hizmet ve ticari mal Excel'e çıkmaz, Excel'den girmez.
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): yön metni sunucuda ASCII'ye çevriliyor (`kurallar.ts` `HIZMET_YONU_METNI`). Yön ekranda seçim metniyle (`kayit.g.yon`: "Alınan" / "Verilen") durur; sunucu sütuna ASCII yazar.
- KAPANDI (borç azaltma 18.10.2026, yapılmış): 360 genişlikte kabuk başlığı uzun sayfa adını kesiyordu (çekirdek isteği 6); başlık dar ekranda alt satıra kayıyor (commit 1779760, ekran testi `ekran-testleri/ust-cubuk.spec.ts`).
- Kapandı: prototip kuralları (hizmete etiket basılmaz, reçete aramasında hizmet yok, hizmette depo yeri ve sertifika yok) `katalog-kurallari-hizmet.test.tsx` ile testli. "Etiket" düğmesinin gizlenmesi de testli (borç değerlendirmesi 17.10.2026, H5: kart ayrıntısı ve QR kartı, ekrandaki iki çizim yeri). Sunucu tarafı (reçete reddi) testli.
- Hizmet türünün rengi prototipte sabit (`TURLER.hizmet.c`), öteki türler gibi; tasarım değişkenine taşımak prototipin bütün türlerini kapsayan ayrı iş.
- KAPANDI (borç azaltma 18.10.2026, malzemeler tarafında iş yok): satın alma yalnız alınan hizmeti arar (`satin-alma/kurallar.ts` `hizmetYonu: 'alinan'`, SAT-75); rota tür listesinin hizmeti süzmesi rota tarafının işidir, istek `BASKA-MODUL-ISTEKLERI.md`'de.

## Bağlama tur 1: hizmet çeşitleri (kart #163, kullanıcı isteği ve "yaz", 09.10.2026)
Kapandı:
- Hizmette grup, çeşit, standart ve isterler (ekranın `HZ_KAT` tablosu); kod çeşide göre; mükerrer anahtarı yön, grup, çeşit, standart ve isterlerle.
- Stok sözleşmesi hizmeti tanıyor (stok #372 ana dalda); önceki turun "stok birleşmeden birleşemez" maddesi kapandı.
Açık:
- Standart önerileri genel bilgiden; kullanıcının şartname listesiyle karşılaştırılmadı.
- BİLGİ NOTU (borç azaltma 18.10.2026; borç değil, istenirse ayrı iş): çeşit ve ister listeleri Ayarlar'dan genişlemez ("Diğer" çeşit ve serbest standart alanı var); sarf alanlarındaki gibi liste düzenleme.
- BİLGİ NOTU (borç azaltma 18.10.2026; borç değil, bugün isteyen modül yok): çeşit özete, aramaya ve Logo kuyruğuna girmez; rota (fason adımı) ve satın alma çeşide göre süzmek isterse `disari.ts`'e ayrıca eklenir.
- Kapandı: prototipin çeşit tablosu ve kuralları (kod, ad kurma, çeşit değişince silme, mükerrer anahtarı) `katalog-kurallari.test.tsx` ile testli.
  Bir isterin anahtarı grup, yön, ad, kapsam ya da çeşit anahtarıyla çakışırsa çeşit değişince silinmez (`HZ_AYRILMIS`), ama değeri paylaşır; yeni ister eklerken anahtar ayrı seçilmeli.
- Kapandı (kullanıcı kartı 17.10.2026, "Yenilensin"): kayıtlı taslakta çeşit ya da kategori değişince sunucu da ekranın yeni önekiyle yeni kod verir (Logo bölümü madde 5 (c)).
- KAPANDI (borç azaltma 18.10.2026, test; bilinen sınır olarak kalır): mükerrer anahtarı "Diğer" çeşit adı ve metin isterlerle uzar; özet sınırı 500 karakter (`paylasilan/sozlesme/malzemeler.ts` `max(500)`). Test `katalog-kartlari.test.ts` "Anahtar sınırı": 500 karakter kaydolur, 501 karakter 400 (`ozet.benzersiz_anahtar`) ve kart yazılmaz. Gerçekte olası görünmüyor (VARSAYIM); sarfın anahtarında da aynı.

## Akış C düzeltmesi: kart birimi (kart #423, Refs #163, 10.10.2026)
Kapandı:
- Kart birimi kaydolmuyordu (H5); kayıt, varyant ve Excel içe aktarma artık ekranın gösterdiği birimi yazar. Tarayıcıda önce ve sonra sınandı (`/mnt/project-files/bagla/malzemeler-akis-c/`).
Açık:
- KAPANDI (borç değerlendirmesi 17.10.2026, AC1): kayıt, varyant ve Excel yolları testli (`katalog-kurallari.test.tsx` "birimi boş kayıtlı kart" ve "varyant kaydı her karta ekranın gösterdiği birimi yazar", `MalzemeKatalogu.test.tsx` Excel birimi). Birimsiz kart onaya ve aktife geçmez (kapandı, #1474); taslak birimsiz kaydolur.
- Ana dalda birimi boş kalmış kartlar kendiliğinden dolmaz; yeniden kaydedilene kadar satın almada "Kataloğa ekle" 400 verir. Aşama 2: gerçek veriyle sunucu yok; canlı veri gelince sayılır, doldurmak dolu tabloyu değiştirdiği için yazılı onayla.
- ~~Onay akışında birimi boş aktif kart "Kartta değişiklik yok" der~~ kapandı (dal 466, aynı PR): boş birimin dolması talep olarak gider; Excel'de de fark sayılır. Tarayıcıda sınandı (`/mnt/project-files/bagla/malzemeler-aktif-birim/`).

## Tedarikçi firması (kart #466, Refs #163, 10.10.2026)
Firma kartı 13.10.2026'dan beri Müşteriler ve Tedarikçiler modülünde (`musteri_tedarikci_firma.id`, kart #1164); sunucu firmayı `musteri-tedarikci/disari.ts` `firmaOzeti` ile okur, tedarikçi olabilme kuralı `finans/disari.ts` `tedarikciOlabilirMi`'dendir. Ekran ve sunucu iletilerinde "finans" sözcüğü hâlâ geçer (prototip metni ve `servis.ts` ret iletisi); ileti metni değişmedi.
Kapandı:
- Kart tedarikçisi firma kartından seçilir; kimlik kartta (`com.tedId`), sunucu firmanın varlığını denetler.
Açık:
- Eski kartlardaki tedarikçi metni firmaya eşlenmedi (eşleme kullanıcı onaylı ayrı iş; ad benzerliğiyle otomatik eşleme yapılmadı).
- Kısmen kapandı (312 b, 20.10.2026): kartın kimliği `tedarikci_firma_id` sütununda da yazılır, firmaya yabancı anahtarla bağlı (`malzeme_katalog_karti_tedarikci_firma`). Açık: eski satırlar doldurulmadı (314: veri aktarılmaz); `com.tedId` jsonb'de kalır, ekran onu okur.
- Kapandı: ekranın seçici kuralı `katalog-kurallari.test.tsx` ile testli.

## Bağlamada kapanacak: ticari mal (kart #1218)
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): ticari mal reçetede girdi olamaz (`recete-rota/kurallar.ts` `girdiOlabilir: girdiOlabilirMi(ozet.tur)`; test `RotaBaglama.test.tsx` "ticari mal ve hizmet girdi listesinde çıkmaz"); 'ham' eşlemesi gösterim için bilinçli kaldı. Geçici eşleme / recete-rota prototipinde ticari mal türü yok / `sunucu/moduller/recete-rota/kurallar.ts` `KATALOG_TURU_PROTOTIP` ticari_mal -> 'ham' /
  recete-rota ticari malı malzeme listesinden süzünce ya da prototip türü gelince kalkar (kullanıcı kararı: ticari mal reçetede görünmez). Kullanımı etkiler:
  süzülene kadar recete-rota ekranında ticari mal hammadde gibi listelenebilir; malzemeler kendi kartının reçetesinde reddeder (TM3).

## Ad, açıklama ve zorunlu alan kuralları (Malzeme ayarları, 15.10.2026)
Kapandı:
- Firma kodlu türler genel ayardadır (`genel.firmaKoduTurleri`); öneki sunucu kurar ve listeyi doğrular (`mamul-firma-kodu.test.ts`).
Açık:
- Tür başına zorunlu alan onaya göndermede ve aktif yapmada sunucuda denetlenir (kapandı, #1474). KAPANDI (borç azaltma 18.10.2026, tekrar): ad ve açıklama kalıbının (`malzeme` ayarı `kurallar`) yalnız ekranda
  uygulanması ana listedeki madde 4'ün (ekran kuralları sunucuya) parçasıdır, orada izlenir (alanların görünürlük koşulları prototiptedir; sunucu denetimi için alan tanımlarının sunucuya taşınması gerekir).
- KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): çakışma kuralı sunucuda (`kurallar.ts` "MKK-16", `sorgular.ts` `varsayilan_anahtar`; test `cakisma-kurali.test.ts`). Çakışma alanları (`kurallar[tür].cakisma`) seçili türde benzersiz anahtarı sunucuda kurar; ekranın yerleşik kuralı `varsayilan_anahtar` sütununda saklanır, liste boşalınca kartlar ona döner.
- Kapandı: kalıp motoru, zorunlu alan ve çakışma ayarı `katalog-kurallari.test.tsx` ile testli.

## Kg fiyatı ve birim fiyat (19.10.2026, #1842)
- Kartın Ticari bölümünde "Birim fiyat" ve "kg fiyatı (satın alma)" satın almanın kg fiyatı ucundan (`GET /satin-alma-kg-fiyatlari/malzemeler`) gelir, yalnız çerçevenin belleğinde durur, karta yazılmaz.
  Yetkisiz rolde satır çizilmez; yetkili rolde fiyatı bilinmeyen tutar "—".
- Bilinen sınır: satırlar prototip dosyasına değil, prototipten sonra eklenen betiğe yazıldı (`kg-fiyati-eki.ts`; prototip ekranlar değişmez). Betik prototipin genel `hostYenile` ve `specHTML` işlevlerini sarar;
  prototip bu adları değiştirirse satırlar sessizce çıkmaz, `katalog-kurallari.test.tsx` "kartta birim fiyat" kırılır.

## Rotası olan kartta operasyonlar (233 a, 19.10.2026, #1913)
- Rotası (iptal olmayan revizyonu) olan kartta Operasyonlar adımı salt okunur tablo çizer; düzenleme Reçete ve Rota'nın "Ürün ve rotalar" görünümündedir. Yeni ya da rotasız kartta adım bugünkü gibidir; ilk rota karttan açılır (#688).
- Sunucu böyle kartta ops, sıra, bom ya da talepte bunları değiştiren kaydı 409 ile reddeder; yalnız yeniden numaralama değişiklik sayılmaz. Rota bilgisi Rota'nın `durumRevizyonlari` işlevinden, `sunucu/kablolama.ts`'te bağlanan çözücüyle gelir (Rota Malzemeler'i ithal ettiği için ters yön).
- Bilinen sınır: ekran kısmı prototipten sonra eklenen betiktir (`rotali-kart-eki.ts`, `opsHTML` sarılır). Rota durumu okunamazsa düzenleyici açık kalır, kaydı sunucu yine reddeder. Prototipte reçete adımı olmadığı için ekranda yalnız operasyonlar değişir.

## Kartın etiketi Etiket Merkezi'nde (269 a, 20.10.2026, #2033)
- Kart ayrıntısında prototipin "Etiket" düğmesinin yanında "Etiket Merkezi'nde bas" düğmesi durur; `/etiket-merkezi?tur=malzeme&id=<kart no>` açılır. Yalnız `sayfa.etiket-merkezi` olan kullanıcıda, kayıtlı ve hizmet olmayan kartta görünür.
- Bilinen sınır: düğme prototipten sonra eklenen betiktedir (`etiket-merkezi-eki.ts`, `openItem` sarılır). Prototipin kendi etiket penceresi yerinde durur; ikisinin birleşmesi ayrı karardır. Aynı düğme QR ile açılan saha görünümünde de durur (`sahaAc` sarılır).

## Alış birimi ve katsayısı (323 b, 20.10.2026)
- Kartta tek alış birimi ve katsayısı durur (1 alış birimi = katsayı kadar stok birimi; ör. 1 kutu = 50 adet). Kartın `com.alisBirimi` ve `com.alisKatsayisi` alanları `alis_birimi` ve `alis_katsayisi` sütunlarına yazılır;
  ikisi birlikte dolu ya da boştur, alış birimi stok biriminden farklı ve birim listesinde olmalıdır (yeni ya da değişmişse), katsayı sıfırdan büyük, en çok 6 ondalıktır. Satın alma `malzemeBirimDonusumleri` (disari.ts) ile okur.
- Bilinen sınır: alanlar prototipten sonra eklenen betiktedir (`birim-donusumu-eki.ts`, `s5` ve `gTicariHTML` sarılır). Alış birimi seçenekleri ekranın bütün birim listelerinin birleşimidir; Excel aktarımı, föy ve değişiklik karşılaştırması alanları göstermez.
  Eski kartlar boş kalır (314). Satın almada siparişin birimi ve stoka çeviri Satın alma şeridindedir.

## Ekranı olmayan uçlar (kullanıcı kararı 139 a, 23.10.2026) - bağlamada kapanacak
- Uçlar kalır, bağlamada ekrana bağlanır. Hiçbir ekran çağırmıyor (DOĞRULANDI, `degerlendirme/sistem-uyum/rapor.md` bulgu 8): `GET /malzeme-birimleri`. Birimin sahibi malzemeler (144 a).
