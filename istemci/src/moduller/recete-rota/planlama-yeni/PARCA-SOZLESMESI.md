# TS Planlama: P1-P6 parca sozlesmesi (iskelet uzerine)

Kok: `istemci/src/moduller/recete-rota/planlama-yeni/`. Adres: `/recete-rota/planlama-yeni/<gorunum>`; kok adres (`/recete-rota/planlama-yeni`)
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

Her bilesen `(o: PlanlamaEkranOzellikleri) => JSX` imzasindadir. Iskelet her klasore yer tutucu `index.tsx` koyar; parca o dosyayi ve klasorunu
sahiplenir (dosya kilidi koordinatorden). Parca yalniz kendi klasorune ve `ekran-testleri/recete-rota-planlama-yeni.spec.ts` icinde kendi
`test.describe('P<n> ...')` bloguna yazar. Kendi css dosyasi kendi klasorundedir. Iskelet dosyalarina (asagidaki liste) dokunulmaz; eksik islev
iskelet sahibine istek olarak gelir. Parcalar birbirini ithal etmez; ortak gereken iskelete istekle girer.

Iskelet dosyalari (tek sahip: iskelet): `PlanlamaYeni.tsx`, `gorunumler.ts`, `yollar.ts`, `veri.ts`, `durum.ts`, `tipler.ts`, `yetki.ts`,
`YerTutucu.tsx`, `test-ortak.tsx`, `planlama-yeni.css`, `cizelge/`, bu dosya ve iskeletin testleri.

## Iskeletin sabit imzalari (parcalar kullanir, degistirmez)
- `gorunumler.ts`: `PlanlamaEkranOzellikleri { depo: PlanlamaDeposu; yetki: PlanlamaYetkisi; git(g: PlanlamaGorunumu): void; yenile(): void }`.
  `PlanlamaGorunumu` ikinci menu anahtarlaridir. `gorunumAcik(g, yetki)`: maliyet, giderler, denge `finans.maliyet-oku` ister (200 a, 195 a);
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
- `yetki.ts`: `PlanlamaYetkisi { planlamaOku, maliyetOku, planYaz, planKilitle, planStudyo, planCanliyaAl, bedelAyari, kayitYazabilir }`.
  Ekran yalniz gizler; denetim uctadir. Sayfanin ic rol modeli (veri.yaz, plan.kilitle ...) tasinmaz; esleme soru 223'e bagli.
- `cizelge/`: `Cizelge { etiket, olcek, satirlar, simdi?, secili?, sec?, gunEtiketi? }` (kaynak basina satir, saat eksenli cubuk; renk parcanin
  `sinif`'iyla `--renk`), `olcekKur(bas, bit, yakinlik)`, `konum`, `cubukAraligi`, `gunCizgileri`. Tahta, tezgah panosu ve atolye bunu kullanir.
- `YerTutucu`: yalniz iskeletin; parca teslimde kendi index.tsx'inden kaldirir.
- `test-ortak.tsx`: `sunucuKur(kullanici, kayitlar, { ret })`, `ac(adres)`, kullanicilar `YONETICI`, `MALIYETSIZ`, `PLANLAMASIZ`, `KAPISIZ` (uydurma).

## Kararlar ve acik sorular (iskelet salt okur)
- 221 c (kullanici 23.10 22:45, cmsg_019jymdq1CtoFcRqjZv7Ln6XCQ14KrCeDnUCGCLuq6Mmc3): karma. Senaryo, degisiklik ve onay plan modulunun
  tablolarindadir (`/plan/senaryolar`, `PLAN_ONAY_KOMUTLARI`); ekran tercihleri ve agirliklar (`w`, `param`, `pref`, karar alanlari) `:planlama`
  kaydinda kalir. Kayda yazma yolu (surum denetimli, `/recete-rota/kayitlar/yaz`) iskelete istekle girer; parca kendi yazma kodunu yazmaz.
  Sayfanin kendi senaryolari (`calisma.senaryolar`, `canli`) yeni ekranda kullanilmaz; senaryo yalniz plan modulundendir.
- 222: acik (kullanici aciklama istedi). Cevap gelene dek `receteRotaKaydi` yalniz okunur; hicbir parca Recete ve Rota kaydina yazmaz.
- 223 a: cevap verildi, okuma teyidi bekleniyor. Teyit gelene dek ekran bayraklari ortak islemlerden okunur (yetki.ts); ic rol modeli tasinmaz.
- 224 a (ayni mesaj): malzeme ihtiyaci (MRP) hesabinin sahibi recete-rota (Planlama). P4 hesabi saf TS olarak kendi `kurallar.ts`'inde yazar;
  stok ve satin alma verisi sahiplerinin `disari.ts`/uclarindan okunur.
Sunucuya giden yazmalar (onay, canliya alma, kilit, siralama) bugun var olan plan uclariyla yapilir (`PLAN_ONAY_KOMUTLARI`, H2/H3); yeni uc
istegi parcadan iskelete, oradan koordinatore gelir.

## Kurallar (her parca)
- 203 a: tasarim degiskenleri, ortak bilesenler (`Tablo`, `SayfaBasligi`, `FormPenceresi`, `Pencere`, `OnayPenceresi`, `Sekmeler`, `Rozet`,
  `SayiKarti`, `GrafikKarti`, `useBildirim`), ortak `Simge`, 360/768/1280. Sabit renk, olcu, satir ici stil yok.
- 205 a: tarayicidaki hesaplar (yillik plan, ufuk kaba yuku, termin ve kar, maliyet, ek mesai ve fason onerisi, malzeme plani) saf TS islevi,
  parcanin `kurallar.ts` dosyasinda, birim testli. Yazma sonucu doguran (onay, canliya alma, kilit) sunucudadir.
- 208 a: olcut bugun calisan haldir; olu kod (cizilmeyen eski Plan, Tezgah, Siparis, Kriz, Senaryo sekmeleri), deneme izleri ("V2 deneme",
  rol secici, ornek veri, `set-yukle`, `iceri-ac`, `sifirla`) ve kendi kabuk, palet, bildirim, pencere sistemi yeni ekrana girmez.
- Plan motoru ve onay akisi davranisi birebir; her fark parcanin DEVIR'inde numarali yazilir ve kullanici onayina gider. Eski ekran alima kadar yerindedir.
- 209 a: ana akis `ekran-testleri/recete-rota-planlama-yeni.spec.ts` icinde kendi blogunda; testler yer tutucu metnine bagli olmaz.
