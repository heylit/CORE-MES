# ADR dizini ve kuralı

ADR, geri alması pahalı tek bir mimari kararın kaydıdır: bağlam, karar, sonuçlar, vazgeçilenler. Önce bu dizin okunur; yalnız işin
dokunduğu ADR açılır. Dizin ve ADR'ler `araclar/adr-denetimi.ts` ile `npm run kontrol` içinde denetlenir.

## Dizin

Sütunlar araçla okunur: `Durum` sabit listedendir; `Değiştirir` ve `Değiştiren` iki yönlü tutulur; `Çapa` virgülle ayrılmış
`yol` ya da `yol#ad` listesidir (dosya ya da klasör var olmalı, `ad` dosyada geçmelidir); çapası olmayan satırda `-` yazılır.

| No | Başlık | Durum | Değiştirir | Değiştiren | Geçerli özet | Çapa |
|---|---|---|---|---|---|---|
| 0001 | Temel mimari | kabul | - | 0024 | Modüler monolit, derlemesiz TypeScript, yalnız PostgreSQL, uç tanımı tek kaynak, modül sınırı araçla. | sunucu/cekirdek/uc.ts#export function uc, araclar/sinir-denetimi.ts |
| 0002 | Oturum, yetki ve denetim | kısmen yerine geçildi | - | 0003, 0012 | Geçerli: tek kişi kaydı, yalnız eklenen denetim kaydı, denetim kipi ve dosya indirme ekleri. | sunucu/cekirdek/cerez.ts, sunucu/cekirdek/uc.ts#denetim |
| 0003 | İşlem tabanlı yetki ve giriş beklemesi | kabul | 0002 | 0007 | Yetki birimi işlemdir, yalnız rolle verilir; artan bekleme, 10 hatada 15 dk ad kilidi ve cihaz sınırı; cihaz profili; giriş denemesi 365 gün. | paylasilan/islemler.ts, sunucu/cekirdek/uc.ts#cihazProfili, sunucu/cekirdek/uc-cihaz-profili.test.ts, sunucu/moduller/oturum/kurallar.ts#HESAP_KILIDI_ESIGI |
| 0004 | İstek sınırı, veritabanı ve sağlık | kabul | - | - | Transaction, salt okunur GET, kısıt ihlali çevirisi, süre ve havuz ortamdan, sağlık uçları. | sunucu/cekirdek/db.ts, sunucu/moduller/oturum/uclar.ts#txDisi |
| 0005 | Uygulama ve göç için ayrı veritabanı kullanıcıları | kabul | - | - | Uygulama ve göç ayrı rol; göç kimliği sunucuya girmez; şemayı değiştirebilen kullanıcıyla uygulama açılmaz. | araclar/vt/kurulum.sql, sunucu/cekirdek/ayar.ts#gocKimligiOku |
| 0006 | Modüller arası akış | kabul | - | - | Yön tektir, grafik döngüsüzdür; ters haber yalnız `sunucu/kablolama.ts`'te bağlanır. Katman tablosu bekliyor. | sunucu/kablolama.ts, sunucu/kablolama.test.ts, araclar/sinir-denetimi.ts |
| 0007 | Okuma ucunda sayfa ya da veri işlemi | kabul | 0003 | - | Uç `biri: [...]` listesi alabilir; 'oturum' okuma yalnız kullanıcı kararıyla. | sunucu/cekirdek/uc.ts#biri |
| 0008 | Denetim eki | kabul | - | - | İşleyici denetim kaydına sınırlı ek bırakır; ayrı tarihçe tablosu kurulmaz. | sunucu/cekirdek/uc.ts#denetimEki, sunucu/cekirdek/uc-denetim-eki.test.ts |
| 0009 | Dosya saklama | kabul | - | - | Dosya PostgreSQL'de özetle tekil; indirme bağlayan modülün ucundan; talimat medyası diskte. | sunucu/moduller/dosya/servis.ts, sunucu/moduller/dosya/disk-deposu.ts, sunucu/moduller/dosya/isler.ts#dosya-temizlik |
| 0010 | Zamanlanmış iş | kabul | - | - | Çekirdekte tek zamanlayıcı, aynı süreçte, kilitle tek koşu, kişisiz; transaction dışı iş eki. | sunucu/cekirdek/zamanlayici.ts#txDisi, sunucu/cekirdek/zamanlayici.test.ts |
| 0011 | Sunucudan kurum içi köprü servisine istek | kısmen yerine geçildi | - | 0017 | Geçerli: tek modül, varsayılan kapalı, zamanlanmış iş, çift gönderim kalkanı; kurum içi adres kuralı. | sunucu/moduller/logo/kopru.ts, sunucu/cekirdek/kurum-ici.ts#kurumIciMi |
| 0012 | PIN ile giriş | kabul | 0002 | - | Yönetici dışı kişi altı haneli PIN'le girer; geçici PIN ilk girişte değişir; kendi PIN'ini değiştirir; istasyonda kart + PIN. | sunucu/moduller/oturum/servis.ts#pinBelirlenecek, sunucu/moduller/oturum/uclar.ts#/oturum/kart-giris, sunucu/moduller/kisiler/servis.ts#kendiPininiDegistir |
| 0013 | Sunucudan kurum içi SmartES servisine SOAP isteği | kabul | - | - | SmartES'e yalnız `smartes` modülü, kurum içi adres, varsayılan kapalı, MES verisi silinmez. | sunucu/moduller/smartes/istemci.ts |
| 0014 | Sunucudan kurum içi etiket yazıcısına doğrudan baskı | kabul | - | - | Yalnız `etiket-merkezi` yazıcıya TCP 9100 ile, aralık ortamda, varsayılan kapalı. | sunucu/moduller/etiket-merkezi/gonderici.ts#tcpGonder, sunucu/moduller/etiket-merkezi/ag.ts |
| 0015 | Bildirimlerin kurum içi posta sunucusundan e-postayla gönderilmesi | kabul | - | - | Kabul edildi, kodu yok; istisna kod gelince CLAUDE.md'ye girer. | - |
| 0016 | Kart okuyucunun PDKS hareketini oturumsuz uçla göndermesi | kabul | - | - | Tek oturumsuz uç; ağ izin listesi, cihaz anahtarı, oran sınırı, varsayılan kapalı. | sunucu/moduller/nizamiye/ag.ts, sunucu/moduller/nizamiye/anahtar.ts |
| 0017 | Logo'ya aynı bilgisayardaki yardımcıyla yazmak | kabul | 0011 | - | Logo'ya yalnız 127.0.0.1'deki x86 yardımcıyla, Logo Objects ile yazılır; SQL yalnız okuma. | araclar/logo-yardimcisi, sunucu/moduller/logo/ayar.ts#yerelMi |
| 0018 | Plan motoru tek kaynak, son söz sunucuda | kısmen yerine geçildi | - | 0020, 0028 | Tek motor kodu; sunucu aramasız kipte yeniden koşar ve son sözü söyler; kalan adetten. | sunucu/moduller/plan/plan-motoru.ts#COZUM_SURESI_MS, sunucu/moduller/plan/disari.ts#planMotoruCozucusu |
| 0019 | Test robotunda dil modeli istisnası | kabul | - | - | Dil modeli yalnız robot klasöründen, canlı olmayan ortamda, sentetik veriyle; varsayılan kapalı. | ekran-testleri/benzetim/model.ts |
| 0020 | Planlama ve plan motoru plan modülünde | kabul | 0018 | - | Motor ve planlama plan modülünde; plan Reçete ve Rota'yı yalnız `disari.ts` ile okur. | sunucu/moduller/plan/motor |
| 0021 | Dış erişim: DMZ'de dış sunucu ve tek yönlü köprü | ertelendi | - | - | Askıda; kod yok. Yeniden açılırsa "Birlikte risk" notu önce sorulur. | - |
| 0022 | Tek üretim emri çok katmanlı reçeteyi taşır; patlamış rota donmuş kopyadır | kabul | - | - | Çok katmanlı reçete tek emirde dal olarak; patlatma rota modülünün yalnız eklenen kopyası. | sunucu/gocler/20261031207000_rota_patlamis_rota.sql, sunucu/moduller/rota/uclar.ts#/rota/patlatmalar/:id |
| 0023 | NC programı tezgaha doğrudan gitmez | kabul | - | - | TMI tezgaha ve DNC'ye bağlanmaz; program yalnız indirilir, sistemin ürettiği program onaysız inmez. | istemci/src/moduller/cnc-kurulum/yeni/indir.ts |
| 0024 | Güvenilmeyen geometri dosyası ayrı süreçte işlenir | kabul | 0001 | - | STEP/IGES yalnız ağsız, veritabanısız ayrı süreçte okunur; çökmesi ana sunucuyu durdurmaz. | sunucu/moduller/geometri/surec.ts#fork, sunucu/moduller/geometri/hesap-sureci.ts |
| 0025 | Büyük kod tabanı için mühendislik kuralları | kabul | - | - | Deterministik kural dosyası, any yok, eksiksiz dal, istek izli günlük, kritik yazmada tekrar koruması ve eşzamanlılık testi, tohumlu test, markalı kimlik pilotu, denetim defteri, para/stok/yetki uçlarında strict; paket yok. | eslint.config.js, paylasilan/durum-gecis.ts#GecisTablosu, sunucu/cekirdek/tekrar.ts#TekrarDeposu, sunucu/cekirdek/test-vt.ts |
| 0026 | Belgeler ve revizyonları tek modülde kontrol edilir | kabul | - | - | Belge, revizyon, bağ ve dağıtımın tek sahibi belge-merkezi; çizimler taşınır; taslak, onay bekliyor, yürürlükte, eski; dört göz ayarı varsayılan kapalı; okundu yok; emre sabitleme Aşama 2. | - |
| 0027 | Ürün tanımı tek değişiklik nesnesiyle yürürlüğe girer; revizyon sahibi modülde kalır | öneri | - | - | Çizim, 3B, rota/reçete, şartname, kontrol planı, NC, markalama yalnız ECO yayınıyla yürürlüğe; ortak yürürlüğe alma arayüzü; parça revizyonu tasarım otoritesinin, proses sürümü ayrı; konfigürasyon yalnız eklenir; açık emir sabit kopyasıyla; stok ve sipariş satırı revizyon taşır. | sunucu/moduller/degisiklik-yonetimi/kurallar.ts#talepGerekmezMi, sunucu/gocler/20261028110000_degisiklik_yonetimi.sql |
| 0028 | Plan motorunun girdisi sahibi modüllerin tablolarından tipli kurulur | kabul | 0018 | - | Girdi tipli sözleşmeyle, alan başına tek kaynaktan; elle ana veri sahibinin tablosunda, JSON kaydı yalnız sayfa ayarı; eşdeğerlik testi ve bayrakla geçiş. | sunucu/moduller/plan/girdi/tipler.ts#UST_ALAN_KAYNAKLARI, sunucu/moduller/plan/girdi/esdegerlik.test.ts |

