## kullanici-adi-onerisi (kart numarası bekleniyor; kullanıcı sorusu 15.10.2026)
- Hesap aç penceresi kullanıcı adını kişinin adından önerir (`istemci/src/moduller/kisiler/kullanici-adi.ts`): Türkçe harf dönüşür (ş→s, ı→i, ğ→g, ü→u, ö→o, ç→c), küçük harf, kelimeler noktayla.
- `kullaniciAdiHatasi` iletisi sorunlu karakteri (boşluk dahil) ya da uzunluğu söyler. Desen `^[a-z0-9._-]{3,40}$`, uç, göç ve yetki değişmez.

## guvenlik-merkezi (kullanıcı kararı 14.10.2026 23:02, "Verilemesin"; koordinatör üzerinden aktarıldı)
- `DEVREDILMEZ_ISLEMLER`e `guvenlik.oku` ve `guvenlik.yonet` eklendi: Güvenlik Merkezi yalnız bayraklı yöneticinindir, kişiye ek işlem olarak verilmez (422).
  Daha önce verilmiş satır alınabilir. Aynı günkü "Verilebilsin" kararı bu iki işlem için değişti; öteki yalnız-yönetici işlemleri verilebilir kalır.

## 1233-kullanici-adi-gorunur (kullanıcı isteği 14.10.2026: kişinin kullanıcı adı hiçbir yerde yazmıyor)
- Kişi cevabına `kullaniciAdi` eklendi: yalnız `kisiler.rol-yonet` sahibine (hesabı açan, bayrak bilgisini gören), ötekine ve hesapsız kişiye null.
  Parola ve PIN özeti yine seçilmez. Personel listesinde Giriş sütunu kullanıcı adını, altında giriş türünü gösterir; Sayfa yetkileri kişi seçimi
  "Ad (kullanıcı adı)" yazar. Varsayım: görme sınırı rol yönetme yetkisidir; geri alması tek satır.

## 1234-sayfa-yetkileri-inceleme (ara inceleme, kart #1233)
- KS-4'e eklendi: pasif ya da girişsiz kişiye ek işlem verilmez (422); var olan satır rolleri gibi pasifte korunur, aktif yapılınca geri
  gelir ve her durumda alınabilir. Seçilen yol: ekran pasif kişiyi listelemediği için yazma reddedilir; pasife almada silmek aktif yapınca
  yetkiyi kaybettirirdi.
- Ekran: rolden de gelen işlemin ek satırı "Rolden" ile birlikte görünür ve alınabilir.
- Arkon rol etkisi `UYUM-BORCU.md`'de istek olarak; Arkon'a dokunulmadı. Devredilmez liste değişmedi (karar kullanıcıda).
- Kullanıcı kararı (karar kartı, 14.10.2026, "Verilebilsin"): yalnız yöneticiye açık işlemler de kişiye ek yetki olarak verilebilir; mevcut hal kalır, `DEVREDILMEZ_ISLEMLER` değişmedi.

## 1233-sayfa-yetkileri (kart #1233, kullanıcı isteği 14.10.2026: Sistem Ayarları'ndan sayfa yetkisi)
- Göç `20261014094901_kisiler_kisi_islemi.sql`: yeni ve boş `kisi_islemi (kisi_id, islem, veren_id, verildi)`; var olan tabloya dokunmaz.
- Kişinin yetkisi rollerinin ve kişiye verilen ek işlemlerin birleşimidir (`yetkiKaydiBul`, `kisiIslemSatirlari`); rolden işlem geri alınmaz.
  Oturum her istekte kullanıcıyı yeniden yüklediği için değişiklik açık oturumda hemen geçerlidir; uçlar aynı listeyle denetler.
- Eklenen uçlar: `GET /kisi-ek-islemleri` ve `POST /kisiler/:id/ek-islem-degistir` (ikisi de `kisiler.rol-yonet`), gövde `{ islem, verildi }`.
  KS-4: yalnız bayraklı aktör değiştirir; bayraklı kişiye, kayıtsız işleme ve `DEVREDILMEZ_ISLEMLER`'e (`kisiler.rol-yonet`, `kisiler.parola-degistir`) verilmez.
- Rol x işlem matrisi değişmez.

