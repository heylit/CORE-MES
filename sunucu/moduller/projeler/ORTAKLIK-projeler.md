# Ortaklık: projeler

| Kavram | Bu modülde | Sahibi | Not |
|---|---|---|---|
| proje | `projeler_proje` (id, kod, ad, durum) | projeler | tek sahip; kalite-merkezi NCR'deki serbest "proje" metni Aşama 2'de buraya bağlanır |
| firma (müşteri) | `projeler_proje.firma_id` | finans (`finans_firma.id`) | yabancı anahtar; ad `firmaAdlari` ile okunur |
| satış siparişi | `projeler_proje.siparis_id` | siparisler (`siparisler_siparis.id`) | yabancı anahtar; sipariş `siparisAyrintisi` ile okunur; bağ açılışta kurulur, değişmez |
| para birimi | `projeler_proje.butce_para_birimi` | finans (para birimi ve kur) | üç harfli kod; çeviri proje-maliyette `kurGetir` ile |
| kişi | `olusturan_id`, `guncelleyen_id` | kisiler (`kisi.id`) | yabancı anahtar |
| durum listesi | `projeler_proje.durum` (aktif, tamamlandi, iptal) | projeler | |
| durum listesi (statü) | `projeler_statu` (ad, ton, sira, etkin), `projeler_statu_kaydi`, `projeler_ayar.serbest_statu` | projeler | 907 a; yaşam durumu (`projeler_proje.durum`) ayrı kalır |
| görev | `projeler_gorev` | projeler | 909 a; Mesaj'daki görev ayrı kavramdır; Aşama 2'de Mesaj takvimi bunları `disari.ts` ile okur |
| kilometre taşı | `projeler_kilometre_tasi`, `projeler_kilometre_tasi_taban` | projeler | üretim emrine bağı yok (UYUM-BORCU 7) |
| kişi (sorumlu) | `projeler_gorev.sorumlu_kisi_id`, `projeler_statu_kaydi.kisi_id`, `projeler_kilometre_tasi_taban.kisi_id` | kisiler (`kisi.id`) | yabancı anahtar; ad `kisiAdlari` ile okunur |
| belge no | `projeler_proje.kod` | projeler | Logo PROJECT kodu ile eşleşebilir; üretim emri numarasına girer |
