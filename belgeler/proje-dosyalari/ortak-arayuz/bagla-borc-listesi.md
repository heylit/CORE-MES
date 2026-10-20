# Bagla: ortak arayuze dusen ve kullanimi etkileyen borclar (BO1 a)

Kaynak: ana dal `c73e2d4`, 17 `UYUM-BORCU.md`, acik `CEKIRDEK-ISTEKLERI.md` maddeleri, `/mnt/project-files/bagla/HAZIRLIK.md`.
Yalniz liste: dal yok, commit yok. Kart numarasi "yeni" olanlar kullanici "yaz" deyince acilir.
Kapsam: kabuk, ikinci menu, ortak bilesenler, istemci tarafi yetki gosterimi.

## 1. Ortak arayuze dusenler (bu konu yazar)

| No | Borc | Modul ve kaynak | Kullanimi nasil etkiliyor | Akis | Kart / dal |
|---|---|---|---|---|---|
| O1 | Ikinci menu maddesi tek islem tasiyor; Arkon maddeleri birden cok rolu anlatamiyor. Maddeye `biri: [...]` (islemlerden biri yeter) destegi | Arkon borc "Madde gorunurlugu kaba" ve Y7 | `sayfa.arkon` bir role verilince operator 6 maddeye tiklar ve Arkon ilk sayfasina geri doner. Bugun yalniz yonetici gordugu icin gizli | A, rol verilmeden once | yeni / `<kart>-menu-coklu-islem`. Tip `paylasilan/sayfa-tanimi.ts` (cekirdek seridi, tek commit once), suzme `istemci/src/ortak/rota/ikinci-menu.ts` `ikinciMenuyuSuz` |
| O2 | Ortak kisi secici yok | istasyonlar borc 3 ve 11 | Kisi kisitlari bolumu kisileri `GET /kisiler`'den okur; `istasyonlar.yaz` olup `kisiler.oku` olmayan rol sunucu hatasi gorur. Kisi paneli kendi ucunu kullanir | A | yeni / `<kart>-ortak-kisi-secici`. Okuma ucu kisiler modulunden (cekirdek seridi) gerekir |
| O3 | Ikinci menunun cihaza gore sade gorunumu (depocu modu) ve cihaz tercihleri icin ortak yer | stok CEKIRDEK-ISTEKLERI Ç6, stok borc 10 | Depocu modunda menu sadelesmiyor; stok tercihini kendi `localStorage` anahtarinda tutuyor | C (stok), sonra da olabilir | yeni / `<kart>-menu-sade-gorunum` |
| O4 | Belge kapanislari: satin alma borc 26 (tablette sol menu) #331 ile kapandi; Arkon borcundaki "1280'deki kuculme kabugun isidir" #292 (daraltma, tam ekran) ve U8A ile kapandi | satin-alma borc 26; Arkon borc "Mobil duzende kucuk dokunma hedefleri" satirindaki B1 notu | Yok (yalniz belge) | - | Modul dosyalari: o modulun konusu yazar ya da "yaz" ile bu konu tek belge commit'inde |

Ortak arayuzun kendi borcu (bilgi, kullanimi etkilemez): E1 Esc cerceve odaktayken calismaz (kabul), P3 `react-router-dom` 6.x iki orta uyari (canli oncesi).

## 2. Baska konulara istek (istemcide gorunen, ortak parca hazir ya da modul isi)

