# Malzemeler: Logo'ya gönderime hazırlık (kart #232), yazım öncesi liste

Taban: güncel ana dal 00349d4 (#308 birleşmiş). Dal `232-malzemeler-logo-hazirlik` "yaz" gelince açılır.
Logo'ya bağlanan kod, dış çağrı, ortam değişkeni ve köprü isteği bu işte yok.

## 1. Şema (yeni göç; satır silinmez ve değişmez)
`malzeme_katalog_karti` tablosuna boş olabilen altı sütun eklenir:
- `logo_kart_turu`
- `logo_birim_seti`
- `logo_kayit_no`: dolu olanlarda kısmi tekil dizin.
- `logo_gonderim_durumu`: adlı kısıt `bekliyor | gonderildi | hata`.
- `logo_gonderim_zamani` (timestamptz)
- `logo_hata`

Ek kısıt: `logo_kayit_no` doluysa durum `gonderildi` olmalı.

Karşılık için yeni tablo `malzeme_logo_karsiligi (cesit 'tur'|'birim', tmi_degeri, logo_degeri boş olabilir)`.
- VARSAYIM: yeni tablo seçildi, çünkü dolu `malzeme_katalog_ayari` tablosunun anahtar kısıtına dokunmaz.
- Değer konmaz; yönetici doldurur.
- Geri alma maliyeti düşük: tablo boştur.

Stok kodu en çok 24 karakter kısıtı: soru 4.
- DOĞRULANDI: geliştirme veritabanında 0 kart var.
- BİLMİYORUM: sunucudaki gerçek verinin sayısı.
- VARSAYIM: eski teknik kodlu kartlarda aşım mümkün. Gerekçe: veritabanı önekin 30 karaktere kadar olmasına izin veriyor (`20261007120000_*`); bugünkü sunucu kuralı ise 17 karakterde kalıyor.

## 2. Kurallar (sunucuda, numaralı; her birine izinli ve reddedilen test)
- MKL-1: Durum yalnız ilk aktiflikte "bekliyor" olur.
  - Koşul: kart ilk kez aktif olduğunda ve durumu boşken (`aktif_oldu` yanlışken). Aynı işlemde, kart tetikleyicisinde yazılır.
  - Taslak ve onaydaki kartta durum boş kalır.
  - Pasiften dönen ya da önceden aktif olmuş kart "bekliyor" olmaz. Neden: Logo'da çift kart açılmasın.
- MKL-2: Logo sütunlarını kart kaydetme yolu yazmaz.
  - Gövdede gelen alanlar yok sayılır (test ediliyor).
  - Yazan tek yer `malzemeLogoSonucu`.
- MKL-3: `logo_kayit_no` dolu kartta stok kodu, tür ve birim değişmez.
  - Birim `kayit.com.birim` alanındadır.
  - Kilit veritabanı tetikleyicisinde; sunucu 422 döner.
  - Bugünkü aktif kilidi yerinde kalır.
- MKL-4: Hazırlık denetimi saf bir işlevdir (`kurallar.ts`). Eksik listesi şu alanlardan oluşur:
  - stok kodu
  - ad (`kayit.com.ad`)
  - birim
  - tür karşılığı
  - birim karşılığı

  Eksik olan kart aktif olabilir; "bekliyor" kalır ve eksikleri görünür.
- MKL-5: `malzemeLogoSonucu` kuralları:
  - Aynı kayıt numarası ikinci karta yazılamaz.
  - "gonderildi" kart yeniden "bekliyor" ya da "hata" olamaz.
  - Durumu boş kart sonuç alamaz.

## 3. disari.ts (yetki denetlemez, çağıranın db'si)
```ts
logoyaGidecekMalzemeler(db: Db, sinir: number): Promise<{
  no: number; stokKodu: string; ad: string | null; birim: string | null; tur: KatalogTuru;
  logoKartTuru: string | null; logoBirimSeti: string | null;   // o anki karşılıktan
  durum: 'bekliyor' | 'hata'; sonHata: string | null; eksikler: LogoEksik[];
}[]>   // bekliyor ve hata, en eski aktiflik önce
malzemeLogoSonucu(db: Db, no: number, sonuc: { kayitNo: string } | { hata: string }): Promise<void>
```

VARSAYIM: `{ kayitNo }` geldiğinde kartın `logo_kart_turu` ve `logo_birim_seti` sütunlarına o anki karşılık yazılır, yani Logo'ya giden değer kaydedilir. Kayıttan sonra karşılık değişirse kart etkilenmez. Geri alma maliyeti: bir göç.

Bu imzalar `NOTLAR.md` ve `ORTAKLIK-malzemeler.md` dosyalarına, modülün kendi belgelerine yazılır.

## 4. Karşılık yazımı
Yeni uç `POST /malzemeler/logo-karsiliklari` yazılır. Yetki için var olan `malzemeler.tanim-yaz` işlemi kullanılır; yeni işlem ve rol satırı yok. Okuma ucu `sayfa.malzemeler` yetkisi ister.

## 5. Ekran (onaysız dokunulmaz; soru 5)
Taslak dosyaları: `taslak-1280.png`, `taslak-360.png`.

## 6. Belgeler
- UYUM-BORCU "Logo alanları":
  - 1-4 maddeleri kapanır.
  - Gönderim, eski kartların eşlenmesi, pasif ve iptal davranışı "bağlantı işinde" diye işaretlenir.
- GUVENLIK-DENETIMI ve KURAL-TEST dosyalarına MKL-1..5 eklenir.
