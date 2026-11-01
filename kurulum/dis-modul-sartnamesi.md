# Dış modül şartnamesi

Bu deponun dışında (başka oturum, başka makine, başka yapay zeka) modül yazan içindir.
Karar (kart #158): dışarıdan gelen modül esastır ve OLDUĞU GİBİ alınır; depodaki aynı modülün yerine geçer, yeniden tasarlanmaz,
yeniden yazılmaz, ekranına dokunulmaz. Depoda yapılan tek iş bağlamadır. Depo kalıbına uymayan yer teslimi geri çevirmez:
modülün `UYUM-BORCU.md` dosyasına yazılır, sonra adım adım uyumlanır. Geri dönen yalnız "Değişmeyenler"e aykırı parçadır.
Dış teslim sürdükçe bu dosya geçerlidir; `CLAUDE.md` ile çelişirse `CLAUDE.md` kazanır.

## Önce oku

`CLAUDE.md` · `.claude/skills/yapi-kaliplari/SKILL.md` · `.claude/skills/modul-ac/SKILL.md` · `uc-ekle` ve `goc-yaz` skill'leri ·
`belgeler/adr/` · örnek modül: `sunucu/moduller/oturum/`, `istemci/src/moduller/sistem/`. Güncel liste: `npm run harita`.
Depodaki güncel modülden başla; kalıplar bu dosyalardadır, burada yinelenmez.

## Değişmeyenler (alınmaz, geri döner)

Kırmızı çizgiler ve çekirdek korumalarıdır; borca yazılarak geçilmez. Aykırı parça alınmaz, kullanıcıya bildirilir.

1. Gerçek veri girmez: müşteri adı, parça no, çizim, kişi adı, parola, anahtar. Test ve örnek verisi uydurmadır.
2. Dış servis, CDN ve telemetri yok; yalnız `TMIV2_*` ortam değişkenleri okunur. Dış adrese giden çağrı çalışır halde alınmaz:
   bağlamada kapatılır ve "kapalı özellik" diye borca yazılır.
3. Eski sistemin kodu, şeması, testi ve verisi girmez; eski sisteme bağlanılmaz.
4. Yeni npm paketi yalnız kullanıcı onayıyla girer: adı, sabit sürümü ve nedeni `CEKIRDEK-ISTEKLERI.md`'ye yaz. Onaysız paket kurulmaz.
5. Yetki sunucudadır: her uç `uc({...})` ile tanımlanır, tanımsız uç yoktur; yalnız ekranda uygulanan yetki yetki sayılmaz.
   Rol x işlem satırları teslimle girmez: önerini yaz, kullanıcı onayıyla ayrı göçte girer.
   Roller ve işlemler: `kurulum/yetki-matrisi.md` (ortak matris; isteğini oraya eklenecek satırlar olarak `CEKIRDEK-ISTEKLERI.md`'ye yaz).
6. Denetim kaydı dolanılmaz: her yazma `uc()` üzerinden geçer (kaydı uç katmanı tutar).
7. Modül sınırı: başka modülün tablosu okunmaz, yazılmaz; yalnız onun `disari.ts` fonksiyonu çağrılır. Fonksiyon yoksa
   `BASKA-MODUL-ISTEKLERI.md`'ye yaz, sahtesini kurma. Kendi tablon yalnız kendi YENİ göç dosyandadır; var olan göç değişmez;
   tablo düşüren göç düşürdüğü her tablonun boş olduğunu denetler.
8. Kilitli yerler teslimle değişmez: `sunucu/cekirdek/`, `istemci/src/ortak/`, `paylasilan/` kökündeki dosyalar (toplayıcılar ve tanımlar),
   başka modüllerin dosyaları, `araclar/`, kök yapılandırma, `.claude/`, `CLAUDE.md`. Gerekeni değiştirme, etrafından dolanma:
   `CEKIRDEK-ISTEKLERI.md`'ye yaz (ne, neden, önerilen imza); ayrı kartla ana depoda girer.
9. Temel kural: belgelerindeki her iddia DOĞRULANDI, VARSAYIM ya da BİLMİYORUM diye yazılır; eksik bilgi uydurulmaz, açık soru olarak gelir.

## Tercih edilen yol (uymayan alınır, borca yazılır)

- Depo kalıbı: `uclar.ts` / `servis.ts` / `kurallar.ts` / `sorgular.ts` / `disari.ts`; SQL yalnız `sorgular.ts`; uçta kayıtlı işlem
  (`<modül>.<eylem>`); çekirdeğin liste, sürüm, kısıt, kapsam ve zaman yardımcıları.
- Ekran ortak arayüz (`istemci/src/ortak/arayuz`) ve tasarım değişkenleriyle, 360, 768 ve 1280 genişlikte. Modül kendi arayüzünü ve
  bileşenlerini de taşıyabilir (modül klasöründe ya da çerçevede kendi sayfasıyla); ortak arayüzü kullanmayan modül bunu borçta bildirir.
  Eksik ortak bileşeni çekirdekten istemek tercihtir, beklemek zorunlu değildir.
- Elindeki çalışan kod ya da prototip olduğu gibi gelebilir; depo kalıbıyla yeniden yazman beklenmez.
- Veri sunucuda, sütun ve kısıtla durur; her iş kuralı bir teste, mümkünse bir veritabanı kısıtına karşılık gelir. Serbest `jsonb`,
  tarayıcıda tutulan veri ve yalnız ekranda kalan kural borçtur.
- İş kuralların öneriyle ilerler: ön pakette tek cümlelik, sınanabilir maddelerle yaz; onay beklemeden yazarsın, kullanıcı itiraz ettiğini değiştirir.
  Depodaki onaylı kararla çelişen kuralın geçerlidir; `FARK.md`'ye yaz, kullanıcıya listede bildirilir.
  Eski sistem kuralları (özel takip deposunda) öneriyle ilerlemez: kullanıcı açıkça "kalsın" demeden onaylı değildir; aldıysan ön pakette işaretle.
- Bir teslim tek modüldür; sunucu ve istemci tarafı birlikte gelir. Dosya ve klasör adları yalnız `[A-Za-z0-9._-]` taşır.

## Teslim biçimi

İki türden biri:
1. Modül dosyaları zip'i: depo yollarıyla `sunucu/moduller/<ad>/`, `istemci/src/moduller/<ad>/`, `paylasilan/{sozlesme,islemler,sayfalar,ayarlar}/<ad>.ts`,
   `sunucu/gocler/<14 haneli damga>_<ad>_<konu>.sql` (damga `main`'deki son göçten yeni); belgeler zip'in kökünde.
2. Yama dizisi (`git am` ile uygulanan commit yamaları; mesajlar İngilizce): hangi commit'in üstüne uygulanacağı uygulama notunda yazar.
   Modül kendi üst düzey klasörünü ve ayrı derlemesini getirebilir; kilitli yere dokunan yama ayrı durur ve çekirdek isteği sayılır.

| Belge | İçerik |
|---|---|
| `FARK.md` | depodaki sürüme göre eklenen, değişen, silinen; değişen onaylı kararlar |
| `CEKIRDEK-ISTEKLERI.md` | çekirdek, ortak arayüz, toplayıcı satırı, menü grubu, yeni paket istekleri (yoksa "yok") |
| `BASKA-MODUL-ISTEKLERI.md` | hangi modülün `disari.ts` dosyasından hangi fonksiyon, hangi imzayla (yoksa "yok") |
| `KURAL-TEST.md` | her iş kuralı -> onu sınayan test adı (ters tırnak içinde); koşulmamış test "çalıştırılmadı" diye |
| `ON-PAKET-<ad>.md` | ad; sayfa ve ikinci menü; uç başına yetki ve önerilen rol dağılımı; tablolar; iş kuralları; `disari.ts` ile açılanlar; açık sorular |
| `UYGULA.md` ya da `OKU.md` | uygulama notu: taban commit, uygulama ve derleme adımları, koştuğun denetimlerin son satırları, koşamadıkların |
| `sunucu/moduller/<ad>/UYUM-BORCU.md` | bildiğin istisnalar; her madde: kural / istisna / nerede / nasıl uyumlanır |

`UYUM-BORCU.md` dolu gelir, oturtmada tamamlanır. En az şunları yaz: `jsonb` ile tutulan veri; kendi stili, rengi ve bileşenleri; tarayıcıda
tutulan veri (`localStorage`, IndexedDB); yalnız ekranda kalan kural ve yetki; kapalı ya da yarım özellik; kullanmadığın çekirdek kalıbı.

Deneme aracının bugünkü sınırı (`npm run teslim`, kart #171; karar kullanıcıda, #116): araç yalnız zip okur; modül klasöründe yalnız
`.ts`, `.tsx`, `.css`, `.md` tanır ve öbür her dosyayı, üst düzey klasörü, kökteki `UYGULA.md` / `OKU.md` dosyasını "kilitli" gösterip
teslimi kırmızı sayar; adında izinli karakter dışı bulunan arşivi hiç açmaz. Bu kırmızı tek başına ret değildir: `.html`, yazı tipi,
lisans dosyası gibi varlıklar ve yama biçimi elle oturtulur. Boş, tamamı atlanmış (`skip`, `todo`) ya da `only` ile daraltılmış test araçta kırmızıdır.

## İkinci menü (her modülde zorunlu)

Dışarıdan gelen her modül ana menüde tek sayfadır ve kendi sayfalarını ikinci menüsünde VERİ olarak bildirir. Kabuk çizer, kullanıcının
işlemlerine göre süzer, etkin maddeyi adresten bulur, dar ekranda şeride çevirir.

```ts
// paylasilan/sayfalar/ornek.ts
import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ORNEK_SAYFALARI = [
  { yol: '/ornek', islem: 'sayfa.ornek', baslik: 'Örnek Modül', simge: 'cube', grup: 'Üretim', sira: 40 },
] as const satisfies readonly SayfaTanimi[];

export const ORNEK_IKINCI_MENU = {
  kok: '/ornek', baslik: 'Örnek Modül', simge: 'cube',
  sayacUcu: '/ornek/menu-sayaclari', // isteğe bağlı
  gruplar: [
    { maddeler: [{ anahtar: 'genel', baslik: 'Genel bakış', yol: '/ornek', simge: 'gauge', islem: 'sayfa.ornek' }] },
    { baslik: 'Tanımlar', maddeler: [{ anahtar: 'turler', baslik: 'Türler', yol: '/ornek/turler', simge: 'grid', islem: 'ornek.tanim-oku' }] },
  ],
} as const satisfies IkinciMenuTanimi;
```

- Madde yolu `kok` yolunun kendisi ya da altıdır ve menüde tekildir; `anahtar` menüde tekildir; `islem` kayıtlı işlem, `simge` ortak setten.
  Her madde yolunun rotası modülün `rotalar.tsx` dosyasında olur (testle denetlenir). Etkin madde adresi kapsayan en uzun yoldur:
  hiçbir maddeye düşmeyen alt yolda (`/ornek/bilinmeyen`) kök yoldaki madde etkin görünür.
- Modül kendi yan menüsünü, sekme şeridini ya da sayfa başlığı çubuğunu çizmez; kullanıcının görmemesi gereken maddeyi `islem` ile bildirir.
  Kendi menüsünü çizerek gelen teslimde bağlamada yalnız menü kabuğa taşınır; ekranın başka yeri değişmez, fark borca yazılır.
- Sayı isteyen modül tek bir okuma ucu bildirir (`sayacUcu`); cevap şeması `#paylasilan/ikinci-menu.ts` `ikinciMenuSayacSemasi`
  (madde anahtarı -> eksi olmayan tam sayı ya da `null`; bilinmeyen sayı `null`, sıfır uydurulmaz). Sayıyı kabuk çağırır ve gösterir.
  Uç `yetki: 'oturum'` ile yazılır ve sayıyı kullanıcının yetkisine göre sunucu süzer: yetkisi olmayan maddenin sayısı `null` döner.
- İçeriği çerçeve olan modül `cerceveli: true` yazar; menü yine kabuktadır. Çerçevedeki görünüm `useCerceveGorunumu({ cerceve, kok })`
  ile adrese bağlanır (`istemci/src/ortak/rota/cerceve-gorunumu.ts`); çerçeve tarafı `cerceveKoprusuKur` ya da aynı iletilerin elle yazımıdır
  (`cerceve-iletisi.ts`). İletiler (hepsi `kanal: 'tmi-gorunum'`, `surum: 1` taşır; görünüm adı maddenin `anahtar`ıdır):
  kabuktan `{ tip: 'gorunum', gorunum, sira }`; çerçeveden `{ tip: 'hazir' }` ve `{ tip: 'gorunum-degisti', gorunum, sira }`.
  - `hazir`, çerçeve `gorunum` iletisini hemen uygulayabilecek duruma gelince yollanır. Kabuk ondan önce göndermez ve dinlemez; her `hazir`da
    adresteki görünümü yeni sırayla yeniden yollar. Çerçeve, `gorunum` iletisi alana kadar `hazir`ı aralıklarla yineleyebilir
    (kabuğun dinleyicisi kurulmadan yollanan `hazir` kaybolur; `cerceveKoprusuKur` bunu kendisi yapar).
  - Bir `gorunum` iletisi alındıktan sonra, o ileti uygulanmadan önceki görünüm (açılış görünümü dahil) bildirilmez; uygulanan isteğin
    yankısını bildirmek zararsızdır. Kullanıcının içeride yaptığı değişim `gorunum-degisti` ile bildirilir.
  - `sira`: kabuk her `gorunum` iletisinde artırır; köprü ömrünce hep artar, `hazir`da sıfırlanmaz. Çerçeve değere anlam yüklemez:
    bildiriminde aldığı son `sira`yı geri yazar (hiç almadıysa 0). Kabuk yalnız kendi son sırasını taşıyan bildirimi kabul eder;
    menüde olmayan ad adresi değiştirmez.
  - İki taraf da kökeni ve kaynak pencereyi denetler, hedef köken `*` olmaz. Çerçevede `sandbox` özniteliği `allow-same-origin` olmadan
    kullanılamaz: köken `null` olur, köprü her iletiyi atar. Çerçeveyi bu köprü dışında bir yolla bağlayan modül bunu borçta bildirir.
- Toplayıcıya (`IKINCI_MENULER`) eklenmesi çekirdek işidir; `CEKIRDEK-ISTEKLERI.md` ile istenir.

## Bağlama: oturtmada ne yapılır

1. Teslim geçici ağaçta denenir; belgeler okunur. Çekirdek, ortak ve başka modül istekleri teslimden önce ayrı kartlarla ana depoda girer.
2. Gelen modül kendi kartıyla bir dala konur ve depodakinin yerine geçer; teslimde olmayan eski dosya silinir.
3. Yapılan yalnız bağlamadır: veri kaynağı (ekranın sunucu uçlarına bağlanması), sayfa ve yetki kaydı (toplayıcı satırları, ikinci menü, işlem),
   derleme, sınır, lint ve gerçek veritabanı testlerindeki kırıklar. Kural testi silinmez, zayıflatılmaz.
4. Bağlamada görülen her çakışma `UYUM-BORCU.md`'ye eklenir; düzeltilmez. Denetçi yetki, denetim kaydı, modül sınırı, gerçek veri, dış çağrı,
   yeni paket ve `FARK.md`'de yazmayan değişikliğe bakar; tasarımı tartışmaz.
5. Kullanıcıya tek listede bildirilir: değişen onaylı kararlar, alınmayan parçalar ve en çok on satırlık "bu modül şunları varsaydı" özeti.

## Kullanıma açma kapısı

- Birleşmek kullanıma açmak değildir: denetimde bulunan yetki açıkları (borçta "kullanıma açmadan önce" başlığı) kapanmadan modülün işlemleri
  yönetici olmayan hiçbir role verilmez. Düzeltmeler sunucuda yapılır, ekrana dokunulmaz.
- Rol x işlem dağılımı kullanıcı onayıyla, ayrı göçte girer.
- Modül, kullanıcı cihazda kullanıp "tamam" demeden bitmiş sayılmaz. Kabul bekleyen iki modül varken yeni teslim oturtulmaz.
