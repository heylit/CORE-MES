# Malzemeler ve Hizmetler: liste (kart #163)

Durum 09.10.2026: kullanıcı MH1-MH5 a (MH4'e kg, m², km eki) ile onayladı; yazıldı, dal `163-malzemeler-oturtma-o7b51n`. Önce ve sonra görüntüleri `malzemeler-hizmet/yazim/`.

Kaynak: ana dal c73e2d4 ve dal `163-malzemeler-oturtma-o7b51n`; prototip `istemci/src/moduller/malzemeler/katalog/katalog.html` (satır numaraları bu dosyada).
Onay gelmeden ekrana, göçe ve sözleşmeye dokunulmaz. Görüntüler `bagla/malzemeler-hizmet/`:
- önce: `once-yeni-kart-1280.png` (beş tür), `once-sarf-kategorileri-1280.png`, `once-logo-gonderimi-1280.png`, `once-katalog-menu-1280.png`;
- sonra (yalnız yerel önizleme, depoya girmedi; yalnız sayfa adı ve altıncı tür kartı denendi): `sonra-tur-secimi-onizleme-1280/360.png`,
  `sonra-sarf-kategorileri-onizleme-1280/360.png` (sarf kategorileri bugünkü sekiz; ofis ve temizlik yok).
Hizmet formunun adımları ve Logo sayfasındaki rozet onaydan sonra yazılır, sonra görüntüsü o zaman verilir.

## 1. Sayfa adı "Malzemeler ve Hizmetler"
| Yer | Bugün | Sonra | Sahibi |
|---|---|---|---|
| Ana menü (`paylasilan/sayfalar/malzemeler.ts` `MALZEMELER_SAYFALARI.baslik`) | Malzeme Kartları | Malzemeler ve Hizmetler | malzemeler (kendi satırı) |
| İkinci menü başlığı (`MALZEMELER_IKINCI_MENU.baslik`) | Malzeme Kartları | Malzemeler ve Hizmetler | malzemeler |
| Sayfa başlığı (kabuk menüden alır) | Malzeme Kartları | Malzemeler ve Hizmetler | malzemeler |
| İkinci menü maddesi "Yeni malzeme" | Yeni malzeme | Yeni kart (VARSAYIM; tür seçimi ilk adımda) | malzemeler |
| Başka modüllerin metinleri: stok `Ayarlar.tsx:50`, `Malzemeler.tsx:72`; rota `MalzemelerEkrani.tsx:21,52`, `AdimPaneli.tsx:90` | "Malzeme Kartları" | "Malzemeler ve Hizmetler" | stok, rota (istek) |
| Yetki matrisi belgesi, çekirdek ve ortak arayüz testlerinde sayfa adı | | | çekirdek, ortak arayüz (istek) |
Modül adı, klasörler, tablo, uç ve işlem adları (`malzemeler`, `sayfa.malzemeler`) değişmez.

## 2. Yeni tür `hizmet`
- Sözleşme: `KATALOG_TURLERI` (paylasilan/sozlesme/malzemeler.ts) altıncı değer `hizmet`.
- Göç (dolu tablo, kısıt değişir): `malzeme_katalog_karti` tür kısıtı; `malzeme_logo_karsiligi_tur` kısıtı DEĞİŞMEZ (hizmet tür karşılığına giremez, Logo isteği 1; adlı kısıt zaten beş türle sınırlı, testi eklenir).
- Stok kodu öneki: **HZ** önerilir (`HZ-<grup>-00001`; `TUR_ONEKI`, `KOD_ONEKI_DESENI` sunucuda; prototipte `KOD_TUR`, `KOD_DESEN` satır 5609-5616). Soru S1.
- Prototip: `TURLER` (satır 4829) altıncı kart; `TUR_ICON`; `BIRIM_T.hizmet`; `turAdimlari` (satır 4954) hizmet dalı. Ekran dosyasına dokunur; yeni tasarım yok, sarf düzeni kopyalanır.

## 3. Hizmet yönü
- Kartta sütun `hizmet_yonu` (`alinan` / `verilen`), adlı kısıt `malzeme_katalog_karti_hizmet_yonu`: hizmette zorunlu, diğer türlerde boş. Dolu tabloya boş olabilen sütun ve kısıt (bugün hizmet kartı yok, kısıt eski satırları bozmaz; göç yine önce sayar).
- Aktif olmuş kartta değişmez: var olan kart tetikleyicisine (tür ve kod kilidinin yanına) eklenir.
- Ekranda değer `kayit.g.yon`; sunucu özetten sütuna yazar (tür gibi). Aynı iş alınıp veriliyorsa iki kart.

## 4. Türe göre alanlar (prototipin sarf düzeni)
Adımlar: 0 Tür seçimi; 1 "Hizmet tanımı" (sarfın "Özellikler"i yerine); 2 "Ticari bilgiler" (`gTicariHTML`, hizmet dalı); 3 "Özet ve kayıt".
| Alan | Yer | Hammadde | Yarı mamul | Mamul | Sarf | Demirbaş | Hizmet |
|---|---|---|---|---|---|---|---|
| Stok kodu | com.kod | Z | Z | Z | Z | Z | Z (HZ-) |
| Ad | com.ad | Z | Z | Z | Z | Z | Z |
| Stok birimi | com.birim | G | G | G | G | G | Z (listeden: adet, saat, gün, sefer, ay; yeni birimler BIRIM_T.hizmet) |
| Hizmet yönü | g.yon | - | - | - | - | - | Z (Alınan / Verilen) |
| Hizmet grubu (kod grubu) | g.kat | - | - | - | Z (kategori) | Z (kategori) | Z: Fason işçilik FSN, Bakım ve onarım BKM, Nakliye NAK, Danışmanlık DNS, Diğer hizmet DGR (VARSAYIM) |
| Açıklama / kapsam | g.kapsam | - | - | - | - | - | G (yeni metin alanı) |
| Tedarikçi | com.ted | G | G | - | G | G | G (yalnız alınan) |
| Notlar | com.not | G | G | G | G | G | G |
| Marka, üretici ürün kodu | g.marka, g.urunKodu | - | - | - | G | - | - |
| Depo yeri | g.depoYeri | G | G | G | G | G | - (gizli) |
| Ölçü, ağırlık, tolerans | ym_olcu, mm_ambalaj, dims | G | G | G | - | - | - |
| Operasyonlar, reçete | ops, bom | - | G | G | - | - | - |
| Sertifika ve uygunluk | com.sertifika | G | G | G | G | - | - |
| Barkod | g.gtin | - | - | G | - | - | - |
| Tedarik tipi | g.tedarik | - | G | G | - | - | - |
| Bakım, kalibrasyon, alış | db_* | - | - | - | - | G | - |
Z zorunlu, G görünür (isteğe bağlı), - gösterilmez. Hammaddenin sihirbazı ayrıdır (aile, sınıf, kalite, form, ölçü); hizmete dokunmaz.
Liste süzgeçleri ve görünüm şeridi: tür süzgeci `TURLER`den üretilir (DOĞRULANDI satır 7770, tür kartları 7586); hizmet kendiliğinden altıncı seçenek olur. İkinci menüde türe göre madde yok; "Yeni malzeme" adı değişir (madde 1).
Etiket (QR) ve dışa aktarım: hizmet kartında etiket basılmaz (VARSAYIM; stoklanmadığı için).

## 5. Ofis ve temizlik malzemesi (sarf, kategoriyle)
Bugünkü sarf kategorileri (satır 4855): Kaynak sarfı (KYN), Kesici takım (TKM), Aşındırıcı (ASN), Yağ ve kimyasal (KIM), İş güvenliği (KKD), Bağlantı elemanı (BGL), Ambalaj malzemesi (AMB), Diğer sarf (GEN).
"Ofis" ve "temizlik" YOK (DOĞRULANDI). Demirbaşta "Mobilya ve ofis" (MOB) var; o kalıcı eşya içindir.
Ekleme yolu (S3):
- a) Ekrana dokunmadan: yönetici Malzeme ayarları > Kategoriler'den "Ofis malzemesi (OFS)" ve "Temizlik malzemesi (TMZ)" ekler; prototip eklenen kategoriye "Diğer sarf"ın alanlarını verir (satır 6170). Bu dalda kayıt sunucu tablosuna da yazılır (ML2 b). (öneri)
- b) Prototipe yerleşik kategori olarak eklenir (`SARF_KAT`, kendi alanlarıyla); ekran dosyası değişir.

