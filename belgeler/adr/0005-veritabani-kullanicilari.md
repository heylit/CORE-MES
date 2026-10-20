# ADR 0005 — Uygulama ve göç için ayrı veritabanı kullanıcıları

Durum: kabul edildi (06.10.2026). Kullanıcının kart #71 ve #114'te onayladığı kararların kaydıdır.

## Karar

1. **İki rol.** `tmiv2_uygulama` sunucu sürecinin kullanıcısıdır: tabloları okur ve yazar, dizileri ve
   işlevleri kullanır; tablo açamaz, değiştiremez, düşüremez, boşaltamaz, tetikleyici kapatamaz.
   `tmiv2_goc` şemanın, tabloların, dizilerin ve işlevlerin sahibidir; göçleri o koşar. İkisi de süper
   kullanıcı değildir. `.env`'de süper kullanıcı parolası durmaz.
2. **Haklar varsayılan yetkiyle gelir.** Göç kullanıcısının açtığı her yeni tablo, dizi ve işlevde
   uygulama kullanıcısına gereken hak veritabanının varsayılan yetkileriyle verilir. Göç dosyası ve göç
   koşucusu hak vermez. Varsayılan yetki veritabanına özeldir; kurulum betiği her veritabanında ayrı koşar.
3. **Herkese açık haklar alınır.** Bağlı veritabanında bağlanma ve geçici tablo, `public` şemasında
   kullanma ve oluşturma, göç kullanıcısının işlevlerinde çalıştırma hakkı herkesten alınır. Betikler
   başka veritabanına dokunmaz ve adı `tmiv2` ile başlamayan veritabanında koşmaz.
4. **Eski sistemin veritabanları.** İki rol `tmi` ve `tmi_onizleme`'ye bağlanamaz. Bu, o veritabanlarında
   herkese açık bağlanma hakkının zaten alınmış olmasına dayanır (06.10.2026'da salt okunur sorguyla ve
   bağlanma denemesiyle doğrulandı); betikler bunu kendileri sağlamaz. Uygulama ayarı iki adı da reddeder.
5. **Yalnız ekleme tabloları iki katla korunur.** Uygulama kullanıcısı boşaltmada izin hatası alır;
   sahibi tetikleyici durdurur. Testler ikisini ayrı ölçer.
6. **Göç kimliği sunucuya girmez.** `TMIV2_PG_GOC_USER` ve `TMIV2_PG_GOC_PASSWORD` ayarın parçası
   değildir; yalnız göç koşucusu ve test fikstürü ayrı okuyucuyla alır, eksikse hata verir, varsayılanı
   yoktur. Uygulama ön yüklemesi iki değişkeni `.env`'den almaz ve ortamda varsa siler. İkisi süreçte
   tanımlıysa uygulama havuzu açılmaz; ön yüklemesiz başlatılan servis de böyle durur.
7. **Uygulama, şemayı değiştirebilen kullanıcıyla açılmaz.** Sunucu ve yönetici aracı havuzu tek bir
   açıcıdan açar. Açıcı adı karşılaştırmaz, veritabanına sorar: bağlı kullanıcı geçerli şemada tablo
   açabiliyorsa, şemanın ya da bir tablonun sahibiyse (üyelikle; hakları devralmayan üye de sayılır)
   açılmaz. Cevap alınamazsa da açılmaz. "Göç ve uygulama aynı kullanıcı olamaz" denetimi göç kimliğinin
   okunduğu yerdedir.
8. **Göç kaydını yalnız sahibi yazar.** Uygulama kullanıcısı `goc_kaydi`'nı okur (açılıştaki bekleyen göç
   denetimi için), yazamaz. Koşucu her koşuda, bekleyen göç olmasa da, yazma haklarını uygulama rolünden
   geri alır; var olan şemalar bir sonraki `npm run goc` ile daralır. "Koşucu hak vermez" ilkesinin tek
   istisnası bu geri almadır. Uygulama rolü yoksa koşu değişkeni adıyla söyleyip durur, hiçbir şey kurmaz.
9. **Betikler.** `araclar/vt/kurulum.sql` rolleri ve varsayılan yetkileri kurar; `tasima.sql` tek
   kullanıcılı kurulumun nesnelerini göç kullanıcısına geçirir ve göç kaydını daraltır; `geri-al.sql`
   öncekine döndürür. Hepsi tek transaction'da (`psql -1`) koşar, yeniden koşulabilir; veritabanının
   sahibi süper kullanıcı ya da göç kullanıcısı değilse dururlar. Test şemalarını silen bayrak yalnız adı
   `tmiv2_` ile başlayan veritabanında çalışır. Taşıma denemesi (`tasima-denemesi.sh`) CI'da koşar.
10. **Testler iki kullanıcıyla koşar.** Fikstür şemayı sahip bağlantısıyla kurar, uygulamayı uygulama
    kullanıcısıyla açar. Test süreci iki kimliği de taşır; üretim süreci taşımaz.

## Vazgeçilenler

- Hakları göç koşucusunun her koşuda vermesi (ilk plan): varsayılan yetki aynı işi veritabanında yapar.
- Toplu sahiplik devri: önyükleme süper kullanıcısından reddedilir; nesneler tek tek geçirilir.
- Göç kullanıcısının adını sunucuya parolasız okutmak: madde 6'ya aykırı.
- Sahiplik denetimini havuzun ilk bağlantısına gömmek: fikstürün sahip havuzu için kaçış yolu gerekiyordu.
- Eski veritabanlarında hak değiştirmek ya da `pg_hba.conf`'a ret satırı eklemek: gerekmedi (madde 4).

## Bilinen sınırlar

- Yeni bir giriş noktasının korumalı açıcı yerine ham açıcıyı çağırmasını engelleyen araç kuralı yok;
  hakları devralmayan üyenin reddi yalnız elle ölçüldü (kart #116).
- `.env` tek dosyadır; ayrıştırılırken göç parolası sunucu sürecinin belleğinden kısa süre geçer.
- Geri almadan sonra yeni kod tek kullanıcılı düzende açılmaz; kod sürümü de geri alınır.
