# Logo Tiger REST servisi arastirmasi (2026-10-08)

Kapsam: Logo'nun kendi REST yolu, bugunku kurum ici kopruye (GET /api/Material/exists/{kod}, POST /api/Material/AddRich, GET /api/Lookup/unitsets) gore ne sunar.
Hicbir Logo kurulumuna istek atilmadi; yalniz acik web kaynaklari okundu. Resmi belge sitesi (docs.logo.com.tr) bu ortamdan acilmadi (ag politikasi engelledi), bu yuzden resmi sayfa ICERIGI dogrulanmadi; bilgiler cozum ortagi ve topluluk sayfalarindandir.

## 1. Ne bu
- Adi "Logo REST Servis" (Logo Objects REST). Ayri urun degil; Logo Objects'in (LObjects.exe) uzerinde Windows hizmeti olarak calisir. DOGRULANDI (kaynak: datasource, "Logo Objects kurulu ve calisir durumda olmadan Logo REST Servis islevsel degildir").
- Kurulum ERP kurulumunda "REST Servis" isaretlenerek ya da ERP dizinindeki RESTServis\LogoRestServiceSetup.exe ile. Ayar araci RESTServis\LogoObjects.RestService.RestServiceWSManager.exe. DOGRULANDI (datasource).
- Varsayilan port 32001; temel yol /api/v1. DOGRULANDI (datasource, logoyazilimdestek).
- Servis icinde Swagger yardim ekrani ve /api/v1/services/help?expandLevel=full yardim ucu var. DOGRULANDI (datasource, semt20).
- j-Platform REST (docs.logo.com.tr/.../jct/...) BASKA bir urundur (j-Guar/j-Platform); Tiger icin degil. VARSAYIM (sayfa yollari jct/j-platform altinda; icerik okunamadi).

## 2. Surum ve lisans (ONEMLI)
- Desteklenen: Tiger 3, Tiger Wings, Tiger 3 Enterprise, Tiger Wings Enterprise.
- Desteklenmeyen: Logo Start, Go Plus, Go 3, Tiger Plus, Tiger Enterprise (eski, "3" olmayan).
  DOGRULANDI (datasource "Desteklenen Urunler"). Not: jetexblog Go 3'u da sayiyor; celiski var, resmi belgeyle dogrulanmadi.
- Ayri "REST lisansi" yok; gecerli Logo Objects kullanim lisansi gerekir. DOGRULANDI (datasource).
- Token icin ClientId ve ClientSecret gerekir; bu degerler yalniz Logo Cozum Ortaklarina verilir. DOGRULANDI (datasource, logoyazilimdestek).

## 3. Kimlik dogrulama
- POST /api/v1/token
  - Baslik: Authorization: Basic base64(ClientId:ClientSecret)
  - Govde: grant_type=password, username=<Logo kullanicisi>, password=<parola>, firmno=<firma no>
  - Yanit: access_token (sonraki isteklerde "Authorization: Bearer <token>")
  DOGRULANDI (logoyazilimdestek Postman sayfasi; Logo forum Delphi ornegi ayni alanlar). Govde kodlamasi (form mu JSON mu) kaynaklarda net degil: DOGRULANMADI; Swagger'dan bakilmali.
- Token suresi servis ayarindan (dakika). Iptal: /api/v1/revoke. DOGRULANDI (datasource).
- Token firmaya baglidir (firmno token isteginde). VARSAYIM: firma degisirse yeni token gerekir; geri alma maliyeti dusuk.

## 4. Malzeme ile ilgili uclar
- Kaynak adi: items (LObjects karsiligi doMaterial). Birim seti: unitSets. DOGRULANDI (ykyazilim kaynak listesi; canberkdoger rest-schema.json).
- Yollar (canberkdoger rest-schema.json, topluluk kaynagi; resmi degil, DOGRULANMADI):
  - GET    /api/v1/items/{id}            (id kod mu logicalref mi: belirsiz; BILMIYORUM)
  - GET    /api/v1/items/{id}?expandLevel=full
  - POST   /api/v1/items                 (yeni kart, JSON govde)
  - PUT    /api/v1/items/{id}            (once GET, degistir, geri gonder)
  - PATCH  /api/v1/items  {"INTERNAL_REFERENCE": ..., "ALAN": ...}
  - DELETE /api/v1/items/{id}
  - unitSets: GET/POST/PUT/DELETE, PATCH yok
