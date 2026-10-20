# Ön paket: Müşteriler ve Tedarikçiler (tur 2)

## Kararlar (karar kartı #1164; aşağıdaki öneri metnini geçersiz kılar)
- S1: modül adı `musteri-tedarikci` (öneri `firmalar` değil); sayfa `/musteri-tedarikci`, işlemler `musteri-tedarikci.oku/yaz`, `sayfa.musteri-tedarikci`.
- S2: dolu tablo şimdi yeniden adlandırılır (`finans_firma` -> `musteri_tedarikci_firma`); bağlı modüller aynı anda değişir, geçiş katmanı yok. Birleşmeden önce sayım onayı.
- S3: fason işareti kartta kalır.
- S4: koordinat şimdi kartta; sevkiyat koordinatı bir kez kopyalanır.
- S5: çok adres (fatura, teslim, şube), her biri kendi koordinatıyla (öneri tek adresti).
- S6: aynı beş rol aynı hakla; beşi sayfayı görür.
- CLAUDE.md firma satırı güncellenir (ayrı commit).

Kök istek (kullanıcı, 2026-10-13 21:07): "ana sayfada müşteriler ve tedarikçiler sayfası ekleyelim, finans, satın alma ve tedarik buradan alacak, adres ve koordinat".
Tur 1 cevabı (kullanıcı, 21:21): "hayır ayrı bir sayfa açalım ana menüde, sevkiyat, finans, satın alma hepsi buradan beslensin".
Sonuç: firma kaydı finanstan çıkar, kendi modülüne geçer. Bu, proje talimatındaki "firma: finans_firma.id (finans); ayri firmalar modulu yok" sabit kimliğini değiştirir.
Taranan depo: heylit/TMICOREV2 `main` 2ce160c5. Kod yazılmadı, dal açılmadı.

## Önerilen biçim (sorulardaki önerilerle)
- Yeni modül `firmalar`; ana menüde tek sayfa "Müşteriler ve Tedarikçiler" (`/firmalar`, `sayfa.firmalar`), grup Satın Alma ya da Yönetim (varsayım: Yönetim). İkinci menü: Tümü, Müşteriler, Tedarikçiler, Fason.
- Tablo yerinde kalır, sahipliği devredilir: `finans_firma` satırlarına, kimliklerine ve 8 göçteki yabancı anahtarlara dokunulmaz; tabloyu okuyan ve yazan SQL finans'tan `sunucu/moduller/firmalar/sorgular.ts`'e taşınır.
- Firma kartına koordinat (enlem, boylam) eklenir; sevkiyattaki firmaya bağlı noktaların koordinatı bir kez karta kopyalanır.
- Finans, satın alma, sevkiyat, stok, projeler, rota, üretim emirleri, Logo firmayı `firmalar/disari.ts`'ten alır. Aşama 1'de kırılma olmasın diye `finans/disari.ts` aynı fonksiyonları `firmalar`'dan yeniden verir (geçiş); çağıranlar Aşama 2'de doğrudan `firmalar`'a döner.

## Çakışma taraması (kural 10)
### Başka modülde olan (oradan okunur)
| Kavram | Sahibi | Kanıt |
|---|---|---|
| Tedarikçi durumu, puanı, kategorisi, değerlendirmesi | satın alma `satin_alma_tedarikci*` (`firma_id` yabancı anahtar) | DOĞRULANDI: göç 20261009021000 |
| Sevkiyat noktası (durak süresi, rota, araç) | sevkiyat `sevkiyat_noktasi` | DOĞRULANDI: göç 20261011200500, 20261012144300 |
| Firmanın belgeleri, ödeme planı, çek, vade takibi | finans (`finans_belge` vb., `firma_id`) | DOĞRULANDI: göç 20261008132300, 20261013185000 |
| Kişi (firma yetkilisi değil, TMI kullanıcısı) | kisiler | ORTAKLIK-kisiler.md |
### Yalnız bu modülde olacak (sahibi `firmalar`)
- Firma kimliği, kod, ad, tür (musteri / tedarikci / ikisi), fason işareti, ülke, vergi no ve dairesi, varsayılan para birimi, vade günü, adres, ilçe, il, posta kodu, telefon, e-posta, aktiflik, Logo cari kodu ve gönderim durumu (bugünkü `finans_firma` sütunlarının hepsi; DOĞRULANDI: göç 20261008132200).
- Yeni: enlem, boylam.
- İşlemler: `firmalar.oku`, `firmalar.yaz`, `sayfa.firmalar` (bugünkü `finans.firma-oku`, `finans.firma-yaz` yerine).
### Belirsiz
Aşağıdaki S1-S6.

