# FARK: cizimler (kart #708, dal 708-cizimler)

Taban: `main` 326c58a. Yeni modül; depoda önceki hâli yok. İnceleme raporu: proje dosyası `inceleme/cizim-merkezi.md`.

## Eklenen
- Sözleşme `paylasilan/sozlesme/cizimler.ts`, işlemler `paylasilan/islemler/cizimler.ts` (`cizimler.oku`, `cizimler.yaz`, `cizimler.yayinla`),
  sayfa ve ikinci menü `paylasilan/sayfalar/cizimler.ts` (`/cizimler`, grup Tanımlar; bölümler: tüm belgeler, arşiv, altı belge türü).
- Toplayıcı satırları ayrı commit'te: `paylasilan/islemler.ts`, `paylasilan/sayfalar.ts`, `paylasilan/islem-adlari.ts` (yalnız bu modülün satırları).
- Göç `20261012101500_cizimler_tablolar.sql`: `cizimler_belge`, `cizimler_revizyon`, `cizimler_bag`; revizyon değişmezliği tetikleyiciyle.
- Sunucu: `kurallar.ts`, `sorgular.ts`, `servis.ts`, `uclar.ts` (13 uç), `disari.ts` (bağlayan modüller için dört işlev).
- İstemci `istemci/src/moduller/cizimler/`: liste (tür ve arşiv bölümleri), belge sayfası (revizyonlar, yayınlama, silme, indirme, malzeme bağı),
  cihazda görüntüleyici (PDF pdf.js; STEP ve IGES occt; STL three; resim), parçalı yükleme.
- Testler: sunucu 19 (gerçek PostgreSQL, gerçek giriş), istemci 11.

## Değişen, silinen
- Yok. `dosya`, `atolye`, `arkon`, `malzemeler`, `kalibrasyon` dosyalarına dokunulmadı.

## Onaylı kararlar (kullanıcı, 12.10.2026)
- CM1 a: yeni modül `cizimler`; `dosya` depolama katmanı olarak kalır (ADR 0009).
- CM2 b: var olan Arkon ve atölye dosyaları şimdi taşınır; kullanıcı kararı tek seferlik göç (kart #746). Göç `arkon_belge`, `arkon_dosya`,
  `atolye_kroki`, `atolye_kroki_parca` tablolarını yalnız okur; her farklı içerik yayında A revizyonlu bir belge olur.
- CM3 a: parçanın 3B modeli ve çizimi malzeme kartına bağlanır; merkezden yalnız malzeme bağı kurulur.
- STEP özgün dosya olarak saklanır; görüntü cihazda üretilir, sunucuya ikinci kopya gitmez.

## GLB ve glTF 3B modeli (kart #921, 13.10.2026)
- CZ-03: `3b-model`, `makine` ve `diger` belgesi GLB ve glTF alır; teknik resim, sertifika ve kroki almaz.
- Göç `20261013051806_cizimler_glb.sql`: `cizimler_revizyon_dosya_turu` kısıtı yalnız genişler (glb, gltf); satır değişmez.
- Görüntüleyici GLB ve gömülü tamponlu glTF'i three GLTFLoader ile açar (yeni paket yok). glTF metre ve Y yukarı okunur, ölçü mm gösterilir.
- İstemci `disari.ts`: başka modül ekranı (CNC Kurulum "Çizimlere aktar") dosyayı `dosyaYukle` ile yükler, belgeyi `POST /cizimler` ile açar.
  Makineye bağ Çizimler ekranından kurulmaz (CZ-09); atölye kendi ucundan `kaydaBagla(..., 'istasyonlar', istasyonId)` ile bağlar.
- Sunucu `disari.ts`: `kayitlaraBagliBelgeler(db, hedefModul, hedefIdler)` bir modülün birçok kaydına bağlı belgeleri tek sorguda verir (atölye isteği 6).

## Rapor türü ve stok bağı (kart #959, 13.10.2026)
- Belge türü `rapor` (PDF ve resim; CZ-03), ikinci menüde "Raporlar". Fason dönüş raporu ve benzeri.
- Bağ hedefi `stok` (hedef: stok partisi kimliği). Hammadde sertifikası mal kabulde partiye stok modülünün kendi ucundan bağlanır.
  Fason dönüş raporu iş emrine `uretim-emirleri` hedefiyle bağlanır (hedef kimliği iş emri; hedef zaten vardı).
- Göç `20261013064645_cizimler_rapor_stok.sql`: `cizimler_belge_tur_degeri` ve `cizimler_bag_hedef_modul` yalnız genişler.

## Kayda bağlı belge açma (Refs #960, 13.10.2026)
- Sunucu `disari.ts`: `belgeAcVeBagla(db, kullanici, { ad, tur: 'sertifika' | 'rapor', ozet, dosyaAdi }, hedefModul, hedefId, denetimEki)`
  belgeyi açar, ilk revizyonu yayınlar, kayda bağlar ve belge kimliğini döner (CZ-13). `cizimler.yaz` ve `cizimler.yayinla`
  sorulmaz; yetkiyi çağıran modülün ucu denetler. Mal kabulde parti sertifikası (stok) ve fason dönüş raporu bunu kullanır.

## Satın alma sipariş bağı (kart #1015, 13.10.2026)
- Bağ hedefi `satin-alma` (hedef: satın alma sipariş satırı kimliği). Sertifika siparişe satın alma modülünün kendi ucundan
  `belgeAcVeBagla` / `kayittakiBelgeDosyasi` / `kayittanKaldir` ile bağlanır; aynı belge gelen partiye `stok` hedefiyle de bağlanabilir.
- Göç `20261013093500_cizimler_satin_alma_bag.sql`: `cizimler_bag_hedef_modul` yalnız genişler.

## Makine eşleştirmesi (kart #1196, 14.10.2026)
- CZ-14: merkezden 3B model belgesi istasyona bağlanır ("Makineyle eşleştir"). CM3 a ("merkezden yalnız malzeme bağı") bu kadar genişler:
  kullanıcı isteği, Çizim Merkezi'nde fabrika haritasıyla eşleştirme yeri olsun. İstasyon başına tek 3B model: yeni bağ öbürünü kaldırır
  (atölyenin kendi seçicisiyle aynı). İstasyon `istasyonlar/disari.ts` `istasyonGetir` ile doğrulanır. Göç yok.

## Malzeme seçicisi (14.10.2026)
- "Malzeme kartına bağla" penceresinde elle yazılan kart no kutusu kalktı: stok kodu ya da adla aranır, aktif kartlar listeden seçilir.
  Yeni okuma ucu `GET /cizimler/malzeme-secimi` (`cizimler.yaz`; bağ kuran rol malzeme sayfasını görmeyebilir), malzemeler
  `disari.ts` `malzemeAra` ile okur. Göç yok, yeni işlem yok.

## Makine eşleştirme uyarısı (kart #1258)
- "Makineyle eşleştir" penceresi seçilen makine fabrika haritasında yoksa "Ekle > Eklenecek makineler'den yerleştirin" der; çizim taslaktaysa
  haritanın yalnız yayındaki modeli gösterdiğini yazar. Yerleşim `atolye` istemci `disari.ts` ile okunur; haritayı göremeyen kullanıcıda uyarı çıkmaz.

## CNC makineleri bölümü (15.10.2026)
- İkinci menüye "CNC makineleri" (`/cizimler/cnc-makineleri`, `cizimler.yaz`) girdi: CNC Kurulum Motoru'ndaki makineler burada istasyonla
  eşleştirilir. Ekran `cnc-kurulum` modülündedir (rotası orada); bu modülün uçları ve yetkisi değişmedi.
