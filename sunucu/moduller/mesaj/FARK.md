# mesaj: fark

Depoda karşılığı olmayan yeni modül; silinen ya da değişen dosya yok. Teslim tabanı: `main` 708190c; oturtma tabanı `main` 5daeb55 (kart #743).

## Eklenen
- `sunucu/gocler/20261012140811_mesaj_belge_deposu.sql`: `mesaj_belge` (belge deposu), `mesaj_ek` (ekler), `mesaj_surum` sayacı.
- `sunucu/moduller/mesaj/`: `uclar.ts`, `servis.ts`, `sorgular.ts`, `kurallar.ts`, `disari.ts`, testler, `UYUM-BORCU.md`.
- `paylasilan/sozlesme/mesaj.ts`, `paylasilan/islemler/mesaj.ts`, `paylasilan/sayfalar/mesaj.ts`.
- `istemci/src/moduller/mesaj/`: `MesajCercevesi.tsx`, `cerceve-kopru.ts`, `kopru.ts`, `yazi-tipleri.ts`, `rotalar.tsx`, `mesaj.css`, testler.
- `istemci/src/moduller/mesaj/cerceve/mesaj.html`: prototip, bayt bayt aynı (sha256 `efaf4915a55cdbaec7bf5fa906edbcc761fc862875fb9e986e4819fe91de5de6`).
- `istemci/src/moduller/mesaj/cerceve/yazi/`: prototipin yazı tipleri (SIL OFL 1.1, lisansları yanında).

## Prototipe göre
Prototip dosyası değişmedi. Açılışta yalnız şunlar eklenir: içerik politikası, gömülü yazı tipi stili ve köprü betiği; Google
yazı tipi bağlantıları çıkarılır (dış servis yok). Köprü `navigator.storage.persist` isteğini "kalıcı" diye karşılar (opak kökende
tarayıcı reddeder; veri zaten sunucuda kalıcıdır). Görünüm, yerleşim ve kullanım aynıdır.

## Oturtmada değişenler (kart #743, kullanıcı kararları 12.10.2026)
- Ad: teslimdeki `mesai-alani` modülü `mesaj` adıyla oturtuldu (karar 5, "zaten mesaj olmalı"): klasörler, tablolar (`mesaj_belge`, `mesaj_ek`,
  `mesaj_surum`), kısıtlar, uçlar (`/mesaj/...`), işlemler (`mesaj.oku/yaz/yonet`, `sayfa.mesaj`), sayfa başlığı "Mesaj". Böylece vardiyanın
  "Günlük Mesai" (`/mesai`) sayfasıyla karışmaz. Prototipin kendi metni ve yerel depo öneki (`mesai:`) değişmedi.
- Göç yeniden damgalandı: `20261012073100` -> `20261012140811` (main'in son göçünden sonra).
- `xlsx` paketi eklenmedi (karar 2, "hayır"): `ek-betikler.ts` çıkarıldı, çerçeveye kütüphane gömülmez. Prototip `.xlsx` dosyasını dış adresten
  yüklemeye çalışır, içerik politikası kapatır ve prototip "Dosya okunamadı. CSV olarak kaydedip tekrar dene." uyarısını gösterir. CSV dosyası ve
  Excel'den kopyala-yapıştır ile içe aktarım çalışır.
- Rol satırları bu çekme isteğinde yok: çekirdek isteği olarak iletildi (CEKIRDEK-ISTEKLERI 5). Rol satırı gelene kadar Mesaj yalnız yöneticide açılır.

## Değişen onaylı karar
Yok.
