# Çekirdek ve ortak istekleri: malzemeler (Aşama 1 tur 1 ve tur 2)

1. Ortak arayüz (kart #172 şeridi, `istemci/src/ortak/arayuz`): `YalitilmisCerceve` bileşeni ve `yalitimOnBetigi()`.
   İmza: `YalitilmisCerceve({ baslik, ad?, sinif?, sayfa, izinler?: ('allow-downloads'|'allow-modals')[], yetenekler?: ('camera'|'clipboard-write')[], iletiGeldi?: (veri, yanitla) => void })`.
   Hazır kod ve testi: dal `236-cerceve-kisitlamasi` (`istemci/src/ortak/arayuz/YalitilmisCerceve.tsx`, `yalitim.ts`, `YalitilmisCerceve.test.tsx`); karşılandı (#264, main 27cf5bd); modül ortaktan ithal eder.
   Neden: kullanıcı kararı #236; kopya ortak gelince silinir (UYUM-BORCU, bağlamada kapanacak).
2. Rol satırı (kart #229, kullanıcı kararı M1, 07.10.2026): `malzemeler.tanim-yaz` → `planlama_proje`, `mudur` (yönetici bayrakla zaten taşır). Yeni rol göçü; `rol-dagilimi.test.ts` beklentisi aynı dalda güncellenir
   (bugün "hiçbir rol tanım ve ayar işlemini taşımaz" diye sınıyor).
3. Karşılandı: uç katmanı `OkumaYetkisi` (`{ biri: [...] }`) kabul ediyor; üç GET ucu tur 2'de bağlandı, servis denetimi kalktı, `paylasilan/islemler/malzemeler.ts` yorumu düzeldi.
4. Karşılandı: `npm run test:modul -- malzemeler` Linux'ta sunucu testlerini buluyor (DOĞRULANDI 08.10.2026: `ℹ tests 138`, istemci 18).
5. Karşılandı, bu dalda ayrı commit (kullanıcı kararı T1 a, 08.10.2026): toplayıcı (tur 2): `paylasilan/sayfalar.ts` `IKINCI_MENULER` dizisine `MALZEMELER_IKINCI_MENU` (aynı dosyadaki ithal satırına ek: `import { MALZEMELER_IKINCI_MENU, MALZEMELER_SAYFALARI } from './sayfalar/malzemeler.ts';`).
   Neden: kabuk menüyü yalnız toplayıcıdan çizer; satır girene kadar ikinci menü görünmez, adresler (`/malzemeler/<bolum>`) yine çalışır. Menü tanımı modülün dosyasında, sunucu testi `ikinci-menu.test.ts` geçerliliğini sınar.
   İstemci menüyü değer olarak alamadığı için (`eslint` `PAYLASILAN_DEGERI`) `gorunumler.ts` tabloyu tiple menüye bağlar; toplayıcı girince çekirdek isterse tablo `IKINCI_MENU_TANIMLARI`'ndan okunacak hâle getirilir.

Yeni paket isteği yok.

## Bağlama tur 1: hizmet türü (kart #163, 09.10.2026)
6. Ortak arayüz (KAPANDI, commit 1779760: dar ekranda başlık alt satıra kayar, ekran testi `ekran-testleri/ust-cubuk.spec.ts`): sayfa adı "Malzemeler ve Hizmetler" 360 genişlikte kabuk başlığında "Malzeme... ve..." diye kesiliyor (görüntü `bagla/malzemeler-hizmet/yazim/sonra-hizmet-grubu-360.png`).
   Uzun sayfa adında başlık iki satıra inebilir ya da kısa ad alanı eklenebilir. Yetki matrisi belgesi ve testlerde sayfa adı geçiyorsa güncellenir (malzemelerin testleri güncel).
