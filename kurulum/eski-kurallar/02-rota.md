# Rota ve reçete

Kural kodu: ROTA. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| ROTA-01 | Parça rotası bir şablondur; emir açılınca emrin kendi adım listesine kopyalanır ve ondan sonra iki liste ayrı yaşar. | Tanım | onay bekliyor | |
| ROTA-02 | Rotayı değiştirmek açık emirleri kendiliğinden değiştirmez; planlamacı "rotayı emirlere uygula" işlemini ayrıca çalıştırır. | Akış | onay bekliyor | |
| ROTA-03 | Rota satırı şunları taşır: sıra, operasyon numarası, operasyon tipi, tezgah ya da aday tezgahlar, ayar süresi, birim süre, ölçülmüş süre, bağımlılık ve devir adedi. | Tanım | onay bekliyor | |
| ROTA-04 | Operasyon tipi zorunludur; tipsiz operasyon üretim adımı sayılıp yanlışlıkla çizelgeye sızar. | Değişmez | onay bekliyor | |
| ROTA-05 | Operasyon tipleri: depo girişi, üretim, muayene, tesviye, markalama, özel proses, yüzey işlem, sevk. | Tanım | onay bekliyor | Liste yeni sistemde değişebilir. |
| ROTA-06 | Parça tipi mamulse sistem şablonundan standart rota otomatik kurulur; yarı mamul, hammadde ve sarf malzemesine rota kurulmaz. | Akış | onay bekliyor | |
| ROTA-07 | Eski standart rota: depo girişi, tornalama, muayene, frezeleme, muayene, tesviye, muayene, markalama, özel proses, son muayene, sevk. | Açık soru | onay bekliyor | Yeni sistemde standart rota aynı mı, hangi adımlar kalsın? |
| ROTA-08 | Bağımlılık üç türlüdür: bağımsız (paralel), bekleyen (öncül tamamen bitmeden başlamaz) ve akışlı (öncül üretirken başlar). | Tanım | onay bekliyor | |
| ROTA-09 | Akışlı adım, öncülün teslim ettiği sağlam adedden fazlasını işleyemez. | Değişmez | onay bekliyor | Devir adedi: kaç parça birikince devir olur. |
| ROTA-10 | Etkin süre, ölçülmüş süre varsa odur, yoksa teorik (CAM) süredir. | Hesap | onay bekliyor | |
| ROTA-11 | Aynı rotada aynı operasyon numarası iki kez kullanılamaz. | Değişmez | onay bekliyor | |
| ROTA-12 | Adım çoğaltılınca yeni numarayı sistem verir (en yüksek numara artı on, dolu numara atlanır); kullanıcı ya da ekran numara uydurmaz. | Akış | onay bekliyor | |
| ROTA-13 | Operasyon numarası değişince etkilenecek emirler listelenir; planlı adım seçili gelir, üretimdeki adım uyarılı seçilebilir, biten ve iptal adım seçilemez. | Akış | onay bekliyor | Seçilmeyen emirde reçete çapası ile adım numarası ayrışır. |
| ROTA-14 | Rotayı emirlere uygulamanın iki kipi vardı: birleştir (operasyon numarasıyla eşleştirir, üretimi korur) ve baştan kur (hedefi silip yeniden yazar, üretim ve form alanlarını kaybettirir). | Açık soru | onay bekliyor | Yeni sistemde yalnız güvenli kip mi olsun? |
| ROTA-15 | Reçete satırı bileşen, bir adet için miktar, çekileceği depo ve isteğe bağlı "hangi operasyonda tükenir" bilgisini taşır. | Tanım | onay bekliyor | |
| ROTA-16 | Üretim girilince reçete bileşeni, bağlı olduğu operasyonda depodan otomatik düşer. | Hesap | onay bekliyor | Çift sayım korumaları için bkz. stok dosyası. |
| ROTA-17 | Rota ve reçetenin tek düzenleme yeri vardır; parça kartı ve CAM gibi ekranlar salt okurdur. | Değişmez | onay bekliyor | Üç editörün aynı veriye farklı kural uygulaması ölçülmüştü. |
| ROTA-18 | Operasyon talimat metni rotada tutulur; iş emri formu ve terminal aynı metni okur. | Tanım | onay bekliyor | |
| ROTA-19 | Talimat yazma yetkisi rota değiştirme yetkisinden ayrıdır. | Değişmez | onay bekliyor | Aksi halde talimat yazan üretim rotasını da değiştirebilirdi. |
| ROTA-20 | Çok seviyeli ürün ağacı, çarpanlı karşılama ve döngü tespiti eski sistemde vardı ama reçete sahada hiç doldurulmadı. | Açık soru | onay bekliyor | Yeni sistemin ilk kapsamında reçete var mı, düz liste mi çok seviyeli ağaç mı? |
