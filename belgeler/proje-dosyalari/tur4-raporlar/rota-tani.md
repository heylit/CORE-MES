# Rota tanisi (kart #260) — YENI MODUL GELINCE adim 1-3

Salt okuma. Depo: heylit/TMICOREV2, main `f4d1837` (DOGRULANDI: `git log -1 origin/main`); taban `c2c9871`'den beri 142 commit.
`npm run harita` "Goc sirasi" (DOGRULANDI, `npm ci` sonrasi): 42 goc, son `20261008111500_istasyonlar_operasyon_tipi_surum.sql`.
Kaynak: `/mnt/project-files/TMICOREV2-TESLİMLER/teslim-rota-plan-c2c9871 08.10.26 14.34/` (78 dosya, hepsi okunabildi; rota ve plan ayni klasorde).
Rota ve plan ayrimi: belgeler `-rota` / `-plan` ekli; kod dosyalari cakismaz (UYGULA.md). Plan ekranlari ROTA istemcisinin icindedir (karar P2); ayrintisi `plan-tani.md`.

## 1. Tani

- Ad `rota`. Kapsam: mamul ve yarimamulun revizyonlu rotasi (adimlar, bagimlilik, makine ya da kisi kaynagi, aday kaynaklar, sure), adima bagli recete (bilesen, yan urun), is talimati (surumlu), urun agaci, revizyon farki, onay akisi (dort goz) ve rotanin emre kopyalanmasi.
- Klasorler: `sunucu/moduller/rota`, `istemci/src/moduller/rota`, `paylasilan/{sozlesme,islemler,ayarlar,sayfalar}/rota.ts`, goc `20261008090000_rota_tablolar.sql`.

## a) Dosyanin icinde ne var (yalniz rota parcasi)

| Tur | Dosyalar |
|---|---|
| Sunucu | `servis.ts` (37 KB), `sorgular.ts` (17 KB), `kurallar.ts` (20 KB), `uclar.ts` (19 uc: 10 GET, 9 POST), `disari.ts`, `NOTLAR.md`, `UYUM-BORCU.md` (B1-B10) |
| Goc | `20261008090000_rota_tablolar.sql`: 8 tablo (rota_revizyonu, rota_revizyonu_duzenleyen, rota_op_numarasi, rota_adimi, rota_aday_kaynagi, rota_bileseni, rota_yan_urunu, rota_talimati), 2 fonksiyon, 12 tetikleyici |
| Paylasilan | `sozlesme/rota.ts` (15 KB), `islemler/rota.ts` (4 islem), `ayarlar/rota.ts` (`rota.dort-goz`), `sayfalar/rota.ts` (var olan sayfa + `ROTA_IKINCI_MENU`, 3 grup 10 madde, sayac ucu) |
| Istemci | 36 dosya (~4450 satir): RotaEkrani, AkisSemasi, AkisTablosu, AdimPaneli, RevizyonSeridi, UrunAgaci, TalimatPenceresi, MalzemeSecici; baska modul bolumleri EmirlerEkrani, KaynaklarEkrani, OperasyonlarEkrani, MalzemelerEkrani; plan bolumleri PlanEkrani, KanbanEkrani, PlanStudyosuEkrani (plan-tani.md); `beklenen/` 3 kopya sozlesme (istasyonlar-plan, uretim-emirleri-adimli, vardiya); 5 css |
| Testler | `kurallar.test.ts` (24 saf), `rota.test.ts` (22, gercek PostgreSQL), `Rotalar.test.tsx` (19 ekran, plan bolumleri dahil) |
| Belgeler | FARK-rota, CEKIRDEK-ISTEKLERI-rota, BASKA-MODUL-ISTEKLERI-rota, KURAL-TEST-rota (RT-01..RT-68), ON-PAKET-rota (surum 8, kararlar K1-K3), ORTAKLIK-rota, GUVENLIK-DENETIMI-rota, UYGULA-rota, UYGULA (ortak) |
| Eksik | Prototip (`Recete_ve_Rota_Motoru.html`) teslimde yok. FARK-rota `beklenen/plan.ts` sayiyor; dosya teslimde yok, FARK'in "Guncelleme" bolumu silindigini yaziyor (tutarli). |

## b) Gelenin turu

