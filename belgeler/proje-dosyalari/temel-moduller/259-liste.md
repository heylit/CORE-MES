# Temel moduller: 2. tur yazim listesi (kart #259)

Okunan commit: `9b6582f` (origin/main). Goc sirasi (harita): 33 goc, ilki `20261005120000_kisiler.sql`, sonu `20261008013200_kisiler_malzemeler_tanim_islemi.sql`.
Dal: `259-temel-moduller` (kullanicinin verdigi ad). "yaz" gelmeden dal acilmaz, commit atilmaz.

## Kararlar (numarasiyla)

- K1 a: tablo adlari (kisi, kisi_rolu, rol, rol_islemi, oturum, giris_denemesi, ayar) modul oneki tasimaz; istisna olarak ilgili modulun UYUM-BORCU'na yazilir. Yeniden adlandirma yok.
- K2 a: `rol` ve `rol_islemi` sahibi kisiler. Rol x islem satirlarini cekirdek konusu yazar, kisiler adli goclerle. ORTAKLIK-kisiler.md'ye yazilir.
- K3 a: kisi surumu 3. tur; kisiler UYUM-BORCU'na "3. tur" diye yazilir, kod yok.
- K4 a: denetim okuma ekrani 3. tur (kart #48): liste, suzgec (kisi, tarih araligi, islem), sayfali; yazma/silme yok; yonetici ve `denetim.oku`; gizli alanlar maskeli; tek sayfa olabilir. denetim UYUM-BORCU'na "3. tur" diye yazilir.
- Ek karar: kisiler/disari.ts yazma komutlarinin (hesapAc, rolAta, rolAl, kisiEkle, kisiPasifeAl, kisiAktifYap) daraltilmasi 3. tur, K3 ile ayni cekme isteginde; kisiler UYUM-BORCU'na yazilir.
- Rapordaki 2. madde (POST /kisiler tekrar korumasi): 3. tur; kisiler UYUM-BORCU'na yazilir.

Eksik ya da celisen karar: yok.

## "Sahibi belirsiz" kaydinin kaynagi (K2)

DOGRULANDI (`npm run harita`, "Modüle ait olmayanlar" bolumu): `rol_islemi  belirsiz  20261006011806_yetki_islem_ve_giris.sql  okuyan: kisiler`.
- Tabloyu kuran goc: `sunucu/gocler/20261006011806_yetki_islem_ve_giris.sql` ("CREATE TABLE rol_islemi"). Goc adi modul adiyla baslamiyor.
- Hicbir modulun `sorgular.ts` dosyasi tabloya yazmiyor; satirlar yalniz goclerde giriyor.
- Kural: `araclar/harita.ts` 245-249. satirlar: sahip = tabloya yazan tek modul, yoksa goc adindaki modul, ikisi de yoksa belirsiz.
- Ikisi de benim klasorumde degil: var olan goc yeniden adlandirilmaz (goc damgasi), `araclar/` kilitli. Yazmiyorum; kart #72 icin istek olarak kisiler UYUM-BORCU'na ve cekme istegi aciklamasina yazilir. Oneri (VARSAYIM): harita'ya tablo -> sahip modul bildirimi (or. `rol_islemi: kisiler`) ya da kisiler'in bildirdigi tablo listesi; secim #72'de.

## Yazilacak dosyalar (yalniz dort modulun klasorleri)

| Dosya | Icerik |
|---|---|
| `sunucu/moduller/kisiler/UYUM-BORCU.md` | K1 istisnasi; adsiz kisitlar (`rol.kod`, `kisi.ad`); 3. tur: kisi surumu (K3), POST /kisiler tekrar korumasi, disari.ts daraltma (ek karar); #72 harita istegi; belge eksikleri (KURAL-TEST yok) |
| `sunucu/moduller/kisiler/ORTAKLIK-kisiler.md` | kisi, kullanici adi, rol, rol x islem (K2 sahiplik ve "satiri cekirdek konusu yazar" notu), gorev (vardiya/mesai ile cakisabilir: VARSAYIM) |
| `sunucu/moduller/kisiler/GUVENLIK-DENETIMI.md` | 10 uc: yol, islem, sunucudaki kurallar, izinli ve reddeden test adi (test dosyalarindan okunur); yalniz ekranda kalan kurallar |
| `sunucu/moduller/oturum/UYUM-BORCU.md` | K1 istisnasi (`oturum`, `giris_denemesi`); adsiz kisit `oturum.anahtar_ozeti`; ikinci menu gerekmez (sayfa yok) |
| `sunucu/moduller/oturum/ORTAKLIK-oturum.md` | oturum, giris denemesi; baska modulde karsiligi yok |
| `sunucu/moduller/oturum/GUVENLIK-DENETIMI.md` | 4 uc (giris bekleme/429, anahtar ozeti, oturum gecersizlestirme) |
| `sunucu/moduller/ayarlar/UYUM-BORCU.md` | K1 istisnasi (`ayar`); surum yok (NOTLAR'daki bilinen); `ayar.deger` jsonb (serviste turle dogrulaniyor); okuma da `ayarlar.yaz` ister (karar #117) |
| `sunucu/moduller/ayarlar/ORTAKLIK-ayarlar.md` | ayar degeri (`ayar.anahtar`); tanimlar `paylasilan/ayarlar/<modul>.ts`'te |
| `sunucu/moduller/ayarlar/GUVENLIK-DENETIMI.md` | 2 uc |
| `sunucu/moduller/denetim/UYUM-BORCU.md` | 3. tur: okuma ekrani (K4, kart #48); `denetim.oku` bugun hicbir ucta istenmiyor; istemci ve sozlesme yok |
| `sunucu/moduller/denetim/ORTAKLIK-denetim.md` | denetim kaydi (`denetim_kaydi`, `kisi_id` -> kisi) |
| `sunucu/moduller/denetim/GUVENLIK-DENETIMI.md` | uc yok; `denetimYaz` cekirdekten cagrilir; gizli alan maskeleme ve testi |
| `paylasilan/sayfalar/kisiler.ts` | `KISILER_IKINCI_MENU`: tek grup, tek madde (`/personel`, "Personel", simge `user`, islem `kisiler.oku`) |
| `paylasilan/sayfalar/ayarlar.ts` | `AYARLAR_IKINCI_MENU`: tek grup, tek madde (`/ayarlar`, "Sistem Ayarlari", simge `wrench`, islem `ayarlar.yaz`) |

Toplayici (dar istisna, AYRI commit): `paylasilan/sayfalar.ts`'te yalniz iki import satirina ad eklemek ve `IKINCI_MENULER` dizisine iki ad eklemek. Baska satira ve yapiya dokunulmaz. Not: kisiler ve ayarlar kayitlari icin ayri ayri birer commit.

Varsayimlar (geri alma ucuz, tek satir):
- Madde islemi veri yetkisiyle ayni (satin-alma kalibi): `kisiler.oku` ve `ayarlar.yaz`. Bugun `sayfa.personel` olan uc rolde `kisiler.oku` var (onceki rapor), gorunurluk degismez.
- Iki ekran tek gorunum; menu tek maddelik. Ekran ve rota degismez (madde yolu = var olan rota).
- KURAL-TEST.md bu turda yazilmaz (kapsamda yok); eksikligi UYUM-BORCU'na yazilir.

## Borc siniflari

Her UYUM-BORCU: "Kullanimi tutan" (bugun yok), "Kullanimi etkileyen", "3. tur" (onaylilar), "Baglamada kapanacak", "Sonra" (tablo onekleri istisnasi, adsiz kisitlar). Sayilar yazimda belli olur.

## Kosulacaklar

`npm run tip`, `npm run lint`, `npm run sinir -- --modul <ad>` (dordu), `npm run test:modul -- kisiler` ve `-- ayarlar` (menu tanimi testi istemcide). Node bu container'da v22 (depo >=24 istiyor); sonuc o surumle yazilir.

## Bu konuda yapilmayan

Kok mesajdaki "kurulum/ altindaki iki belgeyi esitleyen cekme istegi" bu konunun gorevinde yok; "Proje metinleri belgesi" konusunun isi oldugunu varsayiyorum (VARSAYIM, kontrol edilmedi).
