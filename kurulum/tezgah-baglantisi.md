# Tezgâh bağlantısı (deneme): kurulum

Tezgâh bağlantısı tezgâh verisini yalnız okur ve deneme ekranında SmartES ile yan yana gösterir; üretim kaydına, sayıma, stoğa
hiçbir şey işlenmez. İki kaynak vardır: ortak MTConnect servisi (ADR 0033, `TMIV2_TEZGAH_MTCONNECT_ADRESI`) ve Heidenhain
kumandaları (LSV2, kart 3753). İkisi de varsayılan kapalıdır ve okuma aralığını (Sistem Ayarları, 5-60 sn) paylaşır.

## Heidenhain okuması

Heidenhain kontrollü tezgâhlar (TNC 6xx sınıfı) LSV2 ile, TCP 19000'den doğrudan okunur. Yalnız okuma telgrafları gider: durum, kip,
program, takım, ilerleme ve iş mili oranları, kumandanın hata iletileri ve ayarda adresi verilmişse PLC'deki parça sayacı. Dosya,
program seçme, tuş, PLC yazma ve her `C_` komutu kodla engellidir. Parola gönderilmez ve hiçbir yerde tutulmaz.

### 1. Ortam değişkeni

Sunucunun ortamına (servis tanımı ya da `.env`) makine listesi yazılır. Biçim:

```
TMIV2_TEZGAH_LSV2_MAKINELERI=CIHAZ=ADRES;SAYAC,CIHAZ=ADRES
```

- `CIHAZ`: SmartES'teki makine kodunun aynısı (karşılaştırma ekranı bu adla eşleşir). Harf, rakam, nokta, tire, alt çizgi.
- `ADRES`: makinenin kurum içi IP adresi (10.x, 172.16-31.x, 192.168.x). Ad ve kapı yazılmaz; kapı her zaman 19000'dir.
- `SAYAC` (isteğe bağlı): parça sayacının PLC çift kelime adresi, `D` ve 4'ün katı sayı. Yazılmazsa sayaç boş kalır, uydurulmaz.
  Adres makineden makineye değişir; PLC programını bilen bakım ekibinden ya da SmartES makine ayarından alınır.

Uydurma örnek (belgeleme aralığı; olduğu gibi kullanılamaz, sunucu dış adresi reddeder):

```
TMIV2_TEZGAH_LSV2_MAKINELERI=ORN-H01=192.0.2.11;D10000,ORN-H02=192.0.2.12
```

Gerçek adres ve sayaç adresi bu belgeye, depoya, karta ya da ön izlemeye yazılmaz; yalnız sunucunun ortamında durur. Değer geçersizse
(dış adres, ad, kapı, bozuk sayaç, aynı ad iki kez) sunucu açılmaz ve iletide kaçıncı kaydın bozuk olduğu yazar. Değişiklik sunucu
yeniden başlayınca geçerli olur.

### 2. Sistem Ayarları

Sistem Ayarları > Tezgâh bağlantısı > "Heidenhain okuması" açılır (varsayılan kapalı). Liste boşken açık olsa da bağlantı açılmaz;
deneme ekranı "Heidenhain listesi yok" der. Okuma aralığı "Tezgâh bağlantısı okuma aralığı" ayarıdır.

### 3. Deneme sırası

1. Önce deneme kurulumunda, tek makineyle: listeye yalnız bir makine yazılır, SmartES açık kalır.
2. Tezgâh bağlantısı (deneme) ekranında makine kartında "Heidenhain LSV2" yazar; durum ve program okunur.
3. CORE'un sayacı ile SmartES'in sayacı karşılaştırılır (ekranda "SmartES:" satırı ve "≠ fark" işareti).
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
| Sayaç için yetki yok | PLC belleği okuması daha yüksek giriş düzeyi istiyor | Parola eklenmez; bakımla konuşulur. Öteki değerler okunmaya devam eder. |
| Sayaç adresi makinenin PLC belleğinde yok | Ayardaki D adresi kelime alanının dışında | Adres bakımla doğrulanır, ayar düzeltilir, sunucu yeniden başlatılır. |
| Makine süresinde cevap vermedi / cevabı yarım kaldı | Ağ ya da kumanda yanıtı kesildi | Bağlantı bırakılır, sonraki turda yeniden kurulur. Sürerse ağ denetlenir. |
