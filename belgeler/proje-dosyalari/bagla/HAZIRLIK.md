# Asama 2 (BAGLA) hazirligi

Kaynak: `heylit/TMICOREV2` ana dal `c73e2d4` (salt okuma; kod, dal, PR yok). Okunanlar: `sunucu/moduller/*/ORTAKLIK-*.md` (15 dosya),
`*/UYUM-BORCU.md` (15 modul + araclar + ortak arayuz), `*/disari.ts`, `*/BASKA-MODUL-ISTEKLERI.md`, ilgili goc dosyalari.
`npm run harita` CALISTIRILMADI (bagimliliklar kurulu degil: `Cannot find package 'zod'`); modul yonu `disari.ts` ithallerinden grep ile cikarildi.
`kurulum/eski-kurallar` okunmadi. uretim-emirleri icin ORTAKLIK dosyasi yok (modul disarida).

OS numaralari proje talimatindaki maddelerin sirasidir: OS1 rota/recete, OS2 kalibrasyon, OS3 vardiya, OS4 olcu birimi, OS5 para/kur,
OS6 satin alma katalogu, OS7 depo/lojistik, OS8 Arkon kaydi, OS9 bakim/kalite, OS10 ayarlar. VARSAYIM (rota, stok, finans borclarindaki OS3, OS4, OS5, OS7 atiflariyla tutarli; DOGRULANDI).

---

## 1. Tek sahiplik tablosu

Durum kisaltmalari: FK = yabanci anahtar var; DUZ = sayi sutunu, anahtarsiz; METIN = ad/kod kopyasi; JSONB = belge govdesinde; GECICI = baglanti.ts / gecici karsilik; YOK.

