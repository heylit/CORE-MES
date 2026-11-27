# Tezgâh bağlantısı (deneme): kurulum

Tezgâh bağlantısı tezgâh verisini yalnız okur ve deneme ekranında SmartES ile yan yana gösterir; üretim kaydına, sayıma, stoğa
hiçbir şey işlenmez. İki kaynak vardır: ortak MTConnect servisi (ADR 0033, `TMIV2_TEZGAH_MTCONNECT_ADRESI`) ve Heidenhain
kumandaları (LSV2, kart 3753). İkisi de varsayılan kapalıdır ve okuma aralığını (Sistem Ayarları, 5-60 sn) paylaşır.

## Heidenhain okuması

Heidenhain kontrollü tezgâhlar (TNC 6xx sınıfı) LSV2 ile, TCP 19000'den doğrudan okunur. Yalnız okuma telgrafları gider: durum, kip,
program ve tümce no, ilerleme, hızlı hareket ve iş mili oranları, iş milindeki takım (boy, yarıçap), eksen konumları, kumandanın
hata iletileri, bağlantı başında kumanda tipi, sürümler ve kumanda saati (parolasız DIAGNOSTICS girişiyle okunur, hemen çıkılır;
sunucu saatinden 60 saniyeden fazla farkta uyarı), (ayrı anahtar açıksa, ayarda adresi verilmişse) PLC'deki parça sayacı ve
(ayrı anahtar açıksa) seyrek aralıkta takım tablosu ve program dosya listesi. Dosya yazma, NC program içeriği, program seçme, tuş, PLC yazma ve her `C_`
komutu kodla engellidir. Parola gönderilmez ve hiçbir yerde tutulmaz. Eksen konumu ve tümce no yalnız son durumda tutulur, geçmişe
yazılmaz. Okunamayan her alan için kumandanın hata kodu ayrıntı ekranında "Okunamayan veri" satırında görünür (ör. "Alarm: yetki yok (kod 23)").

### 1. Makine listesi (Sistem Ayarları)

Sistem Ayarları > Genel > "Heidenhain makineleri" listesine her makine bir satır olarak yazılır (yalnız ayar değiştirebilen yönetici):

- Makine kodu: SmartES'teki makine kodunun aynısı (karşılaştırma ekranı bu adla eşleşir). Harf, rakam, nokta, tire, alt çizgi.
- IP adresi: makinenin kurum içi IPv4 adresi (10.x, 172.16-31.x, 192.168.x). Ad ve kapı yazılmaz; kapı her zaman 19000'dir.
- Sayaç adresi (isteğe bağlı): parça sayacının PLC çift kelime adresi, `D` ve 4'ün katı sayı (ör. D10000). Boşsa sayaç boş kalır,
  uydurulmaz. Adres makineden makineye değişir; PLC programını bilen bakım ekibinden ya da SmartES makine ayarından alınır.

Hatalı alanın altında neden yazar; hatalı listede Kaydet kapalıdır, sunucu da aynı kuralla reddeder. Kaydedince sonraki okumada
geçerli olur, sunucu yeniden başlatılmaz; listeden çıkan ya da adresi değişen makinenin açık bağlantısı kapatılır. Değişiklik denetim
kaydına yazılır. Gerçek adres ve sayaç adresi yalnız bu ayarda durur; depoya, karta ya da ön izlemeye yazılmaz. Ortam değişkeni
kullanılmaz (`TMIV2_TEZGAH_LSV2_MAKINELERI` kalktı, kart 3757).

### 2. Sistem Ayarları

Sistem Ayarları > Tezgâh bağlantısı > "Heidenhain okuması" açılır (varsayılan kapalı). Liste boşken açık olsa da bağlantı açılmaz;
deneme ekranı makine listesinin boş olduğunu söyler. Okuma aralığı "Tezgâh bağlantısı okuma aralığı" ayarıdır.

