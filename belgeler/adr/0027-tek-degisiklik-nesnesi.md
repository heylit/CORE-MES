# ADR 0027 — Ürün tanımı tek değişiklik nesnesiyle yürürlüğe girer; revizyon sahibi modülde kalır

Durum: öneri (kart 1640, tasarım 1606; kullanıcı kararı 01.11.2026: 1640 teyit). Dayandığı kararlar: 1607 a, 1608 a, 1609 a teyit
(983 b'yi değiştirir), 1610 a, 1611 a, 1622 a. İlgili: ADR 0006, ADR 0022, ADR 0026, ADR 0028.

## Bağlam

- Ürün tanımı birden çok modüle dağılmıştır: teknik resim ve 3B model belge sahibinde (ADR 0026), rota ve reçete `rota`'da (reçete rota adımının
  bileşenidir, `rota_bileseni`), işlem şartnamesi `rota`'da, kontrol planı `kalite-merkezi`'nde, NC programı `cnc-kurulum`'da,
  markalama tanımı `markalama`'dadır. Her biri kendi revizyonunu kendi kuralıyla yürürlüğe alır.
- Parçanın revizyonu üç yerde ayrı tutulur ve birbirine bağlı değildir: malzeme kartındaki metin (`malzemeler/sorgular.ts`
  `KatalogResimSatiri`), çizim revizyonu (`cizimler_revizyon.sira`, `antet_rev`), rota revizyonu (`rota_revizyonu.harf`). Bir seri ya da lotun
  hangi tanımla yapıldığını söyleyen kayıt yoktur.
- `degisiklik-yonetimi` talep, emir, geçerlilik, karar ve ilk parça akışını taşır; etkilenen öğe olarak yalnız çizim ve rota revizyonunu
  kimlikle tutar (`degisiklik_yonetimi_emir_kalemi`) ve sahibi modüllerin yürürlüğe almasını denetlemez.
- Emir rota revizyonunu ve patlatmayı donmuş tutar (ADR 0022); plan ise açık emri yürürlükteki rotayla dizer (karar 983 b).
- Stok partisi ve sipariş satırı revizyon taşımaz; eski revizyonlu stok ve yoldaki malzeme bulunamaz.
- Hedef çerçeve ISO 9001 değişiklik maddeleri ve ISO 10007 rehberidir (1611 a); PPAP ve AS9102 alanları isteğe bağlıdır.

## Seçenekler

- **a) Değişiklik nesnesi `degisiklik-yonetimi`'nde, revizyon sahibi modülde:** var olan tablolar ve sahiplik korunur; ortak arayüz gerekir.
- **b) Yeni konfigürasyon modülü bütün revizyonları sahiplenir:** tek yer; dolu tablolar taşınır, çok modülün `disari.ts` çağrısı değişir.
- **c) Her modül kendi onayıyla sürer, yalnız rapor eklenir:** iş en az; baseline ve as-built kurulamaz.

## Karar

1. **Tek kapı (1607 a).** Ürün tanımına giren öğe türleri `cizim`, `model-3b`, `rota` (reçete dahil), `islem-sartnamesi`, `kontrol-plani`,
   `nc-programi`, `markalama-tanimi` yalnız değişiklik emri (ECO) yayınıyla yürürlüğe girer. Sahibi modülün kendi yürürlüğe alma ucu bu
   türlerde reddeder (izinli ve reddedilen test). Yalnız süre ya da tezgah tercihi değişikliği planlama parametresidir, kapsam dışıdır
   (`degisiklik-yonetimi/kurallar.ts` `talepGerekmezMi`). Değiştirilebilirliği bozmayan belge düzeltmesi "hızlı yol" sınıfıyla geçer:
   CCB ve müşteri onayı yoktur, tek onaycı vardır, emir numarası ve imzalı geçmiş yine yazılır.
2. **Revizyon sahibinde, kapı ortak.** Her revizyonlu modül `disari.ts`'inde aynı arayüzü verir: revizyon özeti (tür, nesne, etiket, durum,
   yürürlük günü, içerik özeti), `revizyonuYururlugeAl(db, kullanici, revizyonId, { kaynak: 'degisiklik-yonetimi', kayitId, yururlukGunu })`
   ve yürürlüğe girdi / eskidi haberi. Tip `paylasilan/sozlesme` altında tek dosyadadır ve ADR 0026'nın belge kapısıyla aynıdır. Ters haber
   yalnız `sunucu/kablolama.ts`'te bağlanır (ADR 0006). Bir emirdeki bütün öğeler tek transaction'da yürürlüğe girer; biri reddederse hiçbiri girmez.
