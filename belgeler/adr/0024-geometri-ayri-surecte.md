# ADR 0024 — Güvenilmeyen geometri dosyası ayrı süreçte işlenir

Durum: kabul (kullanıcı kararları 1427 a ve 1428 a + teyit, 31.10.2026; ADR yazımı 1500-j; metin onayı 1524, 01.11.2026 karar kartı).
ADR 0001 karar 1'in "tek süreç" hükmüne istisnadır; ADR 0001'in kalanı sürer.

## Bağlam

STEP ve IGES dosyaları dışarıdan gelir; güvenilmeyen girdidir. Okuyucu (OCCT, WebAssembly) ölçümde 686 MB bellek ve 7 sn yükleme
aldı; ana süreçte çöker ya da asılırsa bütün uygulama durur. PMI için daha büyük bir OCCT paketi gerekecek (1428 a; paket onayı
Aşama 2a denemesinden sonra).

## Karar

1. **Ayrı süreç, aynı depo.** Geometri dosyası yalnız `sunucu/moduller/geometri/hesap-sureci.ts`'de okunur; ana sunucu onu
   `child_process.fork` ile açar ve süreci yalnız `geometri/surec.ts` yönetir. Ayrı servis, konteyner ya da port yoktur; dış servis sayılmaz.
2. **Yalıtım.** Hesap süreci ağa açılmaz, ağa istek atmaz, veritabanına bağlanmaz ve ana sürecin ortam değişkenlerini almaz. Girdi ve
   çıktı yalnız IPC'dir: dosya baytları girer, ölçü ya da hata çıkar. İş kuyruğu ve sonuçlar ana süreçte, geometri modülünün tablolarındadır.
   Ana süreç kapanınca hesap süreci de kapanır.
3. **Sınırlar.** İşler sırayla, birer birer verilir; iş başına süre sınırı, süreç bellek eşiği, dosya boyu sınırı ve biçim başlığı
   denetimi vardır (sayılar `geometri/kurallar.ts`'de). Sınır aşılır ya da süreç düşerse ana süreç onu öldürür ve sonraki işte yeniden
   açar; ana sunucu çalışmayı sürdürür. Hata metni kısaltılır; dosya içeriği hataya girmez.
4. **PMI ve ağır geometri yalnız sunucuda.** PMI okuma ve sonraki ağır geometri hesapları aynı kalıpla ayrı süreçte koşar; tarayıcı
   tam OCCT çalıştırmaz, yalnız görüntüler. Güvenilmeyen girdi işleyen yeni bir ayrı süreç yeni ADR ister (1536 a); güvenilir
   girdiyle sistem aracı çağıran alt süreçler (yedek, sağlık, olay günlüğü) bu ADR'nin kapsamı dışındadır.

## Sonuçlar

- Kod karar 1 ve 3'ü taşır (`surec.ts`, `hesap-sureci.ts`, `GUVENLIK-DENETIMI.md`; 120 sn, 2 GB, 200 MB).
- Karar 2'nin ortam değişkeni kısmını kod kart 1528 ile uygular (`surec.ts` `hesapOrtami`, testler `G-O1`, `G-O2`).
- Ağ yalıtımı işletim sistemi düzeyinde değildir; kod (dinleyici ve istek yok) ve inceleme ile tutulur.

## Vazgeçilenler

- **worker_threads (1427 b):** aynı süreçtir; yerel bellek tükenmesi ya da çökme ana sunucuyu da düşürebilir.
- **Ayrı konteyner ya da HTTP servisi (1427 c):** port açar, kırmızı çizgi yorumu ve kurulum yükü getirir.
- **Tarayıcıda tam OCCT:** büyük paket ve istemci belleği; sonucu sunucu doğrulayamaz.

## Doğrulanmadı

- PMI paketinin (libcascade 3.1.0) aynı süreç kalıbında PMI okuduğu: Aşama 2a denemesi yapılmadı.
