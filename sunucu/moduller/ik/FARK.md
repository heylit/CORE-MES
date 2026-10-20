# FARK (ik v3) — teslim-ik-v2-oturtma'ya göre

Taban: TMICOREV2 ana dal 640bebf (#696 birleşmesi). Ekran ve kullanım v2 ile aynı; yalnız ON-PAKET-ik-v3'ün iki maddesi eklendi
(Mesailerim, bordro onayı). v2'nin kural ve ekranlarından hiçbiri değişmedi.

## 1. Yeni tabana oturtma (kod davranışı değişmedi)
- Göçler yeniden damgalandı; taban 640bebf'deki son göçten sonra sıralanmaları gerekiyor (sınır aracının göç damgası denetimi):
  - `20261012060705_ik_tablolar.sql` -> `20261012082705_ik_tablolar.sql` (içerik aynı; `sema.ts` yorumundaki ad da)
  - `20261012062218_kisiler_ik_islemleri.sql` -> `20261012082718_kisiler_ik_islemleri.sql` (içerik aynı)
- "İK İşlemlerim" ana menü simgesi `edit` -> `home` (`paylasilan/sayfalar/ik.ts`, sayfa ve ikinci menü kökü). Tabana sonradan
  giren "Taleplerim" sayfası `edit` simgesini kullanıyor; "ana menü simgeleri tekil" testi (`istemci/src/ortak/rota/sayfa-simgeleri.test.ts`) reddediyordu.
- `paylasilan/islem-adlari.ts`: `ik.*` işlem adları, `ik` modül adı ve `sayfa.ik-islemlerim` grubu. Tabana sonradan giren
  "her işlemin adı var" tip denetimi bunlar olmadan derlemiyor (CEKIRDEK-ISTEKLERI madde 1).
- Rol yaması yeni tabana yeniden kuruldu: matrisi sabitleyen testlerde tabana sonradan giren sevkiyat, atölye ve taleplerim
  satırlarıyla birlikte (CEKIRDEK-ISTEKLERI madde 3). Dağılım v2 ile aynı.

## 2. Mesailerim (IK-30..IK-35)
- Sunucu: çalışana kendi devam ve mesai kayıtları (`att`) okuma cevabında döner (`servis.ts gorunur`, kural `kurallar.ts devamGorunurMu`).
  Başkasının, ekibin ve personel kaydı eşleşmeyenin kaydı dönmez. Yeni işlem yok; yazma uçları değişmedi (çalışan yazamaz).
- Uygulama: "İK İşlemlerim" ikinci menüsüne "Mesailerim" (`/ik-islemlerim/mesailerim`, simge `clock`); görünüm `mesailerim`:
  ay seçici, dört özet kutusu (fazla mesai saati, resmî tatil çalışması saati, devamsızlık günü, yıllık sınır), kayıt tablosu
  (tarih, tür, saat, onay, açıklama), not. Satır tıklanmaz. Uygulamanın var olan sınıfları kullanıldı; yeni stil yok.

## 3. Bordro onayı (IK-40..IK-46)
- Göç `20261012083000_ik_bordro_onayi.sql`: `ik_bordro_onayi` (yalnız ekleme defteri; tekil bordro + kesinleştirme sayısı).
- Uç `POST /ik/bordrolar/:kimlik/gordum` (gövde `{ surum }`), yeni işlem `ik.bordro-gordum`. Başkasının bordrosu 403, taslak ya da
  iptal 409, eski sürüm 409, ikinci onay 409. Cevap v2 yazma cevabı biçiminde (`kayit`, `gecmis: []`).
- Okuma cevabı: geçerli onayı olan bordro kaydına `gordum` (zaman) eklenir.
- Köprü: `acilis.ts` depoya `bordroGordum(id)`; `kopru.ts` okunan sürümle uca gider, cevabı çerçeveye yazar.
- Uygulama: Bordrolarım'a "Onay" sütunu ("Gördüm, onaylıyorum" düğmesi, onay penceresi; onaylanmışsa "Onaylandı: tarih saat");
  İK'nın Bordro ekranına "Bordro onayı" paneli (sayı, onaylamayanlar, onaylayanlar); Yapılacaklar'a ay başına hatırlatma.
- Rol göçü `20261012083010_kisiler_ik_bordro_gordum.sql`: `ik.bordro-gordum` "İK İşlemlerim" sayfasını alan on role.
- Rol göçü `20261012083020_kisiler_ik_bakim_sevkiyat.sql` (karar "1-a"): bakım ve sevkiyat da İK İşlemlerim, izin talebi ve bordro onayı alır.
  v2 dağılımına ek; öteki roller değişmedi.

## 4. Değişen ya da kaldırılan var olan kurallar
Yok. ON-PAKET'teki IK-33 varsayımı ("onaysız kayıt bordroya girmez") bugünkü kurala uymuyor; ekrana bugünkü kural yazıldı
(NOTLAR.md madde 1). Kural değişmedi (kullanıcı kararı "2a").

## 5. Paket yaması
`istemci/src/moduller/ik/uygulama/paket.ts` derlenmiş paketin üstüne `yama/ik_v3_uygulama_yamasi.py` ile yamalandı (ik-modulu
kaynağı teslimde yok). Kaynak yeniden derlenirse aynı değişiklik kaynağa taşınmalı (NOTLAR.md madde 4).

## 6. Depoya oturtma (kart #740, taban main 5daeb55)
- Göçler yeniden damgalandı (birleştirici sırası: `20261012132735`ten sonra): `20261012134600_ik_tablolar.sql`, `20261012134610_ik_bordro_onayi.sql`
  (içerik aynı; `sema.ts` yorumu da).
- Toplayıcı satırları (`cekirdek-1-toplayicilar.diff`) ayrı commit olarak girdi.
- Rol göçleri ve kisiler isteği bu dalda değil, çekirdek isteği (CEKIRDEK-ISTEKLERI madde 2, 3). Bunun için:
  `servis.ts` "TMI kullanıcısı" listesi geçici olarak `kisileriListele` ile dolar; `ik.test.ts` ve `bordro-onayi.test.ts`
  göçün dağılımını sınayan iki testi bırakır (çekirdek dalına gider), `bordro-onayi.test.ts` `ik.bordro-gordum`'u kendi rollerine verir.
- Teslimdeki belgeler modül klasörüne alındı (`KURULUM.md` -> `UYGULA.md`, kök `NOTLAR.md` -> `TESLIM-NOTU.md`); `ORTAKLIK-ik.md` ve
  `GUVENLIK-DENETIMI.md` yazıldı.

## Kart #1322: kişisel özet okumaları
- `disari.ts`: `kisininFazlaMesaisi`, `kisininIzinleri`, `kisininKalanIzni` (Arkon Operatör Özetim okur). Yalnız okuma; tablo, göç ve uç yok.
- Kalan izin İK ekranının motorundaki `leaveBalance` ile hesaplanır; `motor/arayuz.ts` bu yüzü ve `settingsFor`'u tipleriyle açtı.
- Yetki ve kapsam çağıranın ucundadır (Arkon: kişi kendini, amir kendi iş merkezini görür; kullanıcı kararı 14.10.2026).

## Kart #1571: giriş-çıkış saatleri ve puantaj matrisi
- Yeni boş tablo `ik_puantaj` (göç `20261016131309_ik_puantaj.sql`): personel x gün tek satır (durum, giriş, çıkış, açıklama, sürüm, yazan).
  Dolu tabloya dokunulmadı; `ik_devam` olduğu gibi kaldı.
- Uçlar: `GET /ik/puantaj?ay=&personel=` (oturum; İK kapsamını, çalışan yalnız kendini görür), `POST /ik/puantaj/yaz` (`ik.devam-yaz`;
  tek gün de toplu seçim de tek işlem). Yeni işlem ve rol satırı yok.
- Vardiya planı İK'ya `sunucu/kablolama.ts` ters bağıyla gelir (`calismaTakvimleri`, `basladigiGunTakvimleri`); Vardiya modülü değişmedi.
  Çalışma süresi plandaki molayı düşer; fazla mesai planın üstüdür ve yalnız öneridir (kullanıcı kararı 16.10.2026).
- Ekran (paket yaması `uygulama/yama/ik_puantaj_yamasi.py`): Devam ve mesai sayfasında "Kayıtlar / Puantaj" sekmesi (matris, gün
  penceresi, toplu giriş, fazla mesai önerileri ve "Devam kaydına aktar"); personel sayfasının Devam ve mesai sekmesinde ay takvimi;
  Mesailerim'de salt okunur takvim. Köprü: `puantaj-oku`, `puantaj-yaz` iletileri.
- Düzeltme (kullanıcı, 17.10.2026): devam ve mesai kayıtları puantajda görünmüyordu. Artık hücrede (kayıt yoksa "+3", "D", "GK"; varsa
  başlıkta) ve takvimde görünür; matrisin "Fazla sa" sütunu devam kayıtlarındaki fazla çalışmayı, devamsız gün iki kaynağın birleşimini sayar.

## Karar 84 ve 88 a (19.10.2026, main 2ace540 tabanı)
- IK-72: `kurallar.ts degisiklikler` IBAN, brüt ücret, ücret geçmişi, kan grubu ve engel durumu için değer yazmaz (`{ f, big, gizli }`);
  `servis.ts gecmisCevaplari` eski satırlarda da bu alanların değerini döndürmez. Tablo ve göç değişmedi; eski satırlar yerinde.
  Paket yaması (`yama/ik_puantaj_yamasi.py` DUZELTMELER): günlükte ve CSV'de "değişti" yazar; sözleşmede `changes[].gizli`.
- IK-73: yeni işlem `ik.ozel-veri-oku` (`paylasilan/islemler/ik.ts`). Okuma, yazma cevabı ve silinmiş kaydın kopyası bu işlem
  olmadan kan grubu ve engel durumunu taşımaz (kişinin kendi kaydı hariç); yazmada yetkisiz değişiklik 403, boş gönderim eski değeri korur.
- UYUM-BORCU satır 7, 35, 38, 60, 61 doğrulandı ve "geçersiz: kalıcı bedel" diye kapatıldı.

## Karar 168 c (19.10.2026, main 29efc3c tabanı)
- IK-74: işten çıkış engellenmez. `kurallar.ts cikisZimmetUyarisi` çıkış tarihi dolu personel kaydında iade tarihi boş, iptal edilmemiş zimmetleri sayar;
  `servis.ts yaz` personel kaydında bu uyarıyı üretir, `kaydet` cevabı `uyari` taşır (`paylasilan/sozlesme/ik.ts ikYazCevabi`). Toplu kayıt uyarı döndürmez.
  Ekran: köprü (`kopru.ts`) uyarıyı ortak bildirimle ("bilgi" tonu) gösterir. Göç yok. Zimmet ileride İdari İşler'e geçince okuma `idari-isler/disari.ts`'e taşınır (ayrı onay).

## Bildirim merkezi tetiği (19.10.2026)
- IK-75: `servis.ts yaz` izin kaydı "Beklemede"ye girince (`kurallar.ts izinOnayBildirimi`) aynı transaction'da
  `bildirim/disari.ts bildirimGonder` çağırır: tür `ik.izin-onay-bekliyor`, yol `/ik-islemlerim/onaylar` (alıcı müdürde `sayfa.ik` yok; Onaylar maddesi `ik.izin-onay` ile görünür), kaynak izin kimliği, yazan hariç. Alıcı bütün `ik.izin-onay` sahipleri; ekip sınırı yok.

## İdari İşler isteği: günün fazla mesaisi (19.10.2026)
- IK-76: `disari.ts gununFazlaMesaisi(db, tarih): Promise<number[]>` (yemek sayısı). `sorgular.ts gunDevamKisiNolari`; türler `FAZLA_MESAI_TURLERI`.
  Onay beklemede olan kayıt da sayılır (VARSAYIM: yemek önceden planlanır). Yetki çağıranın ucunda. Göç yok.

## Karar 244 a, 256 a, 267 a (19.10.2026)
- Zimmetin sahibi İdari İşler. İK'da `asset` türü, `zimmetler` alanı, `ik.zimmet-yaz` işlemi ve `ik_zimmet` tablosu kalktı (#1943, #1963;
  göç `20261019120000_ik_zimmet_kaldir.sql` önce `idari_isler_zimmet_ik_kopyala()` çağırır). Paketin zimmet ekranları `uygulama/yama/ik_zimmet_yamasi.py` ile kalktı.
- IK-74 açık zimmeti `idari-isler/disari.ts kisilerinAcikZimmetleri`'nden `servis.ts acikZimmetCozucusu` ile okur (`kablolama.ts`; İdari İK'yı okuduğu için ters bağ).
  Personel kişiye bağlı değilse zimmet bilinmez, uyarı çıkmaz. Uyarı demirbaş no ve marka/modeli sayar.
