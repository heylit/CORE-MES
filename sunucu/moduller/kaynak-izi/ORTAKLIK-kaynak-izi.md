# ORTAKLIK: kaynak-izi

Modül hiçbir kavramı tutmaz; tablosu yoktur (çakışma taraması: /mnt/project-files/raporlar/ana-veri/B2-KAYNAK-IZI-TARAMA.md). Okuduğu kavramlar ve sahipleri:

| Kavram | Sahip modül | Okunan işlev (disari.ts) | Tablo |
|---|---|---|---|
| İş merkezi, istasyon, makine | istasyonlar | `isMerkezleri`, `istasyonlar`, `istasyonGetir`, `makineler`, `makineGetir` | `is_merkezi`, `istasyon`, `makine` |
| Atama (istasyon, makine; yüzde) | istasyonlar | `istasyonKisiAtamalari`, `makineKisiAtamalari` | `istasyon_kisi`, `makine_kisi` |
| Çalışma yetkinliği (istasyon, makine) | istasyonlar | `istasyonYetkinlikleri`, `makineYetkinlikleri` | `istasyonlar_yetkinlik`, `istasyonlar_makine_yetkinlik` |
| Makine durumu (anlık; 1323 a) | istasyonlar | `makineDurumlari` | `istasyonlar_makine_durumu` |
| Kişi (ad, sicil, görev, aktiflik) | kisiler | `kisiAdlari`, `kisiSecenekleri`, `kisiGorevi` | `kisi` |
| Vardiya | vardiya | `kisiVardiyalari`, `vardiyaTanimlari` | `vardiya_kisi`, `vardiya` |
| İzin (bugün) | ik | `izinliKisiler` | `ik_izin` |
| Kişinin iş emirleri | uretim-emirleri | `kisininIsEmirleri` | sayım ve katılım |
| OEE | oee | `istasyonOeeleri` | yok (hesap) |
| Saat maliyeti | finans | `birimMaliyetleri` | `finans_istasyon_maliyet`, `finans_kisi_maliyet` |
| Bakım ve arıza geçmişi (1323 a) | arkon | yok: istek BASKA-MODUL-ISTEKLERI madde 1 | `arkon_belge` |
| Plan yükü | plan | yok: istek madde 2 | plan yerleşimleri |