| Kavram | Sahibi | Ayni kavrami tutan diger moduller (tablo.sutun) | Bugunku durum | Baglamada yapilacak |
|---|---|---|---|---|
| Kisi | kisiler (`kisi.id`) | hemen her modulde `*_kisi_id`; Arkon govdede `by`, `decidedBy`...; malzemeler `kayit.onay.*.byAd`, `kayit.g.sorumlu` | FK (sutunlar); METIN/JSONB (Arkon, malzemeler ad kopyasi) | Kopya adlar gosterimde kalir (iz); `kayit.g.sorumlu` (zimmet) -> kisi id: SORU degil, ekran isi |
| Rol, rol x islem | kisiler (K2 a) | yok | FK; harita sahibi "belirsiz" (kisiler borc 4) | Kart #72 arac isi; her akista rol satirlari kullanici onayiyla |
| Is merkezi, istasyon, makine | istasyonlar | Arkon `kv/plant`, `arkon_kayit.makine`, `.is_merkezi`; malzemeler `kayit.ops[].merkez`; `uretim_emri.istasyon_id`; plan/rota `makine_id` | Arkon METIN; malzemeler METIN; UE, plan, rota FK | Arkon kodlari kimlige; malzemeler `ops` kalkar (OS1); UE'de istasyon is emrine (UE istegi) |
| Operasyon tipi | istasyonlar (`istasyonlar_operasyon_tipi`, RT2 a) | `rota_adimi.operasyon_tipi_id`; malzemeler ekran sabiti `OPS`, ayar `operasyonlar`; Arkon paket `operasyon` | rota DUZ + GECICI eslem (rota B1); malzemeler/Arkon METIN | FK goc `rota_adimi.operasyon_tipi_id`; rota `operasyonKatalogu` -> `operasyonTipleri`; malzemeler `OPS` kalkar |
| Ekip, kisi kapasite yuzdesi | istasyonlar (#105) | vardiya (yok), plan | modulde | Plan `istasyonKisiAtamalari` okur; vardiya gelince sorulur |
| Malzeme | malzemeler (`malzeme_katalog_karti.no`) | rota `*.malzeme_id`; stok `*.malzeme_id` (8 tablo); satin alma `satin_alma_katalog.malzeme_no`, kalem `ad`; Arkon `pkgs.govde.partNo/.part/.material`; `uretim_emri.parca_no/parca_ad` | rota, stok FK; satin alma DUZ (borc 5); Arkon, UE METIN | satin alma FK goc (OS6); Arkon ve UE malzeme no'ya (UE istegi); rota `(no,tur)` tekili (B4) |
| Malzeme turu | malzemeler (`tur`) | `rota_revizyonu.malzeme_turu` | kopya | `(no, tur)` tekil + bilesik FK (dolu tabloya kisit) |
| Olcu birimi | malzemeler (OS4) | malzemeler `kayit.com.birim` JSONB; satin alma `satin_alma_katalog.birim`, `_talep_kalemi.birim` METIN; stok ve rota YOK | sunucuda birim listesi yok; `malzemeOzeti` birim tasiyor (stok borc 21) | Satin alma katalog birimi malzemeden okunur (OS6); stok/rota ekrani ozetteki birimi gosterir; birim listesi: SH4 |
| Recete, operasyon sirasi | rota (OS1, RT1 a) | malzemeler `kayit.bom[]`, `kayit.ops[]` | JSONB kopya | Malzemelerdeki kopya kalkar (rota B16) - dolu JSONB'yi degistirir |
| Uretim emri / is emri | uretim-emirleri (disarida) | stok `stok_parti/.stok_hareketi/.stok_fis.uretim_emri_id`; plan `plan_yerlesimi.is_emri_id`; Arkon `arkon_tmi_yansima.emir_id`, paket `tmi-ue-<id>` | hepsi DUZ; rota/plan GECICI (422 / bos liste) | Hedef kayit: SH3; yeni emir modeli gelince FK goclari |
| Uretim kaydi, sayim, olay | uretim-emirleri (OS8) | Arkon `arkon_kayit` (`events`, `counts`), `results.govde.good/scrap` | Arkon kaydi yansima ile emre yazilir | Arkon bagi is emrine tasinir (OS8, UE5) |
| Durus nedeni, hurda nedeni | durus-nedenleri | Arkon `kv/reasons`, `kv/scraps` (salt okuma kopya); `uretim_olayi.durus_nedeni_id` FK | Arkon TMI'den okur | Arkon kopyasi yalniz okuma kalir; KARAR YOK ama sahibi tartismasiz (VARSAYIM) |
| Olcu aleti, kalibrasyon | kalibrasyon (OS2) | Arkon `arkon_belge` depo `gauges`; malzemeler `kayit.g.kalAy/.sonKal` | JSONB kopyalar | Arkon ve malzemeler `aletGetir`, `gecerliAletVarMi` okur; Arkon `gauges` verisi tasinir (dolu) |
| Vardiya, vardiya devri | personel-vardiya (OS3; o gelene kadar Arkon) | Arkon `kv/shifts`, `kv/handover`; plan (yok, P-B3); rota kaynaklar ekrani (B17) | yalniz Arkon | Modul verilene kadar baglanamaz |
| Bakim, kontrol plani, olcum, numune, planli durus | Arkon (OS9, modul verilene kadar) | malzemeler `kayit.g.kontrol`, `kayit.g.bakimAy` | JSONB | Degismez |
| GKK (giris kalite) sonucu | KARAR YOK | satin alma `gkkSonuclari` bekliyor (GECICI bos); rota'da yalniz op tipi `GKK` | hicbir modulde tablo yok | SH2 |
| Depo, raf, konum | stok (OS7) | malzemeler `kayit.g.depoYeri`, `kayit.g.konum`; kalibrasyon `olcu_aleti.yer`; Arkon `logi` | METIN | Malzemeler gosterimde stoktan (STK3 a); kalibrasyon `yer`: SORU degil, sonra |
| Malzeme lojistigi (istek, cikis) | stok (OS7) | Arkon `arkon_belge` depo `logi` | JSONB | Arkon `logi` stok sepet/fise baglanir |
| Uretim alani konumu | istasyonlar (STK4 a) | `stok_konum.tur` (kapali) | YOK | SH5 |
| Firma (musteri, tedarikci, fason) | finans (`finans_firma.id`) | satin alma `satin_alma_tedarikci.firma_id` + 4 tablo, `satin_alma_teklif.tedarikci_adi`; stok (yok, kapali); malzemeler `kayit.com.ted`, `kayit.g.musteri` | satin alma DUZ + GECICI (`firma-gecici.ts`); malzemeler METIN | FK goc + gecici dosya silinir; malzemeler metni ekran isi |
| Para birimi, kur, fiyat | finans (OS5) | satin alma `satin_alma_kur`, `satin_alma_sabit_kur`, `satin_alma_teklif.para_birimi/.kur`; malzemeler `kayit.com.pb/.fiyat` | satin alma FK kendi kur tablosuna | `finans_kur`'dan okunur (dolu tablo degisir); finansta kur okuma fonksiyonu yok (istenen) |
| Departman ve yillik butce | KARAR YOK (FN5: butce finans butcesinden ayri) | `satin_alma_birim.ad/.yillik_butce`, `satin_alma_talep.birim` | satin almada | SH6 |
| Satin alma katalogu | satin alma, malzeme kartina bagli (OS6) | `satin_alma_katalog.kod/.ad/.kategori/.birim` | kopya | ad, birim, kategori malzemeden okunur; kopya sutunlar kalkar (dolu) |
| Siparis satiri | satin alma (`satin_alma_siparis_satiri.id`) | stok mal kabul satiri (sutun yok) | YOK | Stok yeni sutun + FK (STK2 a); yon: SH1 |
| Ayarlar | ayarlar (sistem capi, dort goz) + modulun kendisi (OS10) | `malzeme_katalog_ayari`, `satin_alma_ayar`, `stok_depo_yerlesimi` | iki depo yan yana | OS10 karara uygun; is yok |
| Dosya, ek | dosya | Arkon `arkon_dosya`; malzemeler/kalibrasyon yok | Arkon kendi deposu | #300, #301, #302; `dosya_bagi.modul` metin (dosya borc 3) |
| Denetim / gecmis kaydi | denetim (`denetim_kaydi`) | Arkon `arkon_kayit` tur `audit`; satin alma `satin_alma_hareket` | ayri; komut defteri ile is izi | Degismez (VARSAYIM: is izi modulde kalir) |
| Belge no | her modul kendi | UE `UE-000123`, satin alma `ST-`, stok `MK-`, finans `belge_no` | modul ici | Yok; Logo no alanlari Logo kolunda |
| Logo alanlari | Logo modulu (#339 taslak) | malzemeler `logo_*`, finans `logo_*`, stok `stok_hareketi_logo`, satin alma (eksik, borc 14) | yalniz alan | Ayri kol; yalniz bagimlilik |

---

## 2. Kararla karsilastirma ve sorular

Kararla CELISEN kavram yok (DOGRULANDI: tablodaki her sahip OS1-OS10 ya da sabit kimliklerle ayni). Kararla celisebilecek bir YON sorunu var (SH1). Karari OLMAYANLAR: GKK, emir bagi hedefi, birim listesi, uretim alani konumu, departman.

**SH1. Stok ile satin alma arasindaki yon.** Neden: satin alma `siparisSatirlari(db, idler?)`'i stok okusun diye verdi (bugun ithal eden yok, grep); satin alma da stoktan `teslimAlinanlar` bekliyor (`satin-alma/teslim-bilgisi.ts:12`). Ikisi birden dongu olur (ADR 0006).
- a) Yon stok -> satin alma: mal kabul komutu satin almanin yeni `teslimIsle(db, siparisSatirId, miktar)` fonksiyonunu ayni islemde cagirir; satin alma teslimi kendi tablosunda tutar. (oneri)
- b) Yon satin alma -> stok: stok siparis satirini satin almadan okumaz, satin alma ekrani siparisi stoga gonderir.
- c) Iki taraf da birbirini sunucuda okumaz; teslim durumu yalniz ekranda birlestirilir.

