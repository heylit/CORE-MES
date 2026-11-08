# ADR 0032 — Yayındaki PDF'in ilk sayfası sunucuda, ayrı süreçte, terminal temasında görüntüye çevrilir

Durum: öneri (kart 2339-S; bağımlılık onayı 2339-3 a, 08.11.2026). ADR 0024 madde 4'ün istediği yeni ayrı süreç ADR'sidir; ADR 0024'ü değiştirmez.

## Bağlam

Terminal, iş paketindeki PDF'i açarken sayfayı pdf.js ile çizer ve her pikseli temaya göre renklendirir (`istemci/src/ortak/cizim/pdf.ts`).
Yavaş tablette bu iş ana iş parçacığını saniyelerce tutar; ekran donar ve Başlat geç yanıt verir (kart 2339 ölçümü,
`meclis/yanit/2339-yazar-olcum.md`). Kullanıcı yönü: görüntü sunucuda tek sefer işlensin, terminal ve uygulama meşgul edilmesin
(`meclis/yanit/2339-CEO-sonuc.md` Ek 2). PDF dışarıdan gelir; güvenilmeyen girdidir. Node'da pdf.js çizimi için tuval kitaplığı gerekir.

## Seçenekler

- **a) Sunucuda ayrı süreç (ADR 0024 kalıbı):** görüntü bir kez üretilir, her tablet hazır alır; bedeli yeni doğrudan bağımlılık ve sunucuda iş, disk.
- **b) Hazırlayanın bilgisayarında üretip pakete yazmak:** sunucuya yük yok; hazırlık uzar, tema ya da ayar değişince paket yeniden hazırlanır.
- **c) Terminal kendisi üretir (bugünkü yol):** bağımlılık yok; donma sürer.

## Karar

1. **Ayrı süreç, aynı depo.** PDF yalnız `sunucu/moduller/arkon/pdf-goruntu/goruntu-sureci.ts`'de çizilir; ana sunucu onu
   `child_process.fork` ile açar ve süreci yalnız `pdf-goruntu/surec.ts` yönetir. Süreç ağa açılmaz, ağa istek atmaz, veritabanına
   bağlanmaz, ana sürecin ortam değişkenlerini almaz (`goruntuOrtami`); girdi PDF baytları ve renk ayarı, çıktı PNG ya da hata (ADR 0024 madde 2).
2. **Sınırlar.** İşler sırayla, birer birer; iş başına süre sınırı, süreç bellek eşiği, dosya boyu sınırı ve PDF başlığı denetimi vardır
   (sayılar `pdf-goruntu/kurallar.ts`). Sınır aşılır ya da süreç düşerse ana süreç onu öldürür, sonraki işte yeniden açar. Hata metni
   kısaltılır; dosya içeriği hataya girmez. pdf.js'te betik değerlendirme ve wasm kapalıdır, sistem yazı tipi okunmaz.
3. **Tek kural, iki yer.** Renklendirme `paylasilan/pdf-renk.ts` `renklendirPiksel` ile hem tarayıcıda hem süreçte aynı işlevle yapılır.
   Görüntünün kimliği `renkImzasi`'dır (algoritma sürümü, tema, görünüş, kalınlaştırma, çözünürlük, mürekkep rengi); algoritma değişirse
   `RENK_SURUMU` artar ve eski görüntü eşleşmez.
4. **Anahtar içerik özeti.** Görüntü kaynak PDF'in sha256 özeti, sayfa ve imza ile saklanır (`arkon_pdf_goruntu`). Revizyon değişince
   özet değişir; eski görüntü yeni revizyona verilmez. Yayında hiçbir pakette kalmayan özetin görüntüleri silinir (`yetimleriSil`).
5. **İş ve uç.** Üretim zamanlayıcı işidir (`arkon/isler.ts` `arkon-pdf-goruntu`, ADR 0010 kalıbı); çizim veritabanı işleminin dışında
   beklenir. Uç `GET /arkon/dosyalar/:ozet/goruntu` dosyanın kendi erişim denetimini kullanır; görüntü yoksa boş cevap döner.
6. **Terminal hazırı tercih eder, yoksa bugünkü yol.** `TeknikResim` önce hazır görüntüyü ister; yoksa, imza tutmazsa ya da sunucu yoksa
   kendisi üretir. Özellik kapanırsa davranış bugünkü yola döner.

## Sonuçlar

- Yeni doğrudan bağımlılık `@napi-rs/canvas` (pdfjs-dist'in isteğe bağlı bağımlılığıydı; hazır derlenmiş, yerel derleme yok).
- Görüntüler veritabanında `bytea` olarak durur: yedek ve WAL büyür. Boyut sayfa çözünürlüğüne bağlıdır; ölçüm kart 2339-S'de.
- Sunucu kendi teması dışında bir mürekkep rengi üretmez; imza tutmayan tablet kendisi üretir.
- Ağ yalıtımı işletim sistemi düzeyinde değildir; kod (dinleyici ve istek yok) ve inceleme ile tutulur (ADR 0024 ile aynı).

## Vazgeçilenler

- **b (hazırlıkta üretmek):** kullanıcı yönünden sapar; yedek yol olarak kayıtta (2339 Ek 2, S').
- **c (yalnız terminal):** donmayı gidermez.
- **worker_threads:** aynı süreçtir; yerel kitaplık çökmesi ana sunucuyu düşürür (ADR 0024 vazgeçilenler).

## Doğrulanmadı

- `@napi-rs/canvas` Windows ikilisinin Windows sunucuda yüklenip çizdiği: kilit dosyasında ve çevrimdışı önbellek listesinde var, Windows'ta denenmedi.
- Gerçek çizimlerde süre, bellek ve görüntü boyu: yalnız sentetik PDF'le Linux'ta ölçüldü.
