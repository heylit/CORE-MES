# Kural -> test (ik)

Test adları `sunucu/moduller/ik/kurallar.test.ts` (saf) ve `sunucu/moduller/ik/ik.test.ts` (gerçek PostgreSQL, gerçek giriş) içindedir.

| Kural | Saf test | Veritabanı testi / kısıt |
|---|---|---|
| IK-0 her yazma ucu kendi işlemi | "IK-0: her yazma alanının kendi işlemi vardır; bordro genel yazma alanında yoktur" | "IK-0: her yazma ucu kendi işlemini ister" |
| IK-1 kimlik ve tür | "IK-1: kayıt kimliği adresle, türü uçla aynı olmalı" | "IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan"; eşleyici reddi ("tanımsız alan, yanlış tip, geçersiz seçenek, bozuk tarih ve boş zorunlu alan reddedilir") |
| IK-2 64 KB | "IK-2: 64 KB üstü kayıt reddedilir" | — |
| IK-3 sunucu alanları | "IK-3: istemcinin zaman ve karar alanları atılır" | "IK-9, IK-3: çalışan kendi adına bekleyen talep açar; tarihleri sunucu yazar" |
| IK-4 zorunlu alanlar | "IK-4: türün zorunlu alanları" | kısıtlar `ik_izin_durum_secenek`, `ik_izin_tarih_sirasi` ("kısıtlar: sicil tekil, durum ve dört göz veritabanında da korunur") |
| IK-5 sonuçlanmış talep değişmez | "IK-5: sonuçlanmış (reddedilmiş, iptal) talep değişmez" | "IK-5, IK-6: onaylı izin onaysız değişmez; sonuçlanmış izin değişmez" |
| IK-6 onaylı izin onaysız değişmez | "IK-6: onaylı iznin içeriği ve iptali onay yetkisi ister; onaylı izin geri çevrilemez" | "IK-5, IK-6: onaylı izin onaysız değişmez; sonuçlanmış izin değişmez" |
| IK-7 kendine karar yok | "IK-7: kimse kendi talebine karar veremez (karar ucu ve İK kaydı)" | "IK-7, IK-8: yönetici yalnız ekibine karar verir; kimse kendine karar veremez" |
| IK-8 yönetici yalnız ekibine | "IK-8: bütün izinleri yazamayan onaycı yalnız ekibine karar verir; içerik değiştirilemez" | "IK-7, IK-8: yönetici yalnız ekibine karar verir; kimse kendine karar veremez" |
| IK-9 çalışan talebi | "IK-9: çalışan yalnız kendi adına bekleyen talep açar, değiştirir ya da geri çeker" | "IK-9, IK-3: çalışan kendi adına bekleyen talep açar; tarihleri sunucu yazar" |
| IK-10 pozisyon durum yolları | "IK-10: pozisyon durumu tanımlı yollarla değişir; açılış onay ister" | "IK-10, IK-11, IK-12: kadro talebi onayı, dört göz ve onaylı pozisyonun kadrosu" |
| IK-11 dört göz | "IK-11: dört göz açıkken gönderen onaylayamaz; kapalıyken onaylar" | aynı test; kısıt `ik_pozisyon_dort_goz` ("kısıtlar: sicil tekil, durum ve dört göz veritabanında da korunur") |
| IK-12 onaylı kadro | "IK-12: onaylanmış pozisyonun kadro bilgileri onaysız değişmez; ilan metni değişir" | "IK-10, IK-11, IK-12: kadro talebi onayı, dört göz ve onaylı pozisyonun kadrosu" |
| IK-13 ücret yetkisi | "IK-13: ücret ve ücret geçmişi ücret yetkisiyle değişir" | "IK-13: ücret yetkisi olmayan ücret giremez ve değiştiremez" |
| IK-14 kendi iletişimi | "IK-14: yalnız kendi personel kaydının iletişim bilgisi" | "IK-14: kişi yalnız kendi iletişim bilgisini değiştirir" |
| IK-15 bordro sunucuda | "IK-15: bordro tutarları motorun hesabıdır; asgari ücretlinin neti girdiden bağımsız hesaplanır" | "IK-15, IK-16, IK-17: bordro sunucuda hesaplanır; kesinleşmiş ay kilit açma ister" |
| IK-16 kilit açma | "IK-16: kesinleşmiş ayı yeniden kesinleştirmek kilit açma yetkisi ister" | aynı test; dizin `ik_bordro_ayda_tek` |
| Kesinleştirme tekrar koruması (borç 170) | "IK-15, IK-16, IK-17: bordro sunucuda hesaplanır; kesinleşmiş ay kilit açma ister" (aynı istek kimliği ilk cevabı alır, kimliksiz istek 400) | `kopru.test.ts` "bordro kaydı kurulmaz" (her ay ayrı kimlik) |
| IK-17 bordro yalnız kesinleştirmeyle | "IK-0: her yazma alanının kendi işlemi vardır; bordro genel yazma alanında yoktur" | "IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan" (personel ucuna `pay` reddi), "IK-15, IK-16, IK-17: bordro sunucuda hesaplanır; kesinleşmiş ay kilit açma ister" (net girdisi reddi) |
| IK-18 silme yerine iptal | — | "IK-18, IK-22: silme iptaldir, kopyası geçmişte kalır ve geri gelir; satır silinemez, geçmiş değişmez"; tetikleyici `ik_kayit_koru` (kısıt adı `ik_kayit_silinmez`) |
| IK-19 sürüm | — | "IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan"; tetikleyici `ik_kayit_surum_artar` |
| IK-20 parametre dönemi kilidi | "IK-20: kilitli dönem değişmez ve silinmez; yeni dönem geçmişe dönük açılamaz" | "IK-20: kilitli parametre dönemi değişmez; yeni dönem geçmişe dönük açılamaz" |
| IK-21 kişi kapsamı | "IK-21: rol işlemden ve ekipten; ekip kaydında ücret, kimlik, banka ve adres yok" | "IK-21, IK-24, IK-25: rol ve kapsam: İK hepsini, yönetici ekibini (süzülmüş), çalışan kendini görür" |
| IK-22 geçmiş yalnız eklenir | "IK-22: değişiklik geçmişi alan alan; boş değerler eşit, zaman alanları atlanır" | "IK-18, IK-22: silme iptaldir, kopyası geçmişte kalır ve geri gelir; satır silinemez, geçmiş değişmez"; tetikleyici `ik_kayit_gecmisi_yalniz_ekleme` |
| IK-23 zaman ve kişi sunucudan | — | "IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan"; tetikleyici `ik_kayit_degismez` |
| IK-24 ekip | "IK-24: ekip yönetici bağından (alt kademeler) ve departman yöneticiliğinden" | "IK-21, IK-24, IK-25: rol ve kapsam: İK hepsini, yönetici ekibini (süzülmüş), çalışan kendini görür" |
| IK-25 TMI kullanıcısı eşleşmesi | "IK-25: kişi personel kaydıyla TMI kullanıcısı alanından; çift bağda hiçbiri" | "IK-21, IK-24, IK-25: rol ve kapsam: İK hepsini, yönetici ekibini (süzülmüş), çalışan kendini görür"; dizin `ik_personel_kisi_id_tek` ("IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan") |

