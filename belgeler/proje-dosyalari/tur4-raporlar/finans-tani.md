# Finans tanisi (kart #246) — YENI MODUL GELINCE adim 1-3

Salt okuma. Depo: heylit/TMICOREV2, main `f4d1837` (DOGRULANDI: `git log -1 origin/main`). Taban `c2c9871`'den beri main'de 142 commit var.
`npm run harita` "Goc sirasi" satiri: CALISTIRILMADI (ortamda node_modules yok, Node 22). Son goc main'de `20261008111500_istasyonlar_operasyon_tipi_surum.sql` (DOGRULANDI: `ls sunucu/gocler`).
Kaynak: `/mnt/project-files/TMICOREV2-TESLİMLER/teslim-finans-c2c9871 08.10.26 13.37/` (44 dosya, tamami okunabildi).

## 1. Tani

- Ad: `finans`. Kapsam: firma karti (musteri, tedarikci, fason) ile fatura takip, odeme, cek, hesap, kur, butce ve raporlar; asil fatura Logo'da, finans takip katmani.
- Klasorler: `sunucu/moduller/finans`, `istemci/src/moduller/finans`, `paylasilan/{sozlesme,islemler,sayfalar}/finans.ts`, iki goc.

## a) Dosyanin icinde ne var

| Tur | Dosyalar |
|---|---|
| Sunucu kodu | `servis.ts` (34 KB), `sorgular.ts` (32 KB), `uclar.ts` (62 uc: 7 firma, 55 para), `kurallar.ts`, `disari.ts` |
| Goc | `20261008090000_finans_firma.sql` (finans_firma), `20261008110000_finans_cekirdek.sql` (15 tablo, tetikleyiciler, KDV oranlari ve tek ayar satiri tohumu) |
| Paylasilan | `sozlesme/finans.ts` (24 KB), `islemler/finans.ts` (5 islem), `sayfalar/finans.ts` (tek sayfa + 13 maddelik ikinci menu, sayac ucu) |
| Istemci | `FinansCercevesi.tsx`, `kopru.ts` (31 adli yazma turu), `rotalar.tsx` (13 yol), `yazi-tipleri.ts`, `finans.css`, `cerceve/finans.html` (382 KB, prototipin kendisi), `cerceve/yazi/` 12 woff2 + 2 OFL lisansi |
| Testler | `kurallar.test.ts` (15 saf), `para.test.ts` (31-32, gercek PostgreSQL), `firma.test.ts` (17), `FinansCercevesi.test.tsx` (9) |
| Belgeler | FARK, CEKIRDEK-ISTEKLERI, BASKA-MODUL-ISTEKLERI, KURAL-TEST (54 FNS satiri), ON-PAKET-finans-s4, ORTAKLIK-finans, GUVENLIK-DENETIMI, UYGULA, `sunucu/moduller/finans/UYUM-BORCU.md`, `NOTLAR.md` |
| Eksik | Prototip (`finans-sistemi/index.html`) teslimde yok; on paket s3 yok (s4 "s3'te yazmayan her madde s3'teki gibi" diyor). Firma teslimi (`teslim-finans-firma-c2c9871.zip`) klasorde yok. |

## b) Gelenin turu

Yazilmis kod, taban `c2c9871` (UYGULA.md "Taban commit: c2c9871"; on paket "son goc 20261007222500"). Tam teslim: firma teslimini icerir ve yerine gecer. Ekran yol A: prototip cercevede oldugu gibi acilir. Yazarin kostugu: tip 0, lint 0, sinir 0 ihlal (4 yol ihlali = calisma kopyasindaki cekirdek istekleri), finans sunucu 64/64, istemci 9/9, butun depo 1029/1029 ve 504/504 (UYGULA.md; benim tarafimdan CALISTIRILMADI).

## c) Cakisma taramasi

