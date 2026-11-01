# ADR 0023 — NC programı tezgaha doğrudan gitmez

Durum: kabul (kullanıcı kararı 1438 a, 31.10.2026: "hiçbir zaman doğrudan gitmez; programcı onaylar, kuru deneme kaydı girilir,
sonra indirilir"; ADR yazımı 1500-j; metin onayı 1524, 01.11.2026 karar kartı).

## Bağlam

Hatalı NC programı tezgah ve takım çarpışması demektir; zarar geri alınamaz. CNC Kurulum modülü program dosyasını (ISO G-kod,
Heidenhain Klartext) okur, benzetimde oynatır ve tarayıcıda dosya olarak indirir (`istemci/src/moduller/cnc-kurulum/yeni/indir.ts`).
Bugün depoda NC programı üreten kod yoktur (Oto-CAM 1399 ile kaldırıldı); 1437 a CAM girdisinin ileride kesinleşmesini öngörür.
ADR 0010 karar 1 yalnız "TMI tezgahtan veri toplamaz" der; tezgaha yazmayı hiçbir ADR söylemez.

## Karar

1. **Tezgaha bağlantı yok.** TMI tezgah kontrolüne, DNC sunucusuna ya da tezgahın dosya paylaşımına bağlanmaz; program göndermez,
   program çekmez. Bunu yapan kod (soket, dosya paylaşımı, seri port, DNC protokolü) yazılmaz. Okuma yönündeki yasak ADR 0010 karar 1'de sürer.
2. **Program yalnız indirilir.** NC programı kullanıcının tarayıcısında dosya olarak iner; tezgaha insan aktarır. Aktarım sistemin
   dışındadır; TMI onu izlemez.
3. **Sistemin ürettiği ya da değiştirdiği program onaysız inmez.** TMI program üretir ya da değiştirirse indirme sunucuda iki koşula
   bağlanır: programcı onayı (ayrı işlem) ve kuru deneme kaydı. Benzetimin temiz çıkması onayın yerine geçmez. Kullanıcının yüklediği
   program bu maddenin dışındadır: TMI onu değiştirmeden geri verir.
4. **Kırmızı çizgi.** Bu karar yalnız yeni ADR ve kullanıcının yazılı onayıyla değişir. CLAUDE.md'deki dış servis yasağı tezgahı zaten
   kapsar (tezgah üç kurum içi istisnadan biri değildir); ayrı satır eklenmez.

## Sonuçlar

- Bugün kod değişmez: sunucuda tezgaha bağlanan kod yoktur, indirme tarayıcıdadır.
- Karar 3, NC üreten ilk kodla (1437 a) birlikte uygulanır; o işin kartı onay işlemini, kuru deneme kaydını ve izinli ve reddedilen
  testleri taşır.
- Kurum içi istisnalar (ADR 0013, 0014, 0017) tezgaha uzatılamaz.

## Vazgeçilenler

- **Benzetim temizse doğrudan indirme (1438 b):** benzetim tezgah kinematiğini, bağlamayı ve gerçek takım boyunu tam bilmez.
- **DNC ile tezgaha gönderme:** kurum içi ağda tezgaha yazan bir yol açar; hata ve kötüye kullanım doğrudan tezgaha ulaşır.

## Açık

- "Kuru deneme kaydı" sistemdeki benzetim koşusu mu, tezgahta parçasız koşunun kaydı mı: karar 3'ü uygulayan kartta sorulur.