- Liste sorgusu: limit parametresi var (GET /api/v1/glaccounts?limit=1). DOGRULANDI (datasource). q/fields/offset/withCount filtre soz dizimi: BILMIYORUM (hicbir okunan kaynakta yok).
- Govde alan adlari LObjects XML alan adlariyla aynidir (CODE, NAME, CARD_TYPE, UNITSET_CODE, INTERNAL_REFERENCE gibi). VARSAYIM: PATCH orneginde INTERNAL_REFERENCE geciyor ve semt20 XML'den sinif uretiyor; tam alan listesi Swagger'dan alinmali.
- Not: datasource PUT'u "yeni kayit", POST'u "guncelleme" diye anlatiyor; rest-schema.json tersini. Gercek davranis DOGRULANMADI.
- Kurallar: istek Logo Objects uzerinden gittigi icin Logo'nun kendi dogrulamalari (zorunlu alan, kod tekilligi) uygulanir; hata aciklamayla doner. VARSAYIM (jetexblog; hata govdesi bicimi BILMIYORUM).

## 5. Esszamanlilik
- Servis bir LObjects.exe havuzu tutar; en az/en cok sayisi ayardan, Objects lisans adedine gore. Kullanilmayan LObjects belli sure sonra kapanir. DOGRULANDI (datasource ayar tablosu, alan 6, 8, 9).
- Yani bugunku "tek oturum, art arda istek" kisiti REST serviste havuz boyutu kadar gevser. VARSAYIM: gercek paralel kapasite lisans adedine bagli; olculmedi.

## 6. Bugunku kopruyle karsilastirma
| Kopru ucu | Logo REST karsiligi | Durum |
|---|---|---|
| GET /api/Material/exists/{kod} | GET /api/v1/items ile koda gore arama | Koda gore filtre soz dizimi BILMIYORUM; bulunamazsa 404 mu bos liste mi BILMIYORUM |
| POST /api/Material/AddRich | POST /api/v1/items | Var; yanitta INTERNAL_REFERENCE (logicalRef karsiligi) doner: VARSAYIM |
| GET /api/Lookup/unitsets | GET /api/v1/unitSets | Var (DOGRULANDI, kaynak listesi) |
| cevap {success, logicalRef, method, error, validate} | HTTP durum kodu + kayit JSON'u / hata metni | Bicim farkli; TMI tarafinda donusturucu gerekir |
| Kopru kimligi | OAuth2 password + Basic(ClientId:Secret) + firmno | ClientId/Secret cozum ortagindan alinir |

Sonuc (VARSAYIM, gerekce yukarida): Logo REST, kopruyu kaldirmaya yeter gibi gorunuyor; ama kod yazmadan once uc sey kurulumdaki Swagger'dan dogrulanmali: (1) items alan listesi ve zorunlu alanlar, (2) koda gore arama soz dizimi, (3) POST/PUT anlami ve hata govdesi. Gonderim altyapisindaki "kopru" arayuzu soyut tutulursa REST'e gecis tek bir uyarlayici dosyasiyla olur; geri alma maliyeti dusuk.

