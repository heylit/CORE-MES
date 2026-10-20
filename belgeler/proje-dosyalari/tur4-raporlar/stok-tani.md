# Stok ve depo: tani, cakisma taramasi, yerlestirme (kart #206)

Salt okuma rapor. Depoya kopyalama, dal, commit yok. Kaynak: `/mnt/project-files/TMICOREV2-TESLİMLER/teslim-stok 08.10.2026 12.55` (63 dosya, 800 KB).
Depo: `heylit/TMICOREV2` main `f4d1837` (2026-10-08 14:47). `npm run harita` "Goc sirasi (42)": son goc `20261008111500_istasyonlar_operasyon_tipi_surum.sql`.
Etiketler: DOGRULANDI (dosya + capa ya da komut), VARSAYIM (gerekce), BILMIYORUM.

## Tani (adim 1)

- Ad: `stok` (Stok Merkezi). Kapsam (tek cumle): depo, raf, konum ve goz tanimi; mal kabul, tasima, cikis, sayim, uretim girisi; parti izi; okut, sepet ve fis, toplama; 2B yerlesim ve 3B depo.
- Klasorler: `sunucu/moduller/stok/`, `istemci/src/moduller/stok/`, `paylasilan/{sozlesme,islemler,sayfalar}/stok.ts`, `sunucu/gocler/*_stok_*.sql`. Depoda bugun yalniz `paylasilan/sayfalar/stok.ts` (tek sayfa, ikinci menu yok) var; modul klasoru yok (DOGRULANDI `ls sunucu/moduller`).

## a) Dosyanin icinde ne var

| Tur | Dosyalar |
|---|---|
| Sunucu kodu | `uclar.ts` (52 uc: GET 28, POST 24), `servis.ts`, `sorgular.ts`, `kurallar.ts`, `disari.ts` (3 fonksiyon) |
| Istemci kodu | 39 dosya: 27 ekran (`IsKutusu`, `MalKabul`, `Okut`, `Sepet`, `Toplama`, `Depo3B`, `YerlesimDuzenleyici`, `Raflar`, `RafMatrisi`, `Konumlar`, `DamaTahtasi`, `Etiketler`, `Hareketler`, `Malzemeler` ...), `stok.css`, saf yardimcilar (`yerlesim.ts`, `depo3b-yerlesim.ts`, `depo3b-sahne.ts`, `ambalaj.ts`, `kamera.ts`) |
| Paylasilan | `sozlesme/stok.ts`, `islemler/stok.ts` (7 islem), `sayfalar/stok.ts` (`STOK_SAYFALARI` + `STOK_IKINCI_MENU`, 4 grup 11 madde, sayac ucu) |
| Goc | 5 dosya, 19 tablo: `20261007160000_stok_tablolar` (11), `..170000_stok_sepet_fis` (3), `..180000_stok_toplama` (3), `..190000_stok_yerlesim` (2), `..200000_stok_sayim_suresi` (sutun) |
| Testler | `kurallar.test.ts` (saf), `stok.test.ts` (gercek PostgreSQL), `stok.test.tsx`, `yerlesim.test.ts`, `depo3b-yerlesim.test.ts` (1187 satir) |
| Belgeler | `FARK.md`, `ON-PAKET-stok.md` (2.4), `KURAL-TEST.md` (51 DEP satiri), `CEKIRDEK-ISTEKLERI.md`, `BASKA-MODUL-ISTEKLERI.md`, `NOTLAR.md` (kok ve modul), `UYUM-BORCU.md` (10 madde) |
| Eksik belge | `GUVENLIK-DENETIMI.md`, `ORTAKLIK-stok.md`, `UYGULA.md` yok (DOGRULANDI listeleme). Prototip (onizleme HTML) teslimde yok |

## b) Gelenin turu