## 1172-kisiler-gorev-okuma (kart #1172, kullanıcı kararı: portal unvanı kişi kartındaki görevden)
- `disari.ts`: `kisiGorevi(db, kisiId): Promise<string | null>`; `kisi.gorev`, boşsa ya da kişi yoksa `null`, pasif kişide de döner. Yetki denetlemez; çağıran (portal) kendi ucunda denetler.
- Göç, uç, yetki değişmez.

## 906-ornek-veri (kart #906)
- Eklenen: `ornek-veri.ts` (`npm run ornek-veri` payı): 12 örnek hesap, kullanıcı adı `ornek.` önekli (yönetici, müdür, planlama, üç operatör, kalite, satın alma, depo, muhasebe, İK, CAM), rolleriyle. Parola koşuda üretilir, yalnız ekrana basılır. Hesapları örnek yönetici açar (`hesapAc`), gerçek yöneticiye dokunulmaz. `ornek.` önekli hesap varsa yüklü sayılır.
- `disari.ts`: `kisiNoKullaniciAdindan(db, kullaniciAdi): Promise<number | null>` (başka modüllerin örnek verisi örnek kişiyi bununla bulur).
- Göç, uç, yetki değişmez.

## 684-yetki-duzenle (kart #684, kullanıcı kararları "Ekrandan, yönetici" ve "Depoda yaz", 12.10.2026)
- Eklenen: `POST /roller/:id/islem-degistir` (`kisiler.rol-yonet`), gövde `{ islem, verildi }`; hedef durumu söyler, ikinci kez aynı komut sonucu değiştirmez.
  Yalnız bayraklı kişi değiştirir (rol yöneten ama bayraksız kişi kendi yetkisini büyütemez); bayraklı rolün satırı değişmez; kayıtsız işlem reddedilir. Cevap güncel matristir; komut denetime düşer.
- Göç ve şema değişmez; `rol_islemi` satırı ekrandan eklenir ve silinir.
- Dikkat: rol x işlem satırı ekleyen sonraki göçler elle verilmiş satırla çakışabilir; `ON CONFLICT DO NOTHING` ile yazılır, var olan satırı silmeye ya da birebir aramaya dayanmaz.

## 608-kisiler-ana-sayfa (kart #608)
- Eklenen (yalnız istemci): `moduller/kisiler/ana-sayfa.tsx` "Eksik bilgili personel" kartı, "Bana düşen işler" bölümünde, `kisiler.yaz` olana görünür.
  Aktif kişilerden sicil no ya da görevi boş olanları sayar; `GET /kisiler` okunur. Uç, göç, yetki değişmez.

## 586-yetki-matrisi (kart #586)
- `GET /rol-islemleri` (`kisiler.rol-yonet`; kullanıcı kararı 11.10.2026: matrisi yalnız rol yöneten görür): kayıtlı işlemler ve rol başına girişteki işlem kümesi; Personel ekranında "Yetki matrisi" sekmesi yalnız rol yönetene görünür. Göç ve yetki değişmez.

# FARK: kisiler, PIN ile giriş (dal 484-pin-giris; kart #484, kullanıcı kararı 1a, 2a, 3a, 4b; ADR 0012)

## Eklenen
- Göç `20261011014600_kisiler_pin.sql`: `kisi.pin_ozeti text`, `kisi.pin_belirlenecek boolean NOT NULL DEFAULT false`, kısıtlar
  `kisi_pin_giris_ister`, `kisi_pin_belirlenecek_pin_ister`. Dolu tabloya boş olabilen sütun ekler; satır ve değer değişmez (3a).
- `POST /kisiler/:id/pin-ver` (`kisiler.parola-degistir`, sürüm ister): geçici PIN yazar, kişiyi "PIN belirlenecek" işaretler, açık
  oturumlarını kapatır. Kendine ve bayraklı kişiye verilmez (422), girişsize verilmez (422), kurala uymayan PIN 400 (`alan: pin`).
- Kurallar: `pinHatasi` (6 rakam; tekrar ve sıralı dizi yok), `girisYontemi` (bayraklı parola; öteki PIN varsa PIN), `pinVermeReddi`.
- `KisiOzeti.pinVar`. Personel ekranında Giriş sütunu "PIN / Parola / Yok" yazar; satırda "PIN ver" düğmesi ve penceresi.
- `disari.ts`: `ilkPiniYaz`, `yeniPinHatasi`, `GirisSirri` (oturum kullanır).

