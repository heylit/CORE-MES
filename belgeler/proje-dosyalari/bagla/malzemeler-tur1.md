# Asama 2, tur 1 (akis C, tedarik): malzemeler listesi

Kaynak: ana dal c73e2d4, `bagla/HAZIRLIK.md`, `stok/` ve `rota/BASKA-MODUL-ISTEKLERI.md`, `malzemeler/disari.ts`, `sorgular.ts`, `katalog.html`.
Kart #163 (modulun kendi karti). Dal `163-malzemeler-oturtma-o7b51n`, son main'den yeniden acilir (onceki PR'lari birlesti).
Kullanici "yaz" demeden dal acilmaz, commit atilmaz.

## Yazilacaklar (malzemeler klasoru, kendi gocu, paylasilan/sozlesme/malzemeler.ts)

M1. `malzemeOzetleri(db, idler): Promise<Map<number, KatalogMalzemeOzeti>>`. Tek sorgu; bos dizide sorgu atilmaz; olmayan kimlik haritada yer almaz.
    Ozet bugun `birim` tasiyor (DOGRULANDI `sorgular.ts` KATALOG_BIRIM, satir 128-133). Stok'un istedigi `stokBirimi` bu alandir; yeni alan acilmaz.
M2. `malzemeAra`, tek imza (stok ile rota istekleri birlesir):
    `malzemeAra(db, { metin: string | null; turler?: readonly MalzemeTuru[]; yalnizAktif?: boolean; sayfa: number; sayfaBoyu?: number }): Promise<SayfaliListe<KatalogMalzemeOzeti>>`.
    Stok kodu ya da adda gecen metin (buyuk-kucuk harf duyarsiz); sayi yazilirsa kart no da eslesir. Siralama: kod.
    VARSAYIM: ek indeks ya da `pg_trgm` yok (katalog binlerce satir; yavaslarsa ayri is). Geri alma: dusuk.
M3. Birim listesi (SH4 a): yeni tablo `malzeme_birimi (kod, ad, aktif, sira)` ve `olcuBirimleri(db)`.
    Ad: HAZIRLIK `malzemeBirimleri(db)` diyor; rota `malzemeBirimleri(db, nolar)` adini kart birimi icin istemis (rota istegi madde 3). Cakisma olmasin diye liste `olcuBirimleri`,
    kart basina birim M1'deki ozetten okunur (rota'nin istegi M1 ile karsilanir). VARSAYIM, geri alma: ad degisikligi.
    Goc tabloyu prototipin listeleriyle (BIRIMLER ve tur listeleri) ve kartlarda bugun gecen birimlerle doldurur; kartlara dokunmaz.
    Kart kaydinda sunucu listede olmayan birimi 422 ile reddeder (yalniz yeni kayit ya da birim degisen kayit; eski kart oldugu gibi okunur).
    Birim listesi okuma ucu `GET /malzeme-birimleri` (sayfa.malzemeler); yazma `POST /malzeme-birimleri/kaydet` (malzemeler.tanim-yaz; yeni islem yok).
    Kart ekraninda secim: kopru, prototipin var olan liste ayari ('birim', 'birim|<tur>') yerine sunucu listesini verir; `katalog.html` degismez (VARSAYIM: bu yolla olur; olmazsa sorarim).
M4. Logo birim seti karsiligi birim listesine baglanir: karsilik satirlari birim listesinden gelir (SH4 a son cumlesi). Kisit sorusu asagida (S1).

## Kapanacak UYUM-BORCU maddeleri
- Logo bolumu madde 2 "Birim hala kartin JSON alanidir": kismen (liste tabloda, kart degeri hala JSON; sutuna tasima dolu tabloyu degistirir, sorulmadi, yapilmaz).
- `ORTAKLIK-malzemeler.md` disari listesi ve birim satiri guncellenir.
- Stok borc 2, 4, 5, 9, 21 ve rota B3 malzemeler tarafindan karsilanir; kapatmayi o moduller yapar.

## Diger parcalara istek (yazmam)
- stok: `malzemeAra` cagrisini yeni imzaya, ozetteki `birim`'i ekranda gostermek (C5, C13).
- satin-alma: katalog kopyalari (C8) icin `malzemeOzetleri`; birimi serbest metin yerine `olcuBirimleri` listesinden (OS4).
- rota (tur 2): `baglanti.ts` gecici `malzemeAra` yeni imzaya; `malzemeBirimleri(db, nolar)` yerine `malzemeOzetleri`.

## Sorular (dolu tablo)
S1. Logo birim karsiligi tablosu (`malzeme_logo_karsiligi`, dolu olabilir) birim listesine yabanci anahtarla baglansin mi?
    Neden: SH4 a "Logo karsiligi bu listeye baglanir" diyor; anahtar dolu tabloya kisittir.
    a) Evet; goc once listede olmayan karsilik satirlarini sayar, varsa hicbir sey degistirmeden sayi ve satirlarla durur (oneri)
    b) Hayir; baglanti yalniz ekranda (karsilik satirlari listeden gosterilir), veritabaninda anahtar yok
S2. Birim listesini kim nerede duzenler?
    Neden: bugun liste prototipin Ayarlar ekraninda ve tarayicida; sunucu tablosuna gecince tek yer olmali.
    a) Malzemeler ikinci menusunde yeni "Birimler" sayfasi, tanim yazan duzenler; prototipte birim listesine yapilan degisikligi kopru sunucuya yazmaz (oneri; prototip ekrani degismez, VARSAYIM: kopru bunu ayirt edebilir, edemezse sorarim)
    b) Prototipin var olan Ayarlar listesi; kaydi kopru sunucu tablosuna yazar