**SH2. GKK (giris kalite kontrol) sonucunun sahibi.** Neden: satin alma `gkkSonuclari` bekliyor, hicbir modulde tablo yok.
- a) Stok, mal kabul satirinda (kabul / kismi / red + miktar, neden) tutar; kalite modulu gelirse oraya tasinir. (oneri)
- b) Kalite modulu verilene kadar GKK yok; satin almada bos kalir.
- c) Arkon (OS9 kontrol plani ve olcum Arkon'da).

**SH3. Uretim emri bagi hangi kayda.** Neden: stok uc tabloda, plan iki tabloda, Arkon yansimada emir kimligi anahtarsiz; FK hedefi secilmeden goc yazilamaz. Bugun `uretim_emri` + `emir_adimi` (adim yalniz sira/ad) var; yeni model disarida.
- a) Plan, Arkon ve stok sarfi is emrine; stok parti ve uretim girisi uretim emrine. (oneri; STK5 a, UE5 ile uyumlu)
- b) Hepsi uretim emrine; is emri yalniz uretim-emirleri icinde.
- c) Hepsi is emrine.

**SH4. Olcu birimi listesi nerede tutulsun.** Neden: OS4 sahibi malzemeler dedi ama birim yalniz `kayit.com.birim` JSONB ve ekran sabiti `BIRIMLER`; satin alma serbest metin (en cok 20). Liste olmadan satin alma ve stok birimi dogrulayamaz.
- a) Malzemelerde ayri birim tablosu + `malzemeBirimleri(db)`; kart birimi o listeden secilir; Logo birim seti karsiligi bu listeye baglanir. (oneri)
- b) Liste ekran sabiti kalir; baska modul yalniz kartin birimini `malzemeOzeti` ile okur.

**SH5. Stoktaki uretim alani konumu istasyonda nasil ayirt edilsin (IR4 c).** Neden: `stok_konum.istasyon_id` goci bunu bekliyor; dolu `istasyon` tablosuna dokunur.
- a) Istasyon tipi `depo` olanlar uretim alani konumudur; yeni sutun yok. (oneri)
- b) `istasyon`'a ayri bayrak sutunu (dolu tabloya sutun).

**SH6. Departman (talep eden birim) ve yillik butce kimde.** Neden: `satin_alma_birim` baska modulde yok; kisiler ve finans da birim tutabilir.
- a) Satin almada kalir (bugunku gibi; FN5 butceyi zaten ayri tuttu). (oneri)
- b) Kisiler (organizasyon) sahibi olur; satin alma okur.

