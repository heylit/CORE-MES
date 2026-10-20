# Cekirdek (kart #259, #247 cekirdek kismi): liste ve uretim-emirleri etki raporu

Ortam: `node -v` = v24.21.0 (kuruldu; ortamda v22.22.0 vardi). Depo `origin/main` 4a70288. `npm ci` ve `npm run harita` cikis 0.
Goc sirasi (31): ilk `20261005120000_kisiler.sql`, son `20261007230000_satin_alma_tablolar.sql`.
Kod yazilmadi, dal acilmadi, commit yok.

## a) Acik kartlar (cekirdek parcasi)

| Kart | Ozet | Bu turdaki yeri |
|---|---|---|
| #259 | Semsiye: sunucu cekirdegi ve paylasilan icin dis yazim | bu konu |
| #247 | Oturumla acik okuma uclari sayfa yetkisi istesin (uretim emirleri, istasyonlar, makineler, nedenler) | cekirdek kalibi bu konuda; modul uclari sahiplerinde |
| #224 | Yeni bakim rolu; arkon.bakim ona | rol karari sende; matris hazir (asagida) |
| #229 | malzemeler.tanim-yaz planlama_proje ve mudur rollerine | rol karari sende |
| #223 | Tek yetki matrisi (Arkon ince yetkileri TMI matrisinde) | Arkon konusuna verildi; cekirdekten istek gelirse yazarim |
| #157 | Yalniz-ekleme defterlerinde uygulama kullanicisindan UPDATE/DELETE hakki alinsin | SONRA |
| #169 | Liste ve sayfalama kalibi; zaman alani kalibi | SONRA |
| #176, #174, #173 | Sadelestirme; canli oncesi goc indirme; tablo onekleri | SONRA |
| #119, #116, #56, #50, #27 | Denetim tek satir; kimlik testleri; baglanti hatasi gunlugu; isleyicide ayar; goc kilidi suresi | SONRA |
| #82 | Dosya saklama (cekirdek) | SONRA (Arkon kendi deposunu kullaniyor) |
| #207-#210 | Logo baglantisi, isci, ADR, ortam degiskeni | BEKLEMEDE (senin karar 6) |
| #121-#125, #122 | Bulut/yerel esligi, platform esligi | ASKIDA / arac isi |
| #44 | Yayin hazirligi | canli kurulum, kapsam disi |
| #85 | Yeni sayfalar ve menu gruplari | o moduller gelince |

Ortak arayuz konusuna ait (bu konu yazmaz): #172, #236 (cerceve yalitimi, dal `236-cerceve-kisitlamasi`), #128, #115, #112, #107-#110, #89, #88, #87, #52, #29.

## b) UYUM-BORCU maddeleri (cekirdege dusenler)

Cekirdegin kendi UYUM-BORCU dosyasi yok; asagidakiler modul borclarinda cekirdekten beklenenlerdir.

