# Arkon, Akış A: üretim emirleri modelini beklemeyen borçlar (BO1 a, liste; yazım "yaz" onayıyla)

Kaynak: `/mnt/project-files/bagla/HAZIRLIK.md` Akış A (A7-A12), `sunucu/moduller/arkon/UYUM-BORCU.md` (main). Kart: #199 (oturtma) ya da belirtilen.

| No | Madde | Neden beklemiyor | Kart / dal | Göç |
|---|---|---|---|---|
| AA1 | Kilit bekleme bütçesi: emir başına 2 sn, istek başına toplam sınırsız -> istek başına üst sınır (A11) | Yalnız Arkon `servis.ts`; emir modeline dokunmaz | #199 / `199-arkon-a11-kilit` | Yok |
| AA2 | `korumaliIsle` ve `geciciHataMi` için doğrudan test; P0001 kullanan "geçici hata" testleri sınıflamayı ölçecek biçime (A11) | Yalnız test | #199 / aynı dal | Yok |
| AA3 | Ölü `yeniEmirler` durumu kaldırılır (A11) | Yalnız Arkon kodu | #199 / aynı dal | Yok |
| AA4 | `arkon_tmi_yansima` `sonuc <> 'yazildi'` süzgecine kısmi dizin (A11) | Arkon tablosu | #199 / `199-arkon-a11-dizin` | VAR (dizin ekler; veri değişmez) |
| AA5 | Y8: tablet `audit` kaydını göndermez (her paket değişikliğinde 400) | Yalnız Arkon ekranı (`arkon/web`) | #199 / `199-arkon-y8` | Yok |
| AA6 | Y3: açılışta yinelenen "Duruş nedeni yok" ve "Yalnız çalışan iş duraklatılır" satırları gürültü olarak gizlenir ya da hiç üretilmez | Arkon yansıma listesi | #243 / `243-arkon-y3` | Yok |
| AA7 | A8 tesis kodları (iş merkezi, istasyon, makine) metin -> istasyonlar kimliği; `istasyonlar/disari.ts` hazır | Sahibi istasyonlar, fonksiyonlar VAR | #199 / `199-arkon-a8` | VAR (dolu JSONB `kv/plant`, `arkon_kayit.makine` dönüşümü; onay gerekir) |
| AA8 | Y4: Arkon'un kendi duruş/hurda kodları (D-01.., H-01..) seçimden kalkar, yalnız TMI nedenleri (durus-nedenleri sahibi, SH karar tablosu) | durus-nedenleri `disari.ts` VAR | #199 / `199-arkon-y4` | Yok (eski kayıttaki kodlar kalır) |

Bekleyen, bu listede değil:
- A9 `gauges` -> kalibrasyon: kalibrasyon modülünün taşıma ucunu bekler; dolu veri taşınır (göç).
- A10 dosya (#302): ortak dosya deposunu bekler; dolu veri (göç).
- A12 / Y7 `sayfa.arkon` ve rol başına menü: TMI rol matrisini (#223) bekler.
- B-006 RED'de durdurma: AK1 c, borçta.

Üretim emirlerine düşenler (yalnız istek, BASKA-MODUL-ISTEKLERI uretim-emirleri 1-6; SH3 a ile is emrine): A7 bağ `tmi-ue-<id>` -> is emri ve `emir_id` FK; is emri düzeyinde `acikEmirler`, `emirOzeti`, komutlar; `EmirOzeti.calisma`; hurda eksi düzeltme, `olayZamani`, toplu `emirDurumlari`, `emirAdlari`.