Varsayimla ilerlenecekler (geri almasi ucuz):
- Durus/hurda nedeni sahibi durus-nedenleri; Arkon salt okuma kopyasi kalir. Geri alma: yok (bugunku hal).
- Satin alma hareket kaydi ve Arkon audit denetim kaydiyla birlesmez. Geri alma: belge.
- Kalibrasyon `olcu_aleti.yer` metin kalir (stok konumuna baglanmaz). Geri alma: sonraki goc.
- Malzeme kartindaki depo yeri gosterimi ekranda birlestirilir, malzemeler sunucuda stogu ithal etmez (stok -> malzemeler var; tersi dongu). Geri alma: ekran.
- Ekip sahibi istasyonlar (#105); vardiya ekibi personel-vardiya gelince sorulur.

---

## 3. Bagla borclari akislara gore

Isaretler: [E] kullanimi etkileyen (once); [G] goc gerekir; [G-DOLU] var olan, veri tasiyabilecek tabloyu degistirir ya da dusurur (kullanicidan onay); [UE] uretim-emirleri'ne yalniz istek; [Y] rol x islem, kullanici onayi.
Canli kurulum yok; "dolu" gelistirme ve gelecekteki veriye gore isaretlendi (VARSAYIM).

### Akis C - Tedarik (talep -> onay -> siparis -> mal kabul -> stok hareketi; sarf ve giris)
Moduller: satin-alma, stok, finans, malzemeler (uretim-emirleri yalniz istek).

| Sira | Borc | Kaynak | Isaret |
|---|---|---|---|
| C1 | Tedarikci eklenemiyor: `firma-gecici.ts` silinir, finans ithal edilir; 5 "[uydurma firma]" testi finansla kurulur | satin-alma borc 1-3 | [E] |
| C2 | `satin_alma_tedarikci.firma_id` -> `finans_firma(id)` FK (once var olan satirlar dogrulanir) | satin-alma borc 1 | [G-DOLU] |
| C3 | Imza farki satin alma tarafinda kapanir: `firmaVarMi` `{var, aktif}`, `firmaAra(db, {metin, sinir, ...})` | finans borc 3 | |
| C4 | Toplu `firmaOzetleri` + iletisim alanlari finansa eklenir | finans borc 2 | finans isi |
| C5 | Mal kabulde ve stok listesinde metinle malzeme aranamiyor (`malzemeAra`, `malzemeOzetleri` yok) | stok borc 2, 5, 9 | [E] malzemeler isi |
| C6 | Teslim bilgisi bos: talep "teslim alindi"ya gecmiyor | satin-alma borc 24 | [E] SH1, SH2'ye bagli |
| C7 | `stok_mal_kabul_satiri`'na siparis satiri sutunu + FK `satin_alma_siparis_satiri(id)` | stok borc 18 | [G-DOLU] (sutun bos olabilir) |
| C8 | Katalog -> malzeme karti: `satin_alma_katalog.malzeme_no` FK; `kod/ad/kategori/birim` kopyalari kalkar | OS6, satin-alma borc 5 | [G-DOLU] |
| C9 | Kur `finans_kur`'dan: `satin_alma_kur`, `satin_alma_sabit_kur` ve `satin_alma_teklif.para_birimi` FK'si degisir; `aylik_faiz_yuzdesi` satin almada kalir (VARSAYIM) | OS5, finans borc 4 | [G-DOLU] |
| C10 | Stok `uretim_emri_id` uc tabloda FK | stok borc 11 | [G-DOLU] SH3, [UE] |
| C11 | Uretime sarfta is merkezi kapsami (DEP-36). `emirOzeti` bugun `istasyonId` veriyor (DOGRULANDI `uretim-emirleri/disari.ts:44-49`); `istasyonGetir` ile is merkezi cozulebilir, istek beklemeden kapanabilir (VARSAYIM) | stok borc 1 | |
| C12 | Stok fason/tedarikci firmasi finanstan (`firmaVarMi`, `firmaAdlari`) | stok borc 16 | [G] yeni sutun |
| C13 | Stok ekraninda birim (ozette var) | stok borc 4, 21 | ekran, onayla |
| C14 | Arkon `logi` stok sepet/fise baglanir | OS7 | Arkon ekrani; sonra |
| C15 | Kullanima acmadan once: stok tekrar korumasi (borc 12), toplama kapatma kisi denetimi (borc 15, kullanici karari), satin alma `acilis` yetkisi (borc 7), okuma yetkisi K3 (stok borc 13) | | [Y] |
| C16 | Satin alma onay dugmeleri durumla gizlenmiyor (borc 29), SAT-56 metni (borc 30) | | soru, ekran |
| C17 | Satin alma Logo alanlari, `siparis_no` 40 -> 16 | satin-alma borc 14 | [G-DOLU] Logo kolu |

Gereken `disari.ts` fonksiyonlari:
- VAR finans: `firmaAdlari(db, idler: number[]): Promise<Map<number,string>>`, `firmaVarMi(db, id): Promise<{var; aktif}>`, `firmaAra(db, {metin; sinir; yalnizAktif?; tur?}): Promise<{id; ad; kod}[]>`, `firmaOzeti(db, id): Promise<FirmaOzeti|null>` (`finans/servis.ts:118-143`).
- VAR satin-alma: `siparisSatirlari(db, idler?: readonly number[]): Promise<SiparisSatiriOkuma[]>` (`satin-alma/servis.ts:309`).
- VAR malzemeler: `malzemeOzeti(db, id)`, `malzemeKullanilabilirMi(db, id)`, `malzemeAdlari(db, idler)` (`malzemeler/servis.ts:32-43`).
- VAR uretim-emirleri: `emirOzeti(db, id): Promise<{id; emirNo; durum; istasyonId}|null>`.
- ISTENEN finans: `firmaOzetleri(db, idler)`, kur okuma (imza yok; ornek `kurGetir(db, paraBirimi, tarih)` VARSAYIM).
- ISTENEN malzemeler: `malzemeOzetleri(db, idler): Map<number, KatalogMalzemeOzeti>`, `malzemeAra(db, {metin; sayfa})` (stok istegi; rota'nin `baglanti.ts:43` imzasi farkli: `{metin; turler; yalnizAktif; sayfa}` - tek imzada birlesmeli).
- ISTENEN SH1'e gore: `satin-alma.teslimIsle(...)` ya da `stok.teslimAlinanlar(db, siparisSatirIdler)`.
- [UE] `emirNolari(db, idler)`, emrin istasyonu (bugun var).

### Akis A - Uretim (malzeme -> rota -> uretim emri -> is emirleri -> Arkon -> kayit emre)
Moduller: malzemeler, istasyonlar, rota, Arkon, durus-nedenleri, kalibrasyon, dosya; uretim-emirleri yalniz istek.

| Sira | Borc | Kaynak | Isaret |
|---|---|---|---|
| A1 | Rota malzeme secicisi pratikte kullanilamaz (`malzemeAra` yok) | rota B3 | [E] malzemeler isi |
| A2 | Rota Operasyonlar bolumu katalogu yanlis semayla okur, yazma 400; Kaynaklar bolumu surum gondermiyor (400), okuma 403 | rota B13, B14 | [E] ekran |
| A3 | Emre kopyalama 422 "henuz bagli degil" (`uretimEmriAc` yok) | rota B6 | [E] [UE] |
| A4 | `rota_adimi.operasyon_tipi_id` FK -> `istasyonlar_operasyon_tipi`; gecici eslem (`baglanti.ts` `operasyonKatalogu`, `istasyonKisileri`) -> `operasyonTipleri`, `istasyonKisiAtamalari` | rota B1, B2; istasyonlar borc 12 | [G-DOLU] |
| A5 | `malzeme_katalog_karti (no, tur)` tekil + rota bilesik FK | rota B4 | [G-DOLU] |
| A6 | Malzemelerdeki `kayit.ops[]`, `kayit.bom[]` ve `OPS` sabitleri kalkar (sahibi rota / istasyonlar) | OS1, rota B16, istasyonlar borc 4, malzemeler borc 10 | [G-DOLU] JSONB |
| A7 | Arkon bagi is emrine (`tmi-ue-<id>` -> is emri); `arkon_tmi_yansima.emir_id` FK ayri gocle | OS8, Arkon "Baglamada kapanacak" | [UE] [G] |
| A8 | Arkon tesis kodlari metin -> kimlik; parca/malzeme metni -> malzeme no | Arkon ORTAKLIK | Arkon ekrani, sonra |
| A9 | Arkon `gauges` ve malzemeler demirbas kalibrasyon alanlari kalibrasyondan okunur; Arkon verisi tasinir | OS2, kalibrasyon borc 2-3 | [G-DOLU] |
| A10 | Dosya: Arkon (#302, DS6 "ozetini bilen okur" acigi), malzemeler (#300), kalibrasyon (#301) | dosya borc 2 | [E] (#302) |
| A11 | Arkon kucuk borclar: kilit bekleme butcesi, `geciciHataMi` testi, olu `yeniEmirler`, `sonuc <> 'yazildi'` dizini | Arkon "Baglamada kapanacak" | |
| A12 | Rol: rota (B8, B11, B21), `sayfa.arkon` (Arkon), kalibrasyon ve durus-nedenleri (borc 1), istasyonlar kisi secimi (borc 3, 11) | | [Y] |
| A13 | Ad goci: rota tetikleyicileri `rotalar_*` (B18); hata iletisi `eskiSurum()` (B12) | | [G] ad degisikligi |

Gereken `disari.ts` fonksiyonlari:
- VAR istasyonlar: `operasyonTipleri(db, {pasiflerDahil}?)`, `istasyonKisiAtamalari(...)`, `istasyondakiKisiler(db, istasyonId, tarih?)`, `istasyonGetir`, `makineGetir`, `aktifIstasyonlar`, `kisininIzinliIsMerkezleri(db, kisiId)` (`istasyonlar/disari.ts`).
- VAR rota: `yururluktekiRevizyon(db, malzemeId)`, `revizyonGetir`, `adimBilesenleri(db, revizyonId, opNo)`, `gecerliTalimat(db, malzemeId, opNo)`, `urunAgaci(db, malzemeId, miktar)`.
- VAR kalibrasyon: `aletGetir(db, id)`, `gecerliAletVarMi(db, turId): Promise<boolean|null>`, `vadesiGecenAletSayisi(db)`, `aletTurleri`.
- VAR durus-nedenleri: `durusNedeniGetir`, `durusNedenleriniListele(db, {yalnizAktif})`, `hurdaNedeniGetir`, `hurdaNedenleriniListele`.
- ISTENEN malzemeler: `malzemeAra` (yukarida), `malzemeBirimleri` (SH4).
- [UE] istekler (projede yazilmaz, yalniz liste):
  1. `uretimEmriAc(db, kullanici, UretimEmriGirdisi): Promise<{uretimEmriId; isEmriIdleri[]}>` (`rota/baglanti.ts:56-77`).
  2. Is emri duzeyinde `acikEmirler`, `emirOzeti` ve komutlar (`emirBaslat/Devam/Duraklat/Durdur/Sayim/Bitir`) is emri kimligiyle (Arkon istek 4, UE5).
  3. `EmirOzeti.calisma` (`calisiyor`, `durakli`, `durdu`) (Arkon istek 1).
  4. Hurda eksi duzeltme, komutlara `olayZamani`, toplu `emirDurumlari(db, idler)`, `emirAdlari` (Arkon istek 2, 3, 5, 6).
  5. `uretim_emri.parca_no/parca_ad` metni yerine malzeme no; istasyon is emrine (rota istegi K1, K3).
  6. Okuma uclari `yetki: { biri: [...] }` (kok `BASKA-MODUL-ISTEKLERI.md` 1-3).

### Akis B - Plan (is emirleri istasyona ve zamana)
Moduller: plan, rota, istasyonlar; uretim-emirleri istek; vardiya modulu YOK.

| Sira | Borc | Kaynak | Isaret |
|---|---|---|---|
| B-1 | Plan gercek veriyle calismaz: `planlanacakIsEmirleri`, `isEmriKaynagiYaz` gecici (bos / 422) | plan P-B1, P-B8 | [E] [UE] |
| B-2 | `plan_yerlesimi.is_emri_id`, `plan_senaryo_yerlesimi.is_emri_id` FK | P-B2 | [G-DOLU] SH3 |
| B-3 | Takvim yok (7/24); rota kaynaklar vardiya uclarini bekliyor | P-B3, rota B17 | personel-vardiya modulu gelince (OS3) |
| B-4 | `istasyonKisileri` gecici -> `istasyonKisiAtamalari` | P-B4 | |
| B-5 | Kapasite kaynagi sunucuda zorunlu + `istasyon.kapasite_kaynagi NOT NULL` | istasyonlar borc 10 | [G-DOLU] |
| B-6 | Ayni isi goren iki sayfa (`/cizelge`, `/matris`, `/kuyruk` ile teslimdeki Plan, Kanban); plan ekranlari rota sayfasinda | P-B11, P-B7, rota B15 | kullanici karari, ekran |
| B-7 | Rol (P-B9, P-B12); adsiz birincil anahtar (P-B10) | | [Y] [G] |

Gereken: VAR `istasyonKisiAtamalari`, `istasyonlar`, `istasyondakiMakineler`, `makineGetir`; [UE] `planlanacakIsEmirleri(db): Promise<PlanIsEmri[]>`, `isEmriKaynagiYaz(db, kullanici, isEmriId, {tur: 'makine'|'kisi'; id})` (`plan/baglanti.ts:10-51`); vardiya `calismaTakvimi(db, kaynak, aralik)` (imza VARSAYIM, modul yok).

### Akis D - Finans (firma karti -> fatura ve masraf -> tahsilat ve odeme -> raporlar)
Moduller: finans; firma bagi C1-C4 ile; Logo ayri kol.

| Sira | Borc | Kaynak | Isaret |
|---|---|---|---|
| D1 | Firma karti baska modullere: C1-C4 (satin alma), C12 (stok); malzemeler `kayit.com.ted`, `kayit.g.musteri` metni (ekran) | finans ORTAKLIK | |
| D2 | KDV/Kur sekmesi acikken cekmece formu kaydedilemiyor (ayni kimlikli iki form) | finans borc 12 | [E] ekran |
| D3 | Duzeltme/iptal komutlari onceki ve yeni degeri deftere eklemiyor (`denetimEki`) | finans borc 6 | |
| D4 | Roller (oneri CEKIRDEK-ISTEKLERI bolum 5); bugun yalniz yonetici | finans borc 7 | [Y] |
| D5 | Logo: finans `logo_*`, `logo_cari_kodu` alanlari; kopru #339 (taslak PR) ve #343 (yetki matrisi satiri, #339'a yigili); malzemeler Logo birim seti secimi #339'a bagli | #339, #343, malzemeler Logo madde 4 | ayri kol |
| D6 | Satin alma siparisinden finans belgesine (mal alimi) bag: hicbir dosyada istenmemis | - | BILMIYORUM gerekip gerekmedigi |

Gereken: VAR finans fonksiyonlari (C bolumu); ISTENEN `firmaOzetleri`, kur okuma.

### Akis disi (cekirdek / ortak)
- `test:modul` Linux'ta sunucu testlerini bulmuyor (malzemeler borc 8; cekirdek).
- `rol_islemi` haritada belirsiz (#72).
- Ikinci menu sayaclari (Arkon, istasyonlar borc 2), tablette sol menu (satin alma borc 26): ortak arayuz.

---

## 4. Akis sirasi onerisi ve ilk tur

ONAYLANDI (kullanici, SR1 a, 2026-10-09): **C -> A -> B -> D**. Cevaplar (2026-10-09): SH1 a, SH2 b (GKK kalite modulu gelene kadar yok), SH3 a, SH4 a, SH5 b (istasyona ayri "uretim alani" bayragi; dolu `istasyon` tablosuna sutun, goc onayi gerekir), SH6 a (departman ve butce satin almada kalir). Butun SH sorulari kapandi. Gerekce: C tamamen depoda ve kullanimi bugun tutuyor (tedarikci eklenemiyor, teslim gorunmuyor); A'nin yarisi (malzeme/rota/istasyonlar/Arkon ici) depoda, kalani uretim-emirleri'nin yeni emir modelini bekler; B bu modelle ve olmayan vardiya moduluyle kilitli; D'nin finans ici borcu az, firma bagi C ile kapanir, kalan Logo kolundadir.

| Tur | Akis | Calisacak parca konulari (tek yazar her parca) | Bekledigi |
|---|---|---|---|
| 1 | C | finans (C4, kur okuma), satin-alma (C1-C3, C6, C8, C9), stok (C5 sonrasi C7, C10-C13), malzemeler (`malzemeAra`, `malzemeOzetleri`) | SH1, SH2, SH4, SH6; C2, C7-C10 goclerinin onayi |
| 1 (yan) | - | uretim-emirleri istek paketi (A ve B'nin UE listesi) kullaniciya; projede yazilmaz | kullanicinin disari iletmesi |
| 2 | A | malzemeler (A1, A5, A6), istasyonlar, rota (A2-A4, A13), Arkon (A9-A11), kalibrasyon, dosya (#300-#302) | SH3; uretim-emirleri yeni modeli (A3, A7) |
| 3 | B | plan, istasyonlar (B-5), rota (B-6 ekran) | UE `planlanacakIsEmirleri`; personel-vardiya modulu |
| 4 | D | finans (D2-D4) | Logo kolu (#339) |

Her turda: rol satirlari ortak yetki matrisinden, kullanici onayiyla; akis kullanici deneyip "tamam" deyince biter.

## 5. Bulgular (karar degil, bilgi)
- `stok/BASKA-MODUL-ISTEKLERI.md` satir 23 "emrin varligini yabanci anahtar saglar (`stok_hareketi_uretim_emri_var`...)" diyor; goc `20261008142031_stok_tablolar.sql:69,127` sutunu duz `int` tanimliyor ("Asama 2: yabanci anahtar ayri gocle"). Belge eski (DOGRULANDI).
- `rota/baglanti.ts` ve stok istegi `malzemeAra` icin iki ayri imza bekliyor; malzemeler tek imza vermeli.
- Bugun hicbir modul `stok`, `satin-alma`, `rota`, `plan`, `kalibrasyon` `disari.ts`'ini sunucuda ithal etmiyor (grep, testler haric); bagla ilk kez yon kuracak, ADR 0006 dongu denetimi her turda gerekir.

## 6. Bagla tur 1 kararlari (kullanici, 2026-10-09 01:01; "hepsi a, su farklarla")

Kod adlari (SA, ML, AG, ST, KN, CK) konu listelerindendir (`satin-alma-tur1.md`, `malzemeler-tur1.md`, `stok-tur1.md`, `arkon-A-listesi.md`, `cekirdek-borclari.md`); burada yalniz fark ve kosullar.

- SA2 b (OS6 guncellendi): katalog kalemi malzeme kartina ZORUNLU baglidir, kopya tutulmaz. Kopya sutunlar (`kod`, `ad`, `kategori`, `birim`) duser; ad, birim, kategori karttan okunur. Yeni kalem yalniz "Malzemeler ve Hizmetler"de acilir; SAT-58 buna gore degisir. Kosullar: goc once sayar, baglanamayan kalem varsa hicbir seyi degistirmeden durur ve sayiyla kalemleri yazar; talep eden katalogda olmayan sey icin kart isteme yolunu ekranda gorur, talep yarim kalmaz (ekran once/sonra goruntusuyle); sira: once hizmet turu ve bag, kalemler baglanir, kopya sutunlarin dusmesi ayri gocle en son.
- Malzemeler ve Hizmetler: sayfa adi degisir (ana menu, ikinci menu basligi, sayfa basligi); modul adi, klasor, tablo ve islem adlari `malzemeler` kalir. Yeni tur `hizmet` (fason iscilik, bakim/onarim isciligi, nakliye, danismanlik...). Tur kisiti, sozlesme, sabit kimlikler guncellenir; stok kodu oneki sorulacak (ornek HZ). Hizmet kartinda zorunlu `hizmet_yonu` (alinan / verilen; adli kisit; diger turlerde bos; aktif olunca degismez; iki yon iki kart). Alt adimlar ture gore (ikinci menu, suzgec, form, kod yapisi); hizmette anlamsiz alanlar gizli; alan alan liste ve onaydan once ekrana dokunulmaz. Ofis ve temizlik malzemesi `sarf` turunde kategoriyle ayrilir, kalicilar `demirbas`; yeni tur yok; kategori Logo'ya gitmez. Hizmet karti recete bileseni olamaz (sunucu ret, test).
  Baska modullere istek: satin alma yalniz ALINAN hizmeti secer (sunucu ret, test); stok hizmeti stoklamaz, mal kabulde hizmet satiri depo girisi yazmaz, yalniz teslim bilgisi verir; Logo hizmet kartini malzeme ucuyla gondermez, tur karsiligina girmez, ayri hizmet karti ucuyla gider (alinan = 1, verilen = 2), o zamana kadar "hizmet karti baglantisi bekliyor"; kopru alanlari kullaniciya sorulur; ortak arayuz ve cekirdek: sayfa adinin gectigi yerler.
- KARAR: fason iscilik rota adimidir (recete bileseni degil). Yazim baslatmaz, konular once liste verir: rota (kaynak turu fason firma, finansin fason isaretli firmasi, termin gunu, alinan hizmet karti; sema ve ekran sorulur; prototipte varsa o gosterilir), satin alma (hizmet siparisi elle mi adimdan mi; yalniz liste), stok (borca: "fason firma ve fason konumu Asama 2'nin sonraki turunda, rota adimina bagli olarak"; ST6 a), uretim-emirleri (UE-LISTESI.md UE3).
- Sabit kimliklere eklenecek (proje talimati ve kurulum belgesi esitlenir): malzeme turleri hammadde, yarimamul, mamul, sarf, demirbas, hizmet; sayfa adi Malzemeler ve Hizmetler; ofis/temizlik sarf + kategori. Hizmet kartinin yonu var; Logo'da hizmet karti ayri kayit. Fason iscilik rota adimi; firma finansin fason isaretli karti; alimi alinan hizmet kartiyla satin almadan. OS6: katalog kalemi malzeme kartina zorunlu bagli, kopya yok.
- ML2 b: yeni "Birimler" sayfasi ACILMAZ; prototipin Ayarlar listesi kalir, kopru kaydi sunucu tablosuna yazar, yetki ucta `malzemeler.tanim-yaz`; kategori listesi de ayni yol. Kopru yapamiyorsa yazmadan once soylenir, a'ya donulur. (SH4 a'nin uygulamasi.)
- AG2: yazim YOK, once liste: donusumun dokundugu her yer (tesis ayari, kayitlardaki makine, Arkon ekraninin kod bekledigi yerler), etkilenen satir sayisi, geri alma yolu, Arkon ekraninin ayni calistiginin gosterimi. Onay listeden sonra.
- ST4 a + kural: toplamayi baslatan kisi ya da `stok.toplama` islemini tasiyan baskasi kapatir; baskasinin toplamasini kapatan kayitta gorunur (stok borc 15). Farkli kural gerekirse listede sorulur.
- SA3 a + kosullar: teklif ve sipariste o gunun kuru saklanmaya devam eder, gecmis kur degismez; dusen yalniz "guncel kur" kaynagidir (`finans_kur`). Finansta o tarih icin kur yoksa satin alma kullanicidan ister ve teklife yazar, finansa yazmaz. Goc once sayar.
- Teslim asimi: kalan miktari asan teslim REDDEDILMEZ; depo saydigini yazar; asan miktar siparis satirinda "fazla teslim" olarak gorunur, satin almaci gorur. Stok ve satin alma tek kurala ve tek sutun adina gore yazar (ad yazar konuca secilip bildirilir).
- ST2, ST3: yazimdan sonra mal kabul ekraninin once/sonra goruntusu. ST5, CK1: rol satirlari her akis icin tablo olarak onaya gelir; onaydan once goc yok. ST6 a. KN1 a: yeni kart gereken yer bildirilir, kullanici acar.
- CLAUDE.md "acik dal en cok 5" eskidi: birlestirici "parca basina bir acik dal" belge degisikligini onerir.
- Sira: cekirdek ve ortak arayuz once; her goc once sayar, etkilenecek satir varsa durur ve bildirir. Akis C bitince kullaniciya deneme adimlari verilir. UE listesi: `UE-LISTESI.md`.
- Not: SH2 b (GKK yok) gecerli; satin almada kalite alani bos kalir.
