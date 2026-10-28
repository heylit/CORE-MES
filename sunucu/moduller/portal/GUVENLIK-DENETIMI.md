# portal: güvenlik denetimi

Oturtmada yazıldı (kart #744); teslimde yoktu. Kaynak: `uclar.ts`, `servis.ts`, `portal.test.ts` (BD-01..BD-12), `KURAL-TEST.md`.
Bütün uçlar çalışan oturumu ister; dış (müşteri, tedarikçi) giriş yok (kart #745).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /portal/ben | `sayfa.portal` ya da `portal.oku`/`.yaz` | kimlik ve bayraklar kullanıcıdan | BD-07 | BD-07 (işlemsiz kişi 403) |
| GET /portal/damga | `portal.oku` ya da `.yaz` | yalnız sayaç | BD-01 | BD-21 |
| GET /portal/sorgu | `portal.oku` ya da `.yaz` | kişiye özel alan (BD-2), koşul/sıra/sınır sunucuda, bölümün okuyamadığı satış ve satın alma kaydı listeden düşer (kart #1162), firma görünürlüğü koşuldan önce (1019 a) | BD-04, BD-17, BD-26 | BD-06, BD-07, BD-17, BD-26 |
| GET /portal/belge | `portal.oku` ya da `.yaz` | kişiye özel alan, bölüm okuma izni: satış teklifi, satın alma teklif ve fiyat talebi, katalog ve türüne göre sipariş bölümü olmayana 403 (kart #1162), dış izleyiciye başka firmanın ya da olmayan kayıt aynı 403 (1019 a) | BD-01, BD-17, BD-26 | BD-06, BD-17, BD-26 |
| POST /portal/belge/yaz | `portal.yaz` | yol biçimi (kısıt), kişiye özel alan, beklenen sürüm 409, kayıt kişisi ve zamanı sunucudan, yeni "kim yaptı" alanı başka portal kullanıcısı olamaz, TMI kişisinin rol ve izinleri değiştirilemez, koleksiyona yalnız ilgili bölüm izni yazar (KD-063), var olan siparişe yalnız türünün bölümü ve finans yazar (kart #1162), onay adım zinciri sunucunun hesabıdır ve onay gerektiren kayıt onaysız ya da düşük tutarlı onayla yazılamaz (B8) | BD-01, BD-02, BD-14, BD-16, BD-17, BD-24 | BD-03, BD-06, BD-07, BD-09, BD-14, BD-15, BD-16, BD-24 |
| POST /portal/belge/sil | `portal.yaz` | kişiye özel alan, bölüm izni, sayaç | BD-05 | BD-06, BD-16 |
| POST /portal/belge/kilitle | `portal.yaz` | başkasının geçerli kilidi verilmez; kilit verisinde de başka kişi adına kimlik reddedilir; bölüm izni | BD-08 | BD-08, BD-16 |
| GET /portal/kisiler | `portal.oku` ya da `.yaz` | yalnız etkin kişilerin no ve adı (kisiler/disari.ts); dış izleyiciye 403 | BD-21 | BD-21, BD-26 |
| POST /portal/ben/hazirla | oturum; serviste `portal.oku` ya da `.yaz` | yalnız kişinin kendi `users/tmi-<no>` belgesi; yoksa kurulur, varsa yalnız rol ve izinleri TMI rolüne göre güncellenir, ad kullanıcıdan | BD-13, BD-15 | BD-13 (işlemsiz kişi 403) |
| POST /portal/kurulum | `portal.yonet` | yalnız işaret belgesi yokken | BD-11 | BD-11 (`yaz` ile 403) |
| GET /portal/oda | `portal.oku` ya da `.yaz` | bellekte, kişi başına; dış izleyiciye 403 | BD-12 | BD-21, BD-26 |
| POST /portal/ekler/yukle | `portal.yaz` | en çok 700 KB (kısıt), boş dosya 400; denetim gövdesiz, ad ve tür seçilir | BD-10 | BD-21 (`portal.oku` ile ve işlemsiz 403) |
| GET /portal/ekler/:id | `portal.oku` ya da `.yaz` | 32 hex kimlik; dış izleyiciye 403 (ekin bağlı olduğu kayıt tutulmuyor) | BD-10, BD-26 | BD-10 (olmayan ek 404), BD-26 |

## Yalnız ekranda kalan kurallar
Müşteri/tedarikçi görünürlüğü (`visible`) sunucudadır (1019 a, `izleyiciGorebilirMi`); bugün her oturum firma içi izleyicidir, dış izleyicinin firması dış hesap işiyle gelir (soru 1021).
Prototipin öteki iş kuralları (sipariş ve ödeme durum geçişleri) tarayıcıdadır; onay adımı hesabı sunucudadır (B8), limit değerleri portal ayarındadır;
`UYUM-BORCU.md`. Genel yazma ucu (`/portal/belge/yaz` her koleksiyona yazar) proje kuralı 7 ile çelişir; Aşama 2'de koleksiyon başına ayrı komut.

## Eksik testler (UYUM-BORCU'ya yazıldı)
Kapandı (borç turu 17.10.2026): `/portal/kisiler`, `/portal/oda`, `/portal/damga` ve ek yükleme için reddeden test BD-21.
