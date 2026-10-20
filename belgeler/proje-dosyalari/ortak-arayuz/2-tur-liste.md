# Ortak arayuz 2 (kart #172, dal 172-ortak-arayuz-2): liste

Depo origin/main 79fb93e. Yalniz kabuk (istemci/src/ortak); Arkon ve malzemeler ekranina dokunulmaz. Dal acilmadi, commit yok.

## B1 Ikinci menu daraltilabilir
Bugun (DOGRULANDI, kod): >=1280'de ikinci menu 248 px sutun (`--ikinci-menu`), ana menu 72 px serit; 768-1279 ve <768'de ikinci menu icerigin ustunde yatay serit (`genis-ekran.ts` esigi 1280).
Arkon: `arkon/web/src/app/baslat.ts:57-62` `useFit`: cerceve genisligi W < 900 ise mobil duzen (zoom 1); degilse zoom = min(W/(1600+84), H/900), RAIL=84 (`baslat.ts:18`).

Oneri:
- Dugme ikinci menu sutununun basliginda (`chev-left` / `chev-right`, 44x44, "Menuyu daralt" / "Menuyu genislet").
- Dar hal: YALNIZ SIMGE, 72 px (ana menu seridiyle ayni genislik; madde adi `title` ve ekran okuyucu adi olarak kalir, sayac simgenin kosesinde). Secenek: tamamen gizli (dugme ust cubuga gecer).
- Daraltma yalniz sutun kipinde (>=1280). 768 ve 360'ta ikinci menu zaten serittir; degismez.
- Varsayilan: cerceveli sayfa ve pencere < 1536 px ise dar; oteki her durumda genis.
- Tercih kullanici basina ve ikinci menu (modul) basina tarayicida saklanir; secilen deger varsayilani ezer. VARSAYIM: anahtar kisi kimligi; bunun icin `istemci/src/App.tsx`'te Kabuk'a `kullaniciId` tek satir eklenir (kabuk baglantisi). Geri alma ucuz.

Cerceve genisligi ve Arkon zoom (pencere 1280x800, 768x1024, 360x740; cerceve yuksekligi = pencere - 56 ust cubuk - serit):
| Genislik | Once: cerceve / Arkon | Sonra, yalniz simge | Sonra, tamamen gizli |
|---|---|---|---|
| 1280 | 960 px / zoom 0.570 (N7 olcumu) | 1136 px / zoom 0.675 | 1208 px / zoom 0.717 |
| 1536 (esik, varsayilan genis) | 1216 px / 0.722 | dar secilirse 1392 / 0.827 | 1464 / 0.869 |
| 768 | 696 px / mobil, zoom 1 | degismez | degismez |
| 360 | 360 px / mobil, zoom 1 | degismez | degismez |
1280 "once" N7'de olculdu; geri kalan sayilar koddaki formulle HESAP (yukseklik siniri 744/900 = 0.827 genislikten buyuk, genislik belirliyor). Sonra degerleri yazimdan sonra 1280'de olculecek.
Malzemeler 1280: cerceve 960 -> 1136 (simge) / 1208 (gizli). Malzemelerin kendi yan menusunun hangi genislikte gizlendigi BILMIYORUM (768'de cerceve 696 px iken gizli; N7).

## B7 360'ta sayfa basligi
Bugun: `h1.tc-kabuk-baslik` tek satir, uc noktayla kesiliyor (kabuk.css:41). 360'ta basliga ~160 px kaliyor (3 dugme x 44 + bosluklar).
Secenekler:
1. ONERI: <768'de iki satira insin (`-webkit-line-clamp: 2`, yazi `--yazi-l`); ust cubuk 56 px'te iki satir sigar. "Durus ve Hurda / Nedenleri", "Malzeme / Katalogu". Ucuncu satir gerekirse uc nokta.
2. Kisa baslik: sayfa tanimina `kisaBaslik` alani; paylasilan/sayfalar.ts (cekirdek) degisir ve her modul kisa ad yazar. Bu turda daha pahali.
3. Yazi kuculsun, tek satir kalsin: uzun adlarda yine kesilir.

## B8 Yatay kayan ikinci menude kaydirma isareti
Oneri: seridin gizli icerik olan kenarinda solma ve kucuk ok simgesi (`chev-left` / `chev-right`, dokunulmaz, ekran okuyucuya gizli). Kenar durumu kaydirma ve boyut degisince guncellenir (oznitelik; stil yalniz degiskenle). Ok dugme degil: dokunma hedefi eklemez.

## Teslim
- Her madde ayri commit, izinli ve reddedilen test (ornek: tercih yokken cerceveli < 1536 dar acilir / 1536'da genis acilir; secilen tercih yeniden yuklemede kalir / baska kullanicinin tercihi uygulanmaz; seritte daraltma dugmesi cizilmez).
- tip, lint, sinir, test:istemci; 360/768/1280 basliksiz Chromium.
- Bitince N7 olcumu Arkon ve malzemeler icin 1280'de yeniden (yerel PostgreSQL 16 var; Playwright depo disinda, package.json degismez); once/sonra tablosu.
- FARK.md.
