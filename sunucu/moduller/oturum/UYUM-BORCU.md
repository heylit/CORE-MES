# oturum: uyum borcu (kart #259, Aşama 1 tur 2)

Durum `9b6582f` üstünde okundu. Her madde: kural / istisna / nerede / nasıl uyumlanır.

## Kullanımı tutan

Yok.

## Kullanımı etkileyen

Yok.

## Sonra

1. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): K1 a kararıyla kalıcı istisna, iş gerektirmez. Tablo adı öneki (K1 a: istisna, yeniden adlandırma yok). Kural: tablo adı modül adıyla başlar. İstisna: `giris_denemesi`
   (`oturum` tablosunun adı modülün adıdır, uyumlu sayılır). Nerede: `20261005120100_oturum.sql`. Kalıcı istisna.
2. Adsız kısıt. Kural: kısıtlar adlandırılır. İstisna: `oturum.anahtar_ozeti` UNIQUE (adı PostgreSQL verir). Nerede:
   `20261005120100_oturum.sql`. Nasıl: yeniden adlandırma göçü (veri değişmez); acele yok.
3. Kullanılmayan şema değeri. `giris_denemesi_sonuc_gecerli` üçüncü değeri (`beklemede`) taşıyor, kod yazmıyor (NOTLAR, kullanıcı kararı
   06.10.2026). Kaldırmak şema kararıdır; bekler.
4. KAPANDI (borç değerlendirmesi 17.10.2026): çıkışın ret durumu testli (`oturum.test.ts` "çıkış başkasının oturumunu kapatamaz"). Eski metin: Belgeler: `KURAL-TEST.md` yazıldı (N9). Testi olmayan kural: çıkışın ret durumu (`POST /oturum/cikis` kimlik istemez;
   başkasının oturumunu kapatmak onun anahtarını ister). Nasıl: Aşama 2'de ret testi gerekip gerekmediği kararlaşır.

5. Hesap kilidi (14.10.2026), bağlamada kapanacak:
   - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kilit Güvenlik Merkezi alarmı açar (`guvenlik/kurallar.ts` "Hesap kilitlendi"; test `guvenlik.test.ts` "hesap kilidi: her yeni kilit orta önemli alarm açar"). Yöneticiye bildirim yok. Kodda yöneticiye bir şey ulaştıran var olan yol bulunamadı: "Ne oldu?" paneli yalnız gezinmedir,
     `mesaj` kendi deposunu tutar ve dışarı yazma açmaz, denetim kaydı yalnız başarılı komutu yazar. Kilit bugün tabloda
     (`oturum_hesap_kilidi`) ve sunucu günlüğünde (uyarı satırı) görünür, `GET /oturum/kilitler` ile okunur.
     Nasıl: ortak bildirim yolu gelince kilitlenme olayı ona bağlanır.
   - KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): kilit listesi ve açma Güvenlik Merkezi ekranında (`istemci/src/moduller/guvenlik/Takip.tsx` `/guvenlik/kilitler`, `.../ac`). Ekran yok: kilit listesi ve açma yalnız uçta. Nasıl: ayrı güvenlik sayfası (tasarımda) bu iki ucu kullanır;
     ara çözüm olarak kişiler ekranına "kilidi aç" eylemi eklenmedi.
   - Yetki `kisiler.rol-yonet` başka modülün işlemidir (yeni işlem açılmadı). Nasıl: ortak yetki matrisinde güvenlik işlemi kararlaşırsa ona geçer.
     Karar (kullanıcı, proje sohbeti 17.10.2026 18:53: 'Hesap kilidinin yalnız guvenlik.yonet yetkisiyle açılmasını onaylıyorum.'): kilit yalnız guvenlik.yonet ile açılır; oturum ucu kalkar ya da aynı işleme geçer; modüller bağlanırken yazılır.

## İkinci menü

Gerekmez: modülün ana menüde sayfası yok; giriş ekranı (`istemci/src/moduller/oturum/Giris.tsx`) oturumsuzken `istemci/src/App.tsx` tarafından çizilir.
Kendi parola değişikliği kabuktadır (`istemci/src/ortak/arayuz/Kabuk.tsx`, `ParolaPenceresi`).
