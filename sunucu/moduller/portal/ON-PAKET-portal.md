# Ön paket: portal

Prototip: Müşteri ve Tedarikçi Portalı (`Atlas-Metal-Portal.html`). Taban: `main` 708190c.

## Sayfa ve ikinci menü
- Sayfa `/portal`, görme işlemi `sayfa.portal`, başlık "Müşteri ve Tedarikçi Portalı", simge `chart`, grup `Yönetim`, sıra 8.
- İkinci menü çerçeveli (`cerceveli: true`), tek madde: ana sayfa. Prototip kendi iç gezinmesini taşır.

## Veri
Prototip `window.claude.use('db')` bulunca veriyi koleksiyonlardan (firmalar, katalog, sipariş, ödeme, uygunsuzluk, teklif, belge, sözleşme, onay, mutabakat, ayarlar, kullanıcılar, bildirimler) okur ve yazar; köprü bunları modülün belge deposuna taşır. Ekran tercihi (`atlas-portal-ui-v3`) kişinin özel alanına yazılır.

Boş depo: Boş depoda yönetici ilk açtığında `settings/main` (prototipin varsayılan onay kuralları, boş endeks) ve kurucu kişi için firma kullanıcısı (`users/tmi-<kişi no>`, rol "Genel müdür") kurulur.

Çerçeve yetenekleri: db, assets (en çok 700 KB), downloads.

## Uçlar ve yetki
| Uç | Yetki | Ne yapar |
|---|---|---|
| GET /portal/ben | `sayfa.portal` ya da `portal.oku` ya da `portal.yaz` | kimlik, yazma ve yönetim bayrağı, kurulum gerekli mi |
| GET /portal/damga | `portal.oku` ya da `.yaz` | son sürüm (değişiklik yoklaması) |
| GET /portal/sorgu | aynı | koleksiyon; koşul, sıra, sınır |
| GET /portal/belge | aynı | tek belge |
| POST /portal/belge/yaz | `portal.yaz` | tam ya da birleştirerek yazma, beklenen sürüm |
| POST /portal/belge/sil | `portal.yaz` | silme |
| POST /portal/belge/kilitle | `portal.yaz` | süreli kilit (tek sefer koşan işler) |
| GET /portal/kisiler | `portal.oku` ya da `.yaz` | etkin kişiler (no, ad) |
| POST /portal/kurulum | `portal.yonet` | boş depoda başlangıç belgeleri |
| GET /portal/oda | `portal.oku` ya da `.yaz` | açık olanlar ve durumları |
| POST /portal/ekler/yukle | `portal.yaz` | ek yükleme (gövdesiz denetim) |
| GET /portal/ekler/:id | `portal.oku` ya da `.yaz` | ek okuma |

Rol dağılımı (kullanıcı kararı 12.10.2026; göç `20261012073300_kisiler_paket_modul_yetkileri.sql`, çekirdek yamasında). `portal.yonet` yalnız yöneticide kalır:

| Rol | İşlem |
|---|---|
| `mudur`, `satin_alma` | oku, yaz |
| `muhasebe_finans`, `kalite`, `sevkiyat` | oku, yaz |
| `planlama_proje` | oku |

Her role ayrıca `sayfa.portal` verilir.

## Tablolar
- `portal_belge`: yol (PK), üst koleksiyon, kimlik, veri (jsonb nesne), sürüm, oluşturan/güncelleyen kişi ve zaman, kilit sahibi ve bitişi.
- `portal_ek`: kimlik (32 hex), ad, tür, boyut (≤ 700 KB), içerik (bytea), yükleyen, zaman.
- `portal_surum`: tek sürüm sayacı.

## İş kuralları
KURAL-TEST.md'deki BD-1..BD-14. Prototipin kendi iş kuralları ekranda kalır (UYUM-BORCU.md).

## disari.ts ile açılan
`portalKoleksiyonu(db, koleksiyon)`: kişiye özel alan (`data/...`) dışındaki bir koleksiyonun belgeleri, salt okunur. Aşama 2'de bağlanacak modüller için.

## Bu modül şunları varsaydı
- Portal kendi içinde rol seçimiyle (firma, müşteri, tedarikçi) giriş ekranı taşır; bu giriş TMI yetkisi değildir, TMI yetkisi yalnız `portal.*` işlemleridir.
- Prototipteki "Atlas Metal" firma adı ve örnek veri prototipin kendi metnidir; db kipinde örnek veri yazılmaz (VARSAYIM: ad bağlamada ayardan gelir).
- Endeks serisi (HRC, kur) boş başlar; örnek değer girilmez.
- Değişiklik 2,5 sn'de bir damga yoklamasıyla gelir (anlık itme yok).
- Ek en çok 700 KB.

## Kararlar (12.10.2026)
1. Ek içeriği denetim kaydına girmez; ad ve tür girer.
2. Rol dağılımı yukarıdaki tablodur.
3. Mesai'nin Excel içe aktarımı için SheetJS eklendi.

## Açık sorular
Yok.
