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
  `belgeSil(depo, depoAdi, kimlik)`, `useSimdi(ms?)`. Eski modul degiskenleri (PLANT, SHIFTS, POLICY, REASONS, SCRAPS, GAUGES) `ayarlar` icindedir.
- `veri/depo.ts`: `ArkonDeposu` (eski AKStore'un ekranda kullanilan yuzu, tipli: DB, Bus, Log, Auth, Server, Plan, Cache, Pkg, status, onStatus).
  Veri katmani eski `arkon/web/src/data/store.ts`'tir (kopya yok); yeni ekranda istekler `veri/tasiyici.ts` ile kopru cevirisinden TMI uclarina gider.
  Onizlemede (`saltOkunur`) yazma TMI'ye iletilmez; parca ayrica yazma dugmesini gizler.
- `cekirdek/`: `tipler.ts` (arkon/shared/model.ts tipleri), `sabitler.ts` (is durumlari, roller, yetkiler, varsayilan matris ve kurallar, yerlesik nedenler,
  cagri ekipleri), `yetki.ts`, `tesis.ts`, `vardiya.ts`, `oee.ts` (`oeeHesapla`), `ayarlar.ts`, `bicim.ts` (`YOK` "—"; veri yoksa sifir yazilmaz), `ses.ts` (`bip`),
  `yerel.ts` (cihaz ayarlari, `ozellikler`, `hafifKip`). Hepsi eski ortak-ayarlar.ts/temel.ts/yukleyici.ts mantiginin tipli tasimasidir; `cekirdek/esitlik.test.ts` eskisiyle esitligi sinar.
- `arkon/web/src/data/*` saf modulleri (anomali, numune, kuyruk, parca, refakat-karti, ...) kopyalanmaz, dogrudan ithal edilir.
- `ortak/Hazirlaniyor.tsx`; `test-ortak.tsx`: `sunucuKur(deneme, { belgeler, kayitlar })`, `arkonAc(adres)`, denemeler `YONETICI`, `KAPISIZ`, `OPERATOR` (uydurma).

## Kurallar (her parca)
- TASARIM KORUMA (2026-10-24 19:19, kullanici): ekranlarin tasarimi kullanicinindir. TS gecisinin amaci yalniz TypeScript'e gecis ve mantik, kurgu ve
  bozukluk hatalarinin duzeltilmesidir. Prototip ya da eski ekranin gorunusu, duzeni, akisi, araclari ve metinleri birebir korunur. 360 genislige
  sigdirma, ortak parcaya tasima, sadelestirme ya da "daha iyi" gerekcesiyle degisiklik yapilmaz; ortak parca yalniz gorunus birebir kaliyorsa
  kullanilir. Fark yalniz mantik/kurgu/bozukluk hatasi, guvenlik ya da onayli bir karar (orn. 357 b) gerektirdiginde yapilir; her fark gerekcesiyle ve
  "hata turu" belirtilerek soru olur, varsayilan oneri "eski hali kalsin"dir. Bu dosyadaki 203 a, ortak bilesen ve 360/768/1280 maddeleriyle celisirse
  TASARIM KORUMA gecerlidir (kurulum/proje-talimati.md KURALLAR 3).
- Tasarim degiskenleri, ortak bilesenler (`Tablo`, `SayfaBasligi`, `FormPenceresi`, `Pencere`, `OnayPenceresi`, `Sekmeler`, `Rozet`, `SayiKarti`, `GrafikKarti`,
  `DurumKutusu`, `useBildirim`), ortak `Simge`; 360/768/1280. Sabit renk, olcu, satir ici stil yok; renk tek basina anlam tasimaz.
- Tarayicidaki hesap saf TS islevidir (parcanin `kurallar.ts` dosyasi, birim testli); eski islevle esitlik testi yazilir (ornegi `cekirdek/esitlik.test.ts`).
  Kopyala-yapistir ve `@ts-nocheck` yok; `htm` yok, TSX.
- Kapali ozellikler (tanitim verisi, PLANT_DEMO, giris ve kilit ekrani, Arkon'un kendi tema ve yakinlastirmasi) yeni ekrana girmez (208 a benzeri).
- Uc, sema, tablo eklenmez; gerekiyorsa A0 uzerinden koordinatore istek.

Kabul (parca basina): eski sayfadaki her alan ve islem DEVIR'de isaretli liste; yazma dugmeleri yetkiye gore gizli, izinli ve reddedilen test;
360/768/1280 olcumu; ekran testi blogu; `npm run kontrol` yesil; fark satirlari onayda.

## Iskelet dosyalari (A0'in; parcalar dokunmaz)
`ArkonYeni.tsx`, `ArkonYeni.test.tsx`, `sayfalar.ts`, `arkon-yeni.css`, `cekirdek/*`, `veri/*`, `ortak/*`, `test-ortak.tsx`, `PARCA-SOZLESMESI.md`;
`../rotalar.tsx`, `../baglanti.ts`, `arkon/web/src/data/store.ts` (yalniz tasiyici eki).
