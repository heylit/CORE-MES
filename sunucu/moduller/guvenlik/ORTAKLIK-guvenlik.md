# Ortaklık: guvenlik

Modülün kendi tabloları: `guvenlik_alarmi`, `guvenlik_taramasi`, `guvenlik_tarama_durumu`. Başka modülde de olabilecek kavramlar:

| Kavram | Bu modülde | Sahibi | Nasıl okunur |
|---|---|---|---|
| kişi | `guvenlik_alarmi.kisi_id`, `onaylayan_kisi_id`, `kapatan_kisi_id` (FK `kisi`) | kisiler | `kisiAdlari` (`disari.ts`) |
| kullanıcı adı | `guvenlik_alarmi.kullanici_adi` (giriş denemesindeki ad; kişiye bağlanmaz) | oturum (`giris_denemesi.kullanici_adi`) | `girisDenemeleriniOzetle`, `girisDenemeleriListesi` |
| cihaz adresi (IP) | `guvenlik_alarmi.ip` | oturum (`giris_denemesi.ip`) | aynı |
| oturum | tutulmaz; sayı alarmda `gozlenen_sayi` | oturum (`oturum`) | `acikOturumlar`, `acikOturumlariSay`, `oturumuKapat` |
| hesap kilidi | tutulmaz; alarm kaynağı `kullanici_adi` | oturum (`oturum_hesap_kilidi`) | `etkinHesapKilitleri`, `etkinHesapKilidiSay`, `sonHesapKilitleri`, `hesapKilidiniKaldir` |
| ayar | `guvenlik.vpn-adres-araligi` | ayarlar (değer), guvenlik (tanım) | `sistemAyariOku` |
| denetim kaydı | tutulmaz | denetim | `/denetim` sayfasına bağlantı |
| durum listesi | `guvenlik_alarmi.durum` (acik, onaylandi, kapandi) | guvenlik | |
| önem listesi | `guvenlik_alarmi.onem` (kritik, yuksek, orta) | guvenlik | |
| reddedilen istek | `guvenlik_red_olayi` (zaman, neden, kisi_id, yontem, yol, ip) | guvenlik (olayı çekirdek üretir) | çekirdek `retOlaylariniBosalt` |
| kişi | `guvenlik_red_olayi.kisi_id` | kisiler | `kisiAdlari` |
| bildirim | tutulmaz; `guvenlik.kritik-alarm` türü | bildirim | `bildirimGonder` |
