# ADR 0013 — Sunucudan kurum içi SmartES (MES) servisine SOAP isteği

Durum: öneri (kart #778; kullanıcı kararları 1a, 2a, 3b, 12.10.2026). Kırmızı çizgi satırına eklenecek metin aşağıdadır; satırı şef değiştirir.

## Bağlam

Kırmızı çizgi "telemetri ve dış servis çağrısı yok" diyor; tek istisna Logo iç köprüsüdür (ADR 0011). Atölyedeki makine gerçekleşenleri
(sağlam, red, duruş, alarm) SmartFactory MES'tedir ve yalnız kurum içindeki ASMX/SOAP servisiyle alınır. Kullanıcı kararları:
1a TMI sunucusu SmartES'e doğrudan bağlanır (ara köprü yok); 2a SmartES kod eşlemesi smartes modülünün kendi tablosunda; 3b okuma ve
yazma (iş emri gönderimi, IsErp işareti) tek anahtarla birlikte açılır.

## Karar

1. **Kurum içi SmartES ayrı tutulur.** Sunucunun kurum içindeki SmartES servisine SOAP isteği "dış servis çağrısı" sayılmaz. İnternete
   çıkan her çağrı, telemetri ve CDN yasağı aynen sürer.
2. **Kurum içi adres açılışta denetlenir.** ADR 0011 karar 2'deki kural aynen: özel ya da yerel IP, ya da noktasız tek parçalı sunucu adı.
   Adreste kullanıcı, parola, sorgu ve `#` olmaz; yönlendirme izlenmez (`sunucu/moduller/smartes/ayar.ts` `kurumIciMi`, `istemci.ts`).
3. **SmartES ile tek modül konuşur.** `sunucu/moduller/smartes/istemci.ts` dışında hiçbir dosya SmartES'e istek atmaz. Başka modüllerin verisi
   yalnız `disari.ts` ile okunur (uretim-emirleri, istasyonlar, malzemeler, durus-nedenleri); smartes başka modüle yazmaz.
4. **Adres yalnız ortam değişkenindedir** (`TMIV2_SMARTES_ADRESI`, isteğe bağlı `TMIV2_SMARTES_AD_ALANI`). Depoya, karta, teste, günlüğe ve hata
   metnine girmez; istasyon ve makine kodları yalnız eşleme tablosundadır (canlı veri). Hata metinleri sabittir, adres taşımaz.
5. **Bağlantı varsayılan kapalıdır.** İstek ancak Sistem Ayarları'ndaki "SmartES bağlantısı" anahtarı (`smartes.baglanti`, varsayılan kapalı)
   açık VE adres tanımlıyken çıkar. Tek anahtar okuma, işaretleme ve gönderimi birlikte açar (karar 3b). Kapalıyken işler koşar, istek atmaz,
   yazmaz; neden sağlık ayrıntısında görünür.
6. **MES'teki üretim verisi silinmez, değiştirilmez.** Yazılan yalnız: TMI'ye okunmuş ve bitmiş kaydın "ERP'ye aktarıldı" işareti (IsErpOK,
   IsErpRED), TMI iş emrinin SmartES'te açılması ve güncellenmesi, plandan düşen emrin pasif ya da bitti yapılması. Silme metodu çağrılmaz.
7. **İş zamanlanmış iş kalıbıyla koşar** (ADR 0010). Yeni paket yok: Node'un `fetch`'i ve el yazımı, DTD ve tanımsız varlık reddeden XML okuyucu.
   Tur, istekleri bekleyebilmek için yalnız kendi transaction'ında "boşta transaction" kesmesini uzatır (ADR 0011 karar 6 ile aynı).
8. **Okuma tekrarı zararsızdır.** Her kayıt SmartES kimliğiyle bir kez yazılır (UPSERT); okuma penceresi 15 dakika geriden başlar; hata
   pencereyi ilerletmez. İşaret, TMI yazması bittikten sonraki turda gider; düşerse kayıt yine okunur ve tekillikle atlanır.

## Kırmızı çizgi için öneri metni

> - Depoya yalnız kod girer: müşteri adı, parça no, çizim, gerçek veri, parola, anahtar girmez. Telemetri ve internete çıkan servis çağrısı yok.
>   İstisnalar kurum içi iki servistir: Logo köprüsü (ADR 0011, yalnız `logo` modülü) ve SmartES (ADR 0013, yalnız `smartes` modülü);
>   yalnız kurum içi adrese, adres `TMIV2_*` ortam değişkeninde, bağlantı varsayılan kapalı.

## Sonuçlar

- Gerçek SmartES'e geçiş: ortam değişkenini vermek, eşlemeleri girmek, anahtarı açmak. Önce yapılacaklar `kurulum/smartes.md`'dedir.
- Alan adları ve bazı metot parametreleri canlı WSDL'den doğrulanmadı; tek yerde (`kurallar.ts` `ALANLAR`, `*Parametreleri`) toplandı, ham satır saklanır.

## Vazgeçilenler

- **Ayrı .NET servisi (brief'teki yol):** ikinci çalışma zamanı ve kurulum; kullanıcı kararı 1a doğrudan bağlantı.
- **SOAP/XML paketi:** yeni bağımlılık onay ister; gereken alt küme (zarf, skaler sonuç, diffgram tablosu, Fault) küçük.
- **Okuma ve yazmaya ayrı anahtar:** kullanıcı kararı 3b tek anahtar.

## Doğrulanmadı

- Liste metotlarının satır alan adları (VARSAYIM: UPPER_SNAKE; aday adlar `ALANLAR`'da).
- `SetErpOkRed` metodu ve parametre adları; `WorkOrdersStatusList` süzgeç parametreleri (VARSAYIM, brief'ten).
- Logo ile SmartES arasındaki eski doğrudan bağlantının IsErp işaretini kullanıp kullanmadığı (BİLMİYORUM; kullanıyorsa iki taraf aynı kaydı
  "aktarıldı" sayar, biri kaçırır). Bu yüzden anahtar geçiş gününe kadar kapalı kalır.