## 6. Hizmet reçete bileşeni olamaz
- Malzemeler: kart kaydında `kayit.bom[].ref` hizmet kartını gösteriyorsa 422 (sunucu, testli). Prototipin reçete arama kutusu hizmet kartını listelemez (satır 7635, ekran).
- Rota (reçetenin sahibi, OS1): bileşen eklerken hizmet türünü reddetsin (istek; `malzemeOzeti.tur` yeter).

## 7. Başka modüllere istekler (yazılmaz; BASKA-MODUL-ISTEKLERI.md ve CEKIRDEK-ISTEKLERI.md onaydan sonra)
- Satın alma: yalnız alınan hizmeti seçer (sunucuda ret, testli). Malzemeler özetine `hizmetYonu` ekler; `malzemeAra` için `hizmetYonu` süzgeci.
- Stok: hizmet stoklanmaz; mal kabulde hizmet satırı depoya giriş yazmaz, yalnız teslim bilgisi.
- Logo bağlantısı (Logo planı `logo/hizmet-karti-plani.md` madde 5 ile güncellendi): hizmet kartı Logo kuyruğuna (`logoyaGidecekMalzemeler`) girer; satırda `tur` ve `hizmetYonu` gelir;
  hizmette tür karşılığı eksik sayılmaz (birim karşılığı yine gerekir). Ara dönemde hizmetin malzeme olarak gitmemesi için hizmet yalnız Logo çağrıda `{ hizmetDahil: true }` verince döner
  (öntanım hariç); Logo kendi tarafını yazınca bu bayrağı verir. Tür karşılığı tablosuna hizmet giremez (kısıt, malzemeler tarafı). Hizmet gövdesi, yol ve yön çevirisi (alınan 1, verilen 2) Logo modülünün.
