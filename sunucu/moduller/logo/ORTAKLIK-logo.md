# Ortaklık: logo

| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Malzeme | kart no ve gönderim izi | `logo_giden.belge_no` (`belge_turu = 'malzeme'`; hizmet kartı `belge_turu = 'hizmet'`, aynı kart no) | sahibi malzemeler (`malzeme_katalog_karti.no`); yabancı anahtar yok (UYUM-BORCU 6) |
| Logo kayıt numarası | son başarılı gönderimin numarası | `logo_giden.logo_kayit_no` | asıl kayıt malzemelerde (`malzeme_katalog_karti.logo_kayit_no`) |
| Belge durumu | deneme sonucu (gonderildi, zaten-vardi, reddedildi, yetkisiz, ulasilamadi, belirsiz, yazilamadi) | `logo_giden.son_sonuc` | kartın Logo durumu (bekliyor, gonderildi, hata) malzemelerde |
| Logo kart türü | tutmaz; gönderirken malzemelerin karşılığını okur | `malzeme_logo_karsiligi` (malzemeler) | sabit tür listesi `kurallar.ts` `LOGO_KART_TURLERI` |
| Logo birim seti | izinli birim seti listesi (köprüden ve elle) | `logo_birim_seti.kod`, `ad`, `elle`, `kopru_listesinde`; `logo_birim_seti_okuma` | karşılık malzemelerde (`malzeme_logo_karsiligi`); birim kavramının sahibi malzemeler |
| Satın alma siparişi | sipariş kimliği ve gönderim izi | `logo_giden.belge_no` (`belge_turu = 'siparis'`, iptal `'siparis-iptal'`) | sahibi satın alma (`satin_alma_siparis.id`, istek); Logo kayıt no ve satır ref'i satın almada |
| Firma (cari) | tutmaz; Logo cari kodunu gönderirken okur | `finans/disari.ts` `firmaOzeti().logoCariKodu` | sahibi finans (`finans_firma.logo_cari_kodu`) |
| Para birimi | Logo döviz türü eşlemesi (USD 1, EUR 20) | `kurallar.ts` `LOGO_DOVIZ_TURLERI` | para biriminin sahibi finans (bugün satın almada) |
| Kişi | elle ekleyen | `logo_birim_seti.ekleyen_kisi_id` | sahibi kisiler (yabancı anahtar `kisi`) |
| Malzeme (Logo kartı) | Logo malzeme kartlarının aynası (kod, ad, açıklama, kart türü, birim seti, aktif) | `logo_malzeme_karti` | sahibi malzemeler (2116-1 a); ayna TMI kartı değildir |
| Malzeme kodu eşlemesi | TMI stok kodu -> Logo kodu (2116-3 c) | `logo_malzeme_eslemesi.stok_kodu`, `logo_kodu` | TMI kodu malzemelerde (`malzeme_katalog_karti.stok_kodu`); yabancı anahtar yok |
| Stok miktarı (Logo) | malzeme ve Logo ambarı başına eldeki miktar | `logo_stok_toplami` | sahibi stok (2116-1 a); yalnız karşılaştırma ve açılış devri |
| Depo (Logo ambarı) | ambar no | `logo_stok_toplami.ambar_no` | depo sahibi stok; ambar adı `logo_ambar` |
| Firma (Logo cari) | tutmaz; aramada okunur, saklanmaz | `logoCariAra`, `logoCariOku` | sahibi müşteri-tedarikçi (2118) |
