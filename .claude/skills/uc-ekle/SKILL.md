---
name: uc-ekle
description: Var olan bir modüle yeni bir API ucu (okuma kaynağı ya da yazma komutu) eklerken kullan.
---

# Uç ekle

Örnek kaynağı: `sunucu/moduller/oturum/uclar.ts` ve `paylasilan/sozlesme/oturum.ts`.

## Adımlar

1. **Biçimi seç.** Okuma kaynaktır (`GET /uretim-emirleri/:id`); yazma komuttur
   (`POST /adimlar/:id/bitir`). PUT ve DELETE ile kaynak üzerine yazma yapılmaz.
2. **Şema** `paylasilan/sozlesme/<ad>.ts` içine: gövde, parametre, cevap ve tipleri (`z.output`;
   gövdede `z.input`). Gövdesiz cevap da adlandırılır. Cevap şemasında olmayan alan istemciye
   gitmez; gizlenecek alan şemaya hiç konmaz. İstemci tipini oradan `import type` ile alır, elle
   yazmaz (değer ithali zod'u pakete sokar); test fikstürü bu tipe uyar (`satisfies`).
3. **Kural** `kurallar.ts` içine saf fonksiyon olarak; **SQL** `sorgular.ts` içine.
4. **Uç** `uclar.ts` dizisine. `yetki` zorunludur: kayıtlı bir işlem (`<modül>.<eylem>`,
   `paylasilan/islemler/<modül>.ts`), `'acik'` ya da `'oturum'`. İşleyici yetki denetimi yazmaz.
5. **Test.** Uç `uygulamaKur` + `app.inject` ile çağrılır. Yetkide red ve kabul birlikte.
6. `npm run harita` ile ucun listede olduğunu gör; `npm run test:modul -- <ad>`.

## Örnek

```ts
uc({
  yontem: 'POST',
  yol: '/oturum/giris',
  yetki: 'acik',
  govde: girisGovdesi,
  cevap: oturumCevabi,
  isle: async ({ db, govde, istek }) => {
    const { anahtar, kullanici } = await girisYap(db, { ...govde, ip: istek.ip });
    istek.cerezYaz(CEREZ_ADI, anahtar, AZAMI_SN);
    return { kullanici };
  },
}),
```

## Dikkat

- Kayıtlı olmayan işlem derlenmez ve tanım anında hata verir. Uç `sayfa.*` işlemi isteyemez: o yalnız menüdür.
- Yeni işlem modülün işlem dosyasına eklenir; yönetici dışındaki rollere göçle verilir (`rol_islemi`), kullanıcı onayıyla.
- Okuma ucu başarılı cevabın durum kodunu `istek.durumKoduYaz(503)` ile belirler; yazma komutu hata fırlatır.
- Veri yoksa `null` dön; sıfır ya da boş dizgi uydurma.
- Liste ucu sınırsız dönmez: sayfalı liste kalıbı (`#paylasilan/liste.ts`, `#cekirdek/liste.ts`; örnek `sunucu/cekirdek/liste.test.ts`).
  - Sözleşme: sorgu `z.object({ ...listeSorguAlanlari(['ad', 'kod']), <süzgeçler> })` (`sayfa`, `sayfaBoyu`, `sirala`, `yon`; sıralama
    yoksa `...sayfaSorguAlanlari`); cevap `listeCevapSemasi(satirSemasi)` (`satirlar`, `toplam`, `sayfa`, `sayfaBoyu`). Sorgu tipi `z.input`.
    Adlar istemcinin `useListeDurumu` kancasıyla aynıdır; başka ad yazma.
  - Sorgular: süzgeç parçası (`FROM ... WHERE ...`) tek sabittir; sayım `SELECT count(*) AS toplam <süzgeç>`, satırlar
    `SELECT ... <süzgeç> ORDER BY ${siralamaSql(SIRALAMA, sorgu)} LIMIT $n OFFSET $m` (`dilim.sinir`, `dilim.atla`).
  - Sıralama: `SIRALAMA: SiralamaTanimi<...> = { sutunlar: { ad: 'm.ad' }, ikincil: 'm.id', varsayilan?: { sutun, yon } }`. İstekten gelen ad
    SQL'e yazılmaz; yalnız bu eşlemenin anahtarıdır. `ikincil` benzersiz sütundur (kimlik): onsuz eşit değerli satırlar sayfalar arasında yinelenir ya da kaybolur.
  - Servis: `sayfaliListe(sorgu, { say, satirlar, sayfaBoyu?: { varsayilan, azami } })`. Varsayılan boy 50, üst sınır 200; aşan boy reddedilmez,
    üst sınıra çekilir. Taşan sayfa son sayfaya çekilir; cevaptaki `sayfa` ve `sayfaBoyu` uygulanandır (istemci `sayfaEsitle` ile izler).
  - `say` verilmezse `toplam` `null` döner (0 değil) ve taşan sayfa boş gelir; pahalı sayımda bilerek seçilir.
  - Sayım ve satırlar okuma ucunun tek görüntüsünde tutarlıdır; yazma komutu içinde çağrılırsa tutmayabilir. Üst sınırı (100000) aşan `sayfa` da reddedilmez, çekilir.
- Zaman ve tarih alanı: şema `#paylasilan/zaman.ts` `zamanSemasi` (saat dilimi bilgili ISO 8601) ve `tarihSemasi` (`GGGG-AA-GG`); `z.string()` yazma.
  Zaman sütunu `SELECT ${zamanMetni('e.acilma')} AS acilma` (`#cekirdek/zaman.ts`) ile seçilir; sarılmayan sütun `Date` döner ve cevap şemasından
  geçmez. `json_build_object` içinde sarılmaz. Tarih sütunu düz seçilir (metin döner). Saat farkı sunucu oturumuna göre değişir: metni değil anı karşılaştır.
  `zamanMetni(ifade)`'de ifade modülün SABİT metnidir; istekten gelen değer yazılmaz. Zaman sütununa `infinity` yazılmaz (şemadan geçmez, cevabı düşürür).
- Doğrulama iletisi Türkçedir (`#cekirdek/dogrulama-iletisi.ts`, uç katmanında kendiliğinden). Alana özel metin gerekiyorsa şemaya yaz
  (`.min(1, 'Ad boş olamaz.')`): o kazanır. İngilizce ileti yazma, iletiyi işleyicide çevirme.
- Başarılı her yazma komutu denetim kaydına kendiliğinden düşer (kişi, yöntem, yol, parametre, gövde); ayrıca kod yazma. Gövdede ve parametrede adı `parola`/`sifre` içeren,
  `password`/`passwd`/`secret` ile biten ve `pin`, `token`, `*Pin`, `*Token`, `*_pin`, `*_token` olan alanlar `[gizli]` yazılır (`pins`, `spindle` açık kalır).
  - Denetimin kapsamını daraltmak KULLANICI KARARIDIR; karar yoksa seçenek yazılmaz, soru teslimde bildirilir. Seçenek `uc({ ..., denetim: 'govdesiz' | 'yok' })`,
    yalnız oturumlu POST/PUT/DELETE (GET'te ve `yetki: 'acik'`te tanım hatası); işleyici ek kod yazmaz. Teslim denemesi seçeneği statik uyarı olarak gösterir.
  - `'govdesiz'` (büyük ikili gövde: dosya parçası): satır yine yazılır; `govde` sütununa `{ "_ozet": { "boyut": <bayt>, "sha256": "<hex>" } }` girer
    (maskelenmiş gövdenin kararlı JSON'undan). `'yok'`: satır yazılmaz; yalnız kendi değişmez defterini tutan komut içindir, bugün hiçbir uçta yok.
  - Kipi tam olmayan her uç `sunucu/cekirdek/uygulama.test.ts` `TAM_DENETLENMEYEN_UCLAR` listesinde olmalıdır (liste kararla güncellenir) ve
    `npm run harita`da satır sonunda `denetim:<kip>` diye görünür.
- İki kişinin düzenleyebildiği kaydı değiştiren komut gövdesinde beklenen sürümü taşır (`...beklenenSurum`,
  `#paylasilan/surum.ts`); cevap ve okuma şeması güncel sürümü verir (`surum: surumSemasi`). Servis yazmayı
  `surumluGuncelle` (`#cekirdek/surum.ts`) ile yapar: kayıt yoksa 404, sürüm eskiyse tek iletili 409
  (`CAKISMA`, `ayrinti.neden: 'eski-surum'`; istemcide `eskiSurumMu`). Birleştirme yok; kendi 409 metnini yazma.
  Kaydı değiştiren HER yazma ana satırın sürümünü aynı koşullu UPDATE ile artırır (alt tabloyu yeniden yazan ve
  durum değiştiren komutlar dahil); biri atlarsa koruma sessizce delinir. İstemci `eski-surum` 409'unda formu
  değil kaydı yeniler. Kalıp READ COMMITTED'a dayanır: yalıtım düzeyi değişirse 40001 için karşılık gerekir.
  Örnek: `sunucu/cekirdek/surum.test.ts`.
- Veri kapsamı (kişinin iş merkezi kısıtı): istasyona ya da iş merkezine bağlı kaydı YAZAN her komut kapsamı
  `#cekirdek/kapsam.ts` ile denetler; kendi denetimini ve 403 metnini yazmaz. Örnek: `sunucu/cekirdek/kapsam.test.ts`.
  - Kapsamı al: `const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri)` (kaynak
    `istasyonlar/disari.ts`). `Kapsam`ın içeriği kapalıdır: ham kısıt listesi ya da `null` derlenmez; yayılan ya da kopyalanan kapsamı yardımcılar reddeder.
  - Yazma: `kapsamDisiysaReddet(kapsam, isMerkeziId)` (403 `YETKI_YOK`, tek ileti). Çağrı yeri: kayıt kilidinden
    SONRA, durum kuralından ÖNCE (kapsam dışı kişi kaydın durumunu öğrenmesin).
  - İstasyonu ya da iş merkezi OLMAYAN kayıt (`isMerkeziId` `null`) herkesin kapsamındadır: yazma geçer, listede görünür.
  - Okuma (liste, ayrıntı, terminal): süzülüp süzülmeyeceği modülün karar kartında yazar; yazmıyorsa süzme, soruyu
    teslimde bildir (`uretim-emirleri` bugün süzmüyor). Süzülecekse sorguya `kapsamSuzgeci(kapsam)` parametresi, SQL `sorgular.ts`'te:
    `($1::int[] IS NULL OR <is_merkezi_id> IS NULL OR <is_merkezi_id> = ANY($1::int[]))`. Parametre `null` ise sınırsız,
    boş dizi ise yalnız iş merkezi olmayan satırlar (ikisi ayrı).
  - Kapsam transaction'da kişi başına bir kez okunur. Aynı transaction'da kısıtı yazıp sonra kapsamı okuyan komut
    yardımcıyı kullanmaz (bellek bayat kalır); kaynağı doğrudan çağırır.
  - Bayraklı kişinin muafiyeti KAYNAKTADIR (`istasyonlar/disari.ts` boş liste döner), çekirdekte değil; çekirdek testi
    muafiyeti sahte kaynakla ölçer, gerçek bayrak yolu `istasyonlar` testlerindedir.
- Eşzamanlı iki komutun bozabileceği kural (tekillik, bağımlı kayıt, değer aralığı) veritabanı kısıtıyla da yazılır;
  kısıt göçte ADLANDIRILIR (`CONSTRAINT <tablo>_<kural>`, tekil dizinde dizin adı). İhlali iletiye servis çevirir:
  `kisitKorumali({ <kisit_adi>: { ileti, alan? } | 'ileti' }, () => sorgular.yaz(db, ...))` (`#cekirdek/kisit.ts`); kendi
  `try/catch`'ini yazma. Kod ihlalin türünden gelir (409 `CAKISMA`, 409 `BAGIMLI_KAYIT`, 422 `GECERSIZ`). Eşlemede olmayan
  kısıt modülün iletisini almaz, çekirdeğin genel cevabına düşer. İhlal transaction'ı iptal eder: çıkan hatayı yakalayıp
  aynı komutta sürdürme. Örnek: `sunucu/cekirdek/kisit-korumali.test.ts`.
  - Kendi kısıtını ADA göre yaz. Türe göre yedek (üçüncü parametre) yalnız BAŞKA modülün kısıtı içindir: silmede ihlal
    edilen yabancı anahtar bağlanan modülün tablosundadır, adını bilemezsin:
    `kisitKorumali(ESLEME, () => sorgular.sil(db, id), { BAGIMLI_KAYIT: 'Bu kayıt kullanımda; silinemez.' })`. Ad eşlemesi yedeği ezer.
  - Kısıt adı en çok 63 karakter (bayt): veritabanı uzun adı keser; daha uzun eşleme anahtarında yardımcı hata fırlatır.
  - Ertelenmiş (`DEFERRABLE INITIALLY DEFERRED`) kısıt bitişte, yardımcının dışında denetlenir ve çevrilmez: yazmanın
    içinde, yazıdan sonra `SET CONSTRAINTS <ad> IMMEDIATE` ile hemen denetlet.
- Tekrar korumalı komut: yinelenirse iki kez uygulanan yazma (sayım, kayıt açma) `uc({ ..., tekrarKorumali: true })` ile tanımlanır; işleyici ek kod yazmaz.
  Durum komutu (zaten çift yazmayan) bayrak almaz. Yalnız oturumlu POST/PUT/DELETE: GET'te ve `yetki: 'acik'`te tanım hatası; işleyici çerez yazamaz.
  - İstek `istek-kimligi` başlığında UUID taşır (`#paylasilan/istek-kimligi.ts`); yoksa ya da bozuksa 400 `DOGRULAMA` (alan `istek-kimligi`), işleyici koşmaz.
  - Aynı kişi + kimlik yinelenirse saklı ilk cevap döner; işleyici ve denetim koşmaz. Kimlik başka gövde, parametre ya da uçla gelirse 422 `GECERSIZ`.
    İlki sürerken gelen yineleme onu en çok 3 sn bekler (istemcinin deneme süresinden kısa), sonra 503 `MESGUL` alır (4xx dönmez). Hata cevabı saklanmaz: yeniden deneme taze çalışır.
  - Anahtar (kişi, kimlik); saklama 24 saat. İstemci `tekrarKorumaliGonder` ile gönderir (`yapi-kaliplari`). Bayraklı ucunu sınayan modül testi
    `uygulamaKur({ ..., tekrar: tekrarDeposu })` (`istek-kimligi/disari.ts`) verir; depo verilmeyen kurulumda uç kaydedilir ama çağrılınca 500 döner, işleyici koşmaz
    (öbür modüllerin testleri depo vermeden çalışır). Bu yalnız test ortamındadır; test dışı ortamda `kimlik`, `denetle` ya da `tekrar` eksikse `uygulamaKur` açılışta durur. Örnek: `sunucu/moduller/istek-kimligi/istek-kimligi.test.ts`.
  - Cevap 24 saat düz saklanır (jsonb): gizli değer (geçici parola gibi) döndüren uç bayrak ALMAZ; cevap jsonb'ye sığmalıdır (`\u0000` ya da eşsiz vekil karakter taşıyan cevap 500 verir).
- Hata fırlatınca transaction geri alınır. Reddedilen komutun yazısı kalacaksa
  (`yazilarKalir`) bu çekirdek kararıdır: cekirdek-yazari'na sor.
