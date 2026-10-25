# TS Arkon (Uretim Terminali ve Uretim Hazirlik): A1-A6 parca sozlesmesi (A0 iskelet uzerine)

Kok: `istemci/src/moduller/arkon/yeni/`. Adres: `/arkon/yeni/<sayfa>[/<kimlik>]`; kok adres role gore girer (yonetim rolleri Pano,
operator Operator; `arkonGirisSayfasi`). Alima kadar yalniz yoneticide acilir (`YeniEkranKapisi`); eski cerceve yerinde kalir.
Sayfa anahtarlari eski Arkon'un adres isaretleridir (`#pano` -> `pano`; operator ekraninin bos isareti -> `operator`; `#onizle:<istasyon>` -> `onizle/<istasyon>`).
Olcut bugun cercevede calisan davranistir; her fark "fark" satiri olarak DEVIR'e yazilir ve kullanici onayina gider.

| Parca | Klasor | Disari verilen sayfa bileseni (adi degismez; sayfalar.ts ithal eder) | Sayfa anahtari | Eski kaynak (arkon/web/src/app) | CSS oneki |
|---|---|---|---|---|---|
| A1 | operator/ | `Operator`, `Onizleme` | operator, onizle | operator.ts, operator-parcalar.ts, bilesenler.ts, ozetim.ts | tc-ay1- |
| A2 | hazirlik/ | `Hazirlik` | hazirlik | hazirlik.ts, kurallar.ts, istasyonlar.ts | tc-ay2- |
| A3 | pano/ | `Pano`, `PlanKuyrugu`, `Kuyruk`, `Anomali` | pano, planlama, kuyruk, anomali | pano-planlama.ts, anomali.ts | tc-ay3- |
| A4 | kalite/ | `Kalite`, `Bakim`, `Raporlar` | kalite, bakim, raporlar | kalite.ts, bakim-raporlar.ts, olcum-aleti-secimi.ts, giris-ayarlar-spc.ts (SPC bolumu) | tc-ay4- |
| A5 | cizim/ | `Cizim` | cizim | cizim-studyosu.ts, teknik-resim.ts, pdf.ts, pdf-okuma.ts, ocr.ts, model-3b.ts, balon-yerlesimi.ts, cizim-merkezi.ts | tc-ay5- |
| A6 | ayarlar/ | `Ayarlar`, `CagriBandi` | ayarlar (+ her sayfanin altindaki cagri bandi) | giris-ayarlar-spc.ts (Ayarlar, CallBanner), ayarlar-uretim.ts | tc-ay6- |

Sayfa bileseni `(o: ArkonEkranOzellikleri) => JSX` imzasindadir (`sayfalar.ts`: `{ sayfa, kimlik }`); `CagriBandi` `{ sayfa }` alir.
A0 her klasore yer tutucu `index.tsx` koyar; parca o dosyayi ve klasorunu sahiplenir. Parca yalniz kendi klasorune ve
`ekran-testleri/arkon-yeni.spec.ts` icinde kendi `test.describe('A<n> ...')` bloguna yazar. Iskelet dosyalarina dokunulmaz;
eksik islev iskelet sahibine (A0) istek olarak gelir. TMI'ye yazilamayanlar sekmesi TMI ekranidir (`/arkon/tmi-yansimalari`), yeni ekranda yoktur.

## Parcalar arasi bilesenler
Baska parca yalniz sahibinin `index.tsx` dosyasindan ithal eder. Imzayi sahibi ilk teslimde yazar; tuketen parca imza gelene kadar o yerde
`ortak/Hazirlaniyor` gosterir ve DEVIR'de borc yazar (iki parca ayni anda birbirinin dosyasina yazmaz). Agir kutuphane (pdf, ocr, 3B) yalniz `lazy` ile acilir.
- A2: `KuralSekmesi` (RulesTab), `UyariPenceresi` (WarnOv), `TakimKarti` (ToolsCard), `IstasyonDuzenleyici` (StEditor, TypePicker),
  `IstasyonPanelleri` (PANELS: depo, boya, montaj, kalite), `Qr`, `KodOkuyucu` (ScanOv), `etiketYazdir` (printLabel). Kullanan: A1, A4, A6.
- A3: `IsMerkeziSuzgeci` (WcFilter). Kullanan: A4.
- A4: `OlcuAletleri` (GaugeView), `NumunePenceresi` (NumuneOv), `AletSecimi`, `SpcGorunumu` (SpcView). Kullanan: A1, A5.
- A5: `TeknikResim` (Blueprint, BlueprintM), `Model3B` (Step3D), `MerkezRozeti`, `MerkezSecici`. Kullanan: A1, A2, A4, A6.

## A0'in sabit imzalari (parcalar kullanir, degistirmez)
- `veri/baglam.ts`: `useArkon(): ArkonBaglami { depo, kisi, ayarlar, ayarlariYenile, yetkiVar(k), sayfaGorunur(s), git(sayfa, kimlik?), tmiyeGit(hedef), saltOkunur }`;
  `useArkonDurumu()`, `useIleti(f)` (anlik iletiler), `useBelgeler<T>(depoAdi, ekDinle?) -> { liste, yenile, hazir }`, `belgeYaz(depo, depoAdi, belge, ileti?)`,
  `belgeSil(depo, depoAdi, kimlik)`, `useSimdi(ms?)`; `onizle(paketId)` "Operator gozuyle" penceresini acar (salt okunur). Eski modul degiskenleri (PLANT, SHIFTS, POLICY, REASONS, SCRAPS, GAUGES) `ayarlar` icindedir.
