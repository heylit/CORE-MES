# Ortaklık: finansın tuttuğu ve başka modülde de olabilecek kavramlar

Başka modül bu kavramları kendi tablosunda kopyalamaz; finansa yabancı anahtarla (sayı kimliği) bağlanır ve adı ya da özeti `sunucu/moduller/finans/disari.ts` ile alır. "Teslim" sütunu kavramın hangi teslimle geldiğini gösterir; bu tam teslimde hepsi vardır.

| Kavram | Tablo ve sütun | Biçim / değerler | Başka modül nasıl kullanır | Teslim |
|---|---|---|---|---|
| Firma (müşteri, tedarikçi, fason) ve bütün kart alanları | `musteri_tedarikci_firma` (kart #1164 ile `finans_firma`dan yeniden adlandırıldı) | `ORTAKLIK-musteri-tedarikci.md` | `firma_id int REFERENCES musteri_tedarikci_firma(id)`; ad, seçim, özet `sunucu/moduller/musteri-tedarikci/disari.ts` ile | taşındı |
| Para birimi | firmanın varsayılanı `musteri_tedarikci_firma.para_birimi`; finansta belge, ödeme, çek, hesap, kur | ISO 4217 üç büyük harf, `char(3)`; varsayılan `TRY` | aynı biçimle saklar; kur tablosunu kopyalamaz | 1 (firma), 2 |
| Kur | `finans_kur` (para birimi, tarih, kur); belge, ödeme, çekte `kur numeric(18,6)` | elle günlük; yoksa belgenin kuru (K-10) | finans dışında kur tutulmaz | 2 (bu teslimde) |
| Hesap (kasa, banka, kredi kartı) | `finans_hesap` | tür `kasa`, `banka`, `kredi_karti`; `logo_kodu` | | 2 (bu teslimde) |
| Belge numarası | `finans_belge.belge_no` | en çok 16 (Logo fatura no) | | 2 (bu teslimde) |
| Gider ve gelir kategorileri | `finans_belge.kategori` | sabit liste (kur farkı geliri ve gideri dahil, K-11) | | 2 (bu teslimde) |
| Durum listeleri | belge (`acik`, `kapandi`, `iptal`); çek alınan (`portfoy`, `tahsilde`, `tahsil`, `ciro`, `karsiliksiz`, `iptal`), verilen (`bekliyor`, `odendi`, `iptal`); Logo eşleme (`eslesmedi`, `eslesti`, `farkli`); kaynak (`elle`, `logo`) | | | 2 (bu teslimde) |

Not: satın alma siparişindeki para birimi ve ödeme planı, stoktaki ambar kodu bu modülün kavramı değildir; yalnız firma ve para birimi biçimi ortaktır.

## Tam teslimle kesinleşen adlar

| Kavram | Tablo ve sütun | Değerler |
|---|---|---|
| Hesap | `finans_hesap.id`, `tur`, `para_birimi`, `logo_kodu` | `kasa`, `banka`, `kredi_karti` |
| Kur | `finans_kur (para_birimi, tarih, kur)`; kayıtlarda `kur numeric(18,6)` | TRY'de 1 |
| Faiz | `finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde)`, yalnız ekleme | aylık yüzde; satın almada `satin_alma_kur.aylik_faiz_yuzdesi` de var (bağlamada finansa döner) |
| Sabit kıymet | `finans_sabit_kiymet.makine_id` -> `makine (id)` (312 b), `makine_kodu` (istasyonlar `makine.kod` biçiminde), `yontem` | `normal`, `azalan`; makine kaydı istasyonlarda, amortisman finansta; makine_id kodun karşılığından yazılır, eski satırlarda boş |
| Belge | `finans_belge.belge_no` (≤16), `kategori`, `durum`, `kaynak`, `logo_kayit_no`, `logo_esleme` | kategori kodları: `urun_satisi`, `hizmet_geliri`, `diger_gelir`, `kur_farki_geliri`, `mal_alimi`, `personel`, `sgk_stopaj`, `kira`, `enerji`, `lojistik`, `pazarlama`, `faiz`, `diger_gider`, `kdv_vergi`, `kredi_anapara`, `kur_farki_gideri`; iade (260 a): `satis_iadesi` (gider), `alis_iadesi` (gelir); tür `iade` |
| Ödeme yöntemi | `finans_odeme.yontem` | `nakit`, `banka`, `kredi_karti`, `cek`, `senet`, `ciro` |
| Çek durumu | `finans_cek.durum` | alınan: `portfoy`, `tahsilde`, `tahsil`, `ciro`, `karsiliksiz`, `iptal`; verilen: `bekliyor`, `odendi`, `iptal` |

## Sipariş bağı (D6 b)

| Kavram | Tablo ve sütun | Sahibi | Not |
|---|---|---|---|
| Satın alma siparişi | `finans_belge.satin_alma_talep_id`, `satin_alma_teklif_id` -> `satin_alma_siparis (talep_id, teklif_id)` | satın alma | Finans yalnız anahtarı tutar; bağı satın alma `belgeSiparisBagla` ile yazar, seçici `alisBelgeleri` |
| Siparişin ödeme planı (beklenen ödeme) | `finans_siparis_odemesi` (`satin_alma_talep_id`, `satin_alma_teklif_id` -> `satin_alma_siparis`; vade, yöntem, firma, para birimi, tutar) | finans | Kart #1124: satın alma `siparisOdemePlaniYaz` ile yazar, `siparisPlanlari` ile okur; kopya tutmaz |
| Satış siparişi (260 a) | `finans_belge.siparis_id` -> `siparisler_siparis (id)` | siparişler | Yalnız satış faturası ve onun iadesi; sipariş onaylı ya da kapanmış, müşterisi faturanın firması (`siparisAyrintisi` ile okunur). Okuma `disari.siparisFaturalari` |
| Sevk işi (260 a) | `finans_belge.sevkiyat_isi_id` -> `sevkiyat_isi (id)` | sevkiyat | Yalnız siparişle birlikte; iptal edilmemiş teslimat, müşterisi ve siparişi faturanınki (FNS-68, `sevkiyat.sevkIsiOzeti` kablolamadan) |
| İade edilen fatura (260 a) | `finans_belge.iade_belge_id` -> `finans_belge (id)` | finans | İade asıl faturanın siparişini ve sevkini taşır |

## Genel gider yük oranı (206 a)

| Kavram | Tablo ve sütun | Sahibi | Not |
|---|---|---|---|
| Genel gider yük oranı (TL / makine saati) | `finans_genel_gider_orani` (`gecerlilik_baslangic`, `aylik_genel_gider`, `aylik_makine_saati`, `amortisman_dahil`) | finans | Proje maliyet `disari.genelGiderOrani` ile okur, kopya tutmaz; kullandığı oranı kendi defterine yazar |
