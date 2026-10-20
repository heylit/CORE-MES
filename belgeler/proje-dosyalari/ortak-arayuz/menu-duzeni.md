# Ana menu ve ikinci menu: uzerine gelince acilma, ikonlar (ortak arayuz onerisi)

Kaynak: ana dal `f153964`. Yalniz oneri: dal yok, commit yok. Goruntuler `menu/` klasorunde (yonetici, yerel bos veritabani).
Taslaklar canli sayfaya tarayicida CSS eklenerek cizildi; depoya bir sey yazilmadi.

## 1. Bugun (DOGRULANDI, `istemci/src/ortak/arayuz/kabuk.css`, `ikinci-menu.css`, olcum Chromium)
- 1280 ve ustu: ana menu yazili (248 px). Ikinci menulu sayfada ana menu simge seridine (72 px) iner, yaninda ikinci menu (248 px ya da dar 72 px, dugmeyle).
- 768-1279 (tablet): ana menu her zaman yalniz simge; ikinci menu dar acilir. Adlar gorunmez, yalniz simge kalir.
- 360 (telefon): altta 5 dugme + "Tumu", ikinci menu icerigin ustunde yatay serit.
- Uzerine gelince acilan menu yok. Icerik genisligi 1280'de: ana sayfa 1032 px, satin alma 960 px.
- Ikon sorunlari (ana menu, `paylasilan/sayfalar/*.ts` `simge`):
  - Ayni ikon iki sayfada: `layers` Kuyruk ve Malzeme Kartlari; `chart` Plan Cizelgesi ve Finans.
  - Birbirine benzeyenler: `cube` Arkon MES ile `box` Stok Merkezi; `tool` Rota ile `wrench` Sistem Ayarlari (ikisi de cekic gibi gorunuyor).
  - Ikinci menu ikonlari ana menudekinden kucuk (dar seritte belirgin).
- Goruntuler: `once-ana-*.png`, `once-satin-alma-*.png` (360, 768, 1280).

## 2. Oneri: davranis
1. Fare olan ekranda (CSS `(hover: hover) and (pointer: fine)`, 768 ve ustu):
   - Dinlenmede iki menu de simge seridi (72 + 72 px). Icerik 1280'de ana sayfada 1208 px, satin almada 1136 px (+176 px, olcum).
   - Ana menu seridinin uzerine gelince kisa bir beklemeyle yazili acilir (248 px). Icerigi itmez, ustune biner. Fare ayrilinca kisa beklemeyle kapanir.
   - Ikinci menu ayni sekilde acilir.
   - Klavye: odak menuye girince acilir, Esc kapatir. Adlar ekran okuyucuya her durumda acik kalir.
   - "Sabitle" dugmesi (bugunku daralt dugmesinin yeri) menuyu acik tutar ve icerigi bugunku gibi iter. Secim kisi basina saklanir (bugunku saklama kullanilir).
2. Dokunmatik ekran (tablet; uzerine gelme yok):
   - Seritler ayni. Seridin en ustundeki dugmeye dokununca menu yazili acilir, bir maddeye ya da disariya dokununca kapanir.
   - Ikinci menuyu basliktaki simgesine dokunmak acar. Uzun basma ya da kaydirma hareketi kullanilmaz.
3. Telefon (<768): menuler bugunku gibi kalir. Ust cubuk O5 ile birlikte duzelir: tema, kisi ve cikis tek "Hesap" dugmesinde toplanir, uzun sayfa adi kesilmez.
- Taslak goruntuler:
  - `taslak-*-dinlenme.png`
  - `taslak-*-ana-acik.png`
  - `taslak-satin-alma-*-ikinci-acik.png`
  - 768 ve 1280. Telefon icin `baslik/taslak-360.png`.

## 3. Oneri: ikonlar
Ortak simge setinde (`istemci/src/ortak/tasarim/simgeler.ts`) eksik olanlar ayni cizgi stilinde elle cizilir. Paket yok.

| Sayfa | Bugun | Oneri | Gerekce |
|---|---|---|---|
| Plan Cizelgesi | chart | gantt (yeni: yatay cubuklar) | cizelge zaman cubugudur; Finans'la ayni ikon kalkar |
| Finans ve Muhasebe | chart | lira (yeni: daire icinde TL) | para oldugu bir bakista okunur |
| Malzeme Kartlari | layers | tag (yeni: etiket) | kart ve kod; Kuyruk'la ayni ikon kalkar |
| Kuyruk | layers | layers (kalir) | tek kullanimi kalir |
| Arkon MES | cube | gauge (var) | uretim izleme; Stok Merkezi kutusuyla karismaz |
| Rota | tool | route (yeni: noktalarla yol) | operasyon sirasi; Ayarlar'la karismaz |
| Sistem Ayarlari | wrench | gear (var) | ayarlarin bilinen ikonu |
| Denetim Kaydi | eye | history (yeni: geri donen saat) | kayit gecmisi; "goz" izlemeyle karisiyor |

- Kalanlar degismez: Uretim Emirleri `list`, Terminal `play`, Plan Matrisi `grid`, Vardiya `clock`, Gunluk Mesai `coffee`, Stok Merkezi `box`, Satin Alma `truck`, Olcu Aletleri `ruler`, Duruslar `pause`, Personel `user`, Istasyonlar `cpu`.
- Ikinci menu ikonlari ana menuyle ayni boyda olur (dar seritte okunurluk).
- Ikon degisikligi sayfa tanimindadir (`paylasilan/sayfalar/<modul>.ts`, cekirdek seridi), modul ekranina dokunmaz.

## 4. Yeni paket
Gerekmez. DOGRULANDI: taslak yalniz CSS ile cizildi. Uygulama React ve CSS medya sorgusuyla yazilir. Yeni ikonlar elle cizilir; dis ikon kutuphanesi eklenmez.

## 5. Kart ve dal
#172 altina girer (ortak kabuk; VARSAYIM). Iki ayri dal onerilir:
- `172-menu-uzerine-gelince`: davranis ve O5 ust cubuk.
- `172-menu-ikonlari`: yeni ikonlar ve sayfa tanimlari; cekirdek seridi, tek commit.
Her ekran degisikligi once ve sonra goruntusuyle gelir.

## 6. Kullaniciya sorulacak
1. Menulerin varsayilani ne olsun?
   - Neden: herkes ilk acista bunu gorur.
   - a) Seritte baslar, uzerine gelince acilir; isteyen sabitler (oneri).
   - b) Bugunku gibi acik baslar, isteyen seride indirir.
2. Ikon tablosu (bolum 3) kabul mu?
   - Neden: sekiz sayfanin ikonu degisir, kullanicinin alistigi gorunum degisir.
   - a) Tablo oldugu gibi (oneri).
   - b) Yalniz ayni ikonlar ayrilsin (Plan Cizelgesi, Finans, Malzeme Kartlari); digerleri kalsin.
