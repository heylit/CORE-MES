# TS Recete ve Rota: R1-R3 parca sozlesmesi (R0 iskelet uzerine)

Kok: `istemci/src/moduller/recete-rota/yeni/`. Adres: `/recete-rota/yeni` (Uretim emirleri) ve `/recete-rota/yeni/<bolum>`; bolum
anahtarlari ikinci menunun "Recete ve Rota" grubundaki anahtarlardir (`paylasilan/sayfalar/recete-rota.ts`: stock, schema, ops, sureler,
items, res). Alimda yalniz `yeni/` adres parcasi duser. Planlama grubu (plan, studio, ysiparis ...) bu ekranda yoktur; ayri istir.
Envanter: `degerlendirme/ts-gecisi/envanter/recete-rota.md` (proje dosyalari). Cerceve dosyalari (`cerceve/`, `ReceteRotaCercevesi.tsx`,
`cerceve-kopru.ts`) alima kadar degismez.

| Parca | Klasor | Disari verilen bilesen (adi degismez; sekmeler.ts ithal eder) | Sekme anahtari | CSS oneki |
|---|---|---|---|---|
| R1 | rotalar/ | `UrunVeRotalar`, `Operasyonlar` | schema, ops | tc-rr1- |
| R2 | kaynaklar/ | `Sureler`, `Malzemeler`, `Kaynaklar` | sureler, items, res | tc-rr2- |
| R3 | emirler/ | `UretimEmirleri`, `Stok` | orders, stock | tc-rr3- |

Her bilesen `(o: EkranOzellikleri) => JSX` imzasindadir. R0 her klasore yer tutucu `index.tsx` koyar; parca o dosyayi ve klasorunu
sahiplenir. Parca yalniz kendi klasorune ve `ekran-testleri/recete-rota-yeni.spec.ts` icinde kendi `test.describe('R<n> ...')` bloguna yazar.
Kendi css dosyasi ve saf hesaplari (`kurallar.ts`, birim testli) kendi klasorundedir. Iskelet dosyalarina dokunulmaz; eksik islev
iskelet sahibine istek olarak gelir.

## R0'in sabit imzalari (parcalar kullanir, degistirmez)
- `sekmeler.ts`: `EkranOzellikleri { veri: RrVerisi; yetki: RrYetkisi; git(anahtar, kimlik?); kimlik: string | null }`.
  `git('schema', urunId)` baska bolume gecer ve secili kaydi verir (emirden urunun semasi, semadan operasyon). Baslik ve sekme seridini
  `ReceteRotaYeni` cizer; parca baslik cizmez, kendi arac cubugunu (`Tablo` araci, `Dugme`) kendisi cizer.
- `veri.ts`:
  - `useRrVerisi()`: `RrVerisi { durum: RrDurumu; ek: KaynakEki }`. `durum` = `GET /recete-rota/durum` (sozlesme `durumCevabi`) +
    `planYerlesim` (`/plan/motor-yerlesimi`, 215 a). `ek` sahiplerin kaynak okumalarindan: makine notu, kisi gorevi, istasyon tipi,
    kapasite kaynagi, vardiya takvimi, kapasite. Okuma yetkisi olmayan dilim null'dir; sifir yazilmaz.
  - `useRrKomutu()`: `mutateAsync({ ad, govde })`. Ad `kopru.ts` `IZINLI_KOMUTLAR` tablosundandir (tabloda olmayan gitmez); govde
    bugunku cercevenin gonderdigi alanlarla. Kural, yetki ve surum denetimi sahibinin ucundadir; surumler kopru icinde tutulur, parca
    surum yazmaz (`beklenenSurum` alan komutlari haric: statu tanimi). Basarida durum onbellege yazilir. Hata `RrHatasi { message, durum,
    eskiSurum, alan }`; eski surumde veri kendiliginden yeniden okunur. Ileti parcanin isidir (`useBildirim`).
    Emir acilisi (`emir-ac`) proje secimini kendisi sorar (bugunku pencere, 224); parca pencere yazmaz.
  - `useStokOkumasi(malzemeIdler)` (R3): statulu stok ve bakiye satirlari, en cok 200 kart.
  - `useSureler(revizyonId, makineId?)` (R2): rota modulunun sure gorunumu.
  - `useEskiKayit()` (R2, Malzemeler "kartsiz eski kayitlar"): kayit belgesinin ana anahtari, YALNIZ OKUNUR (204 a). Yeni ekran
    `/recete-rota/kayitlar/yaz|sil` cagirmaz.
- `yetki.ts`: `RrYetkisi { oku, yaz, rotaYaz, rotaOnayla, rotaEmreKopyala, emirYaz, stokOku, stokStatuDegistir, stokSayim, stokGiris,
  istasyonYaz, kisiYaz, planYaz, maliyetOku, maliyetYaz, herhangiYazma }`. Her bayrak komutu alan modulun islemidir; `yaz`
  (`recete-rota.yaz`) yalniz Recete ve Rota'nin kendi tablolaridir (statu tanimi, statulu kart). Islemi olmayan dugmeyi gormez;
  "yalniz bu sekmede" kipi yoktur (210.8). Ekran yalniz gizler; denetim uctadir.