| No | Borc | Kime | Kullanimi nasil etkiliyor | Akis |
|---|---|---|---|---|
| I1 | Rota eski surumde cekirdegin `eskiSurum()` yerine kendi `cakisma(...)` iletisini doner | rota (B12), sunucu | Ortak istemcinin "kayit degismis, yenile" akisi rotada calismaz; kullanici yalniz hata iletisi gorur | A |
| I2 | Rota Kaynaklar bolumu surum gondermiyor (400), okuma 403; Operasyonlar yanlis semayla okur | rota (B13, B14), ekran | Bolumler kullanilamaz (HAZIRLIK A2) | A |
| I3 | Malzemeler prototipi kendi icinden gorunum degistirince kopruye bildirmiyor | malzemeler (borc 6 "bilinen sinir") | Adres ve menudeki etkin madde eski gorunumde kalir. Ortak kopru icerden gelen gorunum iletisini isliyor (VARSAYIM: `useYalitilmisGorunum` testi buna gore; malzemelerin hangi kancayi kullandigi bu listede dogrulanmadi) | A |
| I4 | Arkon menu sayaci baglanmadi (tek sayac ucu yazilmadi) | Arkon, sunucu | Hazirlik ve Kalite bekleyen sayilari menude gorunmez. Kabuk `sayacUcu` ile hazir | A |
| I5 | Stok yazma komutlari tekrar korumasiz | stok (borc 7, 12), uclar ve `useStokKomutu` | Ag hatasindan sonra yeniden gonderilen mal kabul iki belge acabilir. Ortak `tekrarKorumaliGonder` hazir | C (C15) |
| I6 | Satin alma teklif ekrani kirilimlari pencereye bakiyor | satin-alma (borc 28), ekran | Tablette 448 ve 624 pikselde siralama ve tablolar sikisiyor | C |
| I7 | Satin alma onay dugmeleri durumla gizlenmiyor | satin-alma (borc 29), ekran | Kullanici 422 iletisi gorur (HAZIRLIK C16) | C |
| I8 | Finans ayni kimlikli iki form | finans (borc 12), ekran | KDV ya da Kurlar sekmesi acikken cekmece formu kaydedilmez (HAZIRLIK D2) | D |
| I9 | Mudurun Denetim Kaydi'ni menude gormesi | cekirdek (denetim borc 1, rol satiri) | Mudur denetim ekranini acamaz | rol matrisi |

Bilgi (kullanimi bugun tutmaz, cekirdek karari Ç1): satin alma (borc 15, 23), malzemeler (borc 2) ve finans (cerceve) ekranlari ortak bilesen ve tasarim degiskeni kullanmiyor; ortak bilesenlere gecis ayri karar.

## Dogrulananlar
- Menu maddesi tipi tek `islem: I` (`paylasilan/sayfa-tanimi.ts:34-43`), suzme `islemler.includes(m.islem)` (`istemci/src/ortak/rota/ikinci-menu.ts:16-21`). DOGRULANDI.
- Ortak arayuzde kisi secici bileseni yok (grep `KisiSecici` bos). DOGRULANDI.
- Satin alma borc 26'nin konusu #331 ile main'de (DOGRULANDI, PR birlesti 08.10.2026).

## Ek (09.10.2026): uzun sayfa adi dar ekranda (malzemeler istegi, koordinator)

| No | Borc | Kaynak | Kullanimi nasil etkiliyor | Oneri |
|---|---|---|---|---|
| O5 | 360'ta ust cubuktaki sayfa basligi kesiliyor: "Malzemeler ve Hizmetler" -> "Malzeme... / ve..." | `bagla/malzemeler-hizmet/yazim/sonra-ticari-360.png`; kabuk `kabuk.css` telefonda 2 satir sinirli baslik | Kullanici hangi sayfada oldugunu ust cubuktan okuyamiyor | a) Telefonda (<768) tema, kisi ve cikis tek "Hesap" dugmesinde menu olur (ortak `Menu`); baslik 104 px'ten 216 px'e cikar, ad iki satira sigar (olcum, `ortak-arayuz/baslik/once-360.png`, `taslak-360.png`). b) Sayfa tanimina istege bagli `kisaBaslik`, telefonda o yazilir (paylasilan, cekirdek seridi; her uzun ad icin modul karari). c) Telefonda baslik yazisi kuculur. Oneri: a; ayri dal `172-telefon-ust-cubuk`, #172 altinda |

Olcum (DOGRULANDI, Chromium 360, cerceveli sayfa, 4 dugme): baslik genisligi 104 px, iki satirda "Malzemeler" tek satira sigmiyor. Taslakta iki dugme gizlenince 216 px, "Malzemeler ve / Hizmetler" kesilmeden. 768 ve ustu degismez.
