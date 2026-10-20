# Ortaklık: oturum

Sütunlar `npm run harita -- --modul oturum` çıktısından (DOĞRULANDI, `9b6582f`).

## Tablolar

| Tablo | Sütunlar | Sahibi |
|---|---|---|
| `oturum` | id, anahtar_ozeti, kisi_id -> kisi, acildi, son_gorulme, kapandi? | oturum |
| `giris_denemesi` | id, kullanici_adi, sonuc, ip?, zaman | oturum |
| `oturum_hesap_kilidi` | id, kullanici_adi, kilitlendi, bitis, acildi?, acan_kisi_id? -> kisi | oturum |

## Kavramlar

| Kavram | Tablo ve sütun | Başka modülde | Not |
|---|---|---|---|
| oturum | `oturum` | yok | anahtar saklanmaz, yalnız özeti; kimlik çözümü `kimlikCozucu` (`disari.ts`) çekirdeğe verilir |
| giriş denemesi | `giris_denemesi` | yok | yalnız ekleme; 30 günden eski satır silinebilir |
| hesap kilidi | `oturum_hesap_kilidi` | yok | `kullanici_adi` yabancı anahtar değil (olmayan ad da kilitlenir); açan kişi `acan_kisi_id` -> kisi |
| kişi | `oturum.kisi_id` | sahibi kisiler | kişi, kullanıcı adı ve parola doğrulaması kisiler `disari.ts` ile (`girisDogrula`, `kullaniciYukle`, `kendiParolasiniDegistir`) |

`giris_denemesi.kullanici_adi` yabancı anahtar değildir: olmayan adla yapılan deneme de kaydedilir (bilerek; ad var mı ele verilmez).

## Başka modüle bağlar

kisiler (`kisi.id`, `disari.ts`). Yön `oturum -> kisiler` (`araclar/harita.test.ts` pimler).

## Doğal sahibi başka modül olabilecekler

Yok.
