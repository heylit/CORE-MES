# Üretim terminali

Kural kodu: TER. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| TER-01 | Terminal, tezgah başında işin başlatıldığı, adet ve fire girildiği ve duruşun kaydedildiği tek veri girişi noktasıdır. | Tanım | onay bekliyor | |
| TER-02 | İlerleme, stok, verimlilik ve proje yüzdesi dahil bütün sayılar yalnız buradan girilen veriden türer; veri girilmezse hiçbiri kendiliğinden dolmaz. | Değişmez | onay bekliyor | |
| TER-03 | Operatör tezgah, istasyon ya da atanmamış havuz seçer; istasyonu atanmışsa yalnız kendi istasyonunun tezgahlarını görür. | Akış | onay bekliyor | Seçim o bilgisayarda hatırlanır; kodla gelinen geçici seçim kayıtlıyı ezmez. |
| TER-04 | İş listesi etkin istasyona uyan, açık emre ait ve üretilen adedi hedefin altında olan adımlardan oluşur. | Tanım | onay bekliyor | |
| TER-05 | Başlatmadan önce sırayla denetlenir: adım zaten başlamış mı, emir bekletilmiş ya da bloke mi, sıra kuralı izin veriyor mu, tezgahta başka iş çalışıyor mu. | Akış | onay bekliyor | |
| TER-06 | Operatör başlatmadan önce "malzeme teslim alındı ve kontrol edildi" onayını verir. | Akış | onay bekliyor | |
| TER-07 | Bir tezgahta aynı anda tek iş çalışır; araya girme yalnız açık onayla olur, çalışan iş duraklatılır ve üretimi başlamışsa dönüşte yeniden ayar işaretlenir. | Değişmez | onay bekliyor | Arayüzden atlatılamaz. |
| TER-08 | Üretim girişi bir defterdir: her giriş ayrı satırdır (kim, ne zaman, sağlam, fire, vardiya), üzerine yazılmaz ve gün toplamı satırlardan türetilir. | Değişmez | onay bekliyor | İki kişi aynı güne girse toplanır. |
| TER-09 | Düzeltme negatif girişle yapılır ve kümülatif toplam sıfırın altına inemez. | Değişmez | onay bekliyor | |
| TER-10 | Giriş tarihi gerçek bir takvim günü olmalıdır. | Değişmez | onay bekliyor | |
| TER-11 | Bir adım, öncülünden çıkan sağlam adedi aşamaz. | Değişmez | onay bekliyor | |
| TER-12 | Giriş kaydı tek hamlede şunları yapar: ilk girişte başlangıç, hedefte bitiş damgası; duraklatma ve açık duruşu kapatma; emir aşamasını yeniden hesaplama; reçete bileşenini düşme; son üretim adımıysa mamulü sevk deposuna yazma; planı bayat işaretleme. | Akış | onay bekliyor | |
| TER-13 | Fire kaliteyi düşürür, performansa dahildir ve reçete bileşenini tüketir. | Değişmez | onay bekliyor | Hurdaya çıkan parça malzemeyi kullanmıştır. |
| TER-14 | Kazanılan dakika, (sağlam adet artı fire) çarpı etkin birim dakikadır. | Hesap | onay bekliyor | |
| TER-15 | Verimlilik = kullanılabilirlik × performans × kalite; kullanılabilirlik = çalışma / yüklenen süre, performans = kazanılan dakika / çalışma dakikası, kalite = sağlam / (sağlam + fire). | Hesap | onay bekliyor | Hücre: tezgah, gün, vardiya. |
| TER-16 | Veri yoksa sonuç boş bırakılır, sıfır yazılmaz; duruş kaydı ya da "duruş yok" onayı olmayan hücrede kullanılabilirlik hesaplanmaz. | Değişmez | onay bekliyor | "Yüzde sıfır verim" ile "ölçüm yok" aynı şey değildir. |
| TER-17 | Durdurunca neden seçilir, duruş kaydı açılır, çalışan adım duraklar ve "ayar korundu" işaretlenir. | Akış | onay bekliyor | Dönüşte ayar tekrar sayılmaz. |
| TER-18 | Bir tezgahta aynı anda tek aktif duruş olur. | Değişmez | onay bekliyor | |
| TER-19 | İş hedefe ulaşınca terminal yalnız teslim ekranına ön dolu yönlendirir; teslim kendiliğinden yapılmaz. | Akış | onay bekliyor | Teslim kişinin kendi hesabından sayarak onaylanır. |
| TER-20 | Kapsamlı operatör başka istasyonun adımına kayıt giremez. | Değişmez | onay bekliyor | Okuma ve yazma kuralı aynıdır. |
| TER-21 | Geçmişe dönük toplu girişler stok hareketi üretmez ve verimliliğe sayılmaz. | Değişmez | onay bekliyor | |
| TER-22 | Girişi silmek, onu doğuran otomatik stok hareketlerini tam ters çevirir; rota ya da depo sonradan değişmiş olsa bile. | Değişmez | onay bekliyor | |
| TER-23 | Duruş süresi eşiği (örneğin 30 dakika) aşılırsa ilgili gruba otomatik mesaj gitmesi eski sistemde vardı. | Açık soru | onay bekliyor | Mesajlaşma ilk kapsamda yok; eşik uyarısı nasıl olsun? |
| TER-24 | Tüketimin hammadde partisine bağlanması: tek açık parti varsa bağlanır, çok aday varsa belirsizlik yazılır; seçim ekranı eski sistemde hiç tamamlanmadı. | Açık soru | onay bekliyor | Parti izi ilk kapsamda mı? Operatör seçsin mi? |
