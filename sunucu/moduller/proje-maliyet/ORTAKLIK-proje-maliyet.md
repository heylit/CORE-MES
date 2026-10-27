# Ortaklık (proje-maliyet)

Tabloları `proje_maliyet_defteri` (199 a; proje_id, is_emri_id, plan, gercek, ucretler, adet, saglam, bitis, dondurma, donduran_id), `proje_maliyet_taban` (936 a; proje_id, sira, plan, kalemler, eksik_kalemler, is_emri_sayisi, gerekce, kisi_id, an) ve `proje_maliyet_masraf` (940 c; proje_id, finans_belge_id, gorev_id, kisi_id, an); yabancı anahtarla projeler_proje, projeler_gorev (gorev_id, proje_id), uretim_emirleri_is_emri, finans_belge ve kisi'ye bağlıdır. Öbür kavramlar başka modülün `disari.ts` okumasıdır.

| Kavram | Sahibi | Okunan | Durum |
|---|---|---|---|
| proje, projenin siparişi, bütçe (198 a) | projeler | `projeGetir` (bütçe alanı bekleniyor) | var / istek |
| sipariş tutarı, termin, para birimi, ceza | siparisler | `siparisAyrintisi` | var |
| kur | finans | `kurGetir` | var |
| istasyon, kişi, malzeme birim maliyeti | finans | `birimMaliyetleri` | var, bağlanmadı |
| projenin iş emirleri, süreler, katılım | uretim-emirleri | `projeninIsEmirleri`, `isEmriSureleri` | istek |
| iş emri başına fason tutarı | satin-alma | `isEmriFasonTutarlari` | istek |
| emre malzeme sarfı | stok | `emrinAkisHareketleri` | var, bağlanmadı |
| kâr riski günlük oranı | plan | `planAyariOku` (6b) | istek |
| üretim dışı gider belgesi (no, tarih, tür, KDV hariç TL tutar, durum) | finans | `giderBelgeleri`, `giderBelgesiSecenekleri` | var (940 c) |
| proje görevi (bağın görevi) | projeler | yabancı anahtar; ad ekranda `GET /projeler/:id/yonetim` ile | var |
| kişi (tabanı alan, masrafı bağlayan) | kisiler | `kisiAdlari` | var |
