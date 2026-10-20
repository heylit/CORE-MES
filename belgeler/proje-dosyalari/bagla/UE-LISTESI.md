# UE listesi: uretim-emirleri'nden istenenler (guncel, 2026-10-09)

uretim-emirleri projenin disinda yazilir; projeden hicbir konu dosyalarina yazmaz. Bu liste disaridaki yazara gider.
Kaynak: ana dal `c73e2d4`. Her maddede istekte bulunan modul ve dosya capasi var. Imzalar istekte bulunan dosyadan aynen; uydurma imza yok.

Bagli kararlar: SH3 a (plan, Arkon ve stok sarfi is emrine; stok parti ve uretim girisi uretim emrine), UE5 (Arkon paketi is emrine), K1 (uretim emri ust kayit, her rota adimi bir is emri), K3 (is emrinin kaynagi makine ya da kisi; istasyon kaynaktan turer), fason rota adimidir (2026-10-09).

Bugunku durum (DOGRULANDI): `uretim_emri` tek istasyonlu, `parca_no`/`parca_ad` metin (`sunucu/gocler/20261007002531_uretim_emirleri_tablolar.sql`); `emir_adimi` yalniz sira, ad, aciklama (kontrol listesi, `20261007094251_uretim_emirleri_adimlar.sql`). Ayri is emri tablosu yok.

## A. Yeni emir modeli (en once; plan, rota, stok, Arkon buna bagli)

UE1. Uretim emri + is emirleri. `uretimEmriAc` (rota istegi K1, `sunucu/moduller/rota/BASKA-MODUL-ISTEKLERI.md` "uretim-emirleri (karar K1)"; gecici karsilik `rota/baglanti.ts:56-77`):
```ts
uretimEmriAc(db: Db, kullanici: Kullanici, g: { malzemeNo: number; adet: number; teslim: string | null; kaynakRotaRevizyonId: number;
  isEmirleri: { sira: number; opNo: number; ad: string; operasyonTipiId: number; kaynak: { tur: 'makine' | 'kisi'; id: number } | null;
    ayarSuresiDk: string | null; birimSureDk: string | null; bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null;
    talimatSurumu: number | null; kontrolListesi: { ad: string; aciklama: string | null }[] }[] }): Promise<{ uretimEmriId: number; isEmriIdleri: number[] }>
```
Komut kendi islemini denetler (oneri `uretim-emirleri.yaz`), rotanin islemi icinde calisir. Bugunku `emir_adimi` is emrinin kontrol listesi olur.

UE2. Uretim emri malzeme kartina bagli: `parca_no`/`parca_ad` metni yerine `malzeme_katalog_karti.no` (sabit kimlik). Istasyon is emrine aittir (K3: kaynaktan turer). Kaynak: rota istegi K1 notu.

UE3. Fason is emri (YENI, kullanici karari 2026-10-09 "fason iscilik rota adimidir"). Fason adimin is emri ic adimdan farkli calisir: operator baslatmaz; sayim yerine gidis ve donus (gonderildi / geldi, adetiyle) kaydedilir; kaynagi makine ya da kisi degil fason isaretli firma (`finans_firma.id`), alimi alinan hizmet kartiyla satin almadan yapilir; sure yerine termin gunu. Rota tarafindaki karsiligi rota konusunun listesinde (kaynak turu, sema); imza (ana dal `sunucu/moduller/rota/baglanti.ts` `UretimEmriGirdisi`): UE1'deki is emrinde `kaynak: { tur: 'makine' | 'kisi' | 'fason'; id: number } | null` (fason: `finans_firma.id`), yeni `terminGun: number | null` (yalniz fasonda, takvim gunu), fasonda `ayarSuresiDk`/`birimSureDk` null; hizmet karti no sonra eklenecek. BILMIYORUM: gidis/donus kaydinin alanlari (kullaniciya sorulacak).

## B. Plan icin (`sunucu/moduller/plan/BASKA-MODUL-ISTEKLERI.md` "uretim-emirleri (K1, P3)"; gecici karsilik `plan/baglanti.ts`)

UE4. `planlanacakIsEmirleri(db: Db): Promise<PlanIsEmri[]>`; `PlanIsEmri = { id; uretimEmriId; emirNo; malzemeNo; adet; teslim: string | null; kaynakRotaRevizyonId; sira; opNo; ad; kaynak: { tur: 'makine' | 'kisi'; id } | null; ayarSuresiDk: string | null; birimSureDk: string | null; bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null; durum: 'planli' | 'basladi' | 'bitti' | 'iptal' }` (iptal haric).

