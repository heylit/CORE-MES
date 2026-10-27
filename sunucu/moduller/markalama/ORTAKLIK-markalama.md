# Ortaklık: markalama

Kaynak: `sunucu/gocler/20261027070000_markalama_tablolar.sql`, `paylasilan/sozlesme/markalama.ts`.

| Kavram | Modül ne tutuyor | Tablo.sütun | Sahibi / bağ |
|---|---|---|---|
| Malzeme | kimlik | `markalama_tanimi.malzeme_id`, `markalama_sayaci.malzeme_id`, `markalama_birimi.malzeme_id` | malzemeler; FK Aşama 2 |
| Rota adımı | op no | `markalama_tanimi.op_no` | rota; bağ Aşama 2 |
| Üretim emri | kimlik | `markalama_birimi.uretim_emri_id` | uretim-emirleri; FK Aşama 2 |
| İstasyon | kimlik | `markalama_birimi.istasyon_id` | istasyonlar; FK Aşama 2 |
| Kişi | kimlik | `degistiren_kisi_id`, `kisi_id` | kisiler (FK var) |
| Hurda nedeni | kimlik | `markalama_birim_olayi.hurda_nedeni_id` | durus-nedenleri; FK Aşama 2 |
| Çizim / model revizyonu | belge kimliği, revizyon harfi | `markalama_tanimi.model_belge_id`, `model_revizyon` | cizimler; FK Aşama 2 |
| Seri no (belge no) | birime özel numara | `markalama_birimi.seri_no` (tekil) | bu modül; Arkon panelindeki istemci serisi bunun yerine geçmeli |
| Birim durumu (durum listesi) | sağlam, red, rework, hurda | `markalama_birimi.durum` | bu modül; kalite NCR durumuyla Aşama 2'de eşlenir |
| Markalama yöntemi (durum listesi) | lazer, nokta vuruş, mürekkep, elektrokimyasal, etiket | `markalama_alani.yontem` | bu modül |
| Birim (ölçü) | mm, derece | `markalama_alani` yer sütunları | sabit, modül içi |