Yazilmis kod. Taban `5eb9481` (2026-10-07 15:03) (DOGRULANDI: `FARK.md` "Dayanak 5eb9481", `NOTLAR.md`; servis ve testin ithal ettigi `malzemeAdlari`, `denetimYaz`, `rolAl/rolAta`, `kimlikCozucu` 5eb9481'de var). main bu tabandan 267 commit ileride (`git log 5eb9481..origin/main | wc -l`).

Surum farki: ON-PAKET 2.4 = onayli 2.3 + uc duzeltme (MK no, DEP-20 metni, DEP-53) + kodun pakete farki (32 uc). FARK.md basligi "2.3 (onayli) -> ilk surum kodu" ve 2.3'e gore farki yazar; celiski degil, ayni seyin iki yuzu. Ama ikisi de koddan geride:
- ON-PAKET 2.4 "Kod, goc, test yok" ve 32 uc, 11 tablo der; Okut, Sepet, Toplama, 3B, yerlesimi "S (sonraki surum)" sayar. Kodda 52 uc, 19 tablo, bunlarin hepsi var (FARK 16-29).
- FARK.md son satiri "Teslimde olmayan: 3B depo, 2B yerlesim, QR okutma, toplama, sepet ve fis" der; ayni dosyanin 16-19. satirlariyla celisir (eski satir kalmis).
- ON-PAKET ust bloku dayanagi `0e72bae` der, 2.4 bolumu `5eb9481`. FARK numaralari 7 ve 8'i atlar.
- 2.4'un ve FARK 16-29'daki "kullanici karari" ifadelerinin onayi bu depoda yok: BILMIYORUM. Oturtma ilkesine gore gelen oldugu gibi alinir; soru degil, bilgi.
- `ON-PAKET` "Dogrulananlar" 35 akis testi ve 496 ekran testini 5eb9481'de Node 22 ile yesil yazar; bunun 16-29 eklenmeden once mi sonra mi kosuldugu BILMIYORUM. Ben kosmadim (salt okuma).
- Kart #206 eski kurallar karti #37'ye atif yapar; DEP kurallarinin eski kurallardan alinip alinmadigi BILMIYORUM (ON-PAKET isaretlemiyor).

## c) Cakisma taramasi

### Baska modulde olan (oradan okunur)

| Kavram | Sahibi | Stokta nasil | Durum |
|---|---|---|---|
| Malzeme | malzemeler `malzeme_katalog_karti.no` | `malzeme_id integer REFERENCES malzeme_katalog_karti (no)` (8 tablo); ad, kod, tur `malzemeler/disari.ts` | uygun (sabit kimlik) |
| Olcu birimi (OS4) | malzemeler | ekranda yok; "kartta birim yok" (UYUM-BORCU 4) | main'de `katalogMalzemeOzeti.birim` geldi (DOGRULANDI `paylasilan/sozlesme/malzemeler.ts:38`): baglamada kapanir |
| Kisi | kisiler | `kisi_id REFERENCES kisi`, adlar `kisiAdlari` | uygun |
| Uretim emri | uretim-emirleri (disarida) | `uretim_emri_id REFERENCES uretim_emri` (`stok_parti`, `stok_hareketi`, `stok_fis`); ekranda "Emir #id" | yeni emir modeli (emir + is emirleri) gelmeden baglanamaz: baglamada kapanacak. main'de `uretim-emirleri/disari.ts` artik var ve `emirOzeti(db,id): {id, emirNo, durum, istasyonId}` verir (DOGRULANDI); stok `uretimEmriOzeti` (isMerkeziId) ve `emirNolari` bekliyor |
| Is merkezi kapsami (DEP-36) | istasyonlar `kisininIzinliIsMerkezleri` | yazilmadi (UYUM-BORCU 1) | emirden istasyon, istasyondan is merkezi gelince kapanir; baglamada |
| Firma (tedarikci, fason) | finans `finans_firma.id` | yok; belgeler "firmalar modulu" bekler | SABIT KIMLIKLE CELISIR: ayri firmalar modulu yok, kaynak finansin `firmaVarMi`, `firmaAdlari`. Baglamada kapanacak |
| Siparis satiri | satin alma | `stok_mal_kabul_satiri`'nda sutun yok; S'de yeni gocle FK, `teslimAlinanlar(db, siparisSatirIdler: number[])` | satin almada siparis satiri tablosu yok; siparis anahtari `(talep_id uuid, teklif_id uuid)` (DOGRULANDI `20261007230000_satin_alma_tablolar.sql:236`). Imza tutmuyor: STK-2 |
| Para, kur, maliyet (OS5) | finans | tutulmaz; stok degeri "—" | uygun |
| Ayar deposu | ayarlar | sayim suresi `stok_depo_yerlesimi.sayim_suresi_gun` (sayi turu yok) | UYUM-BORCU 6; OS10'a uygun (modulun calisma ayari modulde) |
| Dosya (sertifika, DEP-26) | `dosya` modulu (#82, yok) | yok | baglamada |
| Logo | Logo (fatura ve fis asil kaydi) | yalniz alanlar (`stok_hareketi_logo`, irsaliye satir no, ambar no); baglanti kodu yok | uygun (#205, #206) |

### Yalniz bu modulde olan (sahibi stok, OS7)

Depo (`stok_depo`, Logo ambar no), raf (`stok_raf`), konum ve goz (`stok_konum`), parti (`stok_parti`), bakiye (`stok_bakiye`), hareket defteri (`stok_hareketi`, `stok_hareketi_logo`),
mal kabul belgesi (`stok_mal_kabul`, `_satiri`), malzeme stok ayari ve ambalaji (`stok_malzeme_ayari`, `stok_malzeme_ambalaji`), sepet ve fis (`stok_sepet_satiri`, `stok_fis`, `stok_fis_satiri`),
toplama (`stok_toplama`, `_kalemi`, `_adimi`), yerlesim ve kare adlari (`stok_depo_yerlesimi`, `stok_kare_adi`).

### Belirsiz (sorulacak)

1. Mal kabul iki yerde: stok `POST /stok/mal-kabul` (miktar, parti, goz) ve satin alma `POST /satin-alma-siparisleri/teslim-al` (islem `satin-alma.teslim-al`, tarih + kalite, miktarsiz, stoga yazmaz; DOGRULANDI `sunucu/moduller/satin-alma/uclar.ts:67`, `servis.ts:280`). Depocu ayni teslimi iki ekranda girer. STK-2.
2. Malzeme kartindaki depo yeri ve konum metinleri `kayit.g.depoYeri`, `kayit.g.konum` (DOGRULANDI `ORTAKLIK-malzemeler.md:21`) ile stokun goz ve konumu; ayrica `stok_malzeme_ayari`. STK-3.
3. Istasyon tipi `depo` (`istasyon.tip`, DOGRULANDI `20261006104042_istasyonlar_tesis.sql:16`) ve stokun "uretim alani konumu" (belgeler "atolye modulu" bekler; atolye kapsam listesinde yok). STK-4.
4. Arkon `arkon_belge` depo `logi` (malzeme lojistigi: istek ve cikis, metin) ile stokun sepet, fis ve toplamasi. OS7 sahibi stok der; Arkon gecisi Asama 2 (soru degil, tabloya not).
5. Kalibrasyon `olcu_aleti.yer` metni (DOGRULANDI `ORTAKLIK-kalibrasyon.md:17`) stok konumu mu istasyon mu: Asama 2'de, kalibrasyonla birlikte.
6. S'deki dis cagri kaynak turu `rota_dusumu` (`stokCikisi`): rota tanimdir (sabit kimlik), tuketim kaynagi is emri ya da uretim kaydidir. Bu teslimde kod yok; S tablosu acilirken sorulur (STK-5).

## d) Yerlestirme

- Akis C (tedarik): siparis (satin alma) -> mal kabul (stok) -> stok hareketi; uretime sarf ve uretimden giris (stok, elle; otomatik kaynak S).
- Akis A'ya dokunur: sarf ve uretim girisi emre baglanir (`uretim_emri_id`), parti izi emirden (`emrinPartileri`).
- Ust/alt: stok malzemeler, kisiler, istasyonlar (kapsam), uretim-emirleri, finans'in ustundedir (onlardan okur). Satin alma stokun ustunde olmali (satin alma `teslimAlinanlar` okur; stok satin almaya baglanmaz, ON-PAKET 2.4 #8). Dongu riski: stok satin almanin `disari.ts`'ini okursa (siparis secimi) ve satin alma stoktan okursa dongu olur; ON-PAKET siparis secimini ekranda satin almanin okuma ucuyla yapar (sunucu ithali yok): uygun.
- Stokun istedikleri (imzasiyla):
  - malzemeler: `malzemeOzetleri(db: Db, idler: number[]): Promise<Map<number, KatalogMalzemeOzeti>>`; `malzemeAra(db: Db, g: { metin: string; sayfa: number }): Promise<SayfaliListe<KatalogMalzemeOzeti>>`. (`birim` artik var.)
  - uretim-emirleri (UE listesine): `uretimEmriOzeti(db, id): {id, emirNo, durum, isMerkeziId} | null`, `emirNolari(db, idler): Map<number,string>`. Bugunku `emirOzeti` `istasyonId` doner; kapsam icin istasyon->is merkezi istasyonlardan okunabilir (VARSAYIM).
  - finans: `firmaVarMi(db, id)`, `firmaAdlari(db, idler)` (finans raporundaki imzayla).
  - istasyonlar: `kisininIzinliIsMerkezleri` (var). Uretim alani konumu icin STK-4 cevabina gore.
  - kisiler: rol x islem satirlari (Asama 2, onayla).
- Stoktan istenenler: `stokMiktarlari`, `emrinPartileri`, `konumAdlari` (var); S'de `stokGirisi`, `stokCikisi`, `stokCagrisiniGeriAl`, `teslimAlinanlar`. Satin alma, malzemeler (kart ekraninda stok), plan ve Arkon (malzeme lojistigi) okuyucu olabilir.

## e) Depodaki guncel durumla fark (5eb9481'den sonra degisen kaliplar)

| Kalip | Stok kodu | Sonuc |
|---|---|---|
| Okuma ucu `yetki: { biri: [...] }` (ADR 0007) | 26 okuma ucu `'oturum'` (K3: "stogu giris yapan herkes gorur") | ADR 0007 madde 4 kullanici karariyla `'oturum'`u izinli tutar; K3 bu karar. Uyar; borca not (kural degisirse `biri: ['sayfa.stok']`). Ekrana dokunmaz |
| Ikinci menu satir basina tek giris (#281) | Ç1 diff `IKINCI_MENULER = [STOK_IKINCI_MENU]` (eski bos dizi uzerine) | Uygulanamaz; main'de 9 menu var. Ayri satir eklenir. Ekrana dokunmaz |
| Toplayici dar istisnasi (proje talimati KURALLAR 2) | Ç1'i cekirdekten istiyor | Modul kendi PR'inda ayri commit olarak ekler: `islemler.ts`'e `STOK_ISLEMLERI` satiri, `sayfalar.ts`'te import + `STOK_IKINCI_MENU` satiri. Cekirdek PR gerekmez |
| Tekrar korumasi (`tekrarKorumali`, #188) | hic yok (UYUM-BORCU 7 kendisi yaziyor) | Mal kabul, cikis, tasima, sayim, uretim girisi, sepet teslim/stoktan dus, toplama adimi cift yazabilir. Borc "kullanima acmadan once"; ekrana dokunmaz (istemci `useStokKomutu` + uc bayragi) |
| Denetim eki `denetimEki` (ADR 0008, #290) | yok | Zorunlu degil (yalniz onceki degeri saklama gerekirse). Mal kabul duzeltmesi ve yerlesim kaydi icin aday; borca not |
| Surum denetimi | `surumluGuncelle` konum, raf, malzeme ayari, toplama, yerlesimde var (DOGRULANDI `servis.ts:162-803`) | uygun |
| Dosya saklama (#82) | sertifika dosyasi yok (DEP-26 bekliyor) | baglamada |
| Goc damgasi | 5 goc `20261007160000..200000`, main'in son gocunden (`20261008111500`) eski | Oturtmada simdiki damgayla yeniden adlandirilir (goc-yaz: "uygulanmis son gocten eski damgali yeni goc reddedilir"). Icerik degismez |
| `test:modul` Linux (Ç5) | elle koşuldu | main'de duzeldi (`65901d0`, `4765450`): Ç5 kapanir |
| `rolAl/rolAta` | test 5eb9481 imzasiyla cagiriyor | main'de `rolAlYetkili/rolAtaYetkili` takma adi, imza ayni, aktor yetkisi ek denetlenir (DOGRULANDI `kisiler/servis.ts:329`); test yonetici aktorle cagiriyor, gecer (VARSAYIM) |
| Simge | `dash, scan, box, list, truck, layers, sort, cube, target, grid, tool` | hepsi sette var (DOGRULANDI `istemci/src/ortak/tasarim/simgeler.ts`); `cart`, `pallet` yok ve kullanilmiyor |
| Node | Node 22 ile kosulmus; depo `>=24` | oturtmada Node 24 ile yeniden kosulur |

## f) Kirmizi cizgi taramasi

Bulgu yok (grep ile, 63 dosya; elle satir satir okuma yapilmadi: VARSAYIM taramanin yeterli oldugu).
- Gercek veri: test ve goc metinleri uydurma (`Deneme sac`, `Eldiven`, `HM-001`, `SR-001`, `Siparis 7781`, `A-01-02`); kisi adi yok; parola sabiti `dogru-parola-1` yalniz test kullanicisi.
- Dis adres, CDN, telemetri: yok. Gecen tek `http://www.w3.org/2000/svg` SVG ad alani (cagri degil). `fetch`, WebSocket, `sendBeacon` yok. Ortam degiskeni okumaz.
- Eski sistem izi: yok (`Planlama`, `4000`, `TMI_YEDEK`, `Desktop` gecmiyor).
- Paket: `three@^0.169.0`, `@types/three@^0.169.0`, `jsqr@^1.4.0`, `qrcode-generator@^1.4.4` istiyor (Ç1b, "kullanici onayladi" diyor; onay bu depoda yok). Durum: `jsqr 1.4.0` ve `qrcode-generator 1.4.4` main `package.json` devDependencies'te sabit surumle zaten var (Arkon icin, `54742f7`): yeni paket degil. `three` yalniz `three-147` (npm:three@0.147.0) takma adiyla var; 0.169 ve `@types/three` YENI: onaysiz alinmaz (STK-1). Bu parca (3B depo: `Depo3B.tsx`, `depo3b-sahne.ts`) onaya kadar oturtulamaz.
- Diger borc (kirmizi degil): `localStorage` cihaz tercihi (`tmi-stok-ekran-modu`, borc 10); `Etiketler.tsx` SVG icinde `#fff/#000`; `depo3b-sahne.ts`'te 23 sayisal renk sabiti (FARK 29 gerekcesiyle). `stok.css` hex 0, inline stil 0.

## g) Oturtma plani

1. PR-0 (cekirdek, ayri kart, yalniz STK-1 onayindan sonra): `package.json` + kilit: `three` ve `@types/three` sabit surum. Onay gelmezse PR-0 yok, 3B depo kapali alinir (STK-1 secenegi).
2. PR-1 (stok, kart #206, dal `206-stok`): butun modul dosyalari oldugu gibi; 5 goc yeni damgayla; ayri commit: `paylasilan/islemler.ts` ve `paylasilan/sayfalar.ts` yalniz stok satirlari; oturtma kiriklari (Node 24, guncel main ile tip/sinir/lint/test). Belgeler: `UYUM-BORCU.md`'ye bu rapordaki "baglamada kapanacak" maddeleri, eksik `ORTAKLIK-stok.md`, `GUVENLIK-DENETIMI.md`, `UYGULA.md` yazilir. Islemler yalniz yoneticide; rol x islem satirlari (BASKA-MODUL-ISTEKLERI K3 tablosu) Asama 2'ye. Buyukluk: ~7800 satir kod + 5 goc; tek PR buyuk, gozden gecirme icin commit'ler sunucu / istemci / goc / toplayici diye bolunur.
3. Kart istekleri (birlesmeyi beklemez): malzemeler `malzemeOzetleri`, `malzemeAra`; UE listesine `uretimEmriOzeti`/`emirNolari` ve "stokun `uretim_emri`'ne FK'si var"; cekirdek Ç2 (ayar sayi turu), Ç3 (ortak 3B), Ç6 (depocu sade menu).
Sira: finans firma PR'inden bagimsiz (stok firmaya bugun baglanmiyor); satin alma ile ortak dosya yalniz toplayicilar, sirayla. Onerim: STK-1 cevabindan sonra PR-0, ardindan PR-1.

## Sorular

- STK-1. `three` surumu. Neden: 3B depo `three@0.169` + `@types/three` istiyor; depoda yalniz `three-147` (0.147) var, yeni surum yeni paket sayilir. Secenekler: (a) `three 0.169.0` ve `@types/three 0.169.0` sabit surumle eklensin; (b) 3B depo var olan `three-147`'ye baglansin (modulde ithal satirlari degisir, ekran degismez; tip paketi yine gerekir); (c) 3B depo simdilik kapali alinsin, borca yazilsin. Oneri: (a); iki surum pakette yan yana durur ama Arkon ve katalog etkilenmez.
- STK-2. Satin almadan gelen malin teslimi hangi ekranda alinsin? Neden: stokta mal kabul (miktar, parti, goz) ve satin almada "teslim al" (tarih, kalite) ayri; depocu iki kez girer, siparis anahtarlari da tutmuyor (uuid ikilisi / sayi). Secenekler: (a) teslim stokun mal kabulunde alinir, satin almanin teslim al ucu Asama 2'de mal kabule baglanir ve satin alma `teslimAlinanlar` okur; (b) ikisi ayri kalir. Oneri: (a) (ON-PAKET 2.4 #8 ile ayni).
- STK-3. Malzeme kartindaki depo yeri ve konum metinleri ne olsun? Neden: OS7 depo ve konumu stoka verdi; kartta serbest metin olarak da duruyor. Secenekler: (a) Asama 2'de kartta salt okunur gosterim, deger stokun varsayilan gozunden; (b) metin kartta kalir, stok kullanmaz. Oneri: (a).
- STK-4. Uretim alani konumunun sahibi? Neden: stok "atolye modulu" bekliyor; atolye kapsamda yok, istasyonlarda `depo` tipli istasyon var. Secenekler: (a) uretim alani konumu istasyona baglanir (`istasyonlar`'dan ad ve varlik); (b) atolye modulu gelene kadar kapali. Oneri: (a).
- STK-5. S'deki `rota_dusumu` kaynak turu kalsin mi? Neden: rota tanimdir, tuketim is emri ya da uretim kaydindan dogar. Secenekler: (a) kaldirilir, tuketim kaynagi is emri; (b) kalir. Oneri: (a). Bu teslimde kod yok; karar S tablosu acilmadan gerekir.
- STK-6. Stokun `uretim_emri` tablosuna yabanci anahtarlari (3 tablo) Asama 1'de kalsin mi? Neden: UE disarida ve emir modeli degisecek; tablo degisirse UE'nin gocu stok FK'leriyle carpisir. Secenekler: (a) oldugu gibi kalsin, UE listesine yazilsin; (b) Asama 1'de duz sutun (FK'siz), FK Asama 2'de ayri gocle. Oneri: (a) (gelen oldugu gibi alinir); UE yazari bilgilendirilir.
