# Güvenlik denetimi: musteri-tedarikci

- Yetki: her uç `uc({...})` ile tanımlı; okuma `musteri-tedarikci.oku`, yazma `musteri-tedarikci.yaz`. Testler 401 (oturumsuz), 403 (işlemsiz ve yalnız okuyan) ölçer; reddedilen yazma kaydı değiştirmez.
- Nesne erişimi: adres uçları adresi firma kimliğiyle birlikte sorgular (`WHERE firma_id = $1 AND id = $2`); başka firmanın adresi 404 alır (test "adres saldırı").
- Girdi: zod şemaları uzunluk sınırlı (ad 100, adres 500); koordinat aralığı hem şemada hem kısıtta; bilinmeyen tür 400.
- Eşzamanlılık: her yazma kartı `FOR UPDATE` ile kilitleyip sürüm artırır; eski sürüm 409.
- Tekrar: ekleme uçları `tekrarKorumali`; aynı istek kimliği ikinci kayıt açmaz.
- SQL yalnız `sorgular.ts`'te, parametreli; arama metnindeki `%` kaçırılır.
- Finans rakamı bu modülün uçlarından ve `disari.ts`'ten dönmez (FNS-48 testi).
- Dış çağrı, yeni paket, gerçek veri yok; örnek firmalar uydurma (ORN-).
- Konum girişi istemcide yalnız metinden ayrıştırılır; harita servisine istek atılmaz.