## Kural

1. **Ne zaman yazılır:** yalnız geri alması pahalı karar: kırmızı çizgi istisnası, yeni çalışma zamanı ya da süreç, dış ya da kurum içi
   bağlantı, güvenlik sınırı, modüller arası yön ve sahiplik, çekirdek kalıbı. İş kuralı (`KURAL-TEST.md`), ekran, sayı ve anlık durum
   ADR'ye yazılmaz.
2. **Durum:** ADR'nin "Durum:" satırı ve dizindeki `Durum` aynı değeri taşır: `öneri`, `kabul`, `ertelendi`, `kısmen yerine geçildi`,
   `yerine geçildi`, `kaldırıldı`. ADR silinmez: yerine yeni karar geldiyse `yerine geçildi` (yenisinin numarasıyla), karar yeni karar
   olmadan geçersiz kaldıysa `kaldırıldı` (gerekçesi durum satırında) olur. CLAUDE.md "kabul" olmayan bir ADR'ye ancak satırda o durumu söyleyerek atıf yapar.
3. **Değişmezlik:** kabul edilen kararın metni değişmez. Karar değişirse yeni ADR yazılır; yeni ADR "değiştirir: NNNN madde k" der, eskisinin
   durum satırına ve dizindeki `Değiştiren` sütununa yenisi yazılır. Çapa düzeltmesi, kalkmış koda atfın silinmesi ve dizin bakımı karar
   değişikliği sayılmaz; bunlar ADR'nin altına "Ek" ya da durum satırına tek cümle olarak girer.
