# ADR 0017 — Logo'ya aynı bilgisayardaki yardımcıyla (Logo Objects) yazmak

Durum: kabul (kullanıcı kararı 344 a, 21.10.2026: "344 a, ADR, CLAUDE.md ve .github onaylı"; Logo istemcisi TMI sunucusuyla aynı bilgisayarda).
ADR 0011'in 1, 2 ve 4. kararlarının yerine geçer; 3, 5, 6 ve 7. kararlar aynen sürer. ADR 0011 karar 2'deki kurum içi adres kuralı
SmartES için (ADR 0013) geçerli kalır.

## Bağlam

ADR 0011 kurum içindeki hazır bir Logo köprü servisini varsayıyordu; böyle bir servis yok. Kullanıcı kararı (20.10.2026): köprü kurulmaz,
Logo'ya Logo Objects (COM, `UnityObjects.UnityApplication`) ile doğrudan yazılır. Logo Objects 32-bit COM'dur; Node COM çağıramaz.
Logo istemcisi TMI sunucusuyla aynı bilgisayardadır. Yazma kuralları kullanıcının verdiği entegrasyon rehberindedir (depoya girmez).

## Karar

1. **Ayrı x86 yardımcı.** `araclar/logo-yardimcisi/` altında C# 5 ile yazılmış, .NET Framework 4.x'in kendi `csc.exe`'siyle `/platform:x86`
   derlenen tek exe. Paket yok (dinamik COM, `System.Data.SqlClient`, `JavaScriptSerializer`). Tek STA iş parçacığı, tek Logo oturumu;
   bağlantı kurulamazsa 5 dakika yeniden denenmez (Logo lisansı kapanan oturumu birkaç dakika tutar).
2. **Yalnız aynı bilgisayar.** Yardımcı yalnız `127.0.0.1`'i dinler; ağ kipi yoktur. TMI'de `TMIV2_LOGO_KOPRU_ADRESI` yalnız `127.0.0.1`,
   `localhost` ya da `[::1]` olabilir; başka adres, kurum içi olsa da, açılışta reddedilir (`sunucu/moduller/logo/ayar.ts` `yerelMi`).
   Yardımcı `Origin` başlıklı isteği (tarayıcı) ve yabancı `Host`'u reddeder; `X-Api-Key` sabit sürede karşılaştırılır.
3. **Sözleşme değişmez.** Yardımcı `kopru.ts`'in kullandığı uçları ve `{ success, logicalRef, error, validate }` zarfını aynen sunar;
   ek olarak hizmet kartı "var mı" ucu (`/api/PurchaseService|SalesService/exists/{kod}`) gelir.
4. **Yazma yalnız Logo Objects ile, SQL yalnız okuma.** Logo tablolarına SQL ile yazılmaz: sorgular tek sınıfta ve yalnız `SELECT`,
   metin denetimi başka her şeyi reddeder, her sorgu geri alınan transaction'da koşar; kurulumda salt okunur SQL kullanıcısı önerilir.
   Her yazmadan sonra kayıt SQL ile doğrulanır (`Post` true yetmez). İrsaliye ve fatura yazılmaz, yalnız okunur.
5. **Ölçülmemiş etiket yazılmaz.** Etiket ve alan adları rehberin ölçülmüş listesinden gelir; ölçülmemiş alan (ör. Açıklama 1) istekte
   gelirse yazılmadan reddedilir. Ölçüm `--olc` ile gerçek kaydın `ExportToXmlStr` dökümünden yapılır.
6. **Kimlik ve adres yalnız yapılandırmada.** Logo kullanıcı adı, parolası, firma ve dönem numarası, SQL bağlantısı ve anahtar yardımcının
   ayar dosyasındadır (depo dışı); TMI tarafı yalnız `TMIV2_LOGO_KOPRU_*` değişkenlerini okur. Depoda yalnız yer tutuculu `ornek.ayar` vardır.
7. **Canlı deneme yalnız test kayıtlarıyla.** `--deneme` yalnız `TMI-ERP-TEST-001` malzemesini ve `TMI-ERP-` önekli fişleri kullanır,
   açtığını siler; gerçek kayıt silinmez.

## CLAUDE.md satırı

Metin CLAUDE.md'dedir (kırmızı çizgiler); buradaki eski öneri metni 01.11.2026'da kaldırıldı (1495 a).

## Sonuçlar

- Kurulum `kurulum/logo-yardimcisi.md`; Windows CI işi yardımcıyı derler ve sahte Logo testlerini koşar.
- TMI kodunda değişiklik küçük: adres denetimi daralır, hizmet "var mı" yolu verilir.

## Vazgeçilenler

- **Kurum içi ağda ayrı köprü sunucusu:** gerekmedi (Logo istemcisi aynı bilgisayarda); ağ kipi saldırı yüzeyini büyütür.
- **Node'dan COM (yerel eklenti paketi):** yeni paket ve derleme zinciri gerekir.
- **Logo tablolarına SQL ile yazmak:** Logo iş kurallarını atlar; kullanıcı kuralıyla yasak.
- **HttpListener:** yönetici olmayan kullanıcıda URL ayırma (`urlacl`) ister; `TcpListener` istemez.

## Doğrulanmadı

- Gerçek Logo'da hiçbir yazma denenmedi; sözleşme sahte Logo ile sınandı. Varsayılan sütun ve etiketler `SqlOkuma.cs` `Sorgular.Dogrulanmadi`
  listesinde ve `kurulum/logo-yardimcisi.md`'de; `--deneme` ile gerçek Logo'da doğrulanır.
- Logo bilgisayarında .NET Framework 4.x'in kurulu olduğu (VARSAYIM; Logo istemcisi .NET Framework ister).