- `veri/depo.ts`: `ArkonDeposu` (eski AKStore'un ekranda kullanilan yuzu, tipli: DB, Bus, Log, Auth, Server, Plan, Cache, Pkg, status, onStatus).
  Veri katmani eski `arkon/web/src/data/store.ts`'tir (kopya yok); yeni ekranda istekler `veri/tasiyici.ts` ile kopru cevirisinden TMI uclarina gider.
  Onizlemede (`saltOkunur`) yazma TMI'ye iletilmez; parca ayrica yazma dugmesini gizler.
- `cekirdek/`: `tipler.ts` (arkon/shared/model.ts tipleri), `sabitler.ts` (is durumlari, roller, yetkiler, varsayilan matris ve kurallar, yerlesik nedenler,
  cagri ekipleri), `yetki.ts`, `tesis.ts`, `vardiya.ts`, `oee.ts` (`oeeHesapla`), `ayarlar.ts`, `bicim.ts` (`YOK` "—"; veri yoksa sifir yazilmaz), `ses.ts` (`bip`),
  `yerel.ts` (cihaz ayarlari, `ozellikler`, `hafifKip`). Hepsi eski ortak-ayarlar.ts/temel.ts/yukleyici.ts mantiginin tipli tasimasidir; `cekirdek/esitlik.test.ts` eskisiyle esitligi sinar.
- `arkon/web/src/data/*` saf modulleri (anomali, numune, kuyruk, parca, refakat-karti, ...) kopyalanmaz, dogrudan ithal edilir.
- `ortak/Hazirlaniyor.tsx`; `ortak/SaatSeridi.tsx` (sayfa basliginin sagindaki kisayollar, baglanti durumu, saat ve vardiya); `ortak/BaglantiDurumu.tsx` (baglantiOzeti, durum isareti); `test-ortak.tsx`: `sunucuKur(deneme, { belgeler, kayitlar })`, `arkonAc(adres)`, denemeler `YONETICI`, `KAPISIZ`, `OPERATOR` (uydurma).

## Kurallar (her parca)
- TASARIM KORUMA (2026-10-24, kullanici; 20:22 duzeltilmis okuma teyitli; 203 a kalkti): HTML'den TS'ye gecen sayfalarda amac TypeScript'e gecis ve
  mantik, kurgu, bozukluk hatalarinin duzeltilmesidir. Ortak tasarima oturur: renkler (tasarim degiskenleri, sabit renk yok), yazi tipi ve boyutlari,
  dugme, kart, form ve bildirim gorunusu, genel dugme ikonlari (Malzemeler ikonlari dahil ortak sete gecebilir). Degismez: sayfanin duzeni, yerlesimi,
  kullanimi, akisi, araclari ve yapisi; ozel tasarimlar ortak parcaya cevrilmez, kendi tasarimiyla tasinir (orn. planlama motoru ve sonsuz tahta,
  planlama atolyesi, Recete-Rota akis semasi ve tablosu, Uretim Terminali). 360 genislige sigdirmak icin duzen degistirilmez; tasma yalniz duzen
  bozulmadan giderilir. Fark yalniz mantik/kurgu/bozukluk hatasi, guvenlik ya da onayli karar (orn. 357 b: motor isteyen dugme gorunur ama pasif)
  gerektirdiginde yapilir; her fark gerekcesi ve hata turuyla soru olur, varsayilan oneri "eski hali kalsin". Bu dosyadaki ortak bilesen ve 360/768/1280
  maddeleri bu metne gore okunur: ortak bilesen yalniz sayfanin duzenini, yerlesimini ve araclarini degistirmiyorsa kullanilir; 360/768/1280 olcumunde
  duzen degismez (kurulum/proje-talimati.md KURALLAR 3).
- Tasarim degiskenleri, ortak `Simge` ve ortak dugme, kart, form, bildirim gorunusu gecerlidir; ortak bilesenler (`Tablo`, `SayfaBasligi`,
  `FormPenceresi`, `Pencere`, `OnayPenceresi`, `Sekmeler`, `Rozet`, `SayiKarti`, `GrafikKarti`, `DurumKutusu`, `useBildirim`) yalniz sayfanin duzeni
  birebir kaliyorsa kullanilir; 360/768/1280'de duzen degismez. Sabit renk, olcu, satir ici stil yok; renk tek basina anlam tasimaz.
- Tarayicidaki hesap saf TS islevidir (parcanin `kurallar.ts` dosyasi, birim testli); eski islevle esitlik testi yazilir (ornegi `cekirdek/esitlik.test.ts`).
  Kopyala-yapistir ve `@ts-nocheck` yok; `htm` yok, TSX.
- Kapali ozellikler (tanitim verisi, PLANT_DEMO, giris ve kilit ekrani, Arkon'un kendi temasi) yeni ekrana girmez (208 a benzeri). Ekran olcegi
  (eski useFit) TASARIM KORUMA geregi geri geldi: kok `cekirdek/olcek.ts` ile 1600x900 tasarim alanina gore yakinlasir (A0.1, O8).
- Uc, sema, tablo eklenmez; gerekiyorsa A0 uzerinden koordinatore istek.

Kabul (parca basina): eski sayfadaki her alan ve islem DEVIR'de isaretli liste; yazma dugmeleri yetkiye gore gizli, izinli ve reddedilen test;
360/768/1280 olcumu; ekran testi blogu; `npm run kontrol` yesil; fark satirlari onayda.

## Iskelet dosyalari (A0'in; parcalar dokunmaz)
`ArkonYeni.tsx`, `ArkonYeni.test.tsx`, `sayfalar.ts`, `arkon-yeni.css`, `cekirdek/*`, `veri/*`, `ortak/*`, `test-ortak.tsx`, `PARCA-SOZLESMESI.md`;
`../rotalar.tsx`, `../baglanti.ts`, `arkon/web/src/data/store.ts` (yalniz tasiyici eki).