## 7. Bilinmeyenler
- Surum: kullanici LT1'e "a" dedi, atolyede Tiger 3 Enterprise var (2026-10-08). REST servis bu surumde destekleniyor.
- ClientId/Secret elde mi (cozum ortagi gerekir).
- REST servis kurulu mu, HTTPS acik mi (polaris.logo.cloud'da "REST Service - 6 - HTTPS baglantilari" basligi var; icerik okunamadi).

## 8. Oneri ve #339'a etkisi (LT1 = a sonrasi)

KARAR LT2 (2026-10-08, kullanici): "Kopru, REST sonra". #339 kopruyle surer; REST, anahtar ve Swagger bilgisi gelince ayri kartla ikinci istemci olarak eklenir.

Kopru yolu ile REST yolu:
| | Kurum ici kopru | Logo REST |
|---|---|---|
| Durum | Var, olculmus (kurulum/logo-koprusu.md "15.09.2026 olcumu", #339 dalinda) | Atolyede kurulu mu BILMIYORUM |
| Kimlik | Tek anahtar, X-Api-Key | ClientId+Secret (cozum ortagindan) + Logo kullanici adi, parola, firma no; token suresi dolunca yenilenir |
| Bakim | Kurum ici servisin sahibi bakar | Logo surumuyle gelir; ERP guncellemesiyle surum esitlenmeli (ayar ekrani "Surum ERP ile ayni olmali") |
| Eszamanlilik | Tek oturum, art arda | LObjects havuzu; TMI zaten tek tek gonderiyor, kazanc yok |
| Bilinmeyen | 11 varsayim (logo-koprusu.md) | items alanlari, koda gore arama, POST/PUT anlami, hata govdesi |

Oneri (VARSAYIM; gerekce: kopru calisiyor ve olculmus, REST'in uc temel bicimi henuz dogrulanmadi, ClientId/Secret dis bagimlilik):
#339 kopruyle oldugu gibi surer. REST, ayni KopruIstemcisi arayuzunun ikinci uygulamasi olarak sonra eklenir; secim ortam degiskeniyle yapilir. Geri alma maliyeti dusuk: arayuz zaten tek dosyada (sunucu/moduller/logo/kopru.ts).

#339'a etkisi:
- Simdi: degisiklik gerekmez. KopruIstemcisi arayuzu (malzemeVarMi, malzemeEkle, birimSetleri) REST'e de uyuyor. DOGRULANDI (pr339:sunucu/moduller/logo/kopru.ts "export interface KopruIstemcisi").
- REST eklenirse degisecekler (VARSAYIM, kod yazilmadi):
  - kopru.ts yaninda rest-istemcisi.ts: token alma (POST /api/v1/token), bellekte saklama, 401'de bir kez yenileme; malzemeVarMi -> items'ta koda gore arama; malzemeEkle -> POST /api/v1/items; birimSetleri -> GET /api/v1/unitSets.
  - ayar.ts: yeni TMIV2_LOGO_REST_* degiskenleri (adres, istemci kimligi, istemci sirri, kullanici, parola, firma no); kurumIciMi denetimi aynen gecerli (port 32001 kurum ici).
  - kurallar.ts: MalzemeEklemeGovdesi alan adlari Logo'nun buyuk harf adlarina (CODE, NAME, CARD_TYPE, UNITSET_CODE, AUXIL_CODE, VAT) cevrilir; logicalRef karsiligi INTERNAL_REFERENCE. Alan adlari DOGRULANMADI.
  - ADR 0011 madde 4 (anahtar X-Api-Key) REST icin "Bearer token" olarak genisler; kirmizi cizgi istisnasi ayni kalir (yalniz logo modulu, yalniz kurum ici adres).
  - Logo'da TMI icin ayri bir kullanici gerekir; yalniz malzeme karti yetkisi olmali (yetki modeli: kullaniciya sorulur).

Degisim maliyeti (VARSAYIM, kod yazilmadi): yeni dosya 1 (rest-istemcisi.ts ve testi), degisen 3 (ayar.ts, kurallar.ts govde donusumu, baglanti.ts secim), belge 2 (ADR 0011 madde 4, kurulum/logo-koprusu.md), ortam degiskeni karti #210 guncellenir. Degismeyenler: cift gonderim kalkani, acma-kapama anahtari, birim seti izinli listesi, giden kutusu ve gocu, servis.ts, isler.ts. ADR 0011 kurum ici adres kurali REST icin de aynen gecerli; Logo sunucusu kurum icinde oldugu surece degismez.

Kullanicinin kurulumda yapacaklari (REST secilirse):
1. Logo sunucusunda REST servisinin kurulu ve calisir oldugunu denetle; degilse ERP dizinindeki RESTServis\LogoRestServiceSetup.exe ile kur. Logo Objects calisir olmali.
2. Ayar aracinda (RestServiceWSManager.exe, yonetici olarak): IP ve port, token suresi, LObjects sayisi; surum ERP ile ayni.
3. Logo cozum ortagindan REST istemci kimligi ve sirrini iste.
4. Logo'da TMI icin ayri kullanici ac, yalniz malzeme karti ve birim seti okuma yetkisi ver.
5. Ayar aracindaki Swagger ekranindan su dort seyi oku ve buraya yaz (degerleri degil, bicimi): items POST govdesindeki alan adlari ve zorunlular; koda gore arama soz dizimi ve bulunamazsa cevap; POST mu PUT mu yeni kayit acar; hata cevabinin ornegi.
6. TMI sunucusundan Logo sunucusunun 32001 portuna erisimi (guvenlik duvari) ac.
Bu degerlerin hicbiri depoya, karta ya da sohbete yazilmaz; yalniz sunucu ortam degiskenine.

## Kaynaklar
- https://www.datasource.com.tr/blog-logo-rest-servis-kurulumu.html
- https://logoyazilimdestek.com/logo-rest-servis-rehberi/
- https://logoyazilimdestek.com/logo-rest-servis-token-alma-postman/
- https://forum.logo.com.tr/index.php?page=details&konu=delphi-ile-logo-objects-rest-servis-token-alma-islemi
- https://www.ykyazilim.com.tr/blog/logo-rest-resource
- https://github.com/canberkdoger/logo-tiger-araclar (src/data/rest-schema.json)
- https://semt20.home.blog/2020/06/11/c-logo-objects-rest-projesi/
- https://jetexblog.com.tr/logo-rest-servis-ile-erp-entegrasyonlarinda-yeni-nesil-yaklasim
- Resmi (bu ortamdan acilamadi): https://docs.logo.com.tr/public/wua/logo-objects-rest-servis/logo-rest-temelleri/logo-rest-servis-kurulumu
