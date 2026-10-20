# malzemeler notları

- Ekran Malzeme Kataloğu prototipidir (kullanıcı kararı 07.10.2026): `istemci/.../katalog/katalog.html` çerçevede birebir açılır; verisi `kopru.ts` ile `malzeme-katalogu-*` uçlarına gider. Kart, şablon ve ayar tek JSON sütunundadır (kural istisnası, kullanıcı kararı); sunucunun denetlediği alanlar (tür, onay durumu, stok kodu, benzersiz anahtar, mükerrer gerekçesi, hizmet yönü) ayrıca sütun ve kısıttır. Tür, durum ve kod kartın kendisinden okunur; benzersiz anahtar ve gerekçe ekranın özetinden gelir (türde çakışma alanı seçiliyse anahtarı sunucu kurar), kartın geri kalanını sunucu doğrulamaz.
- Vazgeçilen yol (#202, kullanıcı kararı B, 07.10.2026): eski normalize kart (18 tablo, 28 uç, ML/MQ/MS kuralları) ekransız kaldığı için kaldırıldı; göç tablolar boş değilse (tanım tabloları tohum sayısında değilse) durur, sessizce silmez.
- `malzeme_katalog_karti.no` hiçbir INSERT'te verilmez (OVERRIDING yok); verilirse sonraki kart açma 23505 alır.
- Stok kodunu sunucu verir: önek prototipin kodundan (yalnız tür-grup(3) biçimi; genel ayarda firma kodu varsa mamulde `FİRMA-MM-`, kart #652), sıra `malzeme_katalog_kod_sirasi` satır kilidiyle; kod kartın içine (`kayit.com.kod`) de yazılır. Hiç aktif ya da pasif olmamış taslakta tür değişince yeni kod alınır (eski sırada delik kalır); onayda, aktif, pasif ve bir kez aktif ya da pasif olmuş kart (`aktif_oldu`, tetikleyici yükseltir, düşürmez) taslağa dönse de tür ve kod kilitli (şema onayı kullanıcı kararı, #230); en çok 24 karakter (önek kabulünde ve veritabanı kısıtı `malzeme_katalog_karti_stok_kodu_24`, kart #232). Göç `20261007210434_*`.
- Dört göz ayarının tek kaynağı `servis.ts` `dortGozAcikMi`: Sistem Ayarları'ndaki `malzemeler.dort-goz` (satır yokken açık). Ayar kapalıyken verilen onay kartta `dort_gozsuz_onay` ile işaretlenir.
- Rol dağılımı kullanıcı kararıdır (07.10.2026): tanım ve ayar işlemi bilerek hiçbir role verilmedi (yalnız bayraklı rol); onaylayan rol yazmayı da taşır, çünkü onay kartı kaydeden uçtan geçer. Testler yetkiyi göçten alır, role elle işlem eklemez (tek istisna: yalnız `tanim-yaz` taşıyan sınama kullanıcısı).
- Çerçevenin içerik politikası dışarıya her isteği kapatır: prototipin Excel (ExcelJS, SheetJS) ve kameradan QR (jsQR) yüklemeleri bu yüzden çalışmaz; yerel kopya onayı bekliyor. Belge yükleme kapalı (dosya saklama yok).
- Değişiklik talebinin farkını (`talep.farklar`) sunucu ham alan yoluyla yazar, ekran saklananı gösterir; ekranın biçimlenmiş farkı sunucuda üretilemediği için bu seçildi (kart #226). Talep uygulanırken içerik `talep.yeni` ile aynı ve talep açıldığı kartta geçerli olmalı.

## Logo bağlantısı: nasıl kullanılır (kart #232)
Bağlantıyı yazacak modül için. Bu modül Logo'ya bağlanmaz; yalnız kuyruğu ve sonucu verir. İki işlev de yetki denetlemez ve çağıranın `db`'sini kullanır.
1. `logoyaGidecekMalzemeler(db, sinir)`: "bekliyor" ve "hata" durumundaki kartlar, en eski aktiflik önce, en çok `sinir` kart. Her kartta `no`, `stokKodu`, `ad`, `birim`, `tur`,
   o anki `logoKartTuru` ve `logoBirimSeti`, `durum`, `sonHata` ve `eksikler` vardır.
2. `eksikler` boş değilse kart gönderilmez (stok kodu, ad, birim, tür karşılığı, birim karşılığı); bir sonraki turda yeniden gelir. Karşılıkları yönetici Logo gönderimi sayfasında doldurur.
3. Eksiksiz her kartı köprüye yazar, Logo'nun cevabını aynı kart için `malzemeLogoSonucu(db, no, sonuc)` ile bildirir: başarıda `{ kayitNo }` (kart "gonderildi" olur, zaman ve
   gönderilen tür/birim karşılığı karta yazılır), hatada `{ hata }` (kart "hata" olur, metin saklanır, sonraki turda yeniden gelir).
4. Reddedilenler: aynı kayıt numarası ikinci karta (409 CAKISMA), gönderilmiş ya da kuyrukta olmayan kart (422 GECERSIZ), boş hata ya da kayıt numarası (400 DOGRULAMA).
   Gönderilmiş kartın kaydını, stok kodunu, türünü ve birimini tetikleyici de değiştirtmez.
5. Kart ilk kez aktif olduğu yazımda "bekliyor" olur (tetikleyici, aynı işlem); taslak ve onaydaki kart, bugün aktif olan eski kart ve pasiften dönen kart kuyruğa girmez.
6. `logoBirimSetiKullaniliyorMu(db, kod)`: bir birim seti kodu herhangi bir birim karşılığında kullanılıyorsa `true` (Logo modülü listeden kaldırmadan önce bakar).
   Tür karşılığı yalnız `10`-`13` olabilir; birim karşılığı yalnız biçimce denetlenir, listede olup olmadığına gönderimde Logo modülü bakar (kart #232, LB9 a).
7. Ad güncellemesi (kart #783, S4 b): Logo kaydı olan kartın adı değişince aynı yazımda `logo_guncelleme_durumu` "bekliyor" olur. `logoyaGuncellemeGidecekMalzemeler(db, sinir)`
   "bekliyor" ve "hata" güncellemeleri en eski önce verir (`no`, `stokKodu`, `ad`, `logoKayitNo`, `durum`, `tur`, `hizmetYonu`). Cevap `malzemeLogoGuncellemeSonucu(db, no, sonuc)` ile:
   `{ ad, tamam: true }` ya da `{ ad, hata }`; `ad` kuyruktan alınan ad olduğu gibi geri verilir. Ad bu arada yine değiştiyse sonuç yazılmaz, güncelleme "bekliyor" kalır ve sonraki
   tur yeni adı alır. Kuyrukta olmayan kart 422 GECERSIZ, boş hata 400 DOGRULAMA, olmayan kart 404. İlk gönderimi bekleyen kartın ad değişimi güncelleme açmaz (ilk gönderim güncel adı alır).

## Bağlama tur 1: başka modüller malzemeyi nasıl okur (kart #163)
1. `malzemeOzetleri(db, idler)`: liste ekranı için tek sorgu; olmayan kimlik haritada yok. Özette `birim` (kartın stok birimi) ve sarf/demirbaşta `kategori`, `kategoriAdi`.
2. `malzemeAra(db, { metin, turler?, yalnizAktif?, sayfa, sayfaBoyu? })`: stok kodunda ya da adda geçen metin (harf duyarsız), rakamsa kart no da; iptal kart gelmez;
   `SayfaliListe` döner (sayfa boyu öntanım 50, en çok 200). Stok ve rota için tek imza.
3. `olcuBirimleri(db)`: birim listesi (`kod`, `aktif`). Pasif birim eski kartta durur, yeni kayıtta seçilemez. Ekran için `GET /malzeme-birimleri`.
4. Birim ve kategori listesi prototipin Ayarlar ekranında düzenlenir; `malzeme` ayarı kaydedilince tablolar aynı işlemde yeniden hesaplanır (ayrı sayfa yok, ML2 b).
5. `malzemeOperasyonlari(db, no)` (kart #688): kartın Operasyonlar adımı `{ no, kod, ad }[]`; no tekil, artan ve pozitif (numarasız satır öncekinin 10 fazlası, eşit numara bir fazlası); kodu boş satır alınmaz; ad null olabilir; kart yoksa null. Kartın onaylı içeriği döner (bekleyen talep değil) ve durum süzülmez: çağıran `malzemeKullanilabilirMi` ile aktifliğe bakar. Yetki denetlemez.
6. `operasyonluAktifKartlar(db)` (kart #688): Rota'nın kendiliğinden taslak işi için; aktif, mamul ya da yarı mamul ve en az bir kodlu operasyonu olan kartlar `{ no, kisiId }[]`. kisiId onaylayan kişi, yoksa son güncelleyen. Rotası olup olmadığına bakmaz (o Rota'nın tablosu). Yetki denetlemez.
7. Rota şablonları (kart #688): kartın Operasyonlar adımı şablonu istemcide Rota'nın `GET /rota/sablonlar` ucundan okur (köprü `rota-sablon-liste`); sunucu tarafında okunamaz, çünkü rota zaten malzemeler'i ithal eder (sınır kuralı f, döngü).

