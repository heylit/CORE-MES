---
name: goc-yaz
description: Veritabanı şemasını değiştiren yeni bir göç dosyası yazarken kullan (tablo, sütun, kısıt, dizin).
---

# Göç yaz

Örnek kaynağı: `sunucu/gocler/20261005120000_kisiler.sql` ve
`sunucu/gocler/20261005120200_denetim.sql`.

## Kurallar

- Şema değişikliği kullanıcı onayı ister. Onay yoksa yazma.
- Uygulanmış göç değişmez (özeti denetlenir). Düzeltme her zaman YENİ dosyadır.
- Dosya adı: `<YYYYAAGGSSDDSS>_<modul>_<konu>.sql`. Zaman damgası yazdığın andır; modül adı
  adda durur. İki dal aynı anda göç eklese de adlar çakışmaz. Uygulanmış son göçten eski damgalı
  yeni göç reddedilir: birleştirmeden önce dosyayı şimdiki damgayla yeniden adlandır.
- Göç yalnız sahibi modülün tablolarına dokunur. Başka modülün tablosuna yalnız yabancı
  anahtarla bağlanılır.
- Tablo düşüren göç, düşürdüğü HER tablonun boş olduğunu denetler; boş değilse açık iletiyle durur (`RAISE EXCEPTION`).
- Sunucu göç koşmaz; bekleyen göç varsa açılmaz. Uygulama: `npm run goc`.

## Adımlar

1. Dosyayı aç; başına tek satır "neden" yorumu.
2. Kuralı kısıta çevir: `NOT NULL`, `CHECK`, `UNIQUE`, `REFERENCES`. Adlandırılmış kısıt testte
   adıyla yakalanır.
3. Zaman `timestamptz` (`timestamp` yok: saat dilimsiz değer zaman şemasından geçmez), tarih `date`. Para ve ölçü için `numeric` (metin döner); `float` yok.
   Zaman sütununa `infinity` yazılmaz ("süresiz" `NULL` ile söylenir): zaman şemasından geçmez. Sayfalı listede sıralanan ya da süzülen sütuna dizin: sıralama `(<sütun>, id)` biçiminde (ikincil anahtar kimliktir; düz dizin iki yönde
   kullanılır). Küçük tanım tablosuna dizin yazma; dizin de şema değişikliğidir, onay ister.
4. İki kişinin düzenleyebildiği kayıt: `surum integer NOT NULL DEFAULT 1`. Tetikleyici yazma; sürümü modülün
   koşullu yazması artırır (`SET ..., surum = surum + 1 WHERE id = $1 AND surum = $2`). Kaydı değiştiren her yazma
   (alt tablosunu yeniden yazan ve durum değiştiren dahil) ana satırın sürümünü artırır. Var olan tabloya sonradan
   eklenirse eski satırlar 1 ile başlar.
5. Yalnız eklenen defterler için `yalniz_ekleme()` tetikleyicisini bağla.
6. Test: `testVeritabaniKur` bütün göçleri boş şemaya uygular; kısıtı ihlal eden satırın
   reddedildiğini ve geçerli satırın kabul edildiğini birlikte sına.

## Örnek

```sql
-- Kişi tek kayıttır: giriş bilgisi olan kişi kullanıcıdır, olmayan yalnız personeldir.
CREATE TABLE kisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  aktif boolean NOT NULL DEFAULT true,
  rol_id int REFERENCES rol,
  kullanici_adi text CHECK (kullanici_adi ~ '^[a-z0-9._-]{3,40}$'),
  parola_ozeti text,
  CONSTRAINT kisi_giris_butun CHECK ((kullanici_adi IS NULL) = (parola_ozeti IS NULL))
);
```

## Dikkat

- Göçe gerçek veri, müşteri adı, parça no girmez. Başlangıç verisi yalnız sistemin kendi
  sabitleridir (yerleşik roller gibi).
- Veri taşıyan ya da sütun silen göç geri alınamaz: kullanıcıya ayrıca sor.