## Değişen
- `girisDogrula(db, kullaniciAdi, sir)`: sır `{ parola }` ya da `{ pin }`; sonuç `{ kisiId, pinBelirlenecek } | null`. Kişinin
  yöntemi dışındaki sır aynı maliyetle reddedilir.

## Değişen onaylı kararlar
- ADR 0002 m.3 ("herkes kullanıcı adı + parola ile girer") ADR 0012 ile değişti (kullanıcı kararı 1a, 2a).

# FARK: kisiler, toplu işlem okuması (dal 259-kisiler-toplu-islem; Arkon isteği 7, kullanıcı kararı N3 ve KT)

## Eklenen
- `disari.ts` `kisilerinIslemleri(db): Promise<Map<number, Islem[]>>`: aktif ve girişli her kişinin işlemleri tek sorguda
  (`sorgular.ts` `kisiIslemSatirlari`). Sonuç `kullaniciYukle(...).islemler` ile aynıdır: bayraklı rol bütün kayıtlı işlemleri verir,
  kayıtsız işlem geçmez (`islemleriBirlestir`). Pasif ve girişsiz kişi haritada yoktur; rolsüz girişli kişi boş liste alır.
  Salt okuma, yetki sormaz (öteki dışa açık okumalar gibi). Arkon `/arkon/kisiler` kişi başına `kullaniciYukle` döngüsünü bununla
  kaldırır (Arkon konusu). Göç, uç, ekran değişmez.

## Değişen onaylı kararlar
Yok.

# FARK: kisiler, 3. tur (dal 259-temel-moduller-3, taban main 2786cb7)

## Eklenen
- Göç `20261008075000_kisiler_kisi_surum.sql`: `kisi.surum int NOT NULL DEFAULT 1`, kısıt `kisi_surum_pozitif`. Dolu tabloya sütun ekler;
  var olan satırlar 1 ile başlar, satır silinmez, veri değişmez (K3 a). Rol x işlem satırı yok.
- Sürüm denetimi (K3 a): `duzenle`, `pasife-al`, `aktif-yap`, `hesap-ac`, `parola-degistir`, `rol-ata`, `rol-al` gövdesi `surum` ister;
  eski sürüm 409 `CAKISMA` (`ayrinti.neden: 'eski-surum'`), kayıt yoksa 404 (`#cekirdek/surum.ts` `surumluGuncelle`). Her başarılı
  komut sürümü bir artırır. Kişinin kendi parolasını değiştirmesi (oturum) sürüm sormaz ama artırır; `yoneticiOlustur` dokunmaz.
- `KisiOzeti` ve `GET /kisiler` cevabı `surum` verir. `KisilerCevabi` tipi `surum` taşımaz (istasyonlar ekranı yalnız okur);
  Personel ekranı tam cevap için `PersonelCevabi` kullanır.
- `POST /kisiler` tekrar korumalı (`tekrarKorumali: true`): `istek-kimligi` başlığı ister; aynı kimlikle ikinci istek ikinci kişi açmaz.
  Ekran `tekrarKorumaliGonder` ile gönderir.
- Ekran: komutlar satırdaki sürümü gönderir; 409 `eski-surum`'da liste yenilenir ve sunucunun iletisi bildirimde görünür (`bildir`).

## Değişen
- `disari.ts` daraltıldı (ek karar): `hesapAc`, `kisiEkle`, `kisiPasifeAl`, `kisiAktifYap` dışarıdan kaldırıldı (kisiler dışında
  ithal eden yoktu, DOĞRULANDI grep). `rolAta` ve `rolAl` kaldı (T3r a): artık eylemi yapanın `kisiler.rol-yonet` işlemini sunucuda
  denetler, yoksa `YETKI_YOK`. İmza aynı; sekiz modülün testleri değişmedi ve yeşil.

## Değişen onaylı kararlar
Yok. K3 a, `POST /kisiler` tekrar koruması ve ek karar (T3r a ile) uygulandı; UYUM-BORCU 1, 2, 3 ve 8 kapandı.

# FARK: kisiler, Aşama 1 tur 2 (dal 259-temel-moduller, taban main 65901d0)

Şema, göç, uç, işlem ve ekran değişmedi.

## Eklenen
- İkinci menü: `paylasilan/sayfalar/kisiler.ts` `KISILER_IKINCI_MENU` (tek grup, tek madde `/personel`, işlem `kisiler.oku`). Toplayıcıya
  (`paylasilan/sayfalar.ts`) yalnız bu modülün kaydı, ayrı commit'te (dar istisna). Sayfayı gören her rolde `kisiler.oku` var; görünüm değişmez.
