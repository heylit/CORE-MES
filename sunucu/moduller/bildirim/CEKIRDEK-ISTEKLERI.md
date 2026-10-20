# CEKIRDEK-ISTEKLERI: bildirim

Yeni işlem, sayfa, rol x işlem satırı ya da toplayıcı satırı gerekmedi: uçlar `oturum`, liste menü sayfası değil (`/profil/bildirimler`), zil `ust-eylem.tsx` ile kendiliğinden toplanır.

## Ç-1: Üst çubukta zile yer (kabuk.css)

Zil her kişinin üst çubuğuna bir düğme ekler. Yöneticide çubuk doludur; `ekran-testleri/ust-cubuk.spec.ts` 1024 ve 1280 genişlikte
`/finans` başlığının kesildiğini yakalar (1024'te 23 px, 1280'de 13 px). Modülün kendi CSS'iyle kapanmaz: düğme dokunma boyundan küçülmez,
başlık ve çubuk düzeni kabuktadır.

Önerilen değişiklik (`istemci/src/ortak/arayuz/kabuk.css`; yerelde `ust-cubuk.spec.ts` 10/10 yeşil):

- Başlığın iki satıra inmesi tabletle sınırlı kalmasın, 1279'a kadar geçerli olsun: `.tc-kabuk-ileri, .tc-kabuk-yerler` gizleme kuralı
  768-1023'te kalır; `.tc-kabuk-baslik` iki satır kuralı ayrı `@media (min-width: 768px) and (max-width: 1279px)` bloğuna taşınır.
- Sık kullanılan düğmenin adı (`.tc-kabuk-dugme-ad`, bugün yalnız "Öneri") 1280 yerine 1440'tan itibaren yazılır.
