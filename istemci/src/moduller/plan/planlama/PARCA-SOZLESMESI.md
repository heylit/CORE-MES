# TS Planlama: P1-P6 parca sozlesmesi (iskelet uzerine)

Kok: `istemci/src/moduller/plan/`. Adres: `/plan/<gorunum>`; kok adres (`/plan`)
Planlama motoru'na (`plan`) doner. Gorunum adres parcasi eski ekranin anahtaridir (`planlama-menusu.ts` PLANLAMA_ANAHTARLARI; `kanban` eski
baglantidir, yeni ekranda yoktur). Alimda yalniz `planlama-yeni` adres parcasi `recete-rota/<anahtar>`'a doner.
Seridin sirasi, basligi ve simgesi ikinci menunun Planlama grubundan gelir (`ONERILEN_IKINCI_MENU`); ayrica yazilmaz.

| Parca | Klasor | Disari verilen bilesen (adi degismez; gorunumler.ts ithal eder) | Gorunum anahtari | CSS oneki |
|---|---|---|---|---|
| P1 | motor/ | `PlanlamaMotoru`, `PlanlamaAtolyesi` | plan, studio | tc-pym- |
| P2 | siparis/ | `Siparisler`, `Terminler`, `TerminVeKar` | ysiparis, terminler, denge | tc-pys- |
| P3 | maliyet/ | `Maliyetler`, `GenelGider`, `EkMesaiPlani`, `FasonPlani` | maliyet, giderler, mesaiplan, fasonplan | tc-pyk- |
| P4 | malzeme/ | `MalzemePlani` | malzplan | tc-pyz- |
| P5 | ufuk/ | `YillikPlan`, `Ufuk` | yillik, ufuk | tc-pyu- |
| P6 | sevkiyat/ | `Sevkiyat` | sevkiyat | tc-pyv- |

P1'in ic sayfalari (`motor/`, `ic/`) kendi oneklerini kullanir (tc-pym-, tc-pyi-, tc-pyh-, tc-pyo-, tc-pyt- tahta kartlari, tc-pyr- tezgah sirasi); P2-P6 oneki
yalniz kendi klasorunun css'inde ve iskelette yazilir: butun planlama css'i ayni sayfada yuklu kalir, baska parcanin onekiyle yazilan kural o
parcanin sayfasina da uygulanir.

Her bilesen `(o: PlanlamaEkranOzellikleri) => JSX` imzasindadir. Iskelet her klasore yer tutucu `index.tsx` koyar; parca o dosyayi ve klasorunu
sahiplenir (dosya kilidi koordinatorden). Parca yalniz kendi klasorune ve `ekran-testleri/recete-rota-planlama-yeni.spec.ts` icinde kendi
`test.describe('P<n> ...')` bloguna yazar. Kendi css dosyasi kendi klasorundedir. Iskelet dosyalarina (asagidaki liste) dokunulmaz; eksik islev
iskelet sahibine istek olarak gelir. Parcalar birbirini ithal etmez; ortak gereken iskelete istekle girer.

Iskelet dosyalari (tek sahip: iskelet): `PlanlamaYeni.tsx`, `gorunumler.ts`, `yollar.ts`, `veri.ts`, `kayit.ts`, `durum.ts`, `tipler.ts`, `yetki.ts`,
`YerTutucu.tsx`, `test-ortak.tsx`, `planlama-yeni.css`, `cizelge/`, bu dosya ve iskeletin testleri.

Plan cubugu (Soru 497/10 a): her planlama sayfasinin ustunde eski ekranin plan cubugu (pm-sb: Plan, Studyo, Veri, Gecmis; plan nabzi; durum;
Olay ekle ve Plani kur/iyilestir, ikisi 357 b geregi pasif) vardir. Cubuk P1'indir (`motor/ust/PlanSeridi.tsx`, `PlanSeridi`); iskelet onu
`gorunumler.ts` uzerinden motor disindaki her gorunumun ustune koyar, motor kendi cubugunu cizer. Parca kendi sayfasinda cubuk cizmez.

