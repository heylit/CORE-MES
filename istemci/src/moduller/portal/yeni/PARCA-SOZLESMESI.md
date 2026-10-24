# Portal TS ekranı: parça sözleşmesi

Kapsam (231 a, 230 a): yeni ekrana yalnız müşteri teklifleri, firma belgeleri ve onaylar taşınır. Başka iş sahibinde açılır
(`sahibinde.tsx`). Görünüm adları prototipin adlarıdır; adres `/portal/yeni/<ad>?id=<kayıt>`.

| Parça | Klasör | Görünümler |
|---|---|---|
| P1 | `teklif/` | sales, sale, newsale |
| P2 | `belgeler/` | docs |
| P3 | `onaylar/` | approvals |
| (soru 263) | `fiyat/` | pricereqs, pricereq, pricelists; cevap gelene kadar boş |

## Kayıt

Parça yalnız kendi klasörüne yazar ve `index.tsx`'inde görünüm adı -> ekran bildirir:

```ts
export const gorunumler: Gorunumler = { sales: TeklifListesi, sale: TeklifAyrintisi, newsale: YeniTeklif };
```

Ekran `GorunumOzellikleri` alır (`id`: ayrıntıda kayıt kimliği, yoksa null). İki parça aynı adı bildirmez (`sekmeler.test.ts`).
Bölüm sekmeleri, yetki kapısı ve görünüm izni kabuktadır (`PortalYeni.tsx`, `izinler.ts`); parça bunları yinelemez.

## Ortak parçalar (yalnız ithal edilir; değişiklik iskelet yazarına istenir)

- `veri.ts`: `usePortal()` (kişi, izin, onaylayan, kurum adı, an, `yol`, `git`), `usePortalDeposu([...koleksiyonlar])`,
  `kaydet`, `belgeYaz`, `belgeSil`, `onayKarari`, `ekYukle`, `useEk`, `belgeNoAl`, `yeniKimlik`, `usePortalKomutu`, `hataMetni`.
- `kurallar.ts`: prototipin hesapları (saf). `izinler.ts`: `izin.eylemAcik('...')`, `izin.gonderimAcik('...')`.
- `tipler.ts`: kayıt tipleri, prototipin alan adlarıyla. `bicim.ts`: tarih, para, sayı biçimleri.
- `sahibinde.tsx`: `SahibindeAc`, `sahibi(gorunum, tur)`. Taşınmayan kayda bağlantı bununla verilir.
- Arayüz yalnız `ortak/arayuz` parçalarıyla: Tablo, SayfaBasligi, FormPenceresi, Pencere, OnayPenceresi, Sekmeler, DurumKutusu.

## Kurallar

0. TASARIM KORUMA (2026-10-24, kullanici; 20:22 duzeltilmis okuma teyitli; 203 a kalkti): HTML'den TS'ye gecen sayfalarda amac TypeScript'e gecis ve
   mantik, kurgu, bozukluk hatalarinin duzeltilmesidir. Ortak tasarima oturur: renkler (tasarim degiskenleri, sabit renk yok), yazi tipi ve boyutlari,
   dugme, kart, form ve bildirim gorunusu, genel dugme ikonlari (Malzemeler ikonlari dahil ortak sete gecebilir). Degismez: sayfanin duzeni, yerlesimi,
   kullanimi, akisi, araclari ve yapisi; ozel tasarimlar ortak parcaya cevrilmez, kendi tasarimiyla tasinir (orn. planlama motoru ve sonsuz tahta,
   planlama atolyesi, Recete-Rota akis semasi ve tablosu, Uretim Terminali). 360 genislige sigdirmak icin duzen degistirilmez; tasma yalniz duzen
   bozulmadan giderilir. Fark yalniz mantik/kurgu/bozukluk hatasi, guvenlik ya da onayli karar (orn. 357 b: motor isteyen dugme gorunur ama pasif)
   gerektirdiginde yapilir; her fark gerekcesi ve hata turuyla soru olur, varsayilan oneri "eski hali kalsin". Bu dosyadaki ortak bilesen ve
   360/768/1280 maddeleri bu metne gore okunur: ortak bilesen yalniz sayfanin duzenini, yerlesimini ve araclarini degistirmiyorsa kullanilir;
   360/768/1280 olcumunde duzen degismez (kurulum/proje-talimati.md KURALLAR 3).
1. Görünüm yalnız okuduğu koleksiyonları ister; yükleniyor, hata ve boş durumları `DurumKutusu` ile gösterir.
2. Yazma: var olan kayıt `kaydet` ile okunduğu sürümle yazılır (409 -> ortak çatışma iletisi). Tam kayıt yazılır; kimlik ve sürüm
   gövdeye girmez. Onay kararı yalnız `onayKarari` ile; kişi ve zaman sunucudan gelir.
3. Onay doğuran kayıt (prototip beforePut: teklif iskontosu) adımları `onayAdimlari` + `adimAtla`, kaydı `yeniOnay` ile kurar.
   H2: teklif iskonto onayı Siparişler'in `iskontoOnayla` ucuna bağlanacak; uç gelene kadar boş bırakılır ve `UYUM-BORCU.md`'ye yazılır.
4. Belge numarası `belgeNoAl` ile (206 a ile sunucuya geçecek; parça değişmez).
5. Eylem düğmesi `izin.eylemAcik`, form `izin.gonderimAcik` ile gizlenir; asıl denetim sunucudadır.
6. Stil: kendi `.css` dosyası, önek `tc-pt-<parça>-`, yalnız tasarım değişkenleri; inline stil yok. 360, 768, 1280'de tam işlevli.
7. Testler: her ekranın `.test.tsx`'i `test-ortak.tsx` (`sunucuKur`, `ac`) ve `ornek-veri.ts` ile; her kural için izinli ve reddedilen
   durum. Veri sentetiktir; gerçek firma, kişi, parça adı girmez.
8. Görünüş ve akış bugünkü prototiple aynıdır; her fark parça teslimindeki `FARK.md`'ye yazılır ve onaya gider.