İstemci: `istemci/src/moduller/ik/kopru.test.ts` (yönlendirme, sürüm, bordro girdileri, eski sürümde yenileme),
`sayfa.test.ts` (içerik politikası, kaçış, köken denetimi).

## v2 ekleri
| Kural | Saf test | Veritabanı testi / kısıt |
|---|---|---|
| IK-27 iş merkezi kapsamı | "IK-27: kaydın iş merkezi kendisinden, personelinden ya da pozisyonundan gelir" | "IK-27: iş merkezi kapsamı okumada ve yazmada; personele ve pozisyona bağlı kayıtlar kapsamı onlardan alır"; zorunlu iş merkezi sütunu, NOT NULL ("kısıtlar: sicil tekil, durum ve dört göz veritabanında da korunur") |
| Tam ayrıştırma: her alan sütun | "personel: alanlar, ücret geçmişi, belgeler, notlar, çıkış listesi ve primler gidip gelir", "bordro: girdiler, hesap sonucu, yemek-yol-teşvik nesneleri ve prim dökümü gidip gelir" | "her ana tablo tanımdaki her alanı ve ortak sütunları taşır; fazladan sütun yok", "ayar tabloları tanımdaki alanları taşır; JSON sütun yok" |
| Tanımsız alan reddi | "tanımsız alan, yanlış tip, geçersiz seçenek, bozuk tarih ve boş zorunlu alan reddedilir" | "IK-19, IK-23: sürüm denetimi; kayıt zamanı sunucudan" (ayakkabiNo, eksik iş merkezi) |
| Ayarların ayrışması | — | "ayarlar tablolara ayrışır ve aynı biçimde geri gelir; tanımsız ayar reddedilir" |