**Baska modulde olan (oradan okunur)**
- Kisi: `olusturan_id`, `guncelleyen_id`, iptal eden vb. `REFERENCES kisi(id)` (23 yerde, cekirdek goc). Depodaki kalipla ayni (oturum, denetim, kalibrasyon da kisi'ye FK verir). Celiski yok.
- Denetim, oturum, istek-kimligi: yalniz disari.ts uzerinden (denetimYaz, kimlikCozucu, tekrarDeposu; DOGRULANDI, main'de var).

**Yalniz bu modulde olan (sahibi finans)**
- Firma (`finans_firma.id`) — SABIT KIMLIKLER ile uyumlu.
- Para birimi, kur (`finans_kur`), fiyatlarin TL karsiligi — OS5 ile uyumlu.
- Hesap (kasa, banka, kredi karti), belge (fatura takip), odeme, dagitim, mahsup, cek, virman, KDV orani, duzenli odeme, finans butcesi, ay sonu kapanisi, skor, oneri durumu.
- Logo cari kodu ve Logo kayit no (firma ve belge) — "fatura asil kaydi Logo'da" ile uyumlu; kopru kodu yok (hedefle uyumlu: yalniz alanlar).

**Belirsiz (sorulacak) — 2 madde**
- B1 Butce: satin almada `satin_alma_birim.yillik_butce` (departman satin alma butcesi), finansta `finans_butce` (gelir/gider kategorisi, aylik). Ad ayni, kavram farkli gorunuyor (VARSAYIM). Soru S5.
- B2 Firma iletisim alanlari: satin alma firma ozetinde `yetkili, telefon, eposta, sehir, surum` bekliyor; `finans_firma`'da telefon, e_posta, il var, **yetkili yok**; finansin `firmaOzeti` bunlarin hicbirini dondurmuyor. Soru S4.

**SABIT KIMLIKLER ve OS1-OS10 ile karsilastirma**
- firma = `finans_firma.id`: uyumlu. Ayri firmalar modulu yok: uyumlu.
- OS5 para birimi, kur, fiyat finansta: uyumlu. Celiski degil ama bag gerekecek: satin almada `satin_alma_kur` (4 sabit kod, guncel kur) ve `satin_alma_sabit_kur` var (`20261007230000_satin_alma_tablolar.sql` satir 22, 229). OS5 "finans gelene kadar satin almada kalir" — Asama 2'de satin alma kuru finanstan okur.
- OS4 olcu birimi, OS7 depo, OS2 kalibrasyon vb.: finans bunlari tutmuyor. Celiski yok.
- "Faturanin asil kaydi Logo'dadir": `kaynak`, `logo_kayit_no`, `logo_esleme` alanlari var, kopru yok. Uyumlu.

## d) Yerlestirme

- Akis D (Finans): firma karti -> fatura ve masraf -> tahsilat ve odeme -> raporlar. Akis C'ye firma ve para birimi/kur ile altlik olur.
- Konum: en altta (yaprak saglayici). Finans hicbir modulun disari.ts'ini cagirmaz (BASKA-MODUL-ISTEKLERI "Yok"); dongu riski yok.
- Finansin verdigi (`disari.ts`, servis.ts satir 118-150, DOGRULANDI):
  - `firmaAdlari(db, idler: number[]): Promise<Map<number, string>>`
  - `firmaVarMi(db, id: number): Promise<{ var: boolean; aktif: boolean }>`
  - `firmaAra(db, { metin, sinir, yalnizAktif?: boolean (vars. true), tur?: FirmaTuru }): Promise<{ id; ad; kod }[]>`
  - `firmaOzeti(db, id): Promise<{ id, kod, ad, tur, fason, vergiNo, paraBirimi, vadeGunu, aktif, logoCariKodu } | null>`
- Satin almanin bekledigi (`sunucu/moduller/satin-alma/firma-gecici.ts`, BASKA-MODUL-ISTEKLERI.md) ile fark:

| Ad | Satin alma bekliyor | Finans veriyor | Durum |
|---|---|---|---|
| firmaAdlari | (db, idler) => Map<number,string> | ayni | UYUSUYOR |
| firmaVarMi | => boolean, yalniz aktifte true | => { var, aktif } | UYUSMUYOR; satin alma `r.var && r.aktif` ile uyar (tek satir) |
| firmaAra | (db, metin: string) => {id, ad}[] | (db, {metin, sinir, yalnizAktif, tur}) => {id, ad, kod}[] | UYUSMUYOR; satin alma cagrisi degisir (tur: 'tedarikci' verilebilir) |
| firmaOzetleri (toplu) | (db, idler) => Map<id, {ad, vergiNo, yetkili, telefon, eposta, sehir, aktif, surum}> | YOK; yalniz tekil firmaOzeti, iletisim alanlari ve surum yok | UYUSMUYOR; soru S4 |

- Baskalarinin finanstan istekleri: satin alma (yukaridaki), stok (firma; stok tanisi ayri konuda). Uretim-emirleri: istek yok (UE listesine ekleme yok).
- Bagimli oldugu: kisiler (kisi), cekirdek. Asama 1'de bos birakilan baglanti yok.

## e) Depodaki guncel durumla fark (taban c2c9871 -> main f4d1837)

| Kalip | Finans durumu | Uyuyor mu | Ekrana dokunur mu |
|---|---|---|---|
| Okuma ucu `yetki: { biri: [...] }` (`sunucu/cekirdek/uc.ts`, `OkumaYetkisi`) | GET uclar tek veri islemi (`finans.oku`, `finans.firma-oku`), sayac `oturum` | UYUYOR (tek islem hala gecerli; `biri` istege bagli) | Hayir |
| Ikinci menu, toplayicida satir basina tek giris (#281, `paylasilan/sayfalar.ts` satir "Satır başına tek menü") | Istek `IKINCI_MENULER = [ARKON_IKINCI_MENU, FINANS_IKINCI_MENU]` tek satir, tabandaki bicim | UYMUYOR, oturtmada `  FINANS_IKINCI_MENU,` tek satir olarak eklenir | Hayir |
| `cerceveli`, `sayacUcu` alanlari (`paylasilan/sayfa-tanimi.ts` satir 58-60) | kullaniyor | UYUYOR | Hayir |
| Yonetim grubunda sira | Finans `sira: 5`; main'de Denetim Kaydi da `sira: 5` (`paylasilan/sayfalar/denetim.ts`) | Esitlik yol sirasiyla cozulur: Denetim, Finans, Sistem Ayarlari (VARSAYIM, `sayfalariSirala`). Kabuk testi yalniz Ayarlar'in sonda olmasini ister | Menu sirasi; ekran degil |
| Toplayici dar istisnasi (islemler, sayfalar, `TAM_DENETLENMEYEN_UCLAR`) | Uc istek de yalniz finans satiri: `...FINANS_ISLEMLERI,`, `...FINANS_SAYFALARI,` + menu satiri, `'POST /finans/toplu-ice-aktar govdesiz'` | UYUYOR, ayri commit'le | Hayir |
| Istisna disi cekirdek istekleri | `package.json` chart.js 4.4.1; dosya turu istisnasi (`.html`, `.woff2`, `.txt`) | Istisna kapsaminda DEGIL: cekirdek isi ve kullanici onayi | Grafikler |
| Tekrar korumasi | 13 ekleme komutunda `tekrarKorumali: true`; istemci `tekrarKorumaliGonder` | UYUYOR | Hayir |
| Denetim eki `denetimEki` (#290), `denetimOzeti` secici (#231) | Kullanmiyor; toplu ice aktarma govdesiz ve secicisiz | UYUYOR (zorunlu degil). Borca: duzeltme/iptal komutlarinda onceki-yeni deger eki yok; toplu aktarimda secici yok | Hayir |
| Surum denetimi | `surumluGuncelle` ve govdede `surum` | UYUYOR | Hayir |
| Dosya saklama (`dosya` modulu, #82, henuz yok) | Finansta dosya yukleme yok | Etkisiz | Hayir |
| Goc damgasi | `20261008090000`, `20261008110000` main'in son gocunden (`20261008111500`) once | UYMUYOR: `sinir` goc damgasi denetimi kirmizi verir (`araclar/sinir-denetimi.test.ts` "tabandaki son göçten önce sıralanan yeni göç ihlal"). Oturtmada iki dosya yeni damgayla yeniden adlandirilir, icerik ayni | Hayir |
| **Cerceve yalitimi** | `FinansCercevesi.tsx` satir 93: `sandbox`'siz, ayni kokenli `srcDoc` cerceve ("malzemeler kalibi"). Tabandan sonra malzemeler `YalitilmisCerceve`'ye gecti (`istemci/src/ortak/arayuz/YalitilmisCerceve.tsx`: `sandbox="allow-scripts"`, opak koken, kopru koken denetimi `'null'`) | UYMUYOR. Ayni kokenli cercevedeki betik `parent` uzerinden uygulamanin oturumuyla istek atabilir; CSP (`connect-src 'none'`) yalniz cercevenin kendi fetch'ini kapatir. Soru S3 | Gorunum degismemeli; kopru ve yazi tipi yukleme degisir (VARSAYIM) |

Kosulan dogrulama: finansin ithal ettigi butun cekirdek ve ortak adlari (liste, kisit, surum, zaman, hata, ikinci-menu, cerceve-gorunumu, tema, istek-kimligi, kisiler/denetim/oturum disari) main'de var (DOGRULANDI: `grep export`). Derleme ve testler CALISTIRILMADI (node_modules yok, Node 22; oturtma dalinda CI'da kosar).

## f) Kirmizi cizgi taramasi — 0 bulgu

- Dis adres: yalniz OFL lisans metinlerinde (`scripts.sil.org`, schibsted github) ve testte `http://localhost`. Kod ve html'de dis adres yok (DOGRULANDI: `grep -E "https?://"`). Google Fonts ve jsDelivr cikarilmis (FARK.md).
- CDN: yok; yazi tipleri yerel woff2, chart.js yerel paketten gomuluyor.
- `finans.html` icinde prototipin kendi saklama kodu var: `fetch("api/data")` satir 1292, 1315, 1351; `fetch("api/analyze")` satir 3965 (goreli yol, dis adres degil). Gomulu kipte bos isleve cevrildigi ve CSP `connect-src 'none'` ile kapali oldugu yazili (UYUM-BORCU); kirmizi cizgi degil, borc.
- Gercek musteri adi, parca no, kisi adi: yok. Ornek veri "Örnek Müşteri A.Ş." (satir 3953, ornek metin); testlerde "Deneme ..." adlari ve `1000000001`, `1234567890` gibi uydurma vergi no.
- Parola, anahtar: yok. Eski sistem izi (`Planlama`, `TMI_YEDEK`, 4000, `tmi`): yok.
- Onaysiz paket: chart.js 4.4.1. Teslim "K-8 onayli" diyor; depoda onay izi bulamadim (BILMIYORUM). Onay teyit edilmeden paket girmez: soru S2.

## g) Oturtma plani

Kullanici emri: ilk PR yalniz firma. Engel: teslim tam teslimdir; `servis.ts`, `sorgular.ts`, `uclar.ts`, `sozlesme`, `kurallar.ts`, `sayfalar`, `kopru.ts`, `finans.html` firma ve para kismini ayni dosyada tasir. Firma-only teslim zip'i klasorde yok. Ayirmak kodu yeniden yazmak olur. Soru S1.

Onerilen (S1-A ile):
1. PR-1 `246-finans-firma`: firma teslimi oldugu gibi + goc yeniden damgalama + toplayici satirlari (ayri commit) + dosya turu istisnasi (cekirdek istegi). Kucuk-orta (~8 kaynak dosya, 1 goc).
2. Satin alma bu PR'dan sonra Asama 2'de `firma-gecici.ts`'i birakir (bu konunun isi degil; satin alma konusuna iletilir).
3. PR-2 `246-finans`: tam teslim ustune; cekirdek goc (yeniden damgali), chart.js (S2 onayiyla), `TAM_DENETLENMEYEN_UCLAR` satiri, cerceve yalitimi (S3'e gore). Buyuk (~35 dosya, 62 uc, 382 KB html).
Sira: cekirdek istekleri (paket, dosya turu) once ya da ayni PR'da ayri commit; finans satin alma ve stoktan once (on paket bolum 14).

Islemler yalniz yoneticide kalir; rol x islem onerisi (CEKIRDEK-ISTEKLERI bolum 5) Asama 2'de.

## Sorular (sorulur kademesi)

S1. Ilk PR yalniz firma nasil kurulsun? Neden: tam teslim firma ve para kodunu ayni dosyalarda tasiyor, firma-only zip klasorde yok.
  A) Firma teslim zip'ini (teslim-finans-firma-c2c9871) klasore koyarsiniz, PR-1 o olur. (oneri: oldugu gibi alinir, yeniden yazim yok)
  B) Tek PR, tam teslim; firma ve para ayri commit'lerde.
  C) Tam teslimi biz firma kismina kirpariz (yeniden yazim sayilir, onerilmez).
S2. chart.js 4.4.1 (MIT) yeni paketi girsin mi? Neden: grafikler bu paketle ciziliyor; teslim "K-8 onayli" diyor, depoda izi yok.
  A) Girsin. (oneri) B) Girmesin, grafikler bos kalir ve borca yazilir.