Parça sayacı ayrı anahtardadır: "PLC sayacı okuması" (varsayılan kapalı, "Heidenhain okuması"ndan bağımsız). Kapalıyken PLC'ye
hiç giriş yapılmaz, sayaç boş kalır ve kartta "PLC sayacı okuması kapalı" yazar. Açıkken yalnız sayaç adresi verilmiş makinede, her
okumada sayaçtan hemen önce parolasız PLCDEBUG girişi yapılır ve sayaç okunur okunmaz bu düzeyden çıkılır; oturum açık bırakılmaz.
Bu düzeyde de yalnız ayardaki sayaç adresi okunabilir; yazma ve kontrol komutu kodla engellidir. İlk açılış deneme kurulumunda, tek
makinede yapılır (aşağıda 3. adım).

Takım tablosu ayrı anahtardadır: "Heidenhain seyrek okuma (takım tablosu)" (varsayılan kapalı) ve "Heidenhain seyrek okuma aralığı
(dakika)" (varsayılan 10, en az 2). Açıkken her aralıkta parolasız FILE girişi yapılır, yalnız takım tablosu dosyası okunur ve hemen
çıkılır; çıkış reddedilirse bağlantı kapatılır. Tablo ayrıntı ekranındaki "Takım tablosu" sekmesinde görünür; geçmişe yalnız ömrü ya
da kilidi değişen takım yazılır. Aynı girişte oturumun açılış klasöründeki dosyaların yalnız adı, boyutu ve tarihi okunur (hangi klasör
olduğu kumandaya bağlıdır; klasör değiştirilmez, dosya içeriği okunmaz).

**PLC sayacı, takım tablosu ve kumanda saati okumaları yazma yetkisi açan bir giriş düzeyi kullanır; makinelerin 19000 kapısına yalnız CORE ve SmartES sunucularının
erişmesi önerilir (bilgi işlem).**

### 3. Deneme sırası

1. Önce deneme kurulumunda, tek makineyle: listeye yalnız bir makine yazılır, SmartES açık kalır.
2. Tezgâh bağlantısı (deneme) ekranında makine kartında "Heidenhain LSV2" yazar; durum ve program okunur.
3. "PLC sayacı okuması" açılır; CORE'un sayacı ile SmartES'in sayacı karşılaştırılır (ekranda "SmartES:" satırı ve "≠ fark" işareti).
4. SmartES'in o makineyi okumayı sürdürdüğü SmartES ekranından doğrulanır.
5. Sayaç eşit ve SmartES bozulmamışsa öteki makineler listeye eklenir. Fark varsa önce sayaç adresi bakımla birlikte denetlenir.

### 4. Güvenlik duvarı

CORE sunucusundan makinelerin TCP 19000 kapısına erişim izni gerekir; bu izni bilgi işlem verir. Öneri: CNC ağı ofis ağından ayrılsın;
yalnız CORE sunucusu ve SmartES makinelerin 19000 kapısına erişebilsin (bugün ofis ağından da erişilebiliyor).

### 5. Sorun giderme

| Ekrandaki uyarı | Anlamı | Ne yapılır |
|---|---|---|
| Makine kapalı ya da meşgul (bağlantı reddedildi) | Makine kapalı, ağ yolu kapalı ya da kumanda yeni bağlantıyı kabul etmiyor (ör. SmartES tutuyor) | CORE zorlamaz, aralık 60 sn'ye kadar uzar ve yeniden dener. Makine açıksa güvenlik duvarı ve SmartES bağlantı sayısı denetlenir. |
| Makine DNC okumasına izin vermiyor | Kumandada DNC seçeneği ya da izni kapalı; durum, program, takım okunamaz | Bakımla konuşulur; CORE parola eklemez. |
| Takım tablosu: yetki yok (kod 23) | FILE girişi bu kumandada izinli değil | Parola eklenmez; seyrek okuma kapatılır ya da bakımla konuşulur. Öteki değerler okunmaya devam eder. |
| Sayaç için yetki yok | PLC belleği okuması daha yüksek giriş düzeyi istiyor | Parola eklenmez; bakımla konuşulur. Öteki değerler okunmaya devam eder. |
| Sayaç adresi makinenin PLC belleğinde yok | Ayardaki D adresi kelime alanının dışında | Adres bakımla doğrulanır, "Heidenhain makineleri" listesinde düzeltilir. |
| Makine süresinde cevap vermedi / cevabı yarım kaldı | Ağ ya da kumanda yanıtı kesildi | Bağlantı bırakılır, sonraki turda yeniden kurulur. Sürerse ağ denetlenir. |