## Iskeletin sabit imzalari (parcalar kullanir, degistirmez)
- `gorunumler.ts`: `PlanlamaEkranOzellikleri { depo: PlanlamaDeposu; calisma: PlanlamaCalismasi | null; komut: CalismaKomutu | null; yetki: PlanlamaYetkisi;
  git(g: PlanlamaGorunumu): void; yenile(): void }`. `calisma` guncel haldir (`depo.calisma` acilistaki); `komut` yazma izni ya da calisma kaydi yoksa null.
  `PlanlamaGorunumu` ikinci menu anahtarlaridir.
- `gorunumler.ts`, gorunumler arasi ortak durum (eski ekranin `U.olcek`/`U.olKay`, `U.secJob`, `U.gySec`, `U.rsTez`, `U.rsT`'si; 453.5, 451/6, 452/7):
  `olcek: PlanlamaOlcegi { olcek: DonemOlcegi; kayma }`, `olcekSec(o)`, `kaydir(n)`, `secim: PlanlamaSecimi { siparis; adim; tezgah; zaman }`, `sec(kismi)`.
  `DONEM_OLCEKLERI` (`gun` Gun, `hafta` Hafta, `ay` Ay, `yil` Yil), acilis `ACILIS_OLCEGI` (Hafta, kayma 0; eski zs-olcek-ortak), `BOS_SECIM`.
  `olcekSec` kaymayi sifirlar; `kaydir(0)` bugune doner, baska sayi kaymaya eklenir (eski `ol-kay`). `sec` yalniz verilen alanlari degistirir; secimi
  kaldirmak icin alan `null` verilir. `zaman` plan saatidir (`calisma.D` ekseni; null su an). Kimlikler: `siparis` siparis no, `adim` plan adimi
  (`CozulmusPlan.ops` anahtari), `tezgah` tezgah kodu. Donem dugmesi olan her gorunum (Gun/Hafta/Ay/Yil, onceki/sonraki) bunu kullanir, kendi
  donem durumunu tutmaz; secim gosteren gorunum secili siparisi, adimi ve tezgahi buradan okur ve yazar. Durum gorunum degisince korunur, sayfa
  yenilenince acilis haline doner (eski ekranda da kaydedilmezdi), calismaya ve sunucuya yazilmaz; secili kimlik calismada yoksa gorunum yok sayar. `gorunumAcik(g, yetki)`: maliyet, giderler, denge `finans.maliyet-oku` ister (200 a, 195 a);
  ekran seritte gostermez, adresle acilirsa yetki iletisi cikar.
- `veri.ts`: `PlanlamaDeposu { ben; calisma: PlanlamaCalismasi | null; calismaSurumu: number | null; receteRotaKaydi: unknown; durum: DurumCevabi | null;
  planSurumu: PlanSurumCevabi | null; senaryolar: SenaryolarCevabi | null; motorUyarilari: string[] | null; okunamayan }`.
  Acilis okumalari eski ekranin kopru.ts'iyle ayni uclardir: `/recete-rota/ben`, `/recete-rota/kayitlar` (zorunlu), `/recete-rota/durum`,
  `/plan/surum`, `/plan/senaryolar`, `/plan/motor-uyarilari` (dusen dilim null; sifir ya da bos liste uydurulmaz). Gorunume ozgu okuma
  (`/recete-rota/kapasite`, `/recete-rota/fason-tahminleri`, `/plan/bedel-ayari`, `/plan/motor-yerlesimi`) parcanin kendi dosyasinda `api.get` ile yapilir.
- `durum.ts`: `calismaOku(deger)`, `planGuncel(c)`, `canliSenaryo(c)`, `GeriAlYigini<T>(sinir)`; `VERI_GERI_ALMA` (30), `PLAN_GERI_ALMA` (20),
  `VARSAYILAN_AGIRLIK`, `VARSAYILAN_PARAMETRE` (sayfanin yeni calisma degerleri).
- `tipler.ts`: `PlanlamaCalismasi` (`S`), `PlanVerisi` (`D`), `Siparis`, `Tezgah`, `Urun`, `RotaAdimi`, `Malzeme`, `Personel`, `Fasoncu`,
  `CozulmusPlan`, `CalismaSenaryosu`, `IzSatiri`. Bilinmeyen alan `ExtraAlanlar` ile tasinir; parca alan eklemek isterse iskelete istek yazar.
- `yetki.ts`: `PlanlamaYetkisi { planlamaOku, maliyetOku, planYaz, planKilitle, planStudyo, planCanliyaAl, bedelAyari, kayitYazabilir, calismaYazabilir }`.
  Ekran yalniz gizler; denetim uctadir. `calismaYazabilir` = ortak `plan.yaz` ve `ben.yazabilir` (223 a). `planKilitle` sunucudaki is emri kilidi
  uclarinindir; sayfa ici kilit (`calisma.locks`) `komut.degistir` ile ve `plan.yaz` ile yapilir.
- `kayit.ts`: `CalismaKomutu { degistir(ne, fn(taslak) => boolean | void, { ayrinti?, planKoru? }): boolean; geriAl(): boolean; geriAlinabilir(): boolean }`.
  `fn` calismanin kopyasini degistirir (false: vazgec). Her degisiklik eski sayfanin `degistir`'i gibi geri alma kopyasi alir (30), veri surumunu
  artirir (plan bayatlar; `planKoru` gorunum tercihi icindir), ize yazar ve basari bildirimini Geri al dugmesiyle verir. Yazma 2 sn birlesik,
  surum denetimli, yalniz `:planlama`; catismada (409) yazma durur ve kullanici yenilemeye cagrilir; 1 MB uzeri gonderilmez.
- `cizelge/`: `Cizelge { etiket, olcek, satirlar, simdi?, secili?, sec?, gunEtiketi? }` (kaynak basina satir, saat eksenli cubuk; renk parcanin
  `sinif`'iyla `--renk`), `olcekKur(bas, bit, yakinlik)`, `konum`, `cubukAraligi`, `gunCizgileri`. Tahta, tezgah panosu ve atolye bunu kullanir.
- `YerTutucu`: yalniz iskeletin; parca teslimde kendi index.tsx'inden kaldirir.
- `test-ortak.tsx`: `sunucuKur(kullanici, kayitlar, { ret })`, `ac(adres)`, kullanicilar `YONETICI`, `MALIYETSIZ`, `PLANLAMASIZ`, `KAPISIZ` (uydurma).

## Kararlar
Kullanici mesajlari: 221 c ve 224 a cmsg_019jymdq1CtoFcRqjZv7Ln6XCQ14KrCeDnUCGCLuq6Mmc3 (23.10 22:45); 222 a, 223 okuma teyidi ve 276 kabul
cmsg_019jymdq1CtoFcRqjZv7Ln6XWUqxR4psGLrrobZ2Dzar9H (24.10 06:42; 06:39 cevabi bununla gecersiz).
- 221 c: karma. Senaryo, degisiklik ve onay plan modulunun tablolarindadir (`/plan/senaryolar`, `PLAN_ONAY_KOMUTLARI`); ekran tercihleri,
  agirliklar ve planlama karar alanlari (`w`, `param`, `pref`, `locks`, `kapali`, `ekMesai`, `down`, karar alanlari) `:planlama` kaydinda kalir.
  Kayda yalniz `kayit.ts` `CalismaYazici` yazar (surum denetimli, `/plan/planlama-kayitlari/yaz`); parca kendi yazma kodunu yazmaz, `komut.degistir` cagirir.
  Sayfanin kendi senaryolari (`calisma.senaryolar`, `canli`) yeni ekranda kullanilmaz; belgede oldugu gibi kalir (eski ekran alima kadar okur).
- 222 a: Planlama Recete ve Rota kaydina (anahtar `recete-rota-motoru-v1`) yazmaz; `receteRotaKaydi` salt okunurdur ve `CalismaYazici` yalniz
  `:planlama` anahtarina yazar. Veri sahibinden girer (Recete ve Rota bolumleri, Malzemeler, Uretim emirleri, Istasyonlar, Vardiya). `calisma.D`'deki
  kaynak kopyalarinin sahibinden gelen alanlari (ad, kod, adet, termin, rota adimlari, tezgah ve kisi tanimi) parca degistirmez; plan alt ayarlari
  (oncelik, gelir, ceza, verim, karar alanlari) planlamanindir [VARSAYIM: eski sayfanin "motor ayarlari" ayrimi, girdi.betik sunucuKaydi].
- 223 a: ic rol esleme. `veri.yaz` kalkar; `plan.yaz` -> ortak `plan.yaz`; sayfa ici `plan.kilitle` (calisma kilitleri, 61 eylem) `plan.yaz`'a katilir;
  `plan.canliya-al` -> ortak `plan.canliya-al`; fiyat ve maliyet gorunumu -> `finans.maliyet-oku`. Sunucudaki `/plan/is-emirleri/:id/kilitle`
  uclari ortak `plan.kilitle` ister (`yetki.planKilitle`); sayfa ici kilit ile ayni sey degildir.
- 224 a: malzeme ihtiyaci (MRP) hesabinin sahibi recete-rota (Planlama). P4 hesabi saf TS olarak kendi `kurallar.ts`'inde yazar;
  stok ve satin alma verisi sahiplerinin uclarindan okunur.
- 276 kabul: iskelet DEVIR'indeki 7 fark kabul edildi.
Sunucuya giden yazmalar (onay, canliya alma, kilit, siralama) bugun var olan plan uclariyla yapilir (`PLAN_ONAY_KOMUTLARI`, H2/H3); yeni uc
istegi parcadan iskelete, oradan koordinatore gelir.

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
- 203 a kalkti (kullanici, 2026-10-24 20:07); yerine TASARIM KORUMA. Tasarim degiskenleri, ortak `Simge` ve ortak dugme, kart, form, bildirim gorunusu
  gecerlidir; ortak bilesenler (`Tablo`, `SayfaBasligi`, `FormPenceresi`, `Pencere`, `OnayPenceresi`, `Sekmeler`, `Rozet`, `SayiKarti`, `GrafikKarti`,
  `useBildirim`) yalniz sayfanin duzeni birebir kaliyorsa kullanilir; 360/768/1280'de duzen degismez. Sabit renk, olcu, satir ici stil yok.
- 205 a: tarayicidaki hesaplar (yillik plan, ufuk kaba yuku, termin ve kar, maliyet, ek mesai ve fason onerisi, malzeme plani) saf TS islevi,
  parcanin `kurallar.ts` dosyasinda, birim testli. Yazma sonucu doguran (onay, canliya alma, kilit) sunucudadir.
- 208 a: olcut bugun calisan haldir; olu kod (cizilmeyen eski Plan, Tezgah, Siparis, Kriz, Senaryo sekmeleri), deneme izleri ("V2 deneme",
  rol secici, ornek veri, `set-yukle`, `iceri-ac`, `sifirla`) ve kendi kabuk, palet, bildirim, pencere sistemi yeni ekrana girmez.
- Plan motoru ve onay akisi davranisi birebir; her fark parcanin DEVIR'inde numarali yazilir ve kullanici onayina gider. Eski ekran alima kadar yerindedir.
- 209 a: ana akis `ekran-testleri/recete-rota-planlama-yeni.spec.ts` icinde kendi blogunda; testler yer tutucu metnine bagli olmaz.
