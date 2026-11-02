# Ortaklık: degisiklik-yonetimi

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261028110000_degisiklik_yonetimi.sql`, `paylasilan/sozlesme/degisiklik-yonetimi.ts`.

| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Malzeme (parça, son ürün) | kimlik | `talep_kalemi.malzeme_id`, `emir_kalemi.malzeme_id`, `emir.gecerlilik_son_urun_id` | malzemeler; yabancı anahtar yok (Aşama 2), ad ve kod `disari.ts` ile |
| Yeni parça no ve adı | önerilen numara | `emir_kalemi.yeni_parca_no`, `yeni_parca_adi` | malzemeler kart açar (Aşama 2) |
| Ürün tanımı öğesinin revizyonu (çizim, 3B, rota/reçete, işlem şartnamesi, kontrol planı, NC programı, markalama tanımı) | eski ve yeni kimlik, tür | `emir_ogesi.tur`, `eski_revizyon_id`, `yeni_revizyon_id` (eski `emir_kalemi.*_cizim_*`, `*_rota_*` sütunları okunmuyor) | belge-merkezi (çizim, 3B), rota, kalite-merkezi, cnc-kurulum, markalama |
| Parça revizyonu ve konfigürasyon (baseline) | parça revizyonu, proses sürümü, öğe kimlikleri, getiren emir | `emir_kalemi.yeni_parca_revizyonu`, `konfigurasyon`, `konfigurasyon_ogesi` | bu modül (1608 a); malzeme kartındaki revizyon metni Aşama 2'de buradan dolar |
| Üretim emri | karar hedefi | `karar.hedef_id` (hedef 'emir') | uretim-emirleri |
| Stok | karar hedefi | `karar.hedef_id` (hedef 'stok') | stok |
| Seri numarası | ilk seri | `emir.gecerlilik_ilk_seri` | seri ve markalama sahibi (Aşama 2'de sorulur) |
| Kişi | açan, koordinatör, karar veren, ilk parça onaylayan, geçmiş | `*_kisi_id`, `ilk_parca.onaylayan_kisi_id`, `gecmis.kisi_id` | kisiler; yabancı anahtar `kisi` |
| Firma (müşteri) | müşteri onay referansı (metin) | `talep.musteri_referansi`, `emir.musteri_referansi` | musteri-tedarikci; bugün serbest metin |
| Belge no | ECR-/ECO- numarası, sapma referansı | `talep.no`, `emir.no`, `karar.sapma_referansi` | sapma: kalite-merkezi |
| Durum listeleri | talep, emir, karar kodu ve modu, ilk parça, geçmiş olayı, iç olay | sözleşme sabitleri, göç CHECK'leri | modül içi |
