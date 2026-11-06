# UYUM BORCU: profil

## Bağlamada kapanacak
1. Rol x işlem: kapandı. `profil.geri-bildirim-oku` müdür ve İK rollerine verildi (kullanıcı kararı 14.10.2026).
2. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): uç `oturum/uclar.ts` `/hesabim/pin-degistir` (`kendiPininiDegistir`), ekran `Profil.tsx` "PIN'imi değiştir", test `oturum/hesabim-pin.test.ts`. Kendi PIN'ini değiştirme: oturum modülünde uç yok; çekirdek isteği (`CEKIRDEK-ISTEKLERI.md`). Profil şimdilik "yöneticiniz verir" der.
3. Arkon Operatör Özetim bağlantısı: Özetim'in kendi adresi yok; Üretim Terminali'nin (`/uretim-terminali`, `sayfa.uretim-terminali`) içinde bir görünümdür ve Arkon rolü operatör ya da amir olan kişide açılışta seçilidir (DOĞRULANDI: `arkon/web/src/app/operator.ts:45` `ozetimGorunur() ? 'ozet'`, `ozetim.ts:15`). KAPANDI (karar 161 a): Profilim'de "Ek mesailerim" kartına `sayfa.uretim-terminali` olan kişiye "Özetim" bağlantısı eklendi (`/uretim-terminali`).

## Sonra
4. KAPANDI (kart 2192): durum, yanıt, iç not, kategori, sorumlu ve toplama Geri Bildirim Merkezi'nde (`/geri-bildirim`) ayrı tablolarla geldi; çalışanın yazdığı satır değişmez. Bildirimler: yeni kayıt merkezi okuyanlara (uygulama konulu ayrı türle), yanıt ve sonuç yazana gider (GBM-8, GBM-9).
5. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kişi iletişim bilgisinin sahibi İK/kisiler, iş gerektirmez. İletişim bilgisi profilde değil İK İşlemlerim'de güncellenir (İK'nın ucu ve sürümüyle); profil bağlantı verir.
6. KAPANDI (2192-4 b): Profilim her rolün menü sayfasıdır (`sayfa.profil`). Sonradan açılan rolde `sayfa.profil` kendiliğinden verilmez (kart 2194).
