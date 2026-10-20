# ADR 0014 — Sunucudan kurum içi etiket yazıcısına doğrudan baskı

Durum: kabul (kullanıcı kararları 98 evet, 18.10.2026; 113 evet, 19.10.2026). Modülün önerisi `sunucu/moduller/etiket-merkezi/ADR-ONERISI.md`.

## Bağlam

Kırmızı çizgi "telemetri ve dış servis çağrısı yok" diyor; istisna kurum içi iki servistir: Logo köprüsü (ADR 0011) ve SmartES (ADR 0013).
Atölyedeki etiket yazıcıları (Zebra ağda, Argox USB'de) komutu ağda TCP 9100'den alır. Komut dosyasını indirip elle göndermek atölyede
yavaştır ve yanlış yazıcıya basılmasına yol açar. Kullanıcı kararı 98: Etiket Merkezi ağdaki yazıcıya sunucudan doğrudan bassın.

## Karar

1. **Kurum içi etiket yazıcısı ayrı tutulur.** Sunucunun kurum içindeki yazıcıya TCP 9100 bağlantısı "dış servis çağrısı" sayılmaz.
   İnternete çıkan her çağrı, telemetri ve CDN yasağı aynen sürer.
2. **Yazıcıyla tek modül konuşur.** Yalnız `sunucu/moduller/etiket-merkezi/gonderici.ts` (`node:net`) yazıcıya bağlanır; başka modül
   `disari.ts` üzerinden de gönderemez.
3. **Adres aralığı yalnız ortam değişkenindedir** (`TMIV2_ETIKET_YAZICI_AGI`, CIDR listesi). Aralık yalnız kurum içi bloklarda olabilir
   (10/8, 172.16/12, 192.168/16, 127/8, fc00::/7, fe80::/10); değilse sunucu açılmaz ve hata değeri yazmaz (`ag.ts`).
4. **Adres yazıcı tanımındaki tek IP'dir, ad çözülmez.** Tanım da her gönderim de aralıkla sınanır. Kapı sabit 9100 (`YAZICI_KAPISI`).
   Bağlantı tek yönlüdür, 5 sn süre sınırı vardır, cevap okunmaz.
5. **Bağlantı varsayılan kapalıdır.** Gönderim ancak değişken tanımlıyken VE Sistem Ayarları'ndaki `etiket-merkezi.dogrudan-baski`
   açıkken çıkar; değilse reddedilir. Komut dosyasını indirme yolu her durumda açıktır.
6. **Her gönderim yalnız eklenen deftere yazılır** (`etiket_merkezi_baski`, `yalniz_ekleme` tetikleyicisi): kişi, yazıcı, şablon, adet,
   sonuç. Hata metni yazıcı adresini taşımaz.

## Kırmızı çizgi metni

> İstisnalar kurum içi üç servistir: Logo köprüsü (ADR 0011, yalnız `logo` modülü), SmartES (ADR 0013, yalnız `smartes` modülü) ve etiket
> yazıcısı (ADR 0014, yalnız `etiket-merkezi` modülü, yalnız TCP 9100, yalnız `TMIV2_ETIKET_YAZICI_AGI` aralığı).

## Sonuçlar

- Atölye ağındaki yazıcıya tek tuşla baskı. Bedeli sunucudan iç ağa yeni bir çıkış yoludur; sınırı modülün testleri tutar (aralık dışı,
  değişken yok, ad verilmiş, ayar kapalı, ulaşılamayan yazıcı).
- USB'deki yazıcıya (Argox) sunucudan baskı yoktur; komut dosyası indirilir.

## Vazgeçilenler

- **Yazıcı sürücüsü ya da baskı sunucusu (CUPS, Windows kuyruğu):** ikinci kurulum ve yeni bağımlılık.
- **Ad ile adres:** DNS çözümü aralık denetimini aşmanın yolu olur.
