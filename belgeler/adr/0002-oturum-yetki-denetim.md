# ADR 0002 — Oturum, yetki ve denetim

Durum: kabul edildi (05.10.2026). ADR 0003 ile değişti: 2., 7. ve 8. maddeler ile 4. maddedeki
kilit kuralı geçersizdir; yetki işlem tabanlıdır, kilit yerine artan bekleme vardır, yetenek dosyası
kalkmıştır ve giriş denemeleri 30 günde silinir. ADR 0012 ile 3. madde değişti: yönetici dışındaki kullanıcı PIN ile girer.

## Bağlam

İlk modüller yazılmadan önce kimin girdiği, neyi görebildiği ve ne yaptığı belli olmalıydı. Kararlar
eski kural listesinden (KAY-15, YTK-02..17) kullanıcıya sorularak alındı.

## Karar

1. **Tek kişi kaydı.** `kisi` tablosu hem personeli hem kullanıcıyı tutar; kullanıcı adı ve parola
   özeti olan kişi kullanıcıdır. Tablonun sahibi `kisiler` modülüdür.
2. **Sayfa matrisi + rol yetenekleri.** Rol başına sayfa düzeyi (oku / yaz / yonet); kişiye özel satır
   rolü ezer, `yok` sayfayı kapatır. Buna ek dört yetenek role verilir: üretim kaydı, adım onayı,
   kayıt silme / iptal, plan yayınlama. Uç tanımı `yetenek` alanıyla ister; yönetici hepsine sahiptir.
   Tanınmayan sayfa, düzey ve yetenek yetki vermez.
3. **Herkes kullanıcı adı + parola ile girer.** Parola scrypt ile özetlenir (yeni bağımlılık yok).
4. **Çerez oturumu.** Anahtarın yalnız özeti saklanır. 12 saat hareketsizlikte, en geç 30 günde
   kapanır. Beş hatalı denemede kullanıcı adı 15 dakika kilitlenir; olmayan kullanıcı aynı sürede
   aynı cevabı alır. Bağlantı kurum içi ağda şifresiz olduğu için çerezde `Secure` yoktur.
5. **Reddedilen komutun yazısı kalabilir.** `yazilarKalir` işaretli hata transaction'ı geri almaz;
   hatalı giriş denemesi bu yolla kaydedilir. Başka kullanım için gerekçe gerekir.
6. **Sade denetim kaydı.** Başarılı her yazma komutu, komutla aynı transaction'da `denetim_kaydi`
   tablosuna yazılır (kim, ne zaman, hangi komut, parametre, gövde). Parola alanları maskelenir.
   Tablo yalnız ekleme kabul eder; güncelleme, silme ve boşaltma veritabanında reddedilir. Zincir ve
   imza yoktur; gerekirse yeni göçle eklenir.
7. **Alt yol, üst sayfanın yetkisini alır.** `/stok/:id` yalnız `/stok` sayfasını gören kullanıcıya açılır.
8. **Yalnız yönetici yetkisi:** sayfaya bağlı değildir; bir sayfada 'yonet' düzeyi yönetici yapmaz.

## Ek: denetim kipi (07.10.2026, kart #212)

6. maddeye ek. Gövdenin tamamı her yazmada deftere girdiği için dosya parçası taşıyan komut (istek başına
yaklaşık 700 KB) defteri dosya içeriğiyle dolduruyordu. Uç tanımı `denetim` seçeneği alır; verilmezse
davranış 6. maddedeki gibidir.

- `govdesiz`: satır yine yazılır (kim, ne zaman, hangi komut, parametre); gövdenin yerine
  `{ "_ozet": { "boyut", "sha256" } }` girer. Özet maskelenmiş gövdenin kararlı JSON'undan alınır: ham
  gövdenin özeti deftere girseydi kısa bir gizli değer özetten çevrimdışı denenebilirdi.
- `yok`: satır yazılmaz. Yalnız kendi değişmez defterini tutan komut içindir; her kullanımı ayrı kullanıcı
  kararıdır ve bugün hiçbir uçta yoktur.
