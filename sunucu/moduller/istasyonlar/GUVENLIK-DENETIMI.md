# GÜVENLİK DENETİMİ: istasyonlar (kart #186, #247, #105; son dal 105-ekip-kapasite)

Her uç: yol, işlem, sunucudaki kurallar, izinli test, reddeden test. Kaynak `uclar.ts`, testler `istasyonlar.test.ts` (DOĞRULANDI: dosya ve test adı).
Yazmaların denetim kaydını uç katmanı tutar (`uc()`); bu modülde `denetim: 'govdesiz' | 'yok'` kullanılmaz, gövde tam girer (DOĞRULANDI: `uclar.ts`).
Kayıt zamanı ve kişi: tesis tablolarında zaman ve kişi sütunu yok; kim ve ne zaman denetim kaydındadır.

## Okuma uçları

| Uç | İşlem | Sunucu kuralı | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /is-merkezleri | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.recete-rota` (#247, 195 a) | yok | `yetki (IS8)…`: planlama ve yazan rol 200; `yetki (195 a)…`: kalite 200 | aynı test: operatör 403 YETKI_YOK, oturumsuz 401; `yetki (195 a)…`: depo 403 |
| GET /istasyonlar | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.recete-rota` (#247, 195 a) | aktif tanımı: istasyon ve iş merkezi aktif (IS7) | aynı + `IS7` | aynı test |
| GET /makineler | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.recete-rota` (#247, 195 a) | pasif makine varsayılan gizli | aynı + `ARK-IST-09` | aynı test |
| GET /operasyon-tipleri | `biri: sayfa.istasyonlar, istasyonlar.yaz` | pasif yalnız `pasifler=true` ile | `yetki (IS8)…`, `IS13` | aynı test: operatör 403, oturumsuz 401 |
| GET /istasyon-kisileri, /makine-kisileri, /ekip-uyeleri | `biri: sayfa.istasyonlar, istasyonlar.yaz` | o tarihte geçerli, iptal edilmemiş satırlar | `yetki (IS8)…`, `IK2` | `yetki (IS8)…`: operatör 403, oturumsuz 401 |
| GET /ekipler | `biri: sayfa.istasyonlar, istasyonlar.yaz` | pasif yalnız `pasifler=true` ile | `IK7` | `yetki (IS8)…`, `IK7`: operatör 403 |
| GET /kisi-secenekleri | `istasyonlar.yaz` | bütün kişilerin adı ve aktifliği | `ataması olan…` | `IK1: pasif ya da olmayan kişi…`: operatör 403 |
| GET /atama-iptalleri | `istasyonlar.yaz` | geçmiş tarih 400, tür listeden | `E3k` | `E3k: yalnız ileride…`: operatör 403, geçersiz tür ve geçmiş tarih 400 |
| GET /istasyonlar/secim | `oturum` (kullanıcı kararı İ1) | kişinin iş merkezi kısıtıyla süzülür (IS3, IS4) | `ARK-IST-12/13 + IS3` | aynı test: kısıtlı kişi başka iş merkezini görmez |
| GET /kisi-is-merkezleri/:kisiId | `oturum` + serviste | kişi kendisini, başkasını yalnız `istasyonlar.yaz` okur; yetki varlıktan önce (IS2, IS6) | `IS2` | `IS2`: başkası 403; `IS6` |

Kapandı (#247, IS8): üç tanım listesi sayfası olan ya da yazan role açık; yazan rol kişi kısıtları sayfasında iş merkezlerini okur. Seçim ucu oturumla kalır (İ1). DOĞRULANDI: işlemi yalnız `uclar.ts`'ten oturuma çevirmek testi düşürüyor (1 fail).
| GET /istasyon-plan-ayarlari (#409, #746) | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.rota` (Rota > Kaynaklar; 757 a, bu uç için 195 a'nın yerine) | yok | `yetki (IS8)…`: planlama ve yazan rol 200; `yetki (195 a, 757 a)…`: kalite 200 | aynı testler: operatör 403, oturumsuz 401, depo 403, kalite plan ayarı yazması 403 |
| GET /kisi-yetkinlikleri (#409) | `biri: sayfa.istasyonlar, istasyonlar.yaz` | yok | `yetki (IS8)…`: planlama ve yazan rol 200 | aynı test: operatör 403, oturumsuz 401; `yetki (195 a, 757 a)…`: kalite 403 |
| GET /makine-durumlari (#409) | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.atolye` (195 a: Fabrika Haritası) | yok | `yetki (IS8)…`; `yetki (195 a)…`: kalite ve depo 200 | `yetki (IS8)…`: operatör 403, oturumsuz 401 |
| GET /istasyonlar/pano-ozeti (#483) | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.terminal, sayfa.vardiya, sayfa.personel` | yok; yalnız sayı, kayıt ve ad dökmez | `IS16`: operatör, idari işler ve yazan rol 200 | aynı test: finans 403, oturumsuz 401 |
| GET /istasyonlar/ara (#1221) | `biri: sayfa.istasyonlar, istasyonlar.yaz` | sorgu 2-60 harf, en çok 5 satır, `%` joker değil | `arama/arama.test.ts` istasyon ve makine | aynı dosya: işlemsiz 403, oturumsuz 401 |
| GET /istasyonlar/secim-ara (#1318) | `biri: sayfa.istasyonlar, istasyonlar.yaz, sayfa.arkon, sayfa.markalama, sayfa.stok` (karar 1321 b: çağıran modüllerin işlemi; A5'te modül eklenir); yalnız kod, ad, aktiflik ve üst kaydın kodu ve adı döner | sorgu en çok 80 harf, sayfa 1-1000, sayfa başına 30 satır; `%` joker değil; varsayılan yalnız aktif | `arama/arama.test.ts` `#1318 ortak seçici` (yalnız sayfa.arkon 200) | aynı dosya: işlemsiz 403, oturumsuz 401, geçersiz sorgu 400 |

## Yazma uçları (hepsi `istasyonlar.yaz`)

| Uç | Sunucu kuralları | İzinli test | Reddeden test |
|---|---|---|---|
| POST /is-merkezleri, /istasyonlar, /makineler | kod biçimi ve benzersizliği, ad zorunlu, bağ var olmalı, tip ve bağlantı türü listeden, adres yalnız türle (uç ve kısıt) | `yetki: her yazma ucu…`, `ARK-IST-01..04, 10/11` | aynı testler: işlemsiz 403 ve kayıt değişmez; geçersiz 400/409 |
| POST /istasyonlar/:id/plan-ayari (#409) | istasyon var (404); verim 0-200 (0 hariç), operatör 0-10 (uç ve kısıt); değiştiren kişi ve zaman sunucudan; gövdede sürüm verilirse eski sürüm 409 (satır yoksa 0) | `plan ayarı verim ve operatör…` (`plan-girdileri.test.ts`) | aynı test: 400, 404, 409 ve satır değişmez; `yetki: her yazma ucu…` 403 |
| POST /makineler/:id/durum (#409) | makine var (404); durum üç değerden biri, açıklama en çok 200 (uç ve kısıt); kişi ve zaman sunucudan; sürüm verilirse eski sürüm 409 | `IS-01, IS-05…`, `makine durumu sürümü…` | `makine durumu: geçersiz…` 400/404; `makine durumu sürümü…` 409; `yetki: her yazma ucu…` 403 |
| POST /makineler/toplu-tasi, /makineler/toplu-aktiflik (#1296) | 1-500 kayıt, yinelenen kimlik 400; tek işlem, biri reddedilirse hiçbiri (IS27); her kayıt sürümle (eski 409, olmayan 404); hedef istasyon aktif ya da null (400) | `IS27: makineleri toplu taşır…`, `IS27: makineleri toplu pasife alır…` | aynı testler: eski sürüm 409 ve hiçbir kayıt değişmez, pasif hedef 400; `yetki: her yazma ucu…` 403 |
| POST /makineler/toplu-durum (#1296) | kayıt başına durum sürümü (girilmemişte 0); pasif makine 400; tek işlem | `IS27: makineleri toplu pasife alır ve toplu durum verir…` | aynı test: eski durum sürümü 409, hiçbiri yazılmaz; `yetki…` 403 |
| POST /istasyonlar/toplu-tasi, /istasyonlar/toplu-aktiflik (#1296) | 1-500 kayıt; hedef iş merkezi aktif (400); sürüm denetimi; tek işlem | `IS27: istasyonları toplu taşır…` | aynı test: pasif iş merkezi 400, eski sürüm 409 ve hiçbiri; `yetki…` 403 |
| POST /makineler/coklu-ekle, /istasyonlar/coklu-ekle (#1296) | 1-200 kayıt, kod biçimi ve listede tekillik (400); var olan kod 409 ve ileti kodu söyler; hedef aktif; tek işlem | `IS27: çoklu ekle…` | aynı test: çakışan kod 409 ve hiçbiri açılmaz, tekrar ve pasif hedef 400; `yetki…` 403 |
| POST /kisi-yetkinlikleri/:kisiId/belirle (#409) | kişi var (404); yeni istasyon var ve aktif (400); kişinin satırları kilitlenir, yalnız fark yazılır ve deftere girer; veren ve verilme sunucudan (IS29) | `yetkinlik: …` | aynı test: 400, 404 ve liste değişmez; `yetki: her yazma ucu…` 403 |
| POST /kisi-yetkinlikleri/:kisiId/istasyonlar/:istasyonId/ayrinti (karar 146 a) | `istasyonlar.yaz`; sürüm 409, yetkinlik yok 404; dayanak en çok 300 harf; değişiklik deftere, kişi ve zaman sunucudan (IS29) | `IS29 (karar 146 a)` | aynı test 409, 404; `yetki: her yazma ucu…` 403 |
| GET /kisi-yetkinlikleri/:kisiId/gecmis (karar 146 a) | `biri: sayfa.istasyonlar, istasyonlar.yaz`; kişi yok 404; en çok 500 satır | `IS29 (karar 146 a)` | `yetki (IS8)…` operatör 403, oturumsuz 401 |
| POST /…/:id/guncelle (üçü) | yukarıdakiler + sürüm denetimi (IS9) | `IS9`: güncel sürüm yazar ve artırır | `IS9`: eski sürüm 409, eksik 400, kayıt değişmez |
| POST /…/:id/sil (üçü) | kullanımdaki kayıt silinmez (yabancı anahtar, 409) | `ARK-IST-07`, `KAY-07` | aynı testler: bağlı kayıtta 409 |
| POST /operasyon-tipleri | kod biçimi ve benzersizliği (uç ve kısıt), ad zorunlu, grup 13 koddan; varsayılanlar (#324): kısaltma biçimi, süre ondalık ve negatif değil (uç ve kısıt), istasyon var (409) | `IS13`, yetki tablosu | aynı: işlemsiz 403 ve kayıt değişmez; yinelenen kod 409, geçersiz grup ya da ad 400 |
| POST /operasyon-tipleri/:id/guncelle | kod isteğe bağlı (#460): gönderilmezse değişmez, biçimli ve tekil olmalı (409); kullanılmış tipte kod değişimi 409 (#544, `IS18`); sürüm denetimi; pasife alma `aktif` ile; silme ucu yok | `IS13` | `IS13`: eski sürüm 409, eksik 400, kayıt değişmez, olmayan 404 |
| POST /istasyonlar/:id/kisiler/ata, /makineler/:id/kisiler/ata, /ekipler/:id/uyeler/ata | yüzde biçimi; geçmiş tarih 400; hedef var (404); kişi var ve aktif (400); kişi kilidi altında toplam 100 (409); ekipte tek ekip (409) | `IK1`, `IK2`, `IK3`, `IK6`, yetki tablosu | aynı testler: işlemsiz 403 ve kayıt değişmez; kilit testi kilidi ölçer (kilit kaldırılınca kırmızı) |
| POST /…/:kisiId/cikar (üçü) | geçmiş tarih 400; o tarihte geçerli ya da ileride planlı satır yoksa 404; ileri satırlar iptal (silinmez) | `IK2`, `E3k`, yetki tablosu | `IK1: çıkarılan…` 404; `E3k` |
| POST /ekipler, /ekipler/:id/guncelle | kod biçimi ve tekilliği, ad zorunlu, istasyon var (409), sürüm denetimi; silme ucu yok | `IK7`, yetki tablosu | `IK7`: yinelenen kod 409, boş ad 400, eski sürüm 409, olmayan 404, sil ucu 404 |
| POST /kisi-is-merkezleri/:kisiId/belirle | yalnız aktif ve var olan iş merkezi; olmayan kişi 404 | `ARK-IST-09`, `IS6` | aynı testler: pasif ya da olmayan 400, kişi yok 404 |

Tekrar koruması: tanım yazmaları aynı gövdeyle yinelendiğinde aynı sonuca varır ya da kod çakışmasıyla 409 alır; istek kimliği kullanılmaz (VARSAYIM; geri alma düşük).
Veri kapsamı: tesis tanımı iş merkezine bağlı kayıt değildir, kapsam uygulanmaz; kısıt yalnız seçim listesinde süzer (DOĞRULANDI: `servis.ts` `istasyonSecimi`).

## Yalnız ekranda kalan kurallar

- Yazma düğmelerinin gizlenmesi (`istasyonlar.yaz` yoksa); sunucu ayrıca reddeder.
- Bağlantı türü seçilmeden adres alanının kapalı olması; sunucu ve kısıt ayrıca reddeder.

İstemci: kişinin iş merkezi kısıtı Personel bölümündeki kişi kartında yalnız `istasyonlar.yaz` ile görünür, yoksa kişi seçenekleri ve kısıt hiç istenmez (IS12, #1109). Görünürlüktür; veri yetkisi sunucudadır (yukarıdaki satırlar).
- Kapasite kaynağının zorunluluğu (IK4): bugün yalnız ekranda (E2z); sunucu bağlamada zorunlu kılar (UYUM-BORCU 10).
- Kişi panelinde pasif kişinin seçenekte gösterilmemesi; sunucu ayrıca reddeder.
