# Başka modül istekleri ve verilenler (uretim-emirleri, kart #262)

## Bu modülün verdikleri (disari.ts)
| Modül | Fonksiyon | Not |
|---|---|---|
| rota (T4) | `uretimEmriAc(db, kullanici, UretimEmriGirdisi)` -> `{ uretimEmriId, isEmriIdleri }` | `rota/baglanti.ts` imzasıyla birebir; isteğe bağlı ek: oncelik, baslangic, aciklama, taslak, iş emrinde adaylar, bilesenler, firePayiYuzde, makineKullanimi, enKucukParca, yenidenAyar. İşlem: `uretim-emirleri.yaz` ya da `rota.emre-kopyala` |
| rota (T4) | `isEmirleriniYenile(db, kullanici, id, { kaynakRotaRevizyonId, isEmirleri })` -> `{ degisenler }` | "Emirlere uygula" (güvenli kip). Rota "Rev X uygulandı" satırını kendisi başa ekler |
| rota (T4) | `adimliEmirListesi(db, arsiv)`, `adimliEmirAyrintisi(db, id)` | `POST /adimli-emirler` ve `emirlere-uygula` uçları rotada; `rotaDegisti` ve harf rotada hesaplanır |
| plan | `planlanacakIsEmirleri(db)` -> `PlanIsEmri[]` | `plan/baglanti.ts` biçimi; fason ve bitmiş iş emri gelmez; taslak emir gelmez (VARSAYIM) |
| plan | `isEmriKaynagiYaz(db, kullanici, isEmriId, kaynak)` | İşlem: `uretim-emirleri.yaz` ya da `plan.yaz` |
| plan (P6) | `emirPlanBilgisiYaz`, `emirPlanaAl`, `emirIptalEt` | İşlem: `uretim-emirleri.yaz` ya da `plan.canliya-al` |
| stok | `emirNolari`, `isEmriOzeti`, `uretimEmriOzeti`, `fasonHareketiOzeti` | UE12-UE14; K-080 fason transferi hareket kimliğine bağlanır |
| stok, Arkon | `emirOzeti`, `acikEmirler`, `emirBaslat/Bitir/Sayim/Duraklat/Devam/Durdur`, `KOMUT_ISLEMI` | İmzalar değişmedi |