UE5. `isEmriKaynagiYaz(db: Db, kullanici: Kullanici, isEmriId: number, kaynak: { tur: 'makine' | 'kisi'; id: number }): Promise<void>`: planin yerlestirdigi kaynak is emrine yazilir, terminal o kaynagi gorur; komut kendi islemini ve emrin acik oldugunu denetler. Bir kaynakta ayni anda tek calisan is kurali uretim-emirleri'nde kalir.

## C. Arkon icin (`sunucu/moduller/arkon/BASKA-MODUL-ISTEKLERI.md` "uretim-emirleri" 1-6; sozlesme testi `uretim-emirleri-sozlesme.test.ts`)

UE6. Is emri duzeyinde Arkon fonksiyonlari (Arkon 4, UE5): `acikEmirler`, `emirOzeti` karsiliklari is emri duzeyinde; `emirBaslat`, `emirDevam`, `emirDuraklat`, `emirDurdur`, `emirSayim`, `emirBitir` is emri kimligiyle. Bugunku imzalar ve `KOMUT_ISLEMI` gecis bitene kadar korunur (kok `BASKA-MODUL-ISTEKLERI.md` madde 5).
UE7. `EmirOzeti`'ne istege bagli `calisma` alani (`calisiyor`, `durakli`, `durdu`) (Arkon 1).
UE8. Hurda eksi duzeltmesi: `emirSayim` hurdada eksiyi kabul etsin ya da ayri hurda duzeltme komutu (Arkon 2).
UE9. Komutlara istege bagli `olayZamani` (Arkon 3): cevrimdisi sayim varis aniyla sayilmasin.
UE10. Istege bagli `emirAdlari(db, idler)`: emir no ve parca adi toplu (Arkon 5; acil degil).
UE11. Toplu durum: `emirDurumlari(db, idler): Map<id, EmirDurumu>` (Arkon 6; acil degil).

## D. Stok icin (`sunucu/moduller/stok/BASKA-MODUL-ISTEKLERI.md` "uretim-emirleri"; stok borc 1, 3, 11)

UE12. `emirNolari(db: Db, idler: number[]): Promise<Map<number, string>>` (ekranda "Emir #<kimlik>" yerine emir no).
UE13. Sarfin baglanacagi is emri kimligi ve is emrinin istasyonu (SH3 a; DEP-36 kapsami). Bugunku `emirOzeti(db, id)` (`id, emirNo, durum, istasyonId`) yeni modelde kalmali ya da karsiligi bildirilmeli; stok `emirVarDenetle` ile kullaniyor.
UE14. Parti ve uretim girisi uretim emrine bagli kalir (SH3 a); uretim emri ozeti/varlik fonksiyonu.

## E. Diger

UE15. Okuma uclari `yetki: { biri: [...] }`: `GET /uretim-emirleri`, `GET /uretim-emirleri/:id` -> `sayfa.uretim-emirleri`; `GET /terminal/isler` -> `sayfa.terminal`; her uca izinli ve reddedilen test (kok `BASKA-MODUL-ISTEKLERI.md` 1-3).
UE16. Istasyon adlari `istasyonAdlari(db, idler)` ile (bugun her okumada butun istasyonlar cekiliyor) (`istasyonlar/BASKA-MODUL-ISTEKLERI.md` 2).
UE17. Is emri operasyon tipi tasiyacaksa `operasyonTipleri(db, { pasiflerDahil }?)` okunur, bag `istasyonlar_operasyon_tipi.id` sayi kimligiyle (`istasyonlar/BASKA-MODUL-ISTEKLERI.md` 3).
UE18. Terminal ekrani yeni "istasyonda tek calisan" kuralini bilmiyor (duraklamis varken "Isi Baslat" kapali; duraklamista "Durdur" 409) (`uretim-emirleri/NOTLAR.md`; disaridaki ekran isi).
UE19. Adimli emir uclari (rota istegi K2, `sunucu/moduller/rota/BASKA-MODUL-ISTEKLERI.md` "Rota sayfasindaki oteki bolumlerin bekledigi uclar"): rota sayfasinin "Uretim emirleri" bolumu (`istemci/src/moduller/rota/EmirlerEkrani.tsx`) `/adimli-emirler*` uclarini bekler; beklenen sozlesme kopyasi `istemci/src/moduller/rota/beklenen/uretim-emirleri-adimli.ts` (`rotadanEmirGovdesi`, `adimliEmirOzeti`, `adimliEmirAyrintisi`, `adimIstasyonuGovdesi`, `uygulamaCevabi`). Sahibi sozlesmesini verince kopya kalkar.

## Bu listeye bagli projedeki borclar
Rota B6 ve plan P-B1/P-B8 (UE1, UE4, UE5); stok borc 11 ve plan P-B2 FK goclari (UE1, UE13, UE14); Arkon `arkon_tmi_yansima.emir_id` FK ve `tmi-ue-<id>` -> is emri (UE6); fason adim (UE3).
