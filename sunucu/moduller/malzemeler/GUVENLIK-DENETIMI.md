# Güvenlik denetimi: malzemeler (uç başına; Aşama 1 tur 2 ve kart #232 durumu)

Zaman ve kişi her yazmada sunucudan (`guncelleyen_kisi_id`, `guncelleme`; kartın içindeki damgalar MKK-15). Kart sayfasında veri kapsamı yok (iş merkezine bağlı değil).
İstek kimliği (tekrar koruması) kullanılmıyor: kart kaydet sürümle korunur (MKK-7, 409); şablon ve ayar sürümsüz (UYUM-BORCU, sonra).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /malzeme-katalogu-kartlari | `{ biri: ['sayfa.malzemeler'] }` | sayfası olmayan 403; sayfa boyu en çok 500, `sonra` geçerli zaman olmalı (400) | `okuma uçları: sayfası olan roller 200 okur, ...` | aynı test: sayfasız 403, oturumsuz 401 |
| POST /malzeme-katalogu-kartlari/:kimlik/kaydet | `malzemeler.yaz` | MKK-1..MKK-16 (kod, tür kilidi, onay geçişleri, dört göz, sürüm, mükerrer, talep, fark; tür, durum ve önek karttan) | `Kabul: ...` (5), `meşru akış (<tür>) ...` | `MKK-3, MKK-4: onaya gönderen onaylayamaz ...`, `MKK-7: sürüm ...409`, `sahte fark: noktalı üst anahtar ...`, `talep alanını null göndermek ...`, `MKK-14 (kart #163): özet karttan farklı ...`, `Kart #226: onaycının gördüğü kayıtlı fark ...` |
| POST /malzeme-katalogu-kartlari/:kimlik/iptal | `malzemeler.yaz` | MKK-6: yetkisiz yalnız kendi hiç onaylanmamış taslağı | `MKK-6: onay yetkisi olmayan yalnız kendi açtığı ...` | aynı test (başkasının taslağı 403) |
| GET /malzeme-katalogu-sablonlari | `{ biri: ['sayfa.malzemeler'] }` | sayfası olmayan 403 | `okuma uçları: ...` | aynı test |
| POST /malzeme-katalogu-sablonlari/:kimlik/kaydet | `malzemeler.yaz` | kimlik = adres; başkasının şablonunun üstüne yalnız onay yetkilisi | `sahipsiz eski şablonun üstüne yazmayı yalnız onay yetkilisi yapar ...` | `başkasının şablonunun üstüne aynı kimlikle kaydetmek 403 ...` |
| POST /malzeme-katalogu-sablonlari/:kimlik/kaldir | `malzemeler.yaz` | yalnız kaydeden ya da onay yetkilisi | `kaydeden kendi şablonunu kaldırır ...` | aynı test (başka yazar 403), `sahipsiz eski şablonu yalnız onay yetkilisi kaldırır` |
| GET /malzeme-katalogu-ayarlari | `{ biri: ['sayfa.malzemeler'] }` | sayfası olmayan 403 | `okuma uçları: ...` | aynı test |
| POST /malzeme-katalogu-ayarlari/:anahtar/kaydet | `malzemeler.tanim-yaz` | onay akışını açıp kapatmak yalnız bayraklı yönetici (`kisiBayrakliMi`); `malzeme` ayarı aynı işlemde birim ve kategori tablosunu yeniden hesaplar, geçersiz değerde 400 ve hiçbir şey yazılmaz (ML2 b, kart #163) | `ayarı yalnız bayraklı rol değiştirir: ... yönetici 200` | aynı test (403), `MKK-9: onay akışı ayarını yalnız onay yetkisi olan açıp kapatabilir ...` |

| GET /malzeme-birimleri | `{ biri: ['sayfa.malzemeler'] }` | salt okunur; pasif birim de döner (kart #163) | `birim listesi: göç prototipin yerleşik birimlerini getirir ...` | `okuma uçları: sayfası olan roller 200 okur, sayfasız rol 403, oturumsuz 401` |
| GET /malzeme-logo-durumu | `{ biri: ['sayfa.malzemeler'] }` | salt okunur; eksikli kartlar üstte (kart #232) | `Logo durumu sayfası: sayfası olan okur, ...` | `okuma uçları: sayfası olan roller 200 okur, sayfasız rol 403, oturumsuz 401` (listeye eklendi) |
| GET /malzeme-firma-secenekleri | `malzemeler.yaz` | arama en az 2 harf; yalnız aktif tedarikçi (ya da ikisi) firmaların kimlik, ad ve kodu (kart #466). `finans.firma-oku` istemez: kalite ve cam rolleri bu uçtan tedarikçi ad ve kodunu görür (kullanıcı kararı 11.10.2026, karar kartında "Kalite ve cam görsün") | `arama: aktif tedarikçi firmalar adla bulunur ...` | `yetki: kart yazma işlemi olmayan rol (operator) firma arayamaz, 403`; aynı arama testi: tek harf 400 |
| GET /malzemeler/ozet | oturum | yalnız sayı; `malzemeler.onayla` yoksa `null` (stok özetiyle aynı yol, kart #489) | `onaydaki kart ve bekleyen değişiklik talebi sayılır ...` | `onaylama işlemi olan rol (kalite) sayıyı görür; olmayan (operator) null alır`; `oturumsuz istek 401` |
| Genel arama kaynağı `malzeme` (#1244; `GET /malzemeler/ara` kalktı) | `['sayfa.malzemeler']`, çekirdek `/arama` denetler | sorgu sınırı ve desen çekirdekten, en çok `sinir` satır, iptal kart yok | `arama/arama.test.ts` kod, ad, eski kod, sıra | aynı dosya: iptal kart ve joker boş; yetkisiz kişinin reddi çekirdek `/arama` testinde |
| POST /malzeme-logo-karsiliklari/kaydet | `malzemeler.tanim-yaz` | tür karşılığı yalnız beş tür (kısıt `malzeme_logo_karsiligi_tur`, 422); tür değeri yalnız 10-13, demirbaş boş (422; kısıt `malzeme_logo_karsiligi_izinli`); birim boşluksuz (400); değer 1-40 karakter ya da boş | `Logo durumu sayfası: ...` (tanım yazan 200), `LB7 (kart #232): ...` | aynı test: okuyucu 403, bilinmeyen tür 422, boş metin 400; LB7 testi: izinsiz kod 422, boşluklu birim 400 |

Logo alanları (`logo_*`) hiçbir uçtan yazılmaz: kart kaydet gövdesindeki değerler yok sayılır (MKL-2); yalnız `disari.ts` `malzemeLogoSonucu` yazar (yetki denetlemez, çağıran bağlantı modülünün işi).
Kayıt numarasının tekliği, gönderilmiş kartın değişmezliği ve Logo kaydı olan kartın kod, tür ve birim kilidi veritabanındadır (MKL-3, MKL-5).
## Yalnız ekranda kalan kurallar
Alan doğrulamaları, kalite/sınıf/form tanım listeleri, ağırlık ve ölçü hesabı, şablon içeriği, operasyon tanımları; kartın jsonb içeriği sunucuda doğrulanmaz (#232, UYUM-BORCU madde 1, 4).
Onaycının kendi açtığı talebi uygulaması yalnız ekranda engelli (kullanıcı kararı #227 madde 2: kalsın).

## İstemci
Çerçeve opak kökenli `sandbox`; köprü sabit uç listesi, yol ve yöntemi çerçeve seçemez, kimlik parçası denetimi (MKK-17, `kopru.test.ts`). Kullanıcı metni prototipin kendi çizimiyle basılır; çerçeve TMI oturumuna erişemez.