Yazilmis kod, taban `c2c9871` (UYGULA-rota.md basligi; ON-PAKET-rota "taban c2c9871"). Onceki "rotalar" teslimini (92f8f76) yerine gecer; depoda rota modulu yok, yalniz sayfa tanimi `paylasilan/sayfalar/rota.ts` var (DOGRULANDI). Yazarin kostugu (calisma kopyasinda, gecici karsiliklarla): rota sunucu 45/45, istemci 19/19, `kontrol` 1014/1014 + 34 dosya, sinir 0 ihlal (FARK-rota). Benim tarafimdan CALISTIRILMADI (salt okuma; depoya kopyalanmadi).

## c) Cakisma taramasi

**Baska modulde olan (oradan okunur)**
- Malzeme: `rota_*.malzeme_id -> malzeme_katalog_karti(no)` — SABIT KIMLIK ile uyumlu (DOGRULANDI goc). Ad, kod, tur `malzemeOzeti` ile (main'de var).
- Makine: `makine_id -> makine`; istasyon tutulmaz, makinenin istasyonundan okunur (istasyonlar; uyumlu).
- Kisi: `kisi_id -> kisi` (kisiler; uyumlu). Kisinin istasyonu istasyonlardan istenir (`istasyonKisileri`, main'de YOK).
- Operasyon tipi: `rota_adimi.operasyon_tipi_id` FK'siz; istasyonlardan okunur — OS1 "operasyon tipi istasyonlarda" ile yonu uyumlu, SEKLI UYUMSUZ (asagida C2).
- Birim: rota tutmaz, `malzemeBirimleri` ister (OS4 olcu birimi malzemelerde — uyumlu).
- Uretim emri / is emri: rota tutmaz, `uretimEmriAc` ile UE'ye yazdirir (K1; SABIT KIMLIK "rotayi emre UE kopyalar" ile yon olarak ayni: emri UE yazar, tetigi rota ucu verir).
- Ayar: `rota.dort-goz` ayarlar modulunden `sistemAyariOku` ile (OS10 ile uyumlu).

**Yalniz bu modulde olan (sahibi rota)**
- Rota revizyonu, durum akisi, OP numarasi defteri, rota adimi (sure, bagimlilik, devir, fire, makine kullanimi), aday kaynak, is talimati (surumlu), urun agaci hesabi, revizyon farki.

**Belirsiz (sorulacak) — 3 madde (sorular bolum g'de)**
- C1. Recete (BOM): rota `rota_bileseni`, `rota_yan_urunu` ile adima bagli recete tutuyor. OS1 "recete malzemelerde kalir"; malzemelerde `kayit.bom[]` ve `kayit.ops[]` (operasyon sirasi, sure) var (DOGRULANDI `sunucu/moduller/malzemeler/ORTAKLIK-malzemeler.md` "Rota ve recete" satiri). OS1 ile dogrudan celisir; ayni kavram iki modulde.
- C2. Operasyon tipi katalogu: main'de `istasyonlar_operasyon_tipi (id, kod, ad, grup, aktif, surum)`, kod `^[A-Z0-9][A-Z0-9._-]{0,23}$`, 60+ satir tohum (LZR, TRN, FRZ...; karar I2, kart #186), ekran #306, uc `GET/POST /operasyon-tipleri` (DOGRULANDI goclar 20261008050100/050200/111500, `disari.ts` `operasyonTipleri`). Rota bekliyor: tablo `operasyon_tipi`, kod kucuk harf (`depo_girisi`, `uretim`, `muayene`, `tesviye`, `markalama`, `ozel_proses`, `yuzey_islem`, `sevk`), `kisaltma`, `varsayilanAyarDk`, `varsayilanBirimDk`, `varsayilanIstasyonId`, `sira`, fonksiyon `operasyonKatalogu`. Ayni URL, farkli sekil: Rota "Operasyonlar" bolumu bugunku ucla bozuk okur ve POST 400 alir; rota "standart taslak" 8 kodu bulamaz.
- C3. Rota sayfasi baska modullerin ekranlarini tasiyor (K2): Uretim emirleri (UE), Plan, Plan studyosu, Kanban (plan), Operator ekrani (SABIT KIMLIK: operator ekrani Arkon), Stok (OS7: stok), Operasyonlar (istasyonlar #306 ekrani ile ayni is), Malzemeler (malzemeler sayfasi), Kaynaklar (istasyonlar ekranlari + vardiya; OS3: vardiya personel-vardiya / simdilik Arkon). Hedefteki "modul ana menude tek sayfa, baskasinin kavramini kopyalamaz" ile celisir; teslim bunu "kullanici karari K2" diye yaziyor.

**SABIT KIMLIK ve OS1-OS10 ile celisen her sey (tek tek)**
1. OS1 recete malzemelerde — rota recete tutuyor (C1).
2. OS1 operasyon tipi istasyonlarda — yon uyumlu, sema uyumsuz (C2).
3. Sabit: operator ekrani Arkon — rota menusunde "Operator ekrani" maddesi (yer tutucu, "bu turda yok") (C3).
4. OS7 depo ve stok — rota menusunde "Stok" maddesi (yer tutucu) (C3).
5. OS3 vardiya personel-vardiya, simdilik Arkon — Kaynaklar bolumu `/vardiyalar`, `/vardiya-takvimi`, `/takvim-gunleri` uclarini bekliyor (yoklar, "modulu bekleniyor") (C3).
6. Sabit: "uretim emri mamul ya da yari mamul icin, altinda is emirleri; rotanin her adimi bir is emri; istasyon is emrine ait" — rota K1 ayni modeli istiyor; ancak K3 ile is emrinin kaynagi istasyon degil makine ya da kisi. "Istasyon is emrine aittir" ile ince fark: istasyon makinenin/kisinin istasyonundan turetilir (VARSAYIM: celiski degil, ayrinti; UE kararina kalir).
Celismeyenler: malzeme no, kisi, makine/istasyon, OS4 birim, OS10 ayar.

## d) Yerlestirme

- Akis A (uretim): malzeme karti -> **rota** -> uretim emri -> is emirleri. Akis B (plan) rota surelerini ve aday kaynaklari okur.
- Altinda (rota cagirir): malzemeler, istasyonlar, kisiler, uretim-emirleri, ayarlar; altyapi: denetim, istek-kimligi, oturum. Ustunde: plan (`revizyonGetir` cagirir). Katman tablosu onayli degil (ADR 0006 "Katman tablosu: Henuz yok"); arac yalniz donguye bakar.
- Rotanin baska modullerden istedigi (imzalar BASKA-MODUL-ISTEKLERI-rota.md'den; main'de durum DOGRULANDI `grep disari.ts`):
  - istasyonlar: `operasyonKatalogu(db): Promise<{id; kod; ad; kisaltma; varsayilanAyarDk: string|null; varsayilanBirimDk: string|null; aktif; sira}[]>` — YOK (main'de `operasyonTipleri(db, {pasiflerDahil})` -> `{id, kod, ad, grup, aktif}`). `istasyonKisileri(db): Promise<{kisiId; istasyonId}[]>` + tablo `istasyon_kisisi` — YOK. Var olanlar: `aktifIstasyonlar`, `istasyonlar`, `istasyondakiMakineler`, `makineGetir` — VAR.
  - malzemeler: `malzemeAra(db, {metin, turler, yalnizAktif, sayfa}): Promise<(KatalogMalzemeOzeti & {toplam})[]>` — YOK. `malzemeBirimleri(db, nolar): Promise<Map<number,string>>` — YOK. `malzeme_katalog_karti (no, tur)` tekili — YOK. `malzemeOzeti` — VAR.
  - uretim-emirleri (disarida): `uretimEmriAc(db, kullanici, {malzemeNo, adet, teslim, kaynakRotaRevizyonId, isEmirleri[...]}): Promise<{uretimEmriId; isEmriIdleri}>` — YOK; UE listesine.
  - kisiler: `kisiAdlari`, `kisileriListele` (+ testte `rolAl`, `rolAta`, `yoneticiOlustur`) — VAR; `rolAl/rolAta` artik aktor yetkisini denetliyor (`rolAlYetkili`, ea647c5), test kurulumu buna gore oturur.
  - ayarlar `sistemAyariOku`, denetim `denetimYaz`, istek-kimligi `tekrarDeposu`, oturum `kimlikCozucu` — VAR.
- Baska modullerin rotadan istedigi: plan `revizyonGetir` (rota `disari.ts` aciyor). Rota `disari.ts`: `revizyonGetir`, `yururluktekiRevizyon`, `gecerliTalimat`, `adimBilesenleri`, `urunAgaci` + saf hesaplar. Koordinatorun beklenen adlari (`yururluktekiRota`, `rotaRevizyonu`, `rotasiVarMi`) yok; karsiliklari `yururluktekiRevizyon`, `revizyonGetir`; `rotasiVarMi` yok (VARSAYIM: `yururluktekiRevizyon !== null` ile karsilanir, istek olarak yazilir).

## e) Depodaki guncel durumla fark (c2c9871 sonrasi kaliplar)

| Kalip | Durum | Ekrana dokunur mu |
|---|---|---|
| Okuma uclari `yetki: { biri: [...] }` (ADR 0007) | UYMUYOR: 10 GET ucu `'oturum'` (DOGRULANDI `uclar.ts`). ADR 0007 madde 4: oturum yalniz kendi kaydi ya da herkesin gormesi gereken veri. Asama 1: yetki bulgusu, borca. | Hayir |
| Ikinci menu `paylasilan/sayfalar/<modul>.ts`, toplayicida satir basina tek giris (#281) | UYAR: `ROTA_IKINCI_MENU` ayni dosyada, `as const satisfies IkinciMenuTanimi`; simgeler (tool, list, chart, layers, play, grid, box, edit, cube, cpu) istemci setinde var (DOGRULANDI `simgeler.ts`). Toplayici satiri cekirdek istegi (dar istisna: ayri commit). | Hayir |
| Toplayici dar istisnasi | Teslim toplayiciya dokunmuyor, istek olarak yaziyor (islemler.ts, ayarlar.ts, sayfalar.ts IKINCI_MENULER) — uyumlu; oturtmada ayri commit. | Hayir |
| Tekrar korumasi | UYAR: `taslak-ac`, `kopyala`, `emre-kopyala` `tekrarKorumali: true`. | Hayir |
| denetimEki (#290, ADR 0008) | Gerekmez: butun yazma uclari tam denetimli; `TAM_DENETLENMEYEN_UCLAR` degismez. | Hayir |
| Surum denetimi | KISMI: surum var, ama eski surumde cekirdegin `eskiSurum()` (neden `eski-surum`) yerine kendi `cakisma(...)` iletisi; ortak istemcinin eski-surum akisi tetiklenmez. Borca. | Hayir |
| Istasyonlarda surum (20261008050000) | UYMUYOR: Kaynaklar bolumu `/is-merkezleri/:id/guncelle`, `/istasyonlar/:id/guncelle`'ye `surum` gondermiyor -> 400 (DOGRULANDI `KaynaklarEkrani.tsx:148`, `istasyonGuncellemeGovdesi = ...extend(beklenenSurum)`). `rota.test.ts:264` ayni nedenle kirilir. | Evet (ekran govdesi) — duzeltilmez, borca |
| Operasyon tipi katalogu ve ekrani (#306) | UYMUYOR: C2. | Evet (Operasyonlar bolumu) |
| Dosya saklama (`dosya`, #82) | Ilgisiz: rota dosya saklamiyor (talimat duz metin). | — |
| Goc damgasi | UYMUYOR: `20261008090000` < main son goc `20261008111500`; sinir araci "damga eski" der (DOGRULANDI `araclar/sinir-denetimi.ts:553`). Yeniden damgalanir. | Hayir |
| Adlandirma | Tablo ve kisitlar `rota_` onekli; iki fonksiyon `rotalar_*` (onceki modul adi). Borca (not). | Hayir |
| Okunan baska modul uclari | Kaynaklar/Operasyonlar `GET /istasyonlar`, `/makineler`, `/operasyon-tipleri` main'de `biri:sayfa.istasyonlar|istasyonlar.yaz`: yalniz rota sayfasi olan kisi 403 alir. Borca. | Hayir |

## f) Kirmizi cizgi taramasi

Bulgu yok (0). Taranan: `https?://` (0), `@import`/`url(` css (0), `dangerouslySetInnerHTML`/`eval`/`fetch(`/`localStorage` (0), eski sistem izi (`Desktop`, `:4000`, `tmi_`, `TMI_YEDEK`) (0), parola/anahtar (yalniz testte `PAROLA` sabiti, depodaki kalip). Test verisi hep "Deneme ..." ve uydurma kod (`MM-MAM-00001`, `HM-AAA-00001`, `RT-MA`). Yeni paket yok: ithal edilenler fastify, zod, react, @tanstack/react-query, react-router-dom, vitest, @testing-library/react — hepsi `package.json`'da (DOGRULANDI). Inline stil ve ham renk yok (DOGRULANDI grep).

## g) Oturtma plani

Rota istemcisi `#paylasilan/sozlesme/plan.ts` ithal ediyor; plan sunucusu `rota/disari.ts` ithal ediyor. Bu yuzden sira:
1. PR-1 (kucuk): plan sozlesmesi ve islemleri (`paylasilan/sozlesme/plan.ts`, `paylasilan/islemler/plan.ts` + toplayici satiri ayri commit). Plan kartiyla (#261).
2. PR-2 (buyuk, ~7.500 satir): rota (#260) — goc yeniden damgali; sunucu, paylasilan, istemci oldugu gibi; toplayici satirlari (`ROTA_ISLEMLERI`, `ROTA_AYARLARI`, `ROTA_IKINCI_MENU`) ayri commit. Oturtma kiriklari (ekrana dokunmaz): `operasyonKatalogu` icin rota icinde gecici eslem (main `operasyonTipleri` -> kisaltma=kod, sureler null; C2 cevabina gore), `istasyonKisileri` ve `malzemeAra` icin rota icinde gecici karsilik, `uretimEmriAc` yokken emre-kopyala ucu "baglamada" hatasi; testlerde `rolAta` yetkili imza, makine guncellemesinde surum, operasyon tipi kodlari. UE'ye bagli RT-66/68 testi ve Kaynaklar/Operasyonlar yazma akislari UYUM-BORCU'ya.
3. PR-3: plan sunucusu ve goc (plan-tani.md).
4. Ayri istekler (sahibi konulara): istasyonlar (`istasyonKisileri` + tablo; C2'ye gore katalog alanlari), malzemeler (`malzemeAra`, `malzemeBirimleri`, `(no, tur)` tekili). UE listesine: `uretimEmriAc`. Rol x islem onerisi Asama 2'ye (Asama 1'de islemler yalniz yoneticide).

Sorular (yalniz geri almasi pahali olanlar):

R1. Recetenin sahibi kim olsun?
Neden: Rota adima bagli recete tutuyor (`rota_bileseni`, `rota_yan_urunu`); OS1 "recete malzemelerde kalir" diyor ve malzeme kartinda `kayit.bom[]`, `kayit.ops[]` var. Ayni kavram iki modulde; Asama 2 bagi buna gore kurulur.
Secenekler: a) recete ve operasyon sirasi rotada; malzemelerdeki bom ve ops Asama 2'de salt okunur olur ya da kalkar (OS1 degisir)  b) OS1 kalsin: recete malzemelerde; rotanin bilesen ve yan urun tablolari ve ekrandaki recete kismi kalkar (rota sunucusu ve ekrani yeniden yazilir).
Oneri: a (gelen modul esas; adima bagli recete malzeme kartindaki duz listeden zengin). Iki secenekte de Asama 1'de teslim oldugu gibi oturur.

R2. Operasyon tipi katalogu hangi semayla kalsin?
Neden: istasyonlardaki katalog (#306, kodlar LZR/TRN/FRZ, grup, dolu tohum) ile rotanin bekledigi katalog (kucuk harf kod, kisaltma, varsayilan sureler ve istasyon, sira) ayni `/operasyon-tipleri` adresinde farkli; rota "Operasyonlar" bolumu bugun bozuk.
Secenekler: a) istasyonlar katalogu esas: istasyonlardan katalog tablosuna kisaltma ve varsayilan sure/istasyon sutunlari istenir (bos olabilen, ekleme goc), rotanin 8 standart taslak kodu depodaki kodlara eslenir; rota "Operasyonlar" bolumu baglamada istasyonlar ekranina baglanir (ekrana dokunur, o zaman ayrica sorulur)  b) rota semasi esas: istasyonlar katalog tablosu ve kodlari degisir (dolu tablo, onayli I2 karariyla celisir).
Oneri: a.

R3. Rota sayfasindaki baska modul bolumleri ne olsun?
Neden: Rota menusunde Uretim emirleri, Plan, Plan studyosu, Kanban, Operator ekrani (Arkon), Stok (stok modulu), Operasyonlar ve Kaynaklar (istasyonlar), Malzemeler var; hedef "modul ana menude tek sayfa, baskasinin kavramini kopyalamaz" diyor, teslim bunu karar K2 diye yaziyor.
Secenekler: a) teslimdeki gibi kalir (K2), sapma UYUM-BORCU'ya, Asama 2'de bolum bolum karar  b) simdi menuden Operator ekrani ve Stok cikar (sahibi Arkon ve stok), oteki bolumler kalir (ekrana dokunur)  c) rota yalniz kendi bolumlerini tasir (Urun ve rotalar, urun agaci); otekiler sahibinin sayfasina gider (ekrana ve plan karari P2'ye dokunur).
Oneri: a.