## Sorular (en çok 6)

S1. Modülün adı?
- a) `firmalar` (öneri; sabit kimlikteki "firma" sözcüğüyle aynı, kısa)
- b) `cariler`
- c) `musteri-tedarikci`
Sayfa başlığı her durumda "Müşteriler ve Tedarikçiler".

S2. Dolu `finans_firma` tablosu ne olsun?
Neden: 8 göçte yabancı anahtar var; satın alma, sevkiyat ve üretim emirlerinin 5 test dosyası tabloya adıyla yazıyor (DOĞRULANDI: `grep finans_firma sunucu/moduller`). Adı değişirse onların klasörüne dokunmadan testleri kırılır.
- a) Yerinde kalır, sahiplik `firmalar`'a geçer; adı Aşama 2'de bağlı modüller güncellenince `firmalar_firma` olur (öneri; veri ve kimlik değişmez, bugün hiçbir modül kırılmaz; ad borcu UYUM-BORCU'ya)
- b) Şimdi `firmalar_firma` diye yeniden adlandırılır, eski adla geçiş görünümü kalır
- c) Yeni tablo açılır, veri kopyalanır, bütün yabancı anahtarlar yeni tabloya taşınır
Öneri: a.

S3. Fason firma işareti nerede kalsın?
- a) Firma kartında, bugünkü `fason` sütunu (öneri; rota ve üretim emirleri fason firmayı zaten bu kimlikle seçiyor)
- b) Ayrı fason listesi (`firmalar_fason`)
Öneri: a.

S4. Koordinat ve sevkiyat
Neden: Bugün koordinat yalnız `sevkiyat_noktasi.enlem/boylam`'da (zorunlu sütun). Kopya göçü dolu iki tabloya dokunur; göçten önce canlıda sayım:
`SELECT (SELECT count(*) FROM finans_firma) AS firma, (SELECT count(*) FROM sevkiyat_noktasi WHERE firma_id IS NOT NULL AND aktif) AS bagli_nokta;`
- a) Firma kartına enlem/boylam eklenir, sevkiyatın firmaya bağlı noktalarının koordinatı bu göçle bir kez karta kopyalanır; sevkiyat sonra koordinatı karttan okur (öneri)
- b) Kart boş başlar, kopya ve okuma Aşama 2'de
- c) Koordinat sevkiyatta kalır, kart yalnız adres tutar
Öneri: a.

S5. Firma başına kaç adres?
- a) Tek adres ve tek koordinat (öneri)
- b) Çok adres: `firmalar_adres` (fatura, teslim, şube; her birinin koordinatı); sevkiyat noktası adrese bağlanır
Öneri: a.

S6. Yetki (rol x işlem)
Neden: `finans.firma-oku` / `finans.firma-yaz` yerine `firmalar.oku` / `firmalar.yaz` gelir, `sayfa.firmalar` eklenir. Bugünkü dağılım (DOĞRULANDI: göç 20261009053000): muhasebe_finans oku+yaz, mudur oku, satin_alma oku+yaz, planlama_proje oku+yaz, depo oku.
- a) Aynı roller aynı haklarla taşınır, beşi de sayfayı görür (öneri)
- b) Sayfayı yalnız yazabilen üç rol görür; depo ve müdür veriyi yalnız başka ekranlardan okur
Öneri: a.

