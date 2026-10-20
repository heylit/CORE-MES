# Ortaklık (rota)

Rota modülünün tuttuğu ya da kullandığı ve başka modülde de bulunan ya da bulunabilecek kavramlar.

| Kavram | Rotada | Sahibi / öteki yer | Not |
|---|---|---|---|
| Malzeme (ürün, bileşen, yan ürün) | `rota_revizyonu.malzeme_id`, `rota_bileseni.malzeme_id`, `rota_yan_urunu.malzeme_id`, `rota_op_numarasi.malzeme_id` -> `malzeme_katalog_karti.no` | malzemeler | Ad, kod, tür, onay `malzemeOzeti` ile okunur; arama istenen `malzemeAra` ile |
| Malzeme türü | `rota_revizyonu.malzeme_turu` (mamul, yarimamul) | malzemeler `malzeme_katalog_karti.tur` | Kopya; `(no, tur)` tekili gelince bileşik yabancı anahtar olur |
| Birim | yok (miktarlar kartın stok birimindedir) | malzemeler (bugün sunucuda birim yok) | Ekran birimsiz gösterir; `malzemeBirimleri` istendi |
| Operasyon tipi | `rota_adimi.operasyon_tipi_id`, `rota_standart_adim.operasyon_tipi_id` | istasyonlar (`operasyon_tipi`, istendi) | Bugün yabancı anahtarsız; katalog gelince eklenir |
| Kaynak: makine | `rota_adimi.makine_id`, `rota_aday_kaynagi.makine_id` -> `makine` | istasyonlar | Pasif makine ya da pasif istasyondaki makine kullanımda değildir |
| Kaynak: kişi | `rota_adimi.kisi_id`, `rota_aday_kaynagi.kisi_id` -> `kisi` | kisiler; istasyon bağı istasyonlar (istendi) | Kişinin istasyonu `istasyonKisileri` ile |
| İstasyon | tutulmaz; kaynağın istasyonundan okunur | istasyonlar | Seçim istasyonlara göre gruplu |
| Süre birimi | dakika: `ayar_suresi_dk` numeric(8,2), `birim_sure_dk` numeric(10,4) (adet başına) | üretim emri iş emri adımı (kopya), plan | Plan bu süreyi okur |
| Süre ayrımı | `rota_adimi.islem_suresi_dk`, `degisim_suresi_dk` (ve aday kaynakta); birim süre bunların toplamı | Reçete ve Rota ekranı (bugün `recete_rota_kayit` JSON'unda kopya, A3'te kalkar) | Oran saklanmaz |
| Gerçekleşen süre | `rota_gerceklesen_sure` (malzeme_id, op_no, makine_id, tur, sure_dk, kaynak, is_emri_id) | ölçüm uretim-emirleri `uretim_sayimi`, `uretim_olayi` (#1045); Arkon günlüğü | Rota yalnız planın kullanacağı değeri tutar; ölçümün asıl kaydı emirdedir |
| Bağımlılık | `rota_adimi.bagimlilik` (bekleyen, akisli, bagimsiz), `devir_adedi` | iş emrine kopyalanır; plan okur | |
| Makine kullanımı | `makine_kullanimi` (tek, paralel), `en_kucuk_parca` | plan | |
| Fire | `rota_adimi.fire_payi_yuzde`, `rota_bileseni.fire_yuzde` | stok (tüketim), plan (miktar) | |
| Revizyon durumu | `rota_revizyonu.durum` (taslak, onay_bekliyor, onayli, yururlukte, iptal) | malzemeler kart onayı (taslak, onayda, aktif, pasif, iptal) | Ayrı listeler; adları benzer |
| Talimat sürümü | `rota_talimati` (malzeme_id, op_no, surum) | iş emrine sabitlenir (`talimatSurumu`), metni kontrol listesi olur | |
| Üretim emri / iş emri | yok (emre kopyalama komutu çağırır) | uretim-emirleri | Üretim emri üst kayıt, iş emri adım başına (K1) |
| Dört göz ayarı | `rota.dort-goz` | malzemeler `genel` ayarındaki dört göz | Ayrı ayarlar |
