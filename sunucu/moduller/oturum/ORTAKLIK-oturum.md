# Ortaklık: oturum

Sütunlar `npm run harita -- --modul oturum` çıktısından (DOĞRULANDI, `9b6582f`).

## Tablolar

| Tablo | Sütunlar | Sahibi |
|---|---|---|
| `oturum` | id, anahtar_ozeti, kisi_id -> kisi, acildi, son_gorulme, kapandi?, ip?, tarayici? | oturum |
| `giris_denemesi` | id, kullanici_adi, sonuc, ip?, zaman | oturum |
| `oturum_hesap_kilidi` | id, kullanici_adi, kilitlendi, bitis, acildi?, acan_kisi_id? -> kisi | oturum |
| `oturum_ortak_cihaz` | id, belirtec_ozeti, ad, kaydeden_kisi_id -> kisi, kaydedildi, kapandi?, kapatan_kisi_id? -> kisi | oturum (kart #739) |
| `oturum_cihaz_nabzi` | oturum_id -> oturum, ortak_cihaz_id? -> oturum_ortak_cihaz, ilk, son, istemci_surumu?, kuyruk?, son_esitleme?, js_hata | oturum (kart 1666, 1745 a) |
| `oturum_cihaz_nabzi_gunluk` | gun, oturum_id -> oturum, ortak_cihaz_id? -> oturum_ortak_cihaz, nabiz, azami_kuyruk?, js_hata, istemci_surumu? | oturum (kart 1666) |

## Kavramlar

| Kavram | Tablo ve sütun | Başka modülde | Not |
|---|---|---|---|
| oturum | `oturum` | yok | anahtar saklanmaz, yalnız özeti; kimlik çözümü `kimlikCozucu` (`disari.ts`) çekirdeğe verilir |
| giriş denemesi | `giris_denemesi` | yok | yalnız ekleme; 30 günden eski satır silinebilir |
| hesap kilidi | `oturum_hesap_kilidi` | yok | `kullanici_adi` yabancı anahtar değil (olmayan ad da kilitlenir); açan kişi `acan_kisi_id` -> kisi |
| cihaz nabzı | `oturum_cihaz_nabzi`, `oturum_cihaz_nabzi_gunluk` | izleme paneli (saglik) okur | kişi, adres, konum tutulmaz; 30 gün (1619 a); Arkon kuyruğu Arkon'dan gelecek (ayrı kart) |
| kişi | `oturum.kisi_id` | sahibi kisiler | kişi, kullanıcı adı ve parola doğrulaması kisiler `disari.ts` ile (`girisDogrula`, `kullaniciYukle`, `kendiParolasiniDegistir`) |

`giris_denemesi.kullanici_adi` yabancı anahtar değildir: olmayan adla yapılan deneme de kaydedilir (bilerek; ad var mı ele verilmez).

## Başka modüle bağlar

kisiler (`kisi.id`, `disari.ts`). Yön `oturum -> kisiler` (`araclar/harita.test.ts` pimler).

## Doğal sahibi başka modül olabilecekler

Yok.

## Okunan başka modül

- Personel kartı (1326, 1327 a): sahibi nizamiye (`nizamiye_personel_kart`); oturum yalnız `personelKartSahibi` (`nizamiye/disari.ts`) ile kart sahibini okur, kart tutmaz.