## Onayla birlikte değişecek belgeler (aynı PR)
- `kurulum/proje-talimati.md` satır 36: "firma: finans_firma.id (finans); ayri firmalar modulu yok" -> "firma: finans_firma.id, sahibi firmalar modulu (Musteriler ve Tedarikciler sayfasi); tablo adi Asama 2'de firmalar_firma olur (2026-10-13)". Satır 35: "firma finansin fason isaretli firma kartidir" -> "firma, firmalar modulundeki fason isaretli firma kartidir".
- `kurulum/proje-hedefi.md` satır 9: kapsam listesine "firmalar (Musteriler ve Tedarikciler; firma, adres, koordinat)" eklenir, "finans (firma kaydi dahil)" -> "finans". Satır 36 D akışı: "firma karti (firmalar) -> fatura ...".
- Proje ayarlarındaki talimat ve hedef metni de aynı cümlelerle değişmeli (kullanıcının elle yapması gerekir).
- `CLAUDE.md` satır 49 "Belli olanlar: ... firma finans" -> "firma firmalar". CLAUDE.md değişikliği ayrıca onay ister; PR'da ayrı commit olur.
- `sunucu/moduller/finans/ORTAKLIK-finans.md` firma satırları `ORTAKLIK-firmalar.md`'ye taşınır.

## Varsayımlar (sorulmaz; geri alma maliyeti düşük)
1. Ekran depodaki sayfa düzeniyle React yazılır: liste + ayrıntı paneli, ortak arayüz parçaları, 360/768/1280. Finans çerçevesindeki "Firmalar" maddesi kalkar, yerine yeni sayfaya bağlantı gelir.
2. Uçlar aynı davranışla `/firmalar*` yoluna taşınır (liste, seçim, ayrıntı, ekle, güncelle, pasif); sürüm denetimi, sunucudan zaman ve kişi, silme yok kuralı (FNS-38, 45, 47) aynen kalır, kural önekleri `FRM-` olur. Eski `/finans/firmalar*` uçları Aşama 1'de kalkar; finans çerçevesi yeni uçlara döner.
3. Koordinat sayı olarak ya da harita bağlantısı / "41.0,29.0" yapıştırılarak girilir; harita çizimi bu turda yok (sevkiyatın çevrimdışı haritası sevkiyat modülünde; ortak parça gerekirse çekirdek isteği). Dış servis yok.
4. Satın almanın puan/durumu ve sevkiyat noktası bu sayfada gösterilmez (o modüller `firmalar`'a bağımlı; ters yön döngü kurar). Kendi ekranları firmaya bağlantı verir.
5. Bağımlılık yönü: finans -> firmalar, satın alma -> firmalar, sevkiyat -> firmalar; `firmalar` kimseyi ithal etmez (kisiler hariç: açan/güncelleyen kişi yabancı anahtarı).
6. Sevkiyatın koordinatı karttan okuması sevkiyat klasöründe kod ister; benim yazmam kurala aykırı, BASKA-MODUL-ISTEKLERI.md'ye imzasıyla yazılır ve sevkiyat yazarına gider.
7. Toplayıcılara (`paylasilan/sayfalar.ts`, `paylasilan/islemler.ts`) yalnız `firmalar` satırı ayrı commit; rol x işlem göçü S6 onayıyla.
8. Kart numarası koordinatörden; dal `<kart no>-firmalar`.

## Aşama 2 bağlama sırası (öneri)
1. Sevkiyat: bağlı noktada koordinat ve adı karttan okur, kendi kopyası yalnız bağsız noktada kalır.
2. Satın alma, stok, projeler, rota, üretim emirleri, Logo: ithalleri `finans/disari.ts`'ten `firmalar/disari.ts`'e döner; finanstaki geçiş yeniden verimi kalkar.
3. Finans: kendi firma SQL'i kalmaz, yalnız `firmalar/disari.ts`.
4. Tablo adı `finans_firma` -> `firmalar_firma` (S2 a ise); testlerdeki adlar aynı turda.
5. Metin kopyası tutanlar firmaya bağlanır: portal `parties`, mesaj `customer`, kalite merkezi `sup`, malzemeler `kayit.g.musteri`, satın alma `satin_alma_teklif.tedarikci_adi`.