S3. Finans cercevesi uygulamadan yalitilsin mi? Neden: finans sandbox'siz ayni kokenli cercevede aciliyor; depo bugun malzemelerde yalitilmis cerceve kullaniyor. Ekran gorunumu degismemeli, kopru koken denetimi ve yazi tipi yuklemesi degisir.
  A) Oturtmada yalitilmis cerceveye gecsin. (oneri) B) Oldugu gibi kalsin, UYUM-BORCU'na "baglamada kapanacak" yazilsin.
S4. Satin almanin istedigi toplu firma ozeti ve iletisim alanlari nereden gelsin? Neden: finansta toplu ozet yok, telefon/e-posta/il ozette donmuyor, "yetkili" alani hic yok.
  A) Asama 2'de finans disari.ts'e toplu `firmaOzetleri` (telefon, e-posta, il dahil) eklenir; "yetkili" satin almada kalir. (oneri)
  B) Satin alma finansin bugun verdigiyle yetinir; iletisim alanlari ekranda bos kalir.
S5. Satin almanin departman yillik butcesi ile finans butcesi ayri kavram mi? Neden: ayni ad, farkli tablo ve anlam.
  A) Ayri kalir: departman butcesi satin almada, kategori butcesi finansta. (oneri) B) Butcenin sahibi finans olur, satin alma okur.

## Varsayimlar (geri alma maliyetiyle)
- Yonetim grubunda sira esitligi yol sirasiyla cozulur (Denetim, Finans, Ayarlar). Ucuz: tek sayi.
- Goc dosyalari yalniz yeniden adlandirilir, icerik degismez. Ucuz.
- `firmaVarMi` ve `firmaAra` farki satin alma tarafinda uyarlanir, finans degismez (gelen esastir). Ucuz: satin almada iki satir.
- `fetch("api/...")` satirlari gomulu kipte calismaz (yazarin beyani; CALISTIRILMADI). S3-A secilirse opak kokende zaten kapanir.