4. **Kodla bağ:** her ADR dizinde en az bir çapa taşır (karar kodsa). Kararı tutan test varsa çapaya eklenir: kod durduğu hâlde davranış
   değişirse onu yalnız test yakalar. Kod tarafında yalnız "neden" yorumunda "ADR NNNN" yazılır; araç bu atıfları tarar: olmayan,
   `yerine geçildi` ya da `kaldırıldı` durumundaki ADR'ye atıf `kontrol`ü kırar, kod yürürlükteki karara bağlanır. Çapası olan dosyayı değiştiren iş, ilgili
   ADR'yi aynı değişiklikte günceller ya da yeni ADR ister; çekme isteğinde çapalı dosya değişip ADR dosyası da dizin de
   değişmediyse CI uyarı yazar, kırmaz (`node araclar/adr-denetimi.ts --capa <taban>`).
5. **Anlık durum yok:** "bugün", "henüz", sayı ve liste ADR'ye yazılmaz; kaynağı yazılır (dosya ya da `npm run harita`).
6. **Açık depo:** depo dışı yol, IP adresi (yalnız 127.0.0.1 ve 0.0.0.0), alan adı, gerçek ad, kapanmamış güvenlik açığı ayrıntısı ADR'ye
   girmez. Gerekçe özel takip deposundaki karar kaydındadır; ADR karar numarasına atıf yapar.
7. **Şablon:** yeni ADR `SABLON.md`'den başlar; 0025 ve sonrasında `## Bağlam`, `## Karar`, `## Sonuçlar` başlıkları araçla
   istenir. Eski ADR'ler değişmezlik kuralı gereği yeniden biçimlenmez.
8. **Numara ve onay:** numarayı koordinatör verir. ADR metni kullanıcının yazılı onayıyla girer; ADR değişikliği de öyle.
9. **Bakım:** araç çapa, durum, iki yönlü bağ, koddaki atıf, şablon ve açık depo kurallarını her `kontrol`de denetler. Anlamsal çelişkiyi araç bulamaz; her ADR
   değişikliğinde "hangi ADR'lere dokunuyor" sorusu cevaplanır ve dönemsel taramayla bakılır.