- Okuma ucunda ve kimlik istemeyen (açık) uçta seçenek tanım hatasıdır: açık komutun satırında kişi
  yoktur, gövde de düşerse iz kalmaz. Kipi tam olmayan uçlar çekirdek testindeki sabit listeyle
  karşılaştırılır, modül haritasında ve dış teslimin statik denetiminde görünür: yeni gövdesiz ya da
  denetimsiz uç liste bilinçli güncellenmeden geçmez.
- Maske listesi genişledi ve parametre sütununa da uygulanır: `parola` ve `sifre` içeren adlara ek olarak
  `password`, `passwd`, `secret` ile biten adlar ve sözcük olarak `pin` ve `token`.
- Göç yoktur. Geri alınırsa seçenek kaldırılır; o arada yazılmış satırların gövdesi geri gelmez.
- Vazgeçilenler: eşik üstü alanı çekirdekte kendiliğinden kısaltmak (sihirli eşik; küçük alanlı büyük
  gövdeyi küçültmez) ve ucun kendi özet gövdesini vermesi (uç denetim için kod yazmaz).

## Ek: dosya indirmeleri (21.10.2026, kullanıcı kararı 385 a)

6. maddeye ek. Okuma denetlenmez; tek istisna dosyadır. Dosya cevabı veren okuma ucu (ADR 0009, `ikiliCevap`)
oturumlu kişiye dosyayı verdiğinde satır yazılır: kim, ne zaman, uç (`GET` ve yol kalıbı), maskelenmiş yol
parametresi, ucun modülü ve yetkisi; gövdenin yerine `{ "_ek": [{ "ad", "tur", "boyut" }] }`. Sorgu dizgisi
girmez (tek kullanımlık izin gibi değerler taşır).

- Satır, okuma transaction'ı bittikten sonra ve içerik akmadan önce ayrı bir yazma transaction'ında yazılır;
  yazılamazsa dosya verilmez (500). İz kalmadan dosya çıkmaz.
- Yalnız dosya verilen istek yazılır: yetkisiz (401, 403), reddedilen ve boş (204) istek yazılmaz. Kimliksiz açık
  uç (giriş logosu) yazılmaz: kişi yoktur.
- Uç yazan modül kod yazmaz; kayıt uç katmanındadır, bugünkü ve sonraki bütün dosya uçlarını kapsar. Çizim ve belge
  önizlemesi de yazılır: önizleme dosyayı tarayıcıya verir.
- Kapsam yalnız dosya indirmeleridir: ekranın kişi istemeden kendiliğinden yüklediği dosya (atölye haritasının 3B
  modelleri) yazılmaz. Uç tanımı bunu `kendiligindenYuklenir` ile söyler; bu uçlar çekirdekteki sabit liste testindedir,
  liste kararsız genişlemez.
- Denetim Kaydı ekranında `GET` komutu olarak süzülür; göç yoktur. Geri alınırsa uç katmanındaki adım kaldırılır,
  yazılmış satırlar kalır (yalnız ekleme).

## Sonuçlar

- Uç yazan modül denetim için kod yazmaz; kayıt uç katmanından gelir.
- Yeni yetenek `paylasilan/yetenekler.ts` dosyasına eklenir; göç gerekmez.
- İlk yönetici `npm run yonetici -- <kullanici_adi> "<Ad Soyad>"` ile oluşturulur.

## Açık konular

- Yerleşik planlamacı ve operatör rollerinin başlangıç sayfa matrisi boştur; kullanıcı kararı bekliyor.
- "Yönetim yetkili en az bir kullanıcı kalır" kuralı kişi yönetimi uçlarıyla birlikte girecek.
- Parola değiştirme, kişi ve rol yönetimi ekranları personel modülüyle gelir.
- Belge indirmenin denetime yazılması (YTK-15'in ikinci yarısı) belge üreten ilk modülle gelir.
