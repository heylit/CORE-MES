# guvenlik: uyum borcu

## Bağlamada kapanacak

1. KAPANDI (1778): hesap kilidi yalnız Güvenlik Merkezi kapısından (`guvenlik.yonet`) okunur ve açılır; oturum modülünün
   `/oturum/kilitler` ve `/oturum/kilitler/:id/ac` uçları kalktı. Karar: kullanıcı, proje sohbeti 17.10.2026 18:53.
2. Koruma maddeleri "bilinmiyor": yedek, güncelleme imzası, HTTPS, sertifika, denetim kaydı durumu. Okuyacak `disari.ts`
   yok; istekler `CEKIRDEK-ISTEKLERI.md` ve `BASKA-MODUL-ISTEKLERI.md`.
3. Yönetici işlemleri bölümü yalnız `/denetim` sayfasına bağlantıdır; denetim `disari.ts` okuyucu vermiyor.
4. VPN ve NAT: muafiyet ayarı geldi, boş başlar. VPN'in adres verme biçimi bilinmiyor (kullanıcı bilgi işleme soracak).
5. Devredilmezlik kapandı: `guvenlik.oku` ve `guvenlik.yonet` `DEVREDILMEZ_ISLEMLER`'de (kullanıcı kararı "Verilemesin").
6. KAPANDI (1369, 1365 a): açık alarm sayısı ana menüde de görünür (`anaMenuSayaci: 'alarmlar'`, kabuk).
7. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): teslim ana dalda; `npm run sinir -- --modul guvenlik` 17.10.2026: sınır 0 ihlal, göç damgası 0 ihlal, yol bulgusu teslime ait değil. Sınır denetimi `[yol]` bulguları: modül dışında değişen dosyalar (oturum `disari.ts`, `sorgular.ts`, testleri; `paylasilan`
   toplayıcıları ve ayar modeli; `kurulum/yetki-matrisi.md`, `araclar/yetki-matrisi.test.ts`; kisiler `kurallar.ts` ve testi;
   Sistem Ayarları metin satırı; `eslint.config.js`). Hepsi ayrı commit'te, görev gereği.
8. Koruma maddelerinde zaman değeri ham ISO metniyle görünür (bugünkü "tarama" maddesi gibi); biçim ortak zaman biçimleyiciyle gelir (CEKIRDEK-ISTEKLERI 3).
9. Sertifika bitişi yalnız arayüz kapısının kendi sertifikasından okunur; ters vekil kurulursa (askıda) madde onun sertifikasını göstermez.