- Belgeler: `UYUM-BORCU.md`, `ORTAKLIK-kisiler.md`, `GUVENLIK-DENETIMI.md`.

## Değişen onaylı kararlar
Yok. Kart #259 kararları belgelere işlendi: K1 a (tablo öneki istisnası), K2 a (`rol` ve `rol_islemi` sahibi kisiler; satırları çekirdek
konusu kisiler adlı göçlerle yazar), K3 a ve ek karar (sürüm, `POST /kisiler` tekrar koruması, `disari.ts` daraltma) 3. tura borç olarak.

## Örnek veride iki ayarcı (Reçete ve Rota isteği, 23 a; 27 a: kisiler Çekirdek'in) — dal `kisiler-ornek-ayarci`
- `ornek-veri.ts`: görevi tam "Ayarcı" iki uydurma kişi (`ornek.ayarci1`, `ornek.ayarci2`, ORN-015, ORN-016). Planlama ayarcıyı görevden okur.
- VARSAYIM: rolleri `operator` (TMI'de ayarcı rolü yok; tezgâhta çalışırlar). Geri alma: örnek veri satırı, düşük. Göç yok.

## Özlük İK'dan (kart 1311; 1302 a teyitli, 1315 a teyitli)
- Göç `20261030160000_kisiler_ozluk_ik.sql`: `kisi.ozluk_ik boolean NOT NULL DEFAULT false`, `kisi.ozluk_cikis_tarihi date` (boş başlar), kısıt `kisi_ozluk_cikisi_ik_bagli` (çıkış yalnız İK'ya bağlı kişide), kısmi dizin `kisi_ozluk_cikis_idx`. Var olan satır değişmez.
- `disari.ts`: `ozluguIkdenYaz(db, aktorId, kisiId, { ad, sicilNo, gorev, cikisTarihi })` ad, sicil no ve görevi yazar, kişiyi İK'ya bağlar, çıkış tarihini saklar; tarih geçmişse kişiyi hemen pasife alır ve oturumlarını kapatır. Dönüş `CikisSonucu` (`pasif`, `zaten-pasif`, `son-yonetici`, `cikis-yok`). `ozlukBaginiKaldir(db, kisiId)` bağı kaldırır; ad ve görev kalır, sicil no düşer (İK'nın tekil değeri, kartla yeni kişiye gider). Yetki İK ucunda (1312) denetlenir.
- `isler.ts` (yeni): `kisiler-cikis-pasif` saatte bir çıkış tarihi gelen aktif kişiyi pasife alır; son yönetici pasife alınmaz, günlüğe yazılır.
- Kurallar: KS-8 İK'ya bağlı kişide ad/sicil/görev Kişiler'den değişmez (aynı değer geçer); KS-9 çıkışı geçmiş kişi aktif yapılmaz; KS-10 bayraklı kişiye yalnız bayraklı aktör iter, son bayraklı kullanıcı çıkışla pasife alınmaz.
- Sözleşme `kisiSemasi`: `ozlukIk`, `ozlukCikisTarihi` (eklendi). Ekran: Kişi düzenleme formunda üç alan İK'ya bağlı kişide salt okunur, ipucu "İK personel kartından gelir" ve çıkış tarihi.
- Rol x işlem, uç ve yetki değişmedi; mevcut uçlara (`duzenle`, `aktif-yap`) red kuralı eklendi.

## #1320: ortak seçici arama ucu (30.10.2026, dal 1320-kisi-secim-ara, 1311 üstüne)
- `GET /kisiler/secim-ara?q&pasifler&sayfa` -> `{ sonuclar: [{ id, kod (sicil no ya da boş), ad, aktif, ust: null }], dahaVar }`. Ortak `KisiSecici` (kart #1317) bunu çağırır.
- Yetki karar 1321 b: kisiler.oku, istasyonlar.yaz (bugünkü kişi seçeneği), sayfa.mesaj, sayfa.arkon. VARSAYIM: çağıranlar bugün kişi seçen modüller (istemci kodunda arandı); A5'te modül eklenir.
- VARSAYIM: sicil no `kod` olarak döner (aynı adlı kişiyi ayırmak için); özlük bayrağı, rol ve kullanıcı adı dönmez. Şema, göç ve rol değişmedi.
