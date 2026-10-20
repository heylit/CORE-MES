# BASKA-MODUL-ISTEKLERI: satin-alma (kart #162)

## Bağlama tur 1 (akış C) durumu
- Finans: KARŞILANDI (#356). Satın alma `firmaAra`, `firmaOzeti`, `firmaOzetleri`, `kurGetir`, `kurlar` kullanır; `firma-gecici.ts` silindi. Aşağıdaki finans bölümü geçmiştir.
- Stok: teslim satın almada yazılır; stok mal kabulde `teslimIsle(db, kullanici, { siparisSatirId, miktar, malKabulSatirId })`, düzeltmede eski satır için
  `teslimGeriAl(db, kullanici, { malKabulSatirId })` sonra yeni satır için `teslimIsle` çağırır (stokla uzlaşıldı). Bağ sütunu `stok_mal_kabul_satiri.siparis_satir_id`.
  Aşağıdaki `teslimAlinanlar` isteği bununla yer değiştirdi. Kalanı aşan teslim reddedilmez; sipariş satırında `fazlaTeslim` görünür.
- Malzemeler: `malzemeAra` ve `malzemeOzetleri` KARŞILANDI (#364); SA2 bağı yazıldı. Bekleniyor: hizmet türü ve yönü (`alinan` | `verilen`) özetlerde;
  gelince satın alma yalnız alınan hizmeti seçer (sunucuda ret) ve kopya sütunlar ayrı göçle düşer.
- Kalite (GKK): kalite modülü gelene kadar sipariş kalitesi boş (SH2 b).

## Üretim emirleri: siparişe bağlı iş emri silme iletisi (karar 143 a, 19.10.2026)
- Bekleyen iş emrini silen yollar (`is-emri-servis.ts` `bekleyeniSil`) satın alma sipariş satırına bağlı iş emrinde yabancı anahtarla 409 BAGIMLI_KAYIT alır (davranış doğru, test satın almada).
  İstek: `bekleyeniSil` çağrısı `kisitKorumali({}, ..., { BAGIMLI_KAYIT: 'İş emri bir satın alma siparişine bağlı; önce siparişteki bağı kaldırın.' })` ile sarılsın; bugünkü ileti geneldir. Satın alma üretim emirlerini ithal ettiği için ters yönde sorgu yok (ADR 0006).

## Üretim emirleri ve rota (fason; bu turda yalnız liste, yazım yok)
Fason bir rota adımıdır. Hizmet siparişinin nasıl açılacağı için seçenekler:
1. Elle: satın almacı talep açar, kalemde alınan hizmeti seçer, rota adımını notta yazar. Bağ yok; adım ilerlemesi elle.
2. Adımdan: rota adımı fason olunca rota satın almaya `fasonTalebiAc(db, { adimId, hizmetNo, miktar, ihtiyacTarihi })` çağırır; talep adım kimliğini taşır,
   fason dönüşü (teslim) adımı ilerletir.
3. Karma: adımda "fason talebi aç" düğmesi talebi adım kimliğiyle taslak açar; tedarikçi, teklif ve karar satın almada elle sürer.
Hangisi seçilirse satın almada talebe boş olabilen `rota_adim_id` gelir; yazım Aşama 2'nin sonraki turunda.

## Finans (kart #246; tablo `finans_firma`)
Kart dört adı verir; imza kartta yok. Satın almanın kullandığı imzalar (VARSAYIM; finans farklı verirse yalnız `servis.ts` ithali ve `firma-gecici.ts` değişir):

| Fonksiyon | Önerilen imza | Satın almada nerede |
|---|---|---|
| `firmaAdlari` | `(db: Db, idler: number[]) => Promise<Map<number, string>>` (kalıp `kisiAdlari`; pasif firma da adıyla) | şimdilik kullanılmıyor; teklif adı için ayrılır |
| `firmaVarMi` | `(db: Db, id: number) => Promise<boolean>`; YALNIZ AKTİF firma için true | `tedarikciKaydet` (SAT-41) |
| `firmaAra` | `(db: Db, metin: string) => Promise<{ id: number; ad: string }[]>` (ad içinde, büyük küçük harf duyarsız, en çok 50) | `GET /satin-alma-firma-secenekleri` |
| `firmaOzetleri` | `(db: Db, idler: number[]) => Promise<Map<number, { id; ad; vergiNo; yetkili; telefon; eposta; sehir; aktif: boolean; surum: number }>>` (finansta olmayan kimlik haritada yoktur; tek sorgu) | açılışta tedarikçi kartları, tedarikçi kaydının cevabı |

Açık soru (finansa): `firmaVarMi` pasif firmada false mı? Satın alma pasif firmayı tedarikçi yapmaz (SAT-41); false değilse `firmaOzetleri(...).get(id)?.aktif` ile denetlenir.
2. tur (#162): tekil `firmaOzeti` yerine toplu `firmaOzetleri` istenir; satın alma tedarikçi başına çağrı yapmaz.
Tur 4: teslim aynı `firmaOzetleri`'ni ayrı bir `firmalar` modülünden istiyordu (pasif firma da döner, sürüm dahil). Sabit kimliğe göre firma finanstadır
(kullanıcı kararı SA2): istek finansa yöneltildi, `firmalar` modülüne bağlantı yazılmadı.

## Teslim bilgisi (tur 4)
Teslim 08.10.26 14.33: teslim alma satın almadan stoka geçti; iki okuma isteği teslimden olduğu gibi alındı. Kalıp `kisiAdlari` gibi:
boş dizide sorgu yok, yinelenen kimlik tek kayıt, olmayan kimlik haritada yok. Satın alma bunları `teslim-bilgisi.ts` içinden çağırır; bugün boş döner.

### Stok (kart #206): `teslimAlinanlar(db: Db, siparisSatirIdler: number[]): Promise<Map<number, MalKabul[]>>`

```ts
interface MalKabul { tarih: string /* YYYY-AA-GG */; miktar: string /* ondalık metin, kabul edilen */ }
```

**Neden:** Teslim satın almada yapılmaz. Depo, stok modülünün mal kabul belgesiyle, sayarak ve parti girerek alır (kullanıcı düzeltmesi). Satın alma, siparişin teslim durumunu buradan okur: satır başına kabul toplamı ve son tarih. Bütün satırlar tam kabul edilince talep "teslim alındı" görünür (SAT-38).

**Bağ:** Mal kabul belgesi satın almanın sipariş satırına bağlanır: `satin_alma_siparis_satiri.id`, tamsayı. Satırlar `sunucu/moduller/satin-alma/disari.ts` → `siparisSatirlari(db, idler?)` ile fiyatsız okunur:
- satır kimliği, talep ve sipariş no;
- tedarikçi;
- katalog kodu ve malzeme no;
- kalem, miktar, birim;
- beklenen teslim.

Kimlik verilmezse teslim bekleyen bütün satırlar döner.

### Rota / kalite (GKK): `gkkSonuclari(db: Db, siparisSatirIdler: number[]): Promise<Map<number, GkkKaydi>>`

```ts
interface GkkKaydi { sonuc: 'uygun' | 'sartli_kabul' | 'ret'; retMiktari: string | null; retNedeni: string | null }
```

**Neden:** Kalite kararı mal kabulden önceki GKK (giriş kalite kontrol) rota adımında verilir. Bu, kullanıcı kararıdır; GKK sonucu ayrı fonksiyonla okunur. Satın almadaki karşılığı tedarikçi karnesine girer:

| GKK sonucu (satırlar) | Satın almadaki kalite |
|---|---|
| Hepsi uygun | Sorunsuz |
| Hepsi ret | Red / iade |
| Karışık ya da şartlı kabul | Kısmi sorun |

Satın almada ayrı kalite alanı yok.

## Üretim emirleri
Yok.

## Malzemeler (kart #1192)
- `malzemeAra` (sunucu/moduller/malzemeler/servis.ts) metni kategori adında da arasın: `katalogMalzemeAra` `ARAMA_KOSULU` bugün yalnız `stok_kodu`, ad ve `no`ya bakar; `kt.ad ILIKE $1` eklenmesi istenir. Neden: talepteki açılır liste "Malzemeler ve Hizmetler"deki gibi kategoriyle de arasın. Gelene kadar kategori yalnız satırda görünür.
