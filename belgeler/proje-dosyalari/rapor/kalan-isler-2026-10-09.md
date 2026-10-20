# Uygulamanin hazir olmasi icin kalanlar (09.10.2026, 06:20 UTC)

Ana dal `4738576` (Merge PR #390). Salt okuma; kod, dal, kart, PR yok.
"Hazir" tanimi (VARSAYIM, koordinator notu): Asama 2 BAGLA bitti, A-B-C-D akislari uctan uca calisiyor, kullanici her akisi deneyip "tamam" dedi, roller verildi.
Kaynaklar: acik PR listesi (GitHub, 11 acik), acik kartlar (110), `bagla/HAZIRLIK.md`, `bagla/SORULAR.md`, `bagla/rol-C.md`, `bagla/UE-LISTESI.md`,
modul `UYUM-BORCU.md` dosyalari (ana dal), `denetim/DURUM.md`, `denetim/KOD.md`, konu durumlari (fetch_thread, 06:18).

## Kisa hukum

- Akis C (tedarik) kodda neredeyse tamam: talep, onay, siparis, mal kabul, teslim, firma ve kur bagi ana dalda (#365, #366 birlesti). Kalan: roller, iki goc temizligi, senin denemen.
- Akis A (uretim) ve B (plan) disaridaki uretim-emirleri modulunun yeni emir modelini (UE1-UE5) bekliyor; bu gelmeden uretim emri acma ve plan gercek veriyle calismaz. En buyuk tikanma bu.
- Akis B ayrica personel-vardiya modulunu (#263, disarida) bekliyor; takvim yok.
- Akis D (finans) kendi icinde kullanilabilir; roller (#387) birlesme sirasinda, Logo kolu (#339) beklemede.
- Canli kurulum hazirligi (#44, #174, #175) hic baslamadi; senin "baslat" demeni bekliyor (hedefteki kural).

## Akis C - Tedarik

| Is | Durum | Kaynak |
|---|---|---|
| Tedarikci -> finans firma (FK, gecici dosya silindi) | bitti | satin-alma UYUM-BORCU 1-2 |
| Kur finanstan (`kurGetir`) | bitti; `satin_alma_ayar.kur_tarihi` sutunu ayri gocle dusecek | satin-alma borc 33 |
| Katalog -> malzeme karti bagi | bitti; kopya sutunlar (kod, ad, kategori, birim) hizmet turu gelince ayri gocle duser | satin-alma borc 33 |
| Mal kabul -> siparis satiri, teslim yazimi, fazla teslim | bitti (#365) | stok borc 18, satin-alma borc 24 |
| Onay dugmeleri, SAT-56 | bitti | satin-alma borc 29-30 |
| Stok: tekrar korumasi, toplama kapatma, okuma yetkisi, birim, arama | bitti | stok borc 2, 4, 5, 12, 13, 15 |
| Ana sayfadan talep acma | PR #388 CI yesil, birlesme sirasinda | Satin alma uyum konusu |
| Finans fason suzgeci | PR #395 CI kosuyor | Finans tanisi konusu |
| Stok rolleri R4-R6, R13 | PR #394, onayin islendi, CI kosuyor | Cekirdek konusu |
| Finans rolleri R8-R12 | PR #387, onayli, birlesme sirasinda | Cekirdek konusu |
| Satin alma rolleri R1-R3 | baslanmadi; sart ("firma bagi finansa baglandiktan sonra") saglandi (VARSAYIM: #366 ile) | `bagla/rol-C.md` |
| Hizmet satiri: mal kabulde depo girisi yazmaz, yalniz teslim | yazim bekliyor; stok konusu sema sorusu bekliyor | stok borc 25 |
| Kalite (GKK) | yok (karar SH2 b: kalite modulu gelene kadar bos) | HAZIRLIK SH2 |
| Stok `uretim_emri_id` yabanci anahtari | uretim-emirleri yeni modelini bekliyor | stok borc 11, UE13-14 |
| Fason firma ve konumu stokta | sonraki tur (ST6 a) | stok borc 24 |
| Satin alma Logo alanlari, `siparis_no` 40 -> 16 | Logo kolunda bekliyor | satin-alma borc 14 |
| Akis C kullanici denemesi | deneme adimlari hazir (`bagla/satin-alma-deneme.md`, 15 adim); senin "tamam"in yok | - |

## Akis A - Uretim

| Is | Durum | Kaynak |
|---|---|---|
| Malzemeler: hizmet turu, Malzemeler ve Hizmetler | #380 birlesti; hizmet cesit/standart isi yaziliyor (PR yok) | Malzemeler konusu |
| Malzemeler kararlari (#227) ve modul karti (#163) | karar bekliyor (kart durumu onay-bekliyor) | kart #227, #163 |
| Rota fason: sunucu | bitti (#377) | Rota ve plan konusu |
| Rota fason adim paneli | PR #391 CI yesil, birlesme sirasinda | - |
| Rota operasyon tipi FK, Operasyonlar/Kaynaklar 400-403 | #361, #367 birlesti (VARSAYIM: A2/A4 kapandi; ayrica dogrulanmadi) | HAZIRLIK A2, A4 |
| Rotadan uretim emri acma | uretim-emirleri `uretimEmriAc` bekliyor (UE1); bugun 422 | rota B6 |
| Arkon tesis kodlari -> istasyon kimligi | yeni kayit bitti (#371); eski kodlarin cozulmesi yazim bekliyor | Arkon konusu |
| Arkon KD-001/KD-002 (tablet sayimi kaybi, yoklama yuku) | PR #389 CI yesil, birlesme sirasinda | kart #383 |
| Arkon KD-003..KD-008 (N+1, yutulan hata, dizin) | baslanmadi | `denetim/KOD.md` |
| Arkon B-005, B-006 (depo okuma, ilk parca, ikinci kontrol) | yazildi; "tarayicida gorulunce kapanir" | arkon UYUM-BORCU 127-129 |
| Arkon B-006 RED'de makine durdurma | karar bekliyor (AK1 c ile borcta) | arkon UYUM-BORCU 130 |
| Arkon bagi is emrine, `arkon_tmi_yansima.emir_id` FK | uretim-emirleri yeni modelini bekliyor (UE6) | HAZIRLIK A7 |
| Kalibrasyon ve Arkon/malzeme olcu aleti verisi | baslanmadi (A9) | HAZIRLIK A9 |
| Dosya: Arkon (#302), malzemeler (#300), kalibrasyon (#301) | kartlar disarida | - |
| Kilitlenme yeniden deneme (#370) | yaziliyor | Cekirdek konusu |
| Surum sutunu durus nedenleri, kalibrasyon (#369) | #381 birlesti (VARSAYIM: kapandi) | - |
| uretim-emirleri okuma uclari herkese acik (B-007) | disarida; ana dalda hala `'oturum'` (DOGRULANDI `uretim-emirleri/uclar.ts:17,25,33`) | UE15 |
| Akis A rolleri (rota, Arkon, kalibrasyon, durus nedenleri) | baslanmadi (CK1 a: akis sirasiyla) | HAZIRLIK A12 |

## Akis B - Plan

| Is | Durum | Kaynak |
|---|---|---|
| Plan gercek is emri okur, kaynak yazar | uretim-emirleri UE4, UE5 bekliyor; bugun bos liste / 422 | plan P-B1, P-B8 |
| Takvim (vardiya, mesai) | personel-vardiya modulu (#263) disarida; gelmeden yok | P-B3 |
| `plan_yerlesimi.is_emri_id` FK | yeni emir modelini bekliyor | P-B2 |
| Ayni isi goren iki sayfa (cizelge/matris/kuyruk ile Plan/Kanban) | karar bekliyor | P-B11, rota B15 |
| btree_gist (cakisma veritabaninda) | karar CK3 a: akis B'ye kadar bekler | SORULAR CK3 |
| Plan rolleri | baslanmadi | P-B9, P-B12 |

## Akis D - Finans

| Is | Durum | Kaynak |
|---|---|---|
| Para hatalari B-003, B-004, B-008, B-009 | kapandi (finans UYUM-BORCU "Denetim duzeltmeleri" 1-6) | - |
| Cekmece formu ayni kimlik (KDV/Kur sekmesinde kaydetmiyor) | PR #386, CI bekleniyor | finans borc 12 |
| Duzeltme/iptal deftere onceki-yeni deger yazmiyor | baslanmadi | finans borc 6 |
| Finans rolleri | PR #387 (yukarida) | - |
| Logo kopru (malzeme giden kutusu) | PR #339 taslak; #343 yetki satiri ona bagli | kart #205, #207 |
| Logo kararlari (#205 kapsam, #209 dis cagri kurali, #210 ortam degiskeni) | beklemede | - |
| Satin alma siparisinden finans belgesine bag | BILMIYORUM gerekip gerekmedigi; hicbir yerde istenmemis | HAZIRLIK D6 |

## Akis disi (canli kullanim icin)

| Is | Durum | Kart |
|---|---|---|
| Yayin hazirligi: betik, uretim kurulumu, izleme | baslanmadi ("canli kurulum" senin istegini bekliyor) | #44 |
| Uretim topolojisi (ekrani kim sunar, sifreleme) | karar bekliyor | #175 |
| Goclerin taban goce indirilmesi; tablo adlarina onek | baslanmadi (canli oncesi) | #174, #173 |
| Ekranlar gercek tarayicida 360/768/1280 olculmedi | kismen olculdu (ortak arayuz, satin alma) | #46 |
| Iki ust karar: #158 (dis modul kurallari), #94 | onay bekliyor | #158, #94 |
| Arkon MES alt modul kararlari (#70, #73-#81: kalite, bakim, cagri, kontrol plani...) | onay bekliyor, beklemede | - |

## Disaridan gelmesi gerekenler (projede yazilmaz)

1. uretim-emirleri yeni emir modeli: UE1 (uretim emri + is emirleri, `uretimEmriAc`), UE2 (malzeme no), UE3 (fason is emri), UE4-UE5 (plan), UE6-UE11 (Arkon), UE12-UE14 (stok), UE15 (okuma yetkisi, B-007), UE16-UE18. Liste: `bagla/UE-LISTESI.md`. A ve B'nin tamami buna bagli.
2. personel-vardiya modulu (#263): B'nin takvimi.
3. Kalite modulu: GKK ve Arkon'daki kalite/bakim/kontrol plani (OS9) icin; verilmedi.

## Senden beklenenler (oneriyle)

1. Akis C'yi dene: `bagla/satin-alma-deneme.md` 15 adim, #388, #394, #387 birlesince. Oneri: birlesmeler bitince dene, "tamam" ya da sorun yaz.
2. Satin alma rolleri R1-R3 (satin alma, mudur, muhasebe): cekirdek konusunun satirlari gostermesi ve senin "gir" demen. Oneri: koordinator cekirdek konusuna simdi baslatsin.
3. uretim-emirleri yeni emir modelini (UE-LISTESI) disaridaki yazara ilet. Oneri: A ve B'nin tek tikanmasi oldugu icin ilk is bu.
4. personel-vardiya teslimi (#263) ne zaman gelecek. Oneri: UE'den sonra; o gelene kadar plan 7/24 calisir.
5. Arkon RED'de makine durdurma (AK1): a) RED'den sonra durma kaydi gelmeden o ise running reddedilir (oneri), b) olculer yeniden onaylanana kadar baslatilamaz, c) borcta kalsin.
6. Plan: iki ayri sayfa (eski cizelge/matris/kuyruk ile yeni Plan/Kanban) hangisi kalir. Oneri: yeni teslim (Plan/Kanban) kalsin, eskiler kalksin (VARSAYIM; karar akis B'de sorulacak).
7. Canli kurulum hazirligina (#44, #174, #175) ne zaman baslansin. Oneri: akis C kabulunden sonra, A ve B uretim-emirlerini beklerken.
