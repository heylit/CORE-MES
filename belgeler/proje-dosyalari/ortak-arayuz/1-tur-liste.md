# Ortak arayuz (istemci/src/ortak), Asama 1 / 1. tur listesi

Depo: origin/main 4a70288. Node: `node -v` -> v24.21.0 (nvm, /opt/nvm/versions/node/v24.21.0). Dal acilmadi, commit yok.
Not: istemci/src/ortak icin UYUM-BORCU.md yok; borc maddeleri acik kartlardan ve modullerin UYUM-BORCU dosyalarindaki ortak arayuze dusen satirlardan toplandi.

## a) Acik kartlar
- #172 Ortak arayuz eksikleri (devam). Girenler: up/down/more simgeleri, CamYuzey siki, TerminalYerlesimi oran, Kart baslikEki, Menu, useForm (main 08fc6c7). Kalan: tarih/saat secici, dosya yukleme, disa aktarma, grafik, bildirim yuvasi.
- #128 Ust cubukta "Parolami degistir". Sunucu ucu var (DOGRULANDI: sunucu/moduller/oturum/uclar.ts `yol: '/hesabim/parola-degistir'`, yetki 'oturum'); istemcide yalniz Personel sayfasinda (KisiPencereleri.tsx:146), kabukta yok.
- #112 Simge seti: gonder, arsiv, birlestir, ayar, sayfa oklari; Turkce adlarin ortaga tasinmasi.
- #169 Liste/sayfalama kalibi: ortak parcasi main'de (Sayfalama.tsx, liste-durumu.ts); kalan modullerin tasinmasi, ortakta is yok.
- #89 Kabukta bildirim yuvasi (cagri modulu icin).
- #88 Tarih-saat secici, dosya yukleme, disa aktarma, yazdirma, kod okutma (kamera icin jsqr = yeni bagimlilik, #107).
- #87 Grafik ve zaman cizgisi.
- #46 Ekranlar 360/768/1280 gercek tarayicida olculmedi (giris, kabuk ayrica olculmedi).
- #49 Cikis dugmesi kilit simgesi (DOGRULANDI: Kabuk.tsx:103 `<Simge ad="lock" />`).
- #115 React Router future flag uyarilari. #52 Tabletlerde tembel yukleme (olcum tetikler). #54 Ekran skill'i (belge, .claude altinda; benim isim degil).

## b) Uc sinif
KULLANIMI TUTAN
- (aday) #128: yonetici olmayan kullanici (operator, planlamaci) kendi parolasini degistiremiyor; yoneticinin bildigi parolayla girer ve her kayit ona yazilir. Izlenebilirlik ve hesap guvenligi acigi. VARSAYIM: TUTAN sayilir (kart yetki acigi demiyor; karar kullanicinin).
- Baska TUTAN madde bulunmadi. Cerceve koprusu koken denetliyor (DOGRULANDI: cerceve-iletisi.ts "Iletı yalnız bu kökene gönderilir").
KULLANIMI ETKILEYEN
- #46 uc genislikte gercek tarayici olcumu (giris, kabuk).
- #49 cikis dugmesi yanlis simge.
- Arkon ikinci menu sayaci: kabuk ucu bekliyor, `GET /arkon/menu-sayaclari` sunucuda yok (#198 notu; arkon konusunun isi).
SONRA
- #172 kalanlari, #88, #87, #89, #112, #115, #52, #169 (modul tasima).
- Malzemeler borc 2 (katalog.html kendi stili), satin alma borc 15 ve 17 (ekran ortak bilesen ve ikinci menu kullanmiyor), Arkon borc satir 22 (ayri derleme, ortak bilesen yok): modul ekrani; ortak tarafta eksik parca yok.

## c) Istekler
- Benim baskasindan bekledigim: yok (#128 icin sunucu ucu hazir).
- Modullerin benden bekledigi: teslimlerde CEKIRDEK-ISTEKLERI.md dosyasi depoda yok; acik istek #172 kalanlari (SONRA).
- #128 yazilirsa kisiler modulune istek (BASKA-MODUL-ISTEKLERI.md): Personel'deki kendi parola penceresi ortaktaki parcayi kullansin; zorunlu degil.

## d) Kontrol (degisiklik yok)
- Node v24.21.0 ile `npm run tip` cikis 0, `npm run lint` cikis 0.