3. **Parça revizyonu (1608 a).** Parça revizyonu tasarım otoritesinin revizyonudur (`TASARIM_OTORITELERI`): müşteri parçasında müşteri
   çiziminin antet revizyonu, iç tasarımda konfigürasyonun harfi. Proses öğesi (rota, şartname, kontrol planı, NC, markalama) değişince
   parça revizyonu değişmez, proses sürümü artar. Malzeme kartındaki revizyon metni konfigürasyondan dolar, elle yazılmaz.
4. **Konfigürasyon (baseline).** `degisiklik-yonetimi` malzeme başına konfigürasyon kaydı tutar: parça revizyonu, proses sürümü, yürürlük,
   onu getiren emir ve öğe satırları (tür, sahip modül, revizyon kimliği). ECO yayınında yeni kayıt yazılır, öncekisi eskir; tablolar yalnız
   eklenir. Geçişte yürürlükteki revizyonlar ilk konfigürasyon olur, geriye dönük onay aranmaz.
5. **Emir kendi tanımıyla yapılır (1609 a teyit; 983 b'yi değiştirir).** Emir açılırken konfigürasyondaki bütün öğe revizyonları emre
   sabitlenir (rota ve patlatma ADR 0022 ile zaten). Açık emir sabitlendiği revizyonla planlanır ve yapılır; yeni revizyona geçiş yalnız
   ECO kararıyla olur (`kalanlari_gecir`, `yeniden_olustur`). Terminal emrin revizyonunu gösterir, daha yenisi varsa uyarır.
6. **Stok ve yoldaki revizyon (1610 a).** Stok partisi, satın alma ve fason sipariş satırı revizyon taşır (boş olabilen sütun); üretimden
   gelen partide emrin sabit revizyonundan, satın almada sipariş satırından dolar. ECO yayınında etkilenen parti ve açık satır karar satırı
   olur; karar sahibi modülün ucuyla uygulanır. Karar kodlarına tedarikçiye iade ve stok bitince kullan, geçerlilik türlerine emir ve stok
   bitince eklenir.
7. **As-built türetilir.** Seri ya da lotun yapıldığı tanım saklanmaz; emre sabitlenen revizyonlar, tüketilen partiler, kararlar, sapmalar
   ve ilk parça kaydından okunur.

## Sonuçlar

- `rota`'nın ve belge sahibinin (ADR 0026) kendi yürürlüğe alma akışı kapsamdaki türlerde kapanır; kullanıcı akışı değişir.
- Plan motoru girdisi sahibi tablolardan kurulur (ADR 0028); açık emirde adım ve süre emrin iş emirlerinden okunur (madde 5).
- Plan motoru girdisi emrin sabit kopyasına geçer; 983 b'ye dayanan uyarı ve test değişir.
- `cnc-kurulum`'a NC programı revizyon tablosu gerekir (ADR 0023 ile uyumlu: program tezgaha gitmez).
- Etki analizi çok modülün `disari.ts` okumasına bağlanır; akış akış yapılır, kabul kullanıcı deneyince.
- `degisiklik-yonetimi` kapanış koşullarında "bilinmiyor" kaynak bağlanınca kalkar; kapalı döngü kapanışı durdurabilir.

## Vazgeçilenler

- b) Yeni konfigürasyon modülü: dolu tabloların taşınması ve sahiplik değişikliği; 1121 a (revizyon sahibi modülde) ile çelişir.
- c) Yalnız rapor: tek kapı olmadan baseline ve as-built izi kurulamaz (1607 a).
- Parça revizyonunu her proses değişikliğinde artırmak (1608 b): müşteri çiziminin revizyonundan ayrışır.

## Doğrulanmadı

- `degisiklik-yonetimi` tablolarının canlıda boş olduğu; doluysa etkilenen öğe tablosuna geçiş ayrıca sorulur.
- 988 a (emir fasonu yürürlükteki rota sırasıyla) madde 5 ile birlikte değişmelidir; etkisi denenmedi.
- Standart maddeleri bilgiden yazıldı, standart metniyle karşılaştırılmadı.