- `bicim.ts`: `sayi`, `miktar(v, birim)`, `dakika`, `tarih`, `zaman`, `YOK` ("—").
- `test-ortak.tsx`: `sunucuKur(kullanici, { durum, kayitlar, motorYok, yazmalar })`, `rrAc(adres)`, `ornekDurum()` (uydurma),
  kullanicilar `YONETICI`, `OKUYAN`, `SAYFASIZ`, `KAPISIZ`.

## Parca gorevleri (envanter bolum 2; her madde DEVIR'de isaretli liste)
- R1: 2.3 Urun ve rotalar (urun listesi, akis semasi tuvali modulun kendi bileseni, duzenleme paneli (dar ekranda alttan acilan panel), revizyon cubugu ve
  onay dugmeleri `rotaOnayla` ile, statulu kart, yeni malzeme `/malzemeler/yeni`'ye gider) ve 2.4 Operasyonlar. Tarayici kurallari
  (`rotaEksikleri`, `islemSuresiEksik`, `girdiOlur`, `stepFactors`, `matCost`) saf TS `rotalar/kurallar.ts` (205 a).
- R2: 2.5 Sureler, 2.6 Malzemeler (salt okunur; kartsiz eski kalemler `useEskiKayit` ile, yazmasiz), 2.7 Kaynaklar (haftalik vardiya
  matrisi modulun kendi bileseni; sahibine yonlendirilen alanlar yalniz okunur, baglanti sahibinin sayfasina).
- R3: 2.1 Uretim emirleri ve 2.2 Stok. Emir tarihi `durum.planYerlesim`'den; okunamazsa bos (215 a). Eksik malzeme hesabi saf islev
  `emirler/kurallar.ts`; ikinci motor (`planRun`) tasinmaz. "Eksikleri teslim al" yoktur; yerine Satin Alma talebine baglanti (227 a).
  Yerel yol (elle eldeki miktar, `moveStatus`, `undoBatch`) yoktur (208 a).

## Kurallar (her parca)
- TASARIM KORUMA (2026-10-24 19:19, kullanici): ekranlarin tasarimi kullanicinindir. TS gecisinin amaci yalniz TypeScript'e gecis ve mantik, kurgu ve
  bozukluk hatalarinin duzeltilmesidir. Prototip ya da eski ekranin gorunusu, duzeni, akisi, araclari ve metinleri birebir korunur. 360 genislige
  sigdirma, ortak parcaya tasima, sadelestirme ya da "daha iyi" gerekcesiyle degisiklik yapilmaz; ortak parca yalniz gorunus birebir kaliyorsa
  kullanilir. Fark yalniz mantik/kurgu/bozukluk hatasi, guvenlik ya da onayli bir karar (orn. 357 b) gerektirdiginde yapilir; her fark gerekcesiyle ve
  "hata turu" belirtilerek soru olur, varsayilan oneri "eski hali kalsin"dir. Bu dosyadaki 203 a, ortak bilesen ve 360/768/1280 maddeleriyle celisirse
  TASARIM KORUMA gecerlidir (kurulum/proje-talimati.md KURALLAR 3).
- 203 a: tasarim degiskenleri, ortak bilesenler (`Tablo`, `Sayfalama`, `Pencere`, `FormPenceresi`, `OnayPenceresi`, `Sekmeler`, `Rozet`,
  `SayiKarti`, `useBildirim`), ortak `Simge`; 360/768/1280. Sabit renk, olcu, satir ici stil yok (statu rengi veridir, istisna degil:
  `Rozet` ya da css degiskeniyle verilir).
- 208 a: olcut bugun calisan (bagli) yoldur; yerel yol ve kaldirilan operator ekrani tasinmaz.
- 209 a: ana akis `ekran-testleri/recete-rota-yeni.spec.ts` icinde kendi blogunda; testler yer tutucu metnine degil, bolgeye
  (`region` adi sekme basligi) ve icerige bakar.
- Cihaz tercihi (secili alt sekme, daralan panel) yalniz `localStorage`'da, try/catch icinde.
- Fark varsa DEVIR'de numarali "fark" satiri; kullanici onayina gider.

Kabul (parca basina): envanter satiri tam; yazma dugmeleri yetkiye gore gizli, izinli ve reddedilen test; 360/768/1280 olcumu;
ekran testi blogu; `kontrol` yesil.

## Iskelet dosyalari (R0'in; parcalar dokunmaz)
`ReceteRotaYeni.tsx`, `sekmeler.ts`, `veri.ts`, `yetki.ts`, `bicim.ts`, `Hazirlaniyor.tsx`, `recete-rota-yeni.css`, `test-ortak.tsx`,
`ReceteRotaYeni.test.tsx`, `veri.test.tsx`, bu dosya; `../rotalar.tsx`. Eski cerceve dosyalari (`../kopru.ts` ve komut tablolari dahil)
bu iste degismez; komut eklenmesi gerekirse koordinatorden ayri kilitle.
