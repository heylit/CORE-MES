# ADR 0001 — Temel mimari

Durum: kabul edildi (05.10.2026)

## Bağlam

Önceki sistemde yeni kod eklemek yavaşlamıştı: tek dosyada yüzlerce uç, iki veritabanı lehçesi,
kaynak metnini kilitleyen testler ve ortak dosyalarda çakışan paralel çalışma. Sistem sıfırdan
yazılıyor; önceki depodan kod, şema, test ve veri taşınmıyor.

## Karar

1. **Modüler monolit.** Tek süreç, tek PostgreSQL. Mikroservis yok. Ağır işler (belge üretimi,
   zamanlanmış işler) ileride aynı depodan ayrı süreç olarak koşar.
2. **TypeScript, derlemesiz sunucu.** Node 24 tip silmeyle `.ts` dosyalarını doğrudan koşar; sunucuda
   derleme adımı yoktur. Bu yüzden yalnız silinebilir sözdizimi kullanılır (enum, namespace yok).
3. **Yalnız PostgreSQL, `async/await`, ORM yok.** Testler de gerçek PostgreSQL'de, koşu başına ayrı
   şemada çalışır.
4. **Göçler dosya başına bir değişiklik.** `sunucu/gocler/<zamanDamgasi>_<ad>.sql`; uygulanmış göç
   değişmez (özet denetlenir). Sunucu göç koşmaz; bekleyen göç varsa açılmaz.
5. **Uç tanımı tek kaynak.** `uc({ yontem, yol, sayfa, yetki, şemalar, isle })`. Yetki, doğrulama ve
   cevap daraltma bu tanımdan uygulanır. Okuma kaynak, yazma komut; yazma tek transaction'da koşar.
6. **Modül sınırları araçla denetlenir.** Modüller arası ithal yalnız `disari.ts`; SQL yalnız
   `sorgular.ts`; iş kuralı `kurallar.ts` içinde saf fonksiyon (saflığa ve tablo sahipliğine araç değil
   denetçi bakar). Uçlar dizin keşfiyle yüklenir; ortak
   kayıt dosyası yoktur.
7. **Ortam değişkenlerinde varsayılan yok.** Yalnız `TMIV2_*` okunur; eksik değişken açılışta hata
   verir. Önceki sistemin veritabanı adı reddedilir.
8. **Tek tasarım sistemi.** Arkon değişkenleri; ekran renk ve ölçü yazmaz. Tek kabuk, üç yerleşim;
   her ekran telefon, tablet ve bilgisayarda tam işlevlidir.
9. **Paralel çalışma dosya ayrıklığıyla.** Bir oturum bir modül klasörü. İş kaydı, karar ve göç iş
   başına ayrı dosyadır; üretilen dizinler depoya girmez.

## Sonuçlar

- Yeni uç tek dosyaya dokunur; yetkiyi unutmak tanım anında hata verir.
- Test için çalışan bir PostgreSQL gerekir (yerelde `tmiv2_test`, GitHub'da servis kabı).
- Çekirdek, `paylasilan/` ve `istemci/src/ortak/` kilitli bölgedir; buraya dokunan iş paralel
  dalgadan önce tek başına girer.

## Açık konular

- Veritabanı rolleri (uygulama, göç, salt-okur) henüz ayrılmadı; şimdilik tek kullanıcı.
- Oturum ve kullanıcı modülü, denetim kaydı ve canlı güncelleme (SSE) sonraki adımlar.
- Üretim derlemesinin sunucudan servisi ve yayın betiği henüz yok.
