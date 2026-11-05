# ORTAKLIK: bildirim

| Kavram | Tablo ve sütun | Sahibi | Not |
|---|---|---|---|
| Kişi | `bildirim_kaydi.kisi_id`, `bildirim_tercihi.kisi_id` -> `kisi.id` | kisiler | yabancı anahtar; alıcı listesi `kisiler/disari.ts` `kisilerinIslemleri` |
| İşlem (alıcı kuralı) | (tablo yok) | kisiler / paylasilan | olay türünün `alanIslemler` listesi, `paylasilan/sozlesme/bildirim.ts` |
| Olay türü | `bildirim_kaydi.tur`, `bildirim_tercihi.tur` | bildirim (katalog); olayı üreten modül tetikler | Faz 1: dört tür, kodda |
| Önem | `bildirim_kaydi.onem` (bilgi, uyari, acil) | bildirim | |
| Kaynak kayıt | `bildirim_kaydi.kaynak_modul`, `tekil_anahtar` (tür + kaynak kimliği), `yol` | olayı üreten modül | yabancı anahtar yok: kaynak her modülde ayrı |
| Bildirim kaydı, okundu, arşiv | `bildirim_kaydi` | bildirim | yalnız bu modülde |
| Kanal tercihi | `bildirim_tercihi` (mesaj, eposta) | bildirim | Mesaj (Faz 4) ve e-posta (Faz 3) gelince okunur |
| E-posta adresi | (tablo yok) | ik (iş e-postası) | Faz 3; bu aşamada okunmaz |
| Rol (çağrı alıcısı) | `bildirim_cagri_alicisi.rol_id` -> `rol.id` | kisiler | yabancı anahtar, rol silinince satır düşer; kişiler `kisiler/disari.ts` `rollerdekiKisiler` ile |
| Çağrı ekibi | `bildirim_cagri_ekibi.ekip`, `bildirim_cagri_alicisi.ekip` | durus-nedenleri sözleşmesi (`CAGRI_EKIPLERI`) | aynı liste `durus_nedeni.cagri_ekibi` kısıtında; Arkon `CALLS` listesi Arkon'da |
| Değiştiren kişi | `bildirim_cagri_ekibi.degistiren_kisi_id` -> `kisi.id` | kisiler | |
| Elle yayın (2147) | `bildirim_yayini`, `bildirim_yayin_hedefi`; `bildirim_kaydi.yayin_id`, `ortada`, `onay_istenir`, `onaylandi` | bildirim | yazan ve geri çeken `kisi.id` yabancı anahtar |
| Yayın hedefi | `bildirim_yayin_hedefi.hedef_id` (rol, istasyon ya da kişi kimliği; `hedef_turu`) | kisiler (rol, kişi), istasyonlar (istasyon) | çok tablolu olduğundan yabancı anahtar yok; yayın anında sahibinin okumasıyla sınanır |
| İstasyon ataması (yayın alıcısı) | (tablo yok) | istasyonlar | kablolama ile `aktifIstasyonlar`, `istasyondakiKisiler` (ters bağ, döngü yok) |
| Yayın görseli | dosya bağı `bildirim` / `yayin:<id>`; `bildirim_yayini.gorsel_ozet` | dosya | yerel disk deposu |
| Tür gösterimi değiştiren | `bildirim_tur_gosterimi.degistiren_kisi_id` | kisiler | `kisi.id` yabancı anahtar |
