# Ana sayfada modul kartlari (ortak arayuz listesi)

Kaynak: ana dal `6e04d3e`. Yalniz liste: dal yok, commit yok. Goruntuler `ana-sayfa/` klasorunde.

## 1. Bugun
- "/" sistem modulunun: `istemci/src/moduller/sistem/rotalar.tsx` icinde `[{ yol: '/', ekran: SistemDurumu }]`. DOGRULANDI.
- Ana sayfa tek kart: "Sistem durumu" (saglik; `saglik.ayrinti-oku` olana ayrinti ve zamanlanmis isler). DOGRULANDI (`SistemDurumu.tsx`).
- Modullerin ana sayfaya kart koyacagi yer yok: ortakta ana sayfa yuvasi, bildirim tipi ya da toplayici yok (grep `anasayfa|ana-sayfa` yalniz finansin kendi menu maddesini buluyor: `paylasilan/sayfalar/finans.ts:19`, yol `/finans`). DOGRULANDI.
- Rotalar `istemci/src/ortak/rota/kesif.ts` icinde `import.meta.glob('../../moduller/*/rotalar.tsx')` ile toplaniyor; ayni yolu iki modul isterse cakisma hatasi veriyor. DOGRULANDI. Yani ortak modul dosyasini glob ile toplayabiliyor; ayni kalip kartlar icin de kullanilir.
- Goruntu: `once-360.png`, `once-768.png`, `once-1280.png` (yonetici, yerel bos veritabani).

## 2. En kucuk ortak yapi (oneri)
1. Tip (ortak): `AnaSayfaKarti = { anahtar, sira, islem?, veya?, genis?, ekran }`. `islem` yoksa her oturum gorur (bugunku "/" gibi); `veya` menudeki gibi "islemlerden biri yeter".
2. Bildirim (modul): modul isterse `istemci/src/moduller/<ad>/ana-sayfa.tsx` dosyasinda `anaSayfaKartlari` disa verir. Kart icerigi ve verisi modulundur; sunucu yetkisi ucta kalir.
3. Toplama (ortak): `istemci/src/ortak/rota/ana-sayfa.ts` glob ile toplar, ayni `anahtar` iki kez gelirse hata verir (rota cakismasi gibi).
4. Gosterim (ortak): `istemci/src/ortak/arayuz/AnaSayfa.tsx` oturumun islemlerine gore suzer (`maddeGorunurMu` ile ayni kural), `sira`ya gore dizer; 1024 ve ustu iki sutun, altinda tek sutun; `genis` tam satir. Gorunecek kart yoksa bos durum.
5. "/" sahipligi (iki yol):
   - A (onerim): "/" ortaga gecer (kabuk ana sayfasi). Sistem "/" rotasini birakir, "Sistem durumu"nu kart olarak bildirir (`genis`, `islem` yok). Sistem klasorunde iki satirlik degisiklik.
   - B: "/" sistemde kalir, `SistemDurumu` ustune `<AnaSayfa />` cizer. Ortak bir modul ekranina gomulur; kabugun parcasi modulde durur.
6. Testler: suzme (islem, veya, islemsiz), siralama, anahtar cakismasi, 360/768/1280 tasma yok. Kaynak dosyayi metin olarak okuyan test yok (sinir h).
7. Yeni bagimlilik yok. Sunucu, `paylasilan` ve goc degismez (VARSAYIM: kart icin yeni sayfa islemi gerekmezse; gerekirse `paylasilan/islemler.ts` cekirdek seridi isidir).

## 3. Taslak (once ve sonra)
- `taslak-360.png`, `taslak-768.png`, `taslak-1280.png`: canli sayfaya tarayicida eklenen taslak; depoya hicbir sey yazilmadi.
- Ustte "Satin alma talebi" karti (malzeme ya da hizmet, miktar, birim, ihtiyac tarihi, aciklama, "Talep ac"), yaninda "Taleplerim", altta tam satir "Sistem durumu".
- Kart icerigi ve alanlari satin almanin isidir; taslaktaki alanlar VARSAYIM, veriler uydurmadir. Ortak yalniz yuvayi, sirayi ve yetkiyle suzmeyi verir.
- Yatay tasma uc genislikte de 0 piksel (olcum, taslak dahil). DOGRULANDI.

## 4. Kart
- #172 ("Ortak arayuz: dis teslimlerin bekledigi eksik parcalar", acik) kapsamina girer: ortak parca, cekirdek istekleri oraya ekleniyor. Yeni kart gerekmez (VARSAYIM; dal adi `172-ana-sayfa-kartlari`).
- Yol A'daki sistem klasoru degisikligi (iki satir) ortak arayuz oturumunun yazamadigi modul klasorundedir; ya sistem modulunun yazari yapar ya kullanici bu iki satira izin verir.
- Talep kartinin kendisi (form, uc, "Taleplerim") satin alma konusundadir; ortaga dusmez.

## 5. Kullaniciya sorulacaklar (bu konudan)
1. "/" sahipligi. Neden: kabugun ana sayfasi ya ortakta ya sistem modulunde durur; sonradan tasimak her kartin yerini degistirmez ama sistem ekranini degistirir. Secenekler: a) "/" ortaga gecer, Sistem durumu kart olur; b) "/" sistemde kalir, kartlar sistem ekranina gomulur. Oneri: a.
(Rol, islem ve "Taleplerim" sorulari satin alma listesindedir; burada tekrarlanmadi.)