## İstekler
| No | Modül | İstek |
|---|---|---|
| B1 | rota (T4) | `baglanti.ts` kalkar, `uretim-emirleri/disari.ts` ithal edilir; `EmirlerEkrani` ve `beklenen/uretim-emirleri-adimli.ts` yeni sözleşmeye (`isEmirleri`, `kaynak`, `kaynakRotaRevizyonId`, `surum`) geçer; `POST /adimli-emirler`, `emirlere-uygula` rotada açılır |
| B2 | plan | `baglanti.ts` kalkar; `isEmriKaynaginiKur` test kancası yerine gerçek iş emri |
| B3 | stok | `emirOzeti` iş emirli emirde istasyonu sıradaki ya da son başlamış iş emrinden verir; hiçbir iş emri istasyona düşmemişse null döner (stok "bulunamadı" der). Sarf iş emrine (SH3 a) `isEmriOzeti` ile bağlanır |
| B4 | stok | K-080 fason konumu: gidiş/dönüş satırının kimliği `fasonHareketiOzeti` ile okunur |
| B5 | finans | Fason firma adı ve kodu `firmaOzetleri` ile okunur (var) |
| B6 | rota (parti kolu, PB-K1..K6) | Bölme formunda başlamamış her adım seçilir; isteğe bağlı birleşme adımı (`birlesmeOpNo`) ve kola ek adım listesi (`ekAdimlar`: tür rework, tamir ya da ek, op, ad, operasyon tipi, kaynak, süre, açıklama). İş emri tablosunda `tur` etiketi (ikonla), kol satırında birleşeceği emir ve op, plan kaldır düğmesi (`POST /adimli-emirler/:id/birlesme-plani`). Birleştirme hedefi: kaynağın ek adımları bitmiş olmalı, kalanlar op numarasıyla karşılaştırılır |
| B7 | plan (parti kolu) | `PlanIsEmri.tur`, `birlesmeOpNo`, `adimAdedi` okunur: kol birleşme adımı ve sonrasını taşımaz; üstün bekleyen birleşme adımı kolun son adımı bitmeden yerleşmez, akışlıysa gelen adetle. İleri adımdan bölünen kolun ilk adımı üstün önceki adımını bekler. Kanban ve çizelgede ek adım kartı `tur` etiketiyle; PL-06 "Partiyi böl" aynı ucu kullanır |
| B8 | Arkon (parti kolu) | İş emrinde `tur` ve `ekAciklama` operatöre görünür; `KOL_ONCEKI_BITMEDI`, `BIRLESME_BEKLENIYOR`, `BIRLESME_GELMEDI` retleri (409) gösterilir. Katılmış (iptal) kol kuyruktan düşer. Kurallar `disari.ts` komutlarında zaten geçerlidir |
| B9 | rota (emir türü, kart #699) | Emir açma formunda tür seçimi (FAI, Seri, Numune, Prototip, Stoğa üretim, Rework, Bakım ve deneme, Fason; varsayılan Seri); `emreKopyala` gövdesi `emirTuru` alır ve `uretimEmriAc`'a geçirir. Bölme formunda tür seçimi (`partiBolGovdesi.emirTuru`, boşsa üstün türü). Listede ve ayrıntıda tür etiketi; adlar `EMIR_TURU_ADLARI`'ndan |
| B10 | plan (emir türü, kart #699) | `PlanIsEmri.emirTuru` etiket olarak kanban ve çizelgede gösterilir; PL-06 bölme formu B9 ile aynı alanı kullanır. Tür plan kuralını değiştirmez |
| B11 | rota (emir no, kart #802) | Emir açma formunda isteğe bağlı proje seçimi (yalnız aktif projeler, projeler `disari.ts`); `emreKopyala` gövdesi `projeId` alır ve `uretimEmriAc`a geçirir. Numara proje kodunu bu yolla alır; seçilmezse proje alanı numaradan düşer |
| B12 | rota (refakat kartı, kart #1061; kart #588) | Emirden refakat kartı sayfası kalktı (Soru 586). Emir ayrıntısındaki "Refakat kartları" bölümü stoğun kartlarını `GET /stok/uretim-emirleri/:id/refakat-partileri` ile okur, Etiket Merkezi'nde (`?tur=refakat-partisi`) basar. `GET /adimli-emirler/:id/refakat-karti` stok ve Etiket Merkezi için kalır |
| B13 | recete-rota (rotasız emir, kullanıcı kararı 14.10.2026) | KAPANDI (bu modül tarafı): malzemeli rotasız emir `POST /adimli-emirler/rotasiz` ile açılır; adımlar `POST /adimli-emirler/:id/adim-ekle`, `adim-duzenle`, `adim-sil` ile yazılır (UE-RA-0..3); `emirDilimi` iş emri satırları ad, operasyon tipi, kaynak, istasyon, süreler ve bileşenleri taşır. Malzemesiz eski rotasız emir (`POST /uretim-emirleri`) dilimde görünmez. Kalan: Reçete ve Rota ekranının bu uçlara bağlanması |
| B14 | arkon (yük testi 2026-10-18, kayıt ekleme) | `POST /arkon/kayitlar/:tur/ekle` satır döngüsü `komutOnbellegiyle(db, () => ...)` içinde koşar; kişi kapsamı (istasyon, rol, iş merkezi) ve ad tabloları istek boyunca bir kez okunur, satır başına 5 sorgu düşer. Döngü içinde kişi, rol, iş merkezi ataması ya da istasyon yazılmaz |
| B15 | arkon (yük testi 2026-10-18, Operatör Özetim) | Gün döngüsündeki `aralikAdetleri(db, 'kisi', [kisiId], gb, gs)` yerine döngüden önce tek `gunlukAralikAdetleri(db, 'kisi', [kisiId], sinirlar)`, `gecmisBeklenen` içindeki gün başına `kisininIsEmirleri` yerine tek `kisininGunlukIsEmirleri(db, kisiId, sinirlar)`; `sinirlar` ilkGun'den bugün+1'e tesis gün başları (ISO). Aralık başına cevap tek tek okumayla aynıdır |
| B16 | kalite-merkezi, stok, sevkiyat, satin-alma (onaylı kapanış K1, 1074 a) | `disari.ts`: `olcumKapanisCozucusu`, `izlenebilirlikKapanisCozucusu`, `fasonKapanisCozucusu`, `stokKapanisCozucusu`, `sevkiyatKapanisCozucusu`, `ncrKapanisCozucusu` (c \| null); çözücü `(db, uretimEmriId) => Promise<{ durum: 'tamam' \| 'eksik' \| 'gerekmez'; ayrinti } \| null>`, bağı kablolama.ts'te. Yalnız `eksik` durdurur. `kapanisSonuclari(db, idler)` reçete-rota ve etiket için (yetki denetlemez) |
