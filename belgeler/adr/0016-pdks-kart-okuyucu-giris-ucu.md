# ADR 0016 — Kart okuyucunun PDKS hareketini oturumsuz uçla göndermesi

Durum: kabul (kullanıcı kararı 289 b, 20.10.2026: "289 b, PDKS cihaz giriş ucu (oturumsuz) ve ADR onaylı, cihaz: bilmiyorum").
Kapsam: `POST /nizamiye/pdks/cihaz-hareketi` ve bu belge; kapı mevcut yol. Ayrı dinleyici, çekirdek değişikliği ve dolu tablo göçü kapsam dışıdır.

## Bağlam

PDKS hareketleri bugün dosyayla elle yükleniyor (243 a, 259 a). Kullanıcı kart okuyucunun veriyi doğrudan TMI'ye yazmasını istedi
("kart okuyucu cihazı direkt bize yazıcak veriyi"). Cihazın markası ve protokolü bilinmiyor. Taslak ve karşılaştırılan yollar:
`/mnt/project-files/inceleme/nizamiye/pdks-otomatik-okuma-adr-taslagi.md` (klasör, kart yazılımının veritabanı, cihazdan çekme, cihazın göndermesi).

## Karar

1. **Oturumsuz tek uç.** Kart okuyucu `POST /api/nizamiye/pdks/cihaz-hareketi` ucuna gönderir (`yetki: 'acik'`). Başka oturumsuz uç açılmaz;
   uç yalnız PDKS hareketi alır, kişi açmaz, sicil değiştirmez, başka modüle yazmaz. TMI dışarıya istek atmaz; dış servis çağrısı yasağı aynen sürer.
2. **Kapı mevcut yoldur.** Cihaz `443 (kurum ters vekili) -> 4101 -> 4100` yolundan gelir (`kurulum/canli.md`). Yeni port açılmaz, sunucu
   dinleme adresi değişmez. Cihazın adresi vekilin `X-Forwarded-For` başlığından, yalnız güvenilen vekil için okunur (`uygulama.ts`).
   Cihaz HTTPS ve kurum kök sertifikasını desteklemiyorsa ayrı dinleyici ayrı karardır (çekirdek değişikliği, kırmızı çizgi).
3. **Ağ izin listesi.** İstek yalnız `TMIV2_PDKS_CIHAZ_AGI` ortam değişkenindeki aralıktan kabul edilir. Aralık yalnız kurum içi bloklardadır
   (10/8, 172.16/12, 192.168/16, fc00::/7, fe80::/10); döngü adresi bilerek yoktur, çünkü vekil adresini bildirmeyen istek 127.0.0.1'den görünür.
   Değişken boşsa hiçbir istek kabul edilmez; geçersiz ya da kurum dışı değer açılışta durdurur (`nizamiye/ag.ts`).
4. **Cihaz başına kayıt ve anahtar.** Her kart okuyucu adıyla ve tek IP adresiyle kaydedilir; istek o adresten gelmelidir. Anahtar 32 rastgele
   bayttır, açılışta ve yenilemede bir kez gösterilir, yalnız scrypt özeti saklanır, sabit süreli karşılaştırılır (`nizamiye/anahtar.ts`).
   Kayıtsız adres de aynı süreyi harcar. Anahtarsız cihaz kabul edilmez. Kaydı PDKS aktarma işlemi (`nizamiye.pdks-aktar`) yönetir.
5. **Tekrar gönderime karşı koruma.** Hareket kişi, zaman ve yönle tektir; dosyadan gelmiş hareket kart okuyucudan ikinci kez yazılmaz.
   Sunucu saatinden 5 dakika ileri ya da 24 saatten eski satır alınmaz, hata sayılır. İmzalı istek ve sıra numarası cihaz destekliyorsa marka ile gelir.
6. **Oran sınırı.** Adres başına dakikada 60 istek (429). Art arda 5 kimlik hatasından sonra adres bir dakika bekletilir, her yeni hatada
   süre ikiye katlanır, bir saatte durur; başarı sıfırlar. Sayaç bellekte, adres sayısı sınırlıdır; sunucu yeniden açılınca sıfırlanır.
   Gövde 400 000 karakterle sınırlıdır.
7. **Ham kaydın saklanması.** Kimliği doğrulanmış her gönderim `nizamiye_pdks_gonderim` satırıdır (yalnız ekleme). Ham gövde
   `nizamiye_pdks_gonderim_ham` tablosunda olduğu gibi saklanır; ayrıştırıcı düzelince yeniden işlenebilir. Saklama süresi
   `TMIV2_PDKS_HAM_SAKLAMA_GUN` (varsayılan 365, 30-3650); süresi dolan ham gövdeyi zamanlanmış iş siler, 30 günden yenisini veritabanı silmez.
   Kimliği doğrulanamayan istek veritabanına yazılmaz: tablo dışarıdan şişirilemez. Gövde denetim kaydına gizli işaretle girer (sicil ve saat taşır).
8. **Varsayılan kapalı.** Sistem Ayarları'nda "Kart okuyucudan PDKS kaydı" (`nizamiye.pdks-cihaz-girisi`) kapalıyken uç hiçbir şey yazmaz.
9. **Kişisiz yazım, ayrı tablolar.** Arka plan yazımının kişisi yoktur (ADR 0010 karar 7). Dosya aktarımının tablolarına dokunulmaz;
   kart okuyucunun hareketi `nizamiye_pdks_cihaz_hareket` tablosundadır, acil durum listesi iki tabloyu birlikte okur.
10. **Elle yükleme kalır.** Cihaz ya da bağlantı düşerse İK dosyayı yine aktarır.

## Açık borç

- **Markaya özel ayrıştırıcı yok.** Cihazın markası ve modeli bilinmiyor ("cihaz: bilmiyorum"). Gövde şimdilik `{ anahtar, ham }` JSON'udur ve
  `ham` dosya biçiminin başlıksız satırlarıdır (`PDKS_BICIMI`, VARSAYIM). Marka gelince yalnız `kurallar.ts` `pdksCihazGovdesiniCoz` ve
  gerekirse uç gövdesi değişir. Cihaz anahtarı başlıkta gönderiyorsa uçta başlık okuma çekirdek isteğidir (`IstekBilgisi` başlık vermiyor).
- Kart okuyucu kayıt ekranı istemcide yok; bu PR yalnız sunucu.

## Vazgeçilenler

- **Ayrı dinleyici (D1-b):** çekirdek ve kırmızı çizgi değişikliği; cihaz HTTPS yapamazsa ayrıca sorulur.
- **Dosya aktarım tablosuna kaynak sütunu:** dolu tablo göçü; kapsam dışında.
- **Kimliği doğrulanamayan isteği yazmak:** dışarıdan şişirilebilir; yalnız bellekteki kapı sayacında sayılır.