- "Logo gönderimi" sayfası (malzemelerin): hizmet kartı durum tablosunda "Hizmet kartı bağlantısı bekliyor" rozetiyle görünür, eksik sayılmaz. Sayfa durumu Logo'nun
  `GET /api/logo/birim-setleri` cevabındaki `hizmetGonderimi: 'kapali' | 'acik'` alanından okur (Logo planı madde 5); alan yoksa "bekliyor" gösterilir. Açıkken kart diğerleri gibi durum taşır.
- Rota: hizmet bileşen olamaz (madde 6). Stok, rota: "Malzeme Kartları" metinleri (madde 1).
- Çekirdek ve ortak arayüz: sayfa adının geçtiği yetki matrisi belgesi ve testler. SABİT KİMLİKLER ve proje talimatı: şefin işi.

## Sorular
S1. Hizmet kartının stok kodu öneki ne olsun? a) HZ (öneri) b) HS c) başka (yazın)
S2. Hizmet grubu (kod grubu) listesi: a) Fason işçilik FSN, Bakım ve onarım BKM, Nakliye NAK, Danışmanlık DNS, Diğer hizmet DGR (öneri) b) başka (yazın)
S3. Ofis ve temizlik kategorisi nasıl girsin? a) Ayarlar'dan, ekrana dokunmadan (öneri) b) prototipe yerleşik
S4. Hizmet birimleri: a) adet, saat, gün, sefer, ay (öneri) b) başka (yazın)
S5. Göç: kart tablosuna `hizmet_yonu` sütunu ve kısıtı, tür kısıtına `hizmet` (dolu tablo; önce sayar). a) Evet (öneri) b) Hayır
