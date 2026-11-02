# UYUM BORCU: durus-nedenleri (kart #247, dal 247-tanim-modulleri)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI (kod ya da komut), VARSAYIM, BİLMİYORUM.
Sınıflar: TUTAN (kullanımı tutar), ETKİLEYEN (kullanımı etkiler), SONRA. Kullanıcı kararları 08.10.2026 (kart #247).

## Bu dalda kapananlar
- KAPANDI (TUTAN): okuma uçları oturumla açıktı. `GET /durus-nedenleri`, `GET /hurda-nedenleri` artık `{ biri: ['sayfa.durus-nedenleri', 'sayfa.terminal', 'sayfa.vardiya'] }`
  (ADR 0007; `sayfa.vardiya` planlı duruş ekranı için, 195 a). Testler DN-S4, DN-S5. Arkon ve üretim emirleri `disari.ts` ile okur; o yol uç yetkisinden geçmez (DN-S5 sabitler).
- KAPANDI (TUTAN): ikinci menü yoktu, ekran kendi sekme şeridini çiziyordu. Menü `paylasilan/sayfalar/durus-nedenleri.ts`
  `DURUS_NEDENLERI_IKINCI_MENU`; bölüm adresten (`/durus-nedenleri/hurda`). Toplayıcı satırı ayrı commit'te (kullanıcı kararı T1 a).

## Bağlamada kapanacak
1. KAPANDI (rol matrisi 139): `sayfa.durus-nedenleri` ve `durus-nedenleri.yaz` `mudur` ve `planlama_proje` rollerinde
   (`sunucu/gocler/20261019083500_kisiler_rol_matrisi_139.sql`, `kurulum/yetki-matrisi.md`). Test: DN-S3 rol taraması (yalnız bu iki rol yazar).
   Önceki hâli: hiçbir rolde değildi, modül yalnız bayraklı yöneticideydi (kullanıcı kararı 08.10.2026).
2. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): Arkon nedenleri bu modülden okur (`arkon/servis.ts:20` `durus-nedenleri/disari.ts` ithali, `:179-184` `durusNedenleriniListele`, `hurdaNedenleriniListele`). SONRA. Arkon'un kendi neden listesi (`kv/reasons`, `kv/scraps`, salt okuma; yazımı reddedilir). DOĞRULANDI: `tur1-raporlar/ortaklik-tablosu.md` satır 12.
   Uyum: Aşama 2 sahiplik tablosunda; Arkon nedenleri yalnız bu modülden okur.

## Bağlamada kapanmayacak (kullanıcı kararıyla borçta)
3. KAPANDI (kart #369, kullanıcı kararı CK2 a): sürüm sütunu ve 409. Önceki hâli: sürüm denetimi yok: `POST /durus-nedenleri/:id/guncelle`, `POST /hurda-nedenleri/:id/guncelle` son yazanı kazandırır.
   DOĞRULANDI: tabloda sürüm sütunu yok, gövdede sürüm yok. Uyum: sürüm sütunu (dolu tabloya sütun) ve gövdede sürüm; kullanıcı kararı gerekir.
4. SONRA. Tablo ve kısıt adları modül adıyla başlamıyor: `durus_nedeni`, `hurda_nedeni` (proje talimatı kural 5). Dolu tabloyu değiştirir; kullanıcı kararı gerekir.
5. SONRA. Kararla ertelenenler (NOTLAR.md): DN-02 ölçümü hesap yapan modülde; sıra değiştiren uç yok.
