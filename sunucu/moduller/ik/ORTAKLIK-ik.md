# Ortaklık: ik

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261012134600_ik_tablolar.sql`,
`sunucu/gocler/20261012134610_ik_bordro_onayi.sql`, `paylasilan/sozlesme/ik.ts`. Yazıldığı yer: oturtma (kart #740); teslimde yoktu.

## Kavramlar
| Kavram | Modül ne tutuyor | Tablo ve sütun | Başka modülde | Bağ |
|---|---|---|---|---|
| Kişi (TMI hesabı) | personelin TMI kullanıcısı; kaydı yazan ve onaylayan | `ik_personel.kisi_id`, `*_kisi_id`, `ik_bordro_onayi.kisi_id` | kisiler (`kisi`) | yabancı anahtar `kisi (id)`; ad `kisiler/disari.ts kisiAdlari` |
| Personel (özlük) | ad, soyad, kimlik, iletişim, sözleşme, ücret, banka | `ik_personel` | kisiler `kisi.ad`, `kisi.sicil_no`, `kisi.gorev`, `kisi.ozluk_cikis_tarihi` | 1302 a: kişi = hesap (kisiler), özlük = ik; bağlı kişiye ad + soyad, sicil no, pozisyon ve çıkış İK'dan itilir (IK-84), Kişiler'de salt okunur |
| Sicil no | personel sicil no | `ik_personel.sicil_no` | `kisi.sicil_no` | aynı kavram; tek kaynak Aşama 2'de |
| İş merkezi | kaydın veri kapsamı | `ik_personel.is_merkezi_id`, `ik_pozisyon.is_merkezi_id` | istasyonlar (`is_merkezi`) | yabancı anahtar `is_merkezi (id)`; doğru yön |
| Departman | ad, kod, gider hesabı, yönetici | `ik_departman` | yok (`kisi.gorev` serbest metin) | yalnız ik |
| Pozisyon, kadro | başlık, departman, ilan | `ik_pozisyon`, `ik_pozisyon_yayini` | yok | yalnız ik |
| Resmi tatil | tarih, ad | `ik_resmi_tatil`, `ik_genel_ayar` tatiller | vardiya (okur) | sahibi İK (soru 142 b); Vardiya takvimi `disari.resmiTatilGunleri` ile okur, kendi kopyasını tutmaz |
| Devam, fazla mesai, devamsızlık | personel, tarih, tür, saat, onay | `ik_devam` | vardiya (günlük mesai sayfası), Arkon operatör günlüğü | vardiyanın ORTAKLIK'ı "mesai: yok"; sahiplik sorulacak |
| Giriş-çıkış (gerçekleşen çalışma) | personel x gün durum, giriş, çıkış saati (kart #1571) | `ik_puantaj` | vardiya (beklenen saatler, planlı fazla mesai), Arkon operatör günlüğü, terminal oturumları | sahibi ik (kullanıcı kararı 16.10.2026); vardiya planı `kablolama.ts` ters bağıyla okunur |
| İzin | tür, tarih aralığı, gün, durum | `ik_izin` | vardiya takvimi (planda kullanılabilirlik) | Aşama 2'de plan ve vardiya okur |
| Zimmet | tutmaz (244 a: sahibi idari-isler; `ik_zimmet` 20261019120000 ile kalktı) | — | idari-isler (`idari_isler_zimmet`) | IK-74 açık zimmeti `kablolama.ts` ters bağıyla okur |
| Eğitim | ad, kurum, süre, maliyet, geçerlilik | `ik_egitim`, `ik_egitim_katilimcisi` | kalite (yetkinlik) olabilir | yalnız ik |
| Para birimi ve tutar | ücret, bordro, maliyet (TL varsayılır) | `*_maas`, `ik_bordro.*` `numeric(14,2)` | finans (para birimi, kur) | para birimi sütunu yok; TL varsayılır (VARSAYIM) |
| Muhasebe hesap kodu | gider, personel, vergi, SGK hesapları | `ik_genel_ayar.hesap_*`, `ik_departman.gider_hesabi` | finans, Logo | Logo köprüsü alanı; bağlama Aşama 2 |
| Firma (şirket adı) | bordro başlığındaki şirket adı | `ik_genel_ayar.sirket` | finans (`finans_firma`), ayarlar (sistem adı) | serbest metin |
| Durum listeleri | izin türü, devam türü, sözleşme türü, cinsiyet, eğitim | CHECK kısıtları | yok | modül içi |
| Rol ve işlem | `ik.*` işlemleri, `sayfa.ik`, `sayfa.ik-islemlerim` | `paylasilan/islemler/ik.ts` | kisiler (`rol_islemi`) | rol dağılımı çekirdek isteği (CEKIRDEK-ISTEKLERI madde 3) |