## Oturtma eki (12.10.2026)
| Kural | Test |
|---|---|
| Rol x işlem: onaylı dağılım göçle gelir; İK sayfası yalnız İK uzmanında; muhasebe_finans İK kayıtlarını okumaz | "rol x işlem göçü: onaylı dağılım; İK sayfası yalnız İK uzmanında, herkes İK İşlemlerim ile izin talep eder; muhasebe İK kayıtlarını okumaz" |
| Çerçeve yalıtılmış (opak köken) çalışır | "yalıtılmış çerçevede (opak köken) çalışır: bellek içi depo betiği içerik politikasından sonra, uygulamadan önce gelir" |

## v3 ekleri (ON-PAKET-ik-v3, 12.10.2026)
Saf test: `sunucu/moduller/ik/kurallar.test.ts` "İK v3 kuralları". Veritabanı testi (gerçek PostgreSQL, gerçek giriş):
`sunucu/moduller/ik/bordro-onayi.test.ts`. Ekran testi (uygulama paketi jsdom'da, sahte depo): `istemci/src/moduller/ik/uygulama.test.ts`.
Köprü: `istemci/src/moduller/ik/kopru.test.ts`.

| Kural | Saf test | Veritabanı / ekran testi |
|---|---|---|
| IK-30 yalnız görme | "IK-30: çalışanın mesai kaydı yazma işlemi yoktur; bordro onayı kayıt yazma işlemi sayılmaz" | DB "IK-30, IK-31, IK-35: ... yazamaz" (çalışanın att yazması 403); ekran "IK-30..IK-34" (satır tıklanmaz) |
| IK-31 sunucu kendi att kaydını döner | "IK-31, IK-35: devam kaydı yalnız kişinin kendisine görünür; ekibe ve eşleşmeyene görünmez" | DB "IK-30, IK-31, IK-35" |
| IK-32 ay süzgeci ve toplamlar | — (ekranda hesap) | ekran "IK-30..IK-34": 5,5 fazla mesai, 8 resmî tatil, 1 devamsızlık, 4 satır |
| IK-33 onay durumu ve bordroya girişi | — | ekran "IK-30..IK-34": "Beklemede" çipi, "Onay bekleyen kayıtlar da bordro hesabına girer" (kural farkı: NOTLAR) |
| IK-34 yıllık sınır | — | ekran "IK-30..IK-34": "5,5 / 270", "sınıra kalan 264,5 saat"; hesap personel kartındakiyle aynı (tür ve yıl süzgeci) |
| IK-35 ekip mesaisi kapsam dışı | "IK-31, IK-35" | DB "IK-30, IK-31, IK-35" (müdür ekibinin att kaydını görmez) |
| IK-40 düğme yalnız kesinleşmiş bordroda | "IK-40, IK-41: onay yalnız kişinin kendi, kesinleşmiş bordrosuna" | ekran "IK-40, IK-41" (düğme ve onay penceresi); Bordrolarım yalnız kesinleşmiş ayları listeler |
| IK-41 sunucu denetler: başkası 403, taslak 409 | "IK-40, IK-41" | DB "IK-41: kesinleşmemiş (taslak) ayın bordrosu onaylanamaz: 409"; DB "IK-40..IK-46" (başka operatör, müdür, yönetici ve bakım rolü başkasınınkine 403; boş gövde 400) |
| IK-42 bir kez, geri alınmaz, defter | "IK-42, IK-43: onay bir kez; ..." | DB "IK-40..IK-46" (ikinci onay 409, defter satırı kişi ve zamanla); DB "IK-42: onay defteri yalnız ekleme"; kısıt `ik_bordro_onayi_tek` |
| IK-43 yeniden kesinleşince düşer | "IK-42, IK-43: ... okunan sürüm güncel değilse reddedilir" | DB "IK-40..IK-46" (yeniden kesinleştirme: `gordum` boş, eski sürümle onay 409, yeniden onay 200, defterde 2 satır) |
| IK-44 "Onaylandı: tarih saat" | — | ekran "IK-44"; köprü "bordro onayı okunan sürümle onay ucuna gider; ..." |
| IK-45 İK sayısı, listesi, hatırlatma | — | DB "IK-40..IK-46" (İK okumasında `gordum`); ekran "IK-45" (Yapılacaklar "bordrosunu 1 çalışan onaylamadı", Bordro ekranı "1/2 çalışan", onaylamayanlar ve onaylayanlar) |
| IK-46 onay tutarı değiştirmez | — | DB "IK-40..IK-46" (net, sürüm ve güncelleme zamanı onaydan önce ve sonra aynı) |
| Rol x işlem (bakım ve sevkiyat dahil, karar 1-a) | — | DB "rol x işlem göçü: bordro onayı İK İşlemlerim sayfasını alan her rolde; bakım ve sevkiyat dahil (karar 1-a)"; `ik.test.ts` dağılım testi |
| IK-51 geçmiş okuyanın kapsamıyla süzülür (denetim KD-051) | — | DB "IK-51" (kapsam dışı personelin ücret ve IBAN geçmişi İK uzmanına görünmez, kapsamdaki görünür, yönetici görür) |
| IK-52 izin günü 0 < gün <= takvim günü (denetim KD-052) | "IK-52" | DB "IK-52" (eksi, sıfır, aralıktan uzun 400; yarım gün kabul) |
| IK-53 yönetici paneli özeti: bugün onaylı izinli ve raporlu kişi sayısı, ad yok (kart #1082) | "IK-53" | DB "IK-53" (izinli 2, raporlu 1; kapsam dışı sayılmaz; İK okuması olmayan 403) |
| IK-54 `disari.ts` `izinliKisiler(db, tarih)`: o gün onaylı izin ya da raporda olan kişilerin `kisi.id`leri; eşleme `ik_personel.kisi_id` (kart #1147) | — | DB "IK-54" (izinli ve raporlu döner; bekleyen, iptal, başka gün ve kullanıcıya bağsız personel dönmez; bitiş günü dahil) |
| IK-55 `disari.ts` `kisininFazlaMesaisi(db, kisiId, bas, bit)`: yalnız fazla mesai, hafta tatili ve resmi tatil çalışması; iki uç dahil; bağsız kişi null (kart #1322) | — | DB "IK-55" (geç kalma, aralık dışı ve iptal girmez; bağlı ama kaydı yok boş liste; personeli yok null) |
| IK-56 yıllık mesai sınırı dönem ayarındaki pozitif saattir, yoksa null (kart #1322) | "IK-56" (270 ve ondalık geçer; boş, metin, sıfır, eksi null) | DB "IK-55" (ayar kaydı yokken 270) |
| `kisininIzinleri` ve `kisininKalanIzni` (kart #1322): izin aralıkla kesişir, iptal düşer; kalan izin İK motorunun hak edişidir, işe giriş yoksa hak ve kalan null | — | DB "kişinin izinleri", "kalan yıllık izin" (6 yıl: 90 gün hak, onaylı 5 düşer, bekleyen 3 ayrı; işe girişsiz null; personelsiz null; tarih biçimi 400) |

## Oturtma notu (kart #740)
"Rol x işlem" satırlarındaki iki göç testi ("rol x işlem göçü: onaylı dağılım ...", "rol x işlem göçü: bordro onayı ...") rol göçleriyle
birlikte çekirdek dalına gider (CEKIRDEK-ISTEKLERI madde 3); bu dalda yoklar.

## Puantaj (kart #1571)
Saf testler `puantaj-kurallar.test.ts`, veritabanı testleri `puantaj.test.ts`, ekran testleri `istemci/src/moduller/ik/uygulama.test.ts` ("İK puantaj yaması").

| Kural | Saf test | Veritabanı testi / kısıt / ekran |
|---|---|---|
| IK-60 kişi sayfası ve matris aynı kaydı okur ve yazar; yazan ve zaman sunucudan | — | DB "kişi sayfası ve matris aynı kaydı okur"; ekran "IK-60", "Kişi sayfası" |
| IK-61 çalışılan günde giriş zorunlu; öteki durumda saat yok | "IK-61" | DB "IK-61, IK-62"; kısıt `ik_puantaj_calisti_girisli`, `ik_puantaj_saatsiz_durum`; ekran "IK-61" |
| IK-62 çıkış girişle aynı olamaz; önceyse ertesi gün | "IK-62" | DB "IK-61, IK-62"; kısıt `ik_puantaj_sure_var` |
| IK-63, IK-64 ileri tarih, işe girişten önce ve çıkıştan sonra yazılmaz | "IK-63, IK-64" | DB "IK-63, IK-64" |
| IK-65 kesinleşmiş ay `ik.bordro-kilit-ac` ister | "IK-65" | DB "IK-65" |
| IK-66 sürüm: yeni gün sürümsüz, var olan okunan sürümle; boş durum günü siler | — | DB "IK-66"; ekran "IK-66" |
| IK-67 çalışan yalnız kendini okur, yazamaz; İK yalnız kapsamını (IK-27) | — | DB "IK-67", "IK-27"; ekran "IK-31" |
| Toplu yazma tek işlem; aynı gün iki kez gönderilemez | — | DB "toplu yazma tek işlemdir"; ekran "Toplu giriş" |
| IK-68 mola düşülür, fazla planın net süresinin üstü; plan yoksa fazla null | "IK-68" | DB "IK-68, IK-69" |
| IK-69 fazla türü günün planından (tatil, kapalı gün, mesai) | "IK-69" | DB "IK-68, IK-69" |
| IK-70 fazla mesai otomatik yazılmaz; "Devam kaydına aktar" bekleyen devam kaydı açar, aktarılan öneriden düşer | — | ekran "IK-70" |
| IK-71 devam ve mesai kayıtları (ik_devam) puantaj hücresinde ve takvimde görünür; "Fazla sa" devam kayıtlarının fazla mesai, hafta tatili ve resmi tatil çalışması toplamıdır; devamsız gün puantaj ve devam kaydının birleşimi, aynı gün bir kez | — | ekran "IK-71", "IK-31" (Mesailerim "FM 3") |
| IK-72 (karar 84) IBAN, ücret (brüt ve ücret geçmişi), kan grubu ve engel durumu geçmişe değer olarak yazılmaz, yalnız "değişti"; karardan önceki satırlar yerinde kalır, okurken gizlenir; bu satırlar geri alınamaz | — | DB "IK-72"; ekran "IK-72" |
| IK-73 (karar 88 a) kan grubu ve engel durumu `ik.ozel-veri-oku` olmadan kartta, yazma cevabında ve silinmiş kaydın kopyasında görünmez, değiştirilemez; boş ya da eksik gönderim değeri silmez; kişi kendininkini görür | — | DB "IK-73" (izinli ve 403) |
| IK-74 (karar 168 c, 244 a) çıkış tarihi olan, TMI kullanıcısına bağlı kişinin İdari İşler'de açık zimmeti varsa çıkış yine kaydedilir, kaydetme cevabı ve ekran uyarı gösterir (sayı, demirbaş no ve marka/model); bağsız personelde uyarı yok | `cikisZimmetUyarisi`, `acikZimmetCozucusu` | DB "IK-74"; köprü "IK-74" |
| IK-75 (bildirim merkezi) izin "Beklemede"ye girince `ik.izin-onay` sahiplerine "İzin talebi onay bekliyor" bildirimi düşer (kişi, tür, tarih; `/ik-islemlerim/onaylar`); talebi giren almaz; bekleyen talebin düzeltilmesi ve onay beklemeyen izin bildirim açmaz | `izinOnayBildirimi` | DB "IK-75" |
| IK-76 (İdari İşler yemek sayısı) `disari.gununFazlaMesaisi`: o gün fazla mesai, hafta tatili ya da resmi tatil çalışması kaydı olan, TMI kullanıcısına bağlı kişiler bir kez; onay beklemede de sayılır; başka tür, başka gün, iptal ve bağsız personel girmez | `FAZLA_MESAI_TURLERI` | DB "IK-76" |
