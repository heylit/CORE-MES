# Temel moduller duzen raporu (kisiler, oturum, ayarlar, denetim)

Salt okuma. Dosya degistirilmedi, commit atilmadi.

Okunan commit: `9b6582f` (origin/main, 08.10.2026). Koordinatorun verdigi `8bf861a` bunun atasidir; aradaki 5 commit
yalniz satin-alma dosyalarina dokunuyor (DOGRULANDI: `git diff --name-only 8bf861a 9b6582f`, dort modulden dosya yok).
Goc sirasi (harita): 33 goc, ilki `20261005120000_kisiler.sql`, sonu `20261008013200_kisiler_malzemeler_tanim_islemi.sql`.

## Kosulan komutlar (bu container, Node v22.22.0; depo `engines` >=24 istiyor)

| Komut | Son satir |
|---|---|
| `npm run tip` | cikis 0 |
| `npm run lint` | cikis 0 |
| `npm run sinir -- --modul <ad>` (dordu) | "Sinir denetimi: 398 dosya, 0 ihlal." / "Dongu denetimi (<ad>): 0 dongu." / "Taban dal bulunamadi ... main" (ayrik HEAD'de okundu, goc damgasi denetimi bu yuzden kosmadi) |
| `npm run test:modul -- denetim` | sunucu 11/11 |
| `npm run test:modul -- ayarlar` | sunucu 14/14, istemci 5/5 |
| `npm run test:modul -- oturum` | sunucu 42/42 (istemci testi yok) |
| `npm run test:modul -- kisiler` | sunucu 79/79, istemci 24/24 |

Testler container icindeki gecici PostgreSQL 16 ile kostu. Kosulmadi: 360/768/1280 ekran denetimi, Windows.

## DUZEN'in alti maddesine gore durum

| Madde | kisiler | oturum | ayarlar | denetim |
|---|---|---|---|---|
| 1. Yer | uygun: sunucu, istemci, paylasilan (sozlesme, islemler, sayfalar), kendi gocleri | uygun; istemcide yalniz `Giris.tsx` (rota yok, kabuk cizer) | uygun | yalniz sunucu; istemci, sozlesme yok |
| 2. Kimlik: tek sayfa | uygun: `/personel` (`sayfa.personel`) | sayfasi yok (giris; gerekmez) | uygun: `/ayarlar` (`sayfa.ayarlar`) | sayfasi yok |
| 2. Ikinci menu | YOK | gerekmez | YOK | gerekmez (sayfa yok) |
| 2. Tablo adi modul oneki | YOK: `kisi`, `kisi_rolu`, `rol`, `rol_islemi` | YOK: `oturum` (ad modulle ayni), `giris_denemesi` | YOK: `ayar` | uygun: `denetim_kaydi` |
| 2. Adli kisit | kismen: `rol.kod` UNIQUE/CHECK, `kisi.ad` CHECK adsiz (`20261005120000_kisiler.sql`) | kismen: `oturum.anahtar_ozeti` UNIQUE adsiz | uygun | uygun |
| 3. Sahiplik | kisi sabit kimlik, sahibi bu; `rol_islemi` haritada "sahibi belirsiz", fiilen kisiler gocleri yaziyor | kendi tablolari | ayar deposunun sahibi; tanimlar modullerde (`paylasilan/ayarlar/<modul>.ts`) | kendi tablosu; `kisi_id` FK |
| 4. Yon | 0 dongu; bagimli olan 7 modul | oturum -> kisiler | ayarlar -> denetim | kimseye bagli degil |
| 5. Guvenlik | her yazma ayri uc ve islem; sunucu zamani; bayrakli hedef korumasi; surum YOK; tekrar korumasi YOK | giris bekleme, 429, anahtar ozeti, oturum gecersizlestirme | tek yazma ucu, denetim kaydi; surum YOK (NOTLAR'da bilinen) | yazma yok; gizli alan maskeleme |
| 6. Belgeler | UYUM-BORCU, ORTAKLIK, GUVENLIK-DENETIMI, KURAL-TEST yok | ayni, yok | ayni, yok | ayni, yok |

Belge yoklugu DOGRULANDI: depoda bu dosyalar yalniz arkon, malzemeler, satin-alma klasorlerinde var.

## Uclar ve yetki (harita ciktisi)

| Modul | Okuma | Yazma |
|---|---|---|
| kisiler | `GET /kisiler`, `GET /roller`: `kisiler.oku` | `POST /kisiler`, `/:id/duzenle`, `/:id/pasife-al`, `/:id/aktif-yap`: `kisiler.yaz`; `/:id/hesap-ac`, `/:id/rol-ata`, `/:id/rol-al`: `kisiler.rol-yonet`; `/:id/parola-degistir`: `kisiler.parola-degistir` |
| oturum | `GET /oturum`: `acik`, txDisi | `POST /oturum/giris`, `/oturum/cikis`: `acik`; `/hesabim/parola-degistir`: `oturum` |
| ayarlar | `GET /ayarlar`: `ayarlar.yaz` (karar #117: okuma da yazma islemini ister) | `POST /ayarlar/:anahtar/degistir`: `ayarlar.yaz` |
| denetim | uc yok | uc yok (`denetimYaz` cekirdekten cagrilir) |

ADR 0007 ile karsilastirma: kisiler okumalari veri islemiyle korunuyor; `sayfa.personel` alan uc rolun (mudur, insan_kaynaklari,
idari_isler) ucunde de `kisiler.oku` var (DOGRULANDI: `kurulum/yetki-matrisi.md`). Sayfasi olup okuyamayan rol yok; `biri:[...]` kalibina
gecmek davranisi degistirmez. Ayarlar her iki islemi yalniz yoneticide tutar; fark yok. Hicbir okuma ucu `'oturum'` istisnasini kullanmiyor.

## Bulgular

Kullanimi tutan: yok. Dort modulde de akisi durduran eksik bulmadim (testler yesil, sayfasi olan rol veriyi okuyabiliyor).

Kullanimi etkileyen:
1. kisiler, `POST /kisiler/:id/duzenle`, pasife-al, aktif-yap: surum denetimi yok; iki kisi ayni kaydi duzenlerse son yazan kazanir. `kisi` tablosunda surum sutunu yok (sema degisikligi gerekir).
2. kisiler, `POST /kisiler`: tekrar korumasi (`tekrarKorumali`) yok; cift tiklama sicil no verilmemisse iki ayni kisi acar (`kisi_sicil_no_tek` yalniz sicil no doluyken tutar).
3. kisiler ve ayarlar ikinci menu tanimi yok (`paylasilan/sayfalar.ts` `IKINCI_MENULER` yalniz arkon ve satin-alma). Ekran calisiyor, duzen farki.
4. denetim kaydini okuyan uc ve ekran yok; `denetim.oku` mudurde var ama hicbir uc istemiyor (DOGRULANDI: grep yalniz islem listesi, roller gocu, oturum testi). Kayit tutuluyor, kimse goremiyor.

Sonra:
5. Tablo adlari modul onekini tasimiyor (kisi, kisi_rolu, rol, rol_islemi, giris_denemesi, ayar). Dolu tablo yeniden adlandirma.
6. Adsiz kisitlar: `rol.kod`, `kisi.ad`, `oturum.anahtar_ozeti`.
7. `rol_islemi` sahibi haritada belirsiz; butun rol x islem satirlari `*_kisiler_*` goclerinde (vardiya, uretim emri, malzemeler, arkon icin de).
8. kisiler `disari.ts` yazma komutlarini disari aciyor (`hesapAc`, `rolAta`, `rolAl`, `kisiEkle`, `kisiPasifeAl`, `kisiAktifYap`); uretim kodunda kisiler disinda cagiran yok, yalniz testler. Acik kaldikca bir modul yetki sormadan rol atayabilir.
9. ayarlar ayni anda iki degisiklikte iki kaydin eski degeri ayni gorunur (NOTLAR'da bilinen, surum yok). `ayar.deger` jsonb, ture gore serviste dogrulaniyor.
10. Dort modulde UYUM-BORCU, ORTAKLIK, GUVENLIK-DENETIMI, KURAL-TEST belgeleri yok.

## ORTAKLIK icin taslak (belge yazilinca)

- kisiler: kisi (`kisi.id`, ad, sicil_no, gorev, aktif), kullanici adi, rol (`rol.kod`), rol x islem (`rol_islemi`). `gorev` vardiya/mesai ile cakisabilir: VARSAYIM, o moduller daha yok.
- oturum: oturum, giris denemesi; baska modulde karsiligi yok.
- ayarlar: ayar degeri (`ayar.anahtar`); tanimlar malzemeler ve satin-alma'da.
- denetim: denetim kaydi (`denetim_kaydi`); ayarlar kendi degisiklik kaydini buraya yazar.

## Tur onerisi

- 2. tur (ucuz, sema degismez): dort modulun belgeleri (UYUM-BORCU, ORTAKLIK, GUVENLIK-DENETIMI); kisiler ve ayarlar ikinci menu tanimi; toplayici satiri cekirdek konusuna istek.
- 3. tur: kisi surumu (madde 1), `POST /kisiler` tekrar korumasi (2), `disari.ts` yazma komutlarini daraltma (8), denetim okuma ucu ve ekrani karariyla (4).
- Bagla asamasina kadar beklesin: tablo onekleri ve adsiz kisitlar (5, 6), `rol_islemi` sahipligi (7).

## Sana sorulanlar

1. Tablo adlari (kisi, rol, kisi_rolu, rol_islemi, giris_denemesi, ayar) modul oneki tasimiyor. Neden: duzen maddesi 2; degistirmek dolu tabloyu yeniden adlandirir ve butun modullerin sorgusunu etkiler. Secenekler: istisna olarak borca yaz / yeniden adlandirma gocu. Oneri: istisna olarak borca yaz.
2. `rol` ve `rol_islemi` tablolarinin sahibi kim olsun? Neden: harita sahibi belirsiz diyor, rol satirlari kisiler adli goclerle giriyor. Secenekler: kisiler / cekirdek. Oneri: kisiler (bugunku durum, yazan tek modul).
3. Kisi kaydina surum sutunu eklensin mi? Neden: guvenlik maddesi surum denetimi istiyor; dolu tabloya sutun eklemek sema karari. Secenekler: ekle (3. tur) / ekleme, son yazan kazanir kalsin. Oneri: ekle.
4. Denetim kaydini okuyan ekran acilsin mi? Neden: kayit tutuluyor ama gorulemiyor; `denetim.oku` mudurde bos duruyor. Secenekler: 3. turda yalniz okuma ekrani (yonetici ve `denetim.oku`) / acma, `denetim.oku` mudurden alinsin / simdilik dokunma. Oneri: 3. turda okuma ekrani.
