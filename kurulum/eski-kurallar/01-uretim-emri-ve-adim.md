# Üretim emri ve iş emri adımı

Kural kodu: UE. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| UE-01 | Üretim emri, bir parçadan belirli adet üretme emridir; iş emri o emrin tek bir operasyon adımıdır. | Tanım | onay bekliyor | Sıra: proje, üretim emri, iş emri (adım). |
| UE-02 | Tezgah başında "iş" denen şey emrin tamamı değil adımdır. | Tanım | onay bekliyor | |
| UE-03 | Emir dört çeşittir: iç üretim, dış (fason), boya ve ikisi birden. | Tanım | onay bekliyor | Dış ve boya ilk kapsamda yoksa çeşit sayısı daralır. |
| UE-04 | Emir açılırken parçadan müşteri, proje ve güncel revizyon devralınır, parçanın rotası emrin kendi adım listesine kopyalanır. | Akış | onay bekliyor | |
| UE-05 | Emrin revizyonu açılış anında dondurulur; parça sonradan revize olsa da emir ve basılı formu eski revizyonda kalır. | Değişmez | onay bekliyor | Denetim kanıtıdır. |
| UE-06 | Emir numarası ayarlanan kurala göre otomatik üretilir ve silinen emrin numarası boşa çıkmaz. | Akış | onay bekliyor | |
| UE-07 | Kontrollü planlama açıksa yeni emir plana kendiliğinden girmez, planlamacı onaylayınca girer. | Akış | onay bekliyor | Çizelgede görünmemesi hata değildir. |
| UE-08 | Üretim yapılmış adım asla kaybolmaz; rotada karşılığı kalmayan adım ancak hiç dokunulmamışsa silinir. | Değişmez | onay bekliyor | Dokunulmamış: üretim yok, tezgah yok, otomatik atama yok, form alanı boş. |
| UE-09 | Emrin teknik durumu dört değerlidir (planlı, başladı, bitti, iptal); kullanıcının gördüğü aşama daha geniştir ve ikisi birlikte yazılır. | Tanım | onay bekliyor | Aşamalar: planlandı, malzeme bekliyor, üretimde, muayenede, sevke hazır, tamamlandı, iptal. |
| UE-10 | Son üretim adımı adede ulaşınca emir "sevke hazır" olur; "tamamlandı" yalnız sevk akışından ya da elle verilir. | Değişmez | onay bekliyor | |
| UE-11 | Kullanıcının bilerek verdiği aşama otomatik ezilmez ve iptal asla otomatik değişmez. | Değişmez | onay bekliyor | |
| UE-12 | Emir silinince satır silinmez, arşive taşınır ve geri yüklenebilir; kalıcı silme yalnız yöneticidedir. | Akış | onay bekliyor | |
| UE-13 | Kullanımdaki kayıt silinemez (üretimi olan parça, hareketi olan lokasyon vb.); proje silinince bağlı parça ve emirler silinmez, yalnız proje bağı boşalır. | Değişmez | onay bekliyor | |
| UE-14 | Biten parça adedi, emrin son üretim adımının gerçekleşen toplamıdır; ilk operasyondan çıkan adet biten sayılmaz. | Hesap | onay bekliyor | Bütün ilerleme ve proje yüzdeleri bu tanımdan beslenir. |
| UE-15 | Son üretim adımı, plana dahil adımlar arasında en yüksek sıradaki adımdır; hiç yoksa (özel emir) bütün adımlar arasındaki en yüksektir. | Hesap | onay bekliyor | Son adım genelde sevk olur ve oraya üretim girilmez. |
| UE-16 | Fazla üretim engellenmez. | Sınır | onay bekliyor | Hedef üstü adet açıkça yazılır. |
| UE-17 | Adım ekleme, silme ve yeniden sıralama tek bütün işlemdir; yarıda kalıp sıra numaralarını boşluklu bırakmaz. | Akış | onay bekliyor | |
| UE-18 | Parçanın proje aidiyeti varsayılandır, emirde değiştirilebilir; emir bilerek projesiz de olabilir. | Tanım | onay bekliyor | |
| UE-19 | Eski sistemde "plana dahil" işareti tek başına adımın zaman tuttuğunu söylüyordu. | Açık soru | onay bekliyor | Yeni sistemde süre tutma ayrı bir özellik mi olsun? |
| UE-20 | Aynı işaret adımın adet üreten bir üretim adımı olduğunu da söylüyordu (ilerleme ve son adım buna dayanır). | Açık soru | onay bekliyor | Yeni sistemde "üretim adımı" ayrı bir özellik mi olsun? Beyaz liste mi kara liste mi? |
| UE-21 | Aynı işaret adımın tezgah kapasitesi tükettiğini ve uyarı kapsamına girdiğini de söylüyordu. | Açık soru | onay bekliyor | Kapasite tüketme ile uyarı kapsamı ayrı mı olsun? Üçünü tek işarette toplamak eski sistemde ilerleme yüzdesini bozdu. |
| UE-22 | Eski sistemde hiçbir emirde ve projede termin girilmemişti. | Açık soru | onay bekliyor | Termin emirde zorunlu mu olsun? Terminsiz emir plana girsin mi? |
| UE-23 | Parti modeli: emir açılırken birden çok parti istenirse parti emirleri çocuk emir olarak akar, sonradan bölme ise ayrı çalışır. | Açık soru | onay bekliyor | Yeni sistemde parti/şemsiye emir ilk kapsamda mı? Eski emirler taşınmayacak. |
