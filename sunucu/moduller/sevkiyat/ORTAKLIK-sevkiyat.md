# Ortaklık: sevkiyat

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261011200500_sevkiyat_tablolar.sql`,
`sunucu/gocler/20261011200600_sevkiyat_is_durumu.sql`, `paylasilan/sozlesme/sevkiyat.ts`.

## Tablolar
- `sevkiyat_noktasi`: `id`, `ad`, `tur` (fabrika, musteri, tedarikci, fason, kargo, diger), `enlem`, `boylam`, `adres`, `durak_suresi_dakika`, `aktif`.
- `sevkiyat_araci`: `id`, `ad`, `tur` (binek, kamyonet, kamyon), `plaka`, `kapasite_kilogram`, `kapasite_palet`, `musait_baslangic`, `musait_bitis`, `kilometre_maliyeti`, `saat_maliyeti`, `gunluk_maliyet`, `aktif`.
- `sevkiyat_isi`: `id`, `tarih`, `tur` (teslimat, alim, aktarma), `alis_noktasi_id`, `birakis_noktasi_id`, `agirlik_kilogram`, `palet_sayisi`, zaman aralıkları, `belge_no`, `aciklama`, `sabit_arac_id`, `iptal_edildi`, `istenen_tarih`, `durum`, `durum_zamani`.
- `sevkiyat_bekleyen` (kart #1310): `kaynak` (urun, fason, alim), `uretim_emri_id`, `fason_hareket_id`, `talep_id`, `firma_id` -> `musteri_tedarikci_firma`, `malzeme_no`, `adet`, `istenen_tarih`, `hazir_zamani`, `is_id`, `kaldirildi`, `kaldiran_kisi_id`.
- `sevkiyat_plani`, `sevkiyat_plan_araci`, `sevkiyat_plan_duragi` (durakta `sonuc`, `sonuc_zamani`, `sonuc_notu`).

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Firma (müşteri, tedarikçi, fason) | ad, adres, konum | `sevkiyat_noktasi` (tur musteri / tedarikci / fason) | sahibi finans; boş olabilen `sevkiyat_noktasi.firma_id` -> `finans_firma(id)` (kart #836), bağlı noktanın adı finanstan okunur; bağsız nokta ad kopyası tutar |
| Fabrika konumu | tek aktif fabrika noktası | `sevkiyat_noktasi` (tur fabrika) | atölye (Fabrika Haritası) de fabrika tutar; Aşama 2'de sorulur |
| Araç ve plaka | araç kartı, kapasite, maliyet | `sevkiyat_araci` | modül içi; başka modülde araç yok (DOĞRULANDI: `npm run harita`) |
| Belge no (irsaliye) | serbest metin | `sevkiyat_isi.belge_no` | irsaliye ve fatura kaydı Logo'da; stok çıkışıyla bağ yok |
| Yük | kg ve palet | `sevkiyat_isi` | malzeme ve stok hareketiyle bağ yok; Aşama 2'de akış C ile sorulur |
| Para birimi | maliyetler TL varsayılır | `sevkiyat_araci.*_maliyeti` | para birimi sahibi finans |
| Kişi | yazan ve onaylayan yalnız denetim kaydında | çekirdek denetim | kayıtta kişi sütunu yok |
| Durum listeleri | iş durumu (havuzda, planlandı, yolda, tamamlandı, yapılamadı), durak sonucu | sözleşme | modül içi |
| "Sevkiyat" adı | araç rota planlama | `/sevkiyat` | stok modülünde "Sevkiyat" bir okutma modudur (stoktan çıkış, `istemci/src/moduller/stok/Okut.tsx`); aynı ad iki anlamda |
| Üretim kaydı | biten emrin ve fason hareketinin kimliği, adedi | `sevkiyat_bekleyen` | sahibi uretim-emirleri; olayla gelir, `disari.ts` ile okunur |
