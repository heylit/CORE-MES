# İstasyon, kaynak ve personel

Kural kodu: KAY. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| KAY-01 | Kaynak, makine ya da insan olabilir; kapasite biçimi tek kaynak ya da havuz (ekip) olabilir. | Tanım | onay bekliyor | |
| KAY-02 | İstasyon, benzer işlerin yapıldığı çalışma yeridir; makineler ve kişiler istasyona bağlanır ve kapasite orada toplanır. | Tanım | onay bekliyor | |
| KAY-03 | Bir adımın etkin istasyonu dört kademeden çözülür: adımın kendi istasyonu, yoksa makinesinin, yoksa operasyonun, yoksa operasyon tipinin eşlendiği istasyon. | Tanım | onay bekliyor | Operasyon kademesi tipten daha özel bilgidir, önce sorulur. |
| KAY-04 | Etkin istasyon tek tanımdan gelir; terminal, istasyon ekranı, kuyruk, yetki kapsamı ve teslim hedefi aynı kuralı kullanır. | Değişmez | onay bekliyor | "Kim hangi işi görür" sorusunun tamamı buna bağlıdır. |
| KAY-05 | Operasyon tipi ile istasyon eşlemesi yönetimden değiştirilebilir ve değişiklik hemen geçerli olur. | Akış | onay bekliyor | Sabit tablo değil, ayardır. |
| KAY-06 | Adımın bir tezgahı olabilir ya da aday tezgah listesi; tezgahsız adım senaryo ile dağıtılır. | Tanım | onay bekliyor | |
| KAY-07 | Kullanımdaki makine, istasyon ve operasyon silinmez; kullanım özeti gösterilir ve pasife alınır. | Değişmez | onay bekliyor | |
| KAY-08 | Pasif kaynak kapasite vermez ve yeni iş almaz. | Değişmez | onay bekliyor | |
| KAY-09 | İstasyon sorumlusu bir yetkidir: sorumlu o istasyondaki adımları onaylayabilir. | Tanım | onay bekliyor | Adres ya da bildirim alanı değildir. |
| KAY-10 | Sorumluyu değiştirmek yönetici yetkisi ister; kapı alanın gönderilmesine değil değişmesine bakar. | Değişmez | onay bekliyor | |
| KAY-11 | Kaynağa üye eklemek boş istasyon bağını doldurur, dolu bağı ezmez (dolu ise reddedilir). | Akış | onay bekliyor | |
| KAY-12 | Havuzda kuyruk yoktur: işler paralel yürür ve ortak günlük dakika kovasından çeker. | Tanım | onay bekliyor | Örnek: tezgahsız çapak alma istasyonu. |
| KAY-13 | Havuzda bir iş en çok "iş başına üst sınır çarpı 9 saat" kadar dakika alabilir; tek iş bütün istasyonu yiyemez. | Hesap | onay bekliyor | |
| KAY-14 | Bir kişinin kullanıcı hesabı bir istasyona bağlanabilir; hesabın istasyonu o kişinin görünürlük ve yazma sınırını belirler. | Tanım | onay bekliyor | Ayrıntı yetki dosyasında. |
| KAY-15 | Kişi kaynağı (kapasite için) ile kullanıcı hesabı (oturum ve yetki için) eski sistemde ayrı iki kayıttı. | Açık soru | değişsin | Karar (05.10.2026): tek kişi kaydı; giriş bilgisi olan kişi kullanıcıdır. |
| KAY-16 | Eski sistemde istasyon bağları istasyon kodu ile kuruluydu; kod değişince bağlı üyelikler koptu ve onarım yolu yoktu. | Açık soru | onay bekliyor | Yeni sistemde bağlar değişmeyen kimlikle mi kurulsun? |
| KAY-17 | Hangi operasyon tipinin hangi istasyona eşlendiği eski sistemde kullanıcı ayarıydı. | Açık soru | onay bekliyor | Yeni sistemin başlangıç eşlemesi ne olsun? |