KULLANIMI TUTAN
1. Okuma uclarinda yetki acigi (#247). DOGRULANDI: `GET /uretim-emirleri`, `/uretim-emirleri/:id`, `/terminal/isler`, `/is-merkezleri`, `/istasyonlar`, `/istasyonlar/secim`, `/makineler`, `/durus-nedenleri`, `/hurda-nedenleri` `yetki: 'oturum'` (ilgili `uclar.ts`). Cekirdek uc katmani yalniz veri islemi kabul ediyor (`sunucu/cekirdek/uc.ts` `UcYetkisi = VeriIslemi | 'acik' | 'oturum'`; `paylasilan/islemler.ts` "Uc yalniz veri islemi ister"). Bu yuzden malzemeler sayfa denetimini serviste yapiyor (`malzemeler/UYUM-BORCU.md` "Uc katmani sayfa islemini kabul etmedigi icin"), satin alma da (`satin-alma/UYUM-BORCU.md` madde 7). Cekirdek isi: okuma uclari icin yetki kalibi (soru 1). Gelen moduller de bu kalibi kullanacak.
2. Hicbir rolde Arkon yetkisi yok: akis A yonetici olmadan kosmaz. DOGRULANDI: `arkon/UYUM-BORCU.md` "`sayfa.arkon` ve `arkon.*` kayitli ama hicbir role verilmedi". Onerilen matris `224-bakim-rolu-ve-arkon-rolleri` dalinda (`kurulum/yetki-matrisi.md`, goc `..._kisiler_bakim_rolu_arkon_islemleri.sql`, `..._kisiler_malzemeler_tanim_islemi.sql`); dal main'in 27 commit gerisinde, 19 commit onde ve malzemeler/denetim degisiklikleri de tasiyor (soru 2).

KULLANIMI ETKILEYEN
3. Arka plan yineleyici yok (Arkon yansimasi). DOGRULANDI: `arkon/UYUM-BORCU.md` sinir (f): bekleyen yansima yalniz yeni kayit gelince yeniden denenir; hic kayit gelmezse emirdeki sayi sonraki kayda kadar eksik kalir. Onayli kararla celisir: "arka plan isi yazilmayacak" (#70 karar 5, #92; #208 beklemede) (soru 3).

SONRA
4. #157 defter haklari (bugun tetikleyici koruyor; ikinci kat eksik).
5. Surum, liste, kisit kaliplarina tasima (Arkon, malzemeler, satin alma: `surumluGuncelle`, `sayfaliListe`, `kisitKorumali` kullanilmiyor; #90, #168, #169). Modul isi; cekirdek kaliplari var.
6. Denetim kaydinda Arkon belge govdesinin daraltilmasi (kullanici karari bekliyor; `arkon/UYUM-BORCU.md` Yetki).
7. Logo / SMARTES alanlari; dosya saklama (#82); ekran kurallari istisnasi (Ç1, malzemeler ve satin alma ekranlari).

## c) Baska parcalardan beklenenler

- Istasyonlar konusu: kendi okuma uclarini (#247) yeni kaliba baglar; okuma islemi gerekirse `paylasilan/islemler/istasyonlar.ts`'e ekler, ben toplayiciya (`paylasilan/islemler.ts`) baglarim.
- Malzemeler konusu: servis icindeki sayfa denetimini kaldirip uclari kaliba baglar (`malzemeler.oku` ya da sayfa islemi, soru 1'e gore).
- Satin alma konusu: `GET /satin-alma-acilis` uc yetkisini kaliba baglar.
- Satin alma konusunun cekirdekten istegi (bu konu yazar, onaydan sonra): `paylasilan/sayfalar.ts` `IKINCI_MENULER`'e `SATIN_ALMA_IKINCI_MENU`; `paylasilan/sayfalar.test.ts`'te dort satin alma sayfasi beklentisinin tek sayfaya inmesi; `sunucu/moduller/oturum/oturum.test.ts:192`'deki uc sayfa isleminin kalkmasi (oturum testi bu konunun klasoru disinda; toplayici sonucu oldugu icin birlikte yazilir). KULLANIMI TUTAN: bunlar olmadan satin alma dali tam kontrolde kirmizi.
- Istasyonlar konusunun cekirdekten istegi: ikinci menusunun toplayiciya (`IKINCI_MENULER`) eklenmesi; ayni commit kalibi.
- Durus-nedenleri: `/durus-nedenleri`, `/hurda-nedenleri` bu turda konusu yok. VARSAYIM: kalip girince bu iki uc acik kalir ve borca yazilir; ya da sen konu acarsin.
- Uretim-emirleri (disarida): uc okuma ucu kaliba baglanir. BASKA-MODUL-ISTEKLERI.md'ye yazilacak, sana tek satir gelir.
- Arkon konusu: #223 icin cekirdekten islem kaydi istegi gelirse yazarim.

## Etki raporu: uretim-emirleri (salt okuma)

Ozet: bugunku `uretim_emri` satiri "bir parca + adet + tek istasyon"; kendi basina baslatilip sayilan is. Yani karardaki IS EMRINE karsilik gelir; urun (mamul) emri kavrami yok. `emir_adimi` rota adimi degil, istasyonsuz kontrol listesi.

Tablolar (DOGRULANDI, `sunucu/gocler/20261007002531_uretim_emirleri_tablolar.sql` ve sonrakiler):
- `uretim_emri`: id, emir_no (`'UE-'||lpad(id)`), `parca_no`, `parca_ad` (serbest metin), adet, `istasyon_id NOT NULL -> istasyon`, durum (planli/basladi/bitti/iptal), `acan_id -> kisi`, zamanlar, saglam_adet, `calisma`; istasyonda tek calisan kismi indeksi.
- Defterler: `uretim_kaydi`, `uretim_olayi` (`durus_nedeni_id -> durus_neden`), `uretim_sayimi` (`hurda_nedeni_id -> hurda_neden`): hepsi `emir_id`, `kisi_id`, `istasyon_id` tasir, yalniz eklenir.
- `emir_adimi` (`emir_id -> uretim_emri`, sira, ad, aciklama; istasyon, operasyon tipi, sure yok), `emir_adimi_olayi` (tamamla/geri-al).

Kim bagli:
- Yabanci anahtarla baska modul tablosu: YOK. Arkon bilincli FK'siz: `arkon_tmi_yansima.emir_id int` (`20261007223000_arkon_tmi_yansima.sql:5`), `arkon_kayit` `emir_no text`; paket kimligi `tmi-ue-<emir id>`.
- `uretim-emirleri/disari.ts`'i yalniz Arkon cagiriyor (`arkon/servis.ts:15-16`): `acikEmirler`, `emirOzeti`, `emirBaslat`, `emirDevam`, `emirDuraklat`, `emirBitir`, `emirSayim`, `emirDurdur`, `KOMUT_ISLEMI = 'terminal.uret'`. Arkon testleri HTTP ile `/uretim-emirleri` ve `EmirAyrintiCevabi` kullaniyor (`arkon/yansima.test.ts`).
- Uretim-emirlerinin verdigi baglar: istasyon, kisi, durus_neden, hurda_neden.
- paylasilan: `sozlesme/uretim-emirleri.ts`, `islemler/uretim-emirleri.ts` (`uretim-emirleri.yaz`), `islemler/terminal.ts` (`terminal.uret`), `sayfalar/uretim-emirleri.ts`, `sayfalar/terminal.ts`; toplayicilar `paylasilan/sayfalar.ts`, `paylasilan/islemler.ts`.
- Istemci: yalniz `uretim-emirleri` ve `terminal` ekranlari; baska modul ekrani kullanmiyor (ortak testler yalniz tip ithal ediyor).
- Rol satirlari: `20261007001021_kisiler_uretim_emri_islemleri.sql` (mudur ve planlama_proje `uretim-emirleri.yaz`; mudur ve operator `terminal.uret`).

Karar uygulaninca degisecekler (CIKARIM; VARSAYIM: bugunku tablo yeniden adlandirilmaz, "is emri" olarak kalir, ustune urun emri gelir):
1. Yeni ust tablo (urun emri) ve `uretim_emri`'ye ust emir sutunu (eski satirlar icin bos olabilen). Dolu tabloyu degistiren sema: sorulur kademesi. Etkilenen: yalniz uretim-emirleri.
2. Rota adimi = is emri olunca `emir_adimi` ya kalkar ya is emrine donusur; istasyon ve operasyon tipi is emrinde. Adim olay defteri ile uretim defterlerinin iliskisi: BILMIYORUM. Etkilenen: emir acma ekrani, terminal adim bolumu.
3. Istasyonda tek calisan kurali ve `calisma` tetikleyicisi istasyon bazli; istasyon is emrinde kaldikca degismez. Istasyonlar etkilenmez; operasyon tipi katalogu istasyonlardan okunur.
4. `disari.ts` imzalari is emri kimligiyle calisiyor; anlam korunursa Arkon degismez. Is emri kimligi ya da numarasi degisirse Arkon paket kimlikleri (`tmi-ue-<id>`) ve FK'siz bekleyen yansimalar kirilir. Urun emri icin yeni okuma imzasi gerekir. Arkon sozlesme testi bunu yakalar.
5. Sozlesme: emir acma govdesi `parcaNo/parcaAd/istasyonId` yerine malzeme karti (`malzeme_katalog_karti.no`) ve rota. Yeni islem (urun emri acma) gerekirse rol goc'u: rol karari sende.
6. Ekranlar: emir listesi (urun emri mi is emri mi), emir ayrintisi (altinda is emirleri), emir acma. Terminal `/terminal/isler` is emri listeler; degismez.
7. Cekirdek ve paylasilan koke etkisi: yalniz toplayicilara yeni dosya kaydi ve soru 1'deki okuma kalibi. Cekirdek kodu degismez.

## Sorular

1. Okuma uclari yetki kalibi. Neden: #247 acigini kapatmak icin uc katmani okuma yetkisini denetlemeli; bugun ADR 0003 "uc yalniz veri islemi ister, sayfa islemi yalniz menu gorunurlugudur" diyor, bu degisir (onayli karar). Secenekler: (A) uc, sayfa ya da veri islemlerinden bir LISTE kabul eder, herhangi biri yeter (ornek: `/istasyonlar` -> `sayfa.istasyonlar` ya da `sayfa.uretim-emirleri`; emir acma ekrani istasyonlari okur); yeni rol satiri gerekmez. (B) her modul `<modul>.oku` veri islemi tanimlar, roller goc'le verilir; sayfa ile okuma ayri yonetilir. Oneri: A (kartin kendi metni "sayfa yetkisi istesin"; rol goc'u gerektirmez; ADR'ye yazilir).
2. Rol matrisi (#224, #229, Arkon rol dagilimi). Neden: rol yok, operator Arkon'u acamaz, akis A yonetici olmadan kosmaz. Tablo `224-bakim-rolu-ve-arkon-rolleri` dalinda `kurulum/yetki-matrisi.md` (ozet: mudur arkon.amir, planlama_proje arkon.planlama, kalite arkon.kalite, cam arkon.hazirlik, operator arkon.operator, yeni bakim rolu arkon.bakim, hepsine sayfa.arkon; malzemeler.tanim-yaz mudur ve planlama_proje). Secenekler: kalsin / degissin (satirlari yaz). Kalsin derse kim yazar: (a) bu konu yalniz rol goclerini, matris belgesini ve testlerini kendi dalina alir; (b) 224 dali guncellenip birlestirilir. Oneri: kalsin + (a); 224 dali eski ve baska modul degisikligi tasiyor.
3. Arka plan yineleyici. Neden: kayit gelmezse bekleyen yansima emre gecmiyor; ama "arka plan isi yazilmayacak" onayli karar. Secenekler: (a) bu turda yok, borcta kalir (her kayit istegi bekleyenleri yeniden dener); (b) yalniz bu is icin surec ici zamanlayici kalibi, ADR ile. Oneri: (a).
