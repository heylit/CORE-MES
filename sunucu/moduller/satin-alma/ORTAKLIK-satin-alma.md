# ORTAKLIK: satin-alma (kart #162)

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Kaynak: `sunucu/gocler/20261007230000_satin_alma_tablolar.sql` (DOĞRULANDI).

## Tablolar

- `satin_alma_ayar` (tek satır): `sirket`, `agirlik_maliyet`, `agirlik_termin`, `agirlik_tedarikci`, `agirlik_garanti`, `gecerlilik_gun`, `en_az_teklif`, `fiyat_uyari_yuzdesi`, `surum`, `guncelleme`
  - `sirket`: şirket adının esası (A7, #514); `finans_ayar.sirket_adi` kopyadır, finans ekranı bunu gösterir.
- `satin_alma_kur`: `para_birimi` (TRY, USD, EUR, GBP), `sira` (kur ve faiz finansın `finans_kur` ve `finans_faiz` tablolarındadır, 937 b)
- `satin_alma_kategori`: `ad`, `sira`
- `satin_alma_birim` (departman): `ad`, `yillik_butce`, `sira`
- `satin_alma_onay_limiti`: `sira`, `azami_tutar`, `seviye`
- `satin_alma_tedarikci`: `firma_id`, `durum`, `puan`, `notlar`, `surum`, `olusturma`, `guncelleme`
- `satin_alma_tedarikci_kategorisi`: `firma_id`, `kategori`, `sira`
- `satin_alma_tedarikci_degerlendirmesi`: `id`, `firma_id`, `tarih`, `puan`, `metin`, `degerlendiren`, `kisi_id`, `olusturma`
- `satin_alma_katalog`: `id`, `kategori`, `ozellik`, `notlar`, `surum`, `olusturma`, `guncelleme`, `malzeme_no`
- `satin_alma_katalog_takma_adi`: `katalog_id`, `takma_ad`
- `satin_alma_talep_sayaci`: `yil`, `son_sira`
- `satin_alma_talep`: `id`, `yil`, `sira`, `no` (üretilen: ST-yıl-sıra), `baslik`, `birim`, `talep_eden_kisi_id`, `acan_kisi_id`, `oncelik`, `ihtiyac_tarihi`, `notlar`, `durum`, `iptal_nedeni`, `agirlik_maliyet`, `agirlik_termin`, `agirlik_tedarikci`, `agirlik_garanti`, `teslim_yontemi` (kart #1310), `surum`, `olusturma`, `guncelleme`
- `satin_alma_talep_kalemi`: `talep_id`, `id`, `sira`, `katalog_id`, `ad`, `ozellik`, `miktar`, `birim`, `kategori`
- `satin_alma_teklif_istegi`: `talep_id`, `firma_id`, `gonderim`, `son_tarih`
- `satin_alma_teklif`: `talep_id`, `id`, `sira`, `firma_id`, `tedarikci_adi`, `teklif_tarihi`, `gecerlilik`, `para_birimi`, `kur`, `iskonto_yuzdesi`, `nakliye`, `diger_masraf`, `teslim_sekli`, `nakliye_dahil`, `termin_gun`, `vade_gun`, `avans_yuzdesi`, `garanti_ay`, `teknik_uygun`, `notlar`, `ilk_toplam`, `revizyon`, `olusturma`
- `satin_alma_teklif_satiri`: `talep_id`, `teklif_id`, `kalem_id`, `birim_fiyat` (işlev `satin_alma_teklif_toplami`)
- `satin_alma_karar`: `talep_id`, `mod` (tek, bolunmus), `teklif_id`, `gerekce`, `karar_veren_kisi_id`, `karar_tarihi`, `ogrenilenler`
- `satin_alma_karar_kalemi`: `talep_id`, `kalem_id`, `teklif_id`
- `satin_alma_sabit_kur`: `talep_id`, `para_birimi`, `kur`
- `satin_alma_siparis`: `talep_id`, `teklif_id`, `no` (TMI, `SP-yıl-sıra`), `siparis_no` (Logo / tedarikçi), `siparis_tarihi`, `beklenen_teslim`; sayaç `satin_alma_siparis_sayaci`; Logo durumu `id`, `logo_kayit_no`, `logo_gonderim_durumu`, `logo_iptal_durumu`, `logo_guncelleme_durumu` (#780), satırda `logo_satir_ref`, karşılama `logo_karsilama_ref` ve `logo_karsilama_durumu` (#790); talepte `sayi_id`, `logo_kayit_no`, `logo_gonderim_durumu`, kalemde `sayi_id`, `logo_satir_ref` (#790)
- `satin_alma_siparis_satiri` (tur 4): `id` (tamsayı), `talep_id`, `teklif_id`, `kalem_id`, `miktar`, `birim`; stokun mal kabulü ve GKK buna bağlanır, fiyat taşımaz
- `satin_alma_onay` (yalnız ekleme): `id`, `talep_id`, `zaman`, `kisi_id`, `sonuc`, `dort_gozsuz`, `notlar`
- `satin_alma_hareket` (yalnız ekleme): `id`, `talep_id`, `zaman`, `kisi_id`, `metin`
- `satin_alma_senaryo`: `talep_id`, `id`, `ad`, `kisi_id`, `olusturma`; `satin_alma_senaryo_payi`: `talep_id`, `senaryo_id`, `kalem_id`, `teklif_id`, `miktar`; `satin_alma_senaryo_kalemi`: `talep_id`, `senaryo_id`, `kalem_id`, `denge`

## Kavramlar

| Kavram | Modül ne tutuyor | Yer (tablo.sütun) | Bağ (yabancı anahtar / metin / yok) |
|---|---|---|---|
| Firma / tedarikçi | Tedarikçi finanstaki bir firmanın kimliğiyle kaydedilir (firma finansta açılır, burada seçilir; kullanıcı kararı S1, 07.10.2026); firma alanları (ad, vergi no, yetkili, telefon, e-posta, şehir, aktiflik) modülde TUTULMAZ, finans gelene kadar geçici karşılıkla boş döner | `satin_alma_tedarikci.firma_id`, `_tedarikci_kategorisi.firma_id`, `_tedarikci_degerlendirmesi.firma_id`, `satin_alma_teklif_istegi.firma_id`, `satin_alma_teklif.firma_id` | Yok (düz sayı; firma tablosuna yabancı anahtar kaldırıldı, tedarikçi tablosuna yabancı anahtar var). Teklifte ayrıca ad kopyası: metin `satin_alma_teklif.tedarikci_adi` |
| Tedarikçi durumu, puanı, notu, kategorisi | Satın almaya özgü: onaylı/deneme/askıda, 1-5 puan, not, kategori listesi, değerlendirmeler | `satin_alma_tedarikci.durum`, `.puan`, `.notlar`, `_tedarikci_kategorisi.kategori`, `_tedarikci_degerlendirmesi.puan/.metin` | Metin (kategori adı), değerlendiren: metin `degerlendiren` + yabancı anahtar `kisi_id` |
| Malzeme / kalem (katalog) | Satın alınabilir kart listesi: kod, ad ve birim malzeme kartından; kartta yoksa kategori, özellik, takma adlar kalemde | `satin_alma_katalog.malzeme_no/.kategori/.ozellik`, `satin_alma_katalog_takma_adi.takma_ad` | Yabancı anahtar `malzeme_no` (`malzeme_katalog_karti.no`, zorunlu) |
| Talep kalemi | Talepte istenen kalem: ad, özellik, miktar, birim, kategori | `satin_alma_talep_kalemi.ad/.ozellik/.miktar/.birim/.kategori/.katalog_id` | Yabancı anahtar `katalog_id` (kendi kataloğu); malzemeye bağ yok, ad metin |
| Kişi: talep eden | Talebi isteyen TMI kişisi | `satin_alma_talep.talep_eden_kisi_id` | Yabancı anahtar (`kisi`) |
| Kişi: talebi açan | Kaydı açan kişi | `satin_alma_talep.acan_kisi_id` | Yabancı anahtar (`kisi`) |
| Kişi: karar veren | Teklif kararını veren | `satin_alma_karar.karar_veren_kisi_id` | Yabancı anahtar (`kisi`) |
| Kişi: onaylayan | Onay ya da ret veren (dört göz) | `satin_alma_onay.kisi_id` | Yabancı anahtar (`kisi`) |
| Kişi: hareket, senaryo, değerlendirme | İzi bırakan kişi | `satin_alma_hareket.kisi_id`, `satin_alma_senaryo.kisi_id`, `satin_alma_tedarikci_degerlendirmesi.kisi_id` | Yabancı anahtar (`kisi`) |
| İstasyon / iş merkezi | Tutulmaz | – | Yok |
| Departman (birim) | Talebi isteyen birim ve yıllık bütçesi; modülün kendi listesi | `satin_alma_birim.ad`, `.yillik_butce`, `satin_alma_talep.birim` | Yabancı anahtar (`satin_alma_birim.ad`); TMI'nin kişi/istasyon/vardiya yapısıyla bağı yok |
| Depo / ambar | Tutulmaz (teslim alma stokta, depo yeri yok; Logo ambar kodu alanı eksik, UYUM-BORCU 14) | – | Yok |
| Ölçü birimi | Katalogda kartın birimi; talep kalemi birimi serbest metin (en çok 20 karakter) | `satin_alma_talep_kalemi.birim` | Metin |
| Para birimi ve kur | TRY, USD, EUR, GBP; güncel kur ve aylık faiz finanstan; teklif günü kuru; sipariş anındaki sabit kur | `satin_alma_kur.para_birimi`, `satin_alma_teklif.para_birimi/.kur`, `satin_alma_sabit_kur.para_birimi/.kur` | Yabancı anahtar (`satin_alma_kur`); liste kısıtla sabit (4 kod) |
| Fiyat | Teklif satırı birim fiyatı, iskonto yüzdesi (teklif düzeyi), nakliye, diğer masraf, avans yüzdesi, ilk toplam | `satin_alma_teklif_satiri.birim_fiyat`, `satin_alma_teklif.iskonto_yuzdesi/.nakliye/.diger_masraf/.avans_yuzdesi/.ilk_toplam` | Yok; fiyat listesi/katalog fiyatı tutulmaz |
| Belge no: talep no | `ST-yıl-sıra` (999'dan sonra kesilmez), yıllık sayaç | `satin_alma_talep.yil/.sira/.no`, `satin_alma_talep_sayaci.yil/.son_sira` | Yok |
| Belge no: sipariş no | TMI numarası `SP-yıl-sıra`, yıllık sayaç, benzersiz (#544); Logo / tedarikçi numarası serbest metin, en çok 40 karakter, benzersiz değil | `satin_alma_siparis.no`, `satin_alma_siparis_sayaci.yil/.son_sira`, `satin_alma_siparis.siparis_no` | Yok (TMI no); metin (Logo no) |
| Belge no: teklif no | Üreteç yok; teklifin kimliği uuid, sıralama `sira` | `satin_alma_teklif.id/.sira` | Yok |
| Belge no: katalog kodu | Tutulmaz; kartın stok kodu (249 a) | – | – |
| Durum: talep | taslak, teklif_isteniyor, degerlendirme, onayda, siparis_verildi, teslim_alindi, iptal | `satin_alma_talep.durum` (+ `iptal_nedeni`) | Metin (kısıt listesi) |
| Durum: tedarikçi | onayli, deneme, askida | `satin_alma_tedarikci.durum` | Metin (kısıt listesi) |
| Durum: karar | tek, bolunmus (karar kipi) | `satin_alma_karar.mod` | Metin (kısıt listesi) |
| Durum: onay | onay, ret (+ dört gözsüz işareti) | `satin_alma_onay.sonuc/.dort_gozsuz` | Metin (kısıt listesi) |
| Durum: teslim | Tutulmaz, türetilir (tur 4): satır başına stoktaki kabul toplamından bekleniyor/kısmi/tamam; kalite GKK sonucundan (sorunsuz, kismi_sorun, red_iade); "teslim alındı" bütün siparişler tamam olunca görünür | `satin_alma_siparis_satiri.id` -> stok `teslimAlinanlar`, rota/kalite `gkkSonuclari` (`teslim-bilgisi.ts`) | Okuma (geçici karşılık boş döner) |
| Durum: teklif | Teknik uygunluk ve revizyon sayısı (ayrı durum alanı yok) | `satin_alma_teklif.teknik_uygun/.revizyon` | Yok |
| Öncelik | dusuk, normal, acil | `satin_alma_talep.oncelik` | Metin (kısıt listesi) |
| Ödeme koşulu | Vade günü ve avans yüzdesi; ödeme planı kodu yok (Logo alanı eksik) | `satin_alma_teklif.vade_gun/.avans_yuzdesi` | Yok |
| Teslim koşulu | Teslim şekli (serbest metin), nakliye dahil mi, termin günü, garanti ayı, beklenen teslim tarihi | `satin_alma_teklif.teslim_sekli/.nakliye_dahil/.termin_gun/.garanti_ay`, `satin_alma_siparis.beklenen_teslim` | Metin / yok |
| Onay seviyesi ve limiti | Tutara göre onay seviyesi metni (bilgi amaçlı) | `satin_alma_onay_limiti.azami_tutar/.seviye` | Yok |
| Ayarlar | Şirket adı, varsayılan ağırlıklar, geçerlilik günü, en az teklif, fiyat uyarısı, kur tarihi (modülün kendi tablosunda); dört göz ayarı Sistem Ayarları'nda | `satin_alma_ayar.*`; `satin-alma.dort-goz` (`paylasilan/ayarlar/satin-alma.ts`) | Yok (dört göz: ayarlar modülü `sistemAyariOku`) |
| Dosya / ek | Tutulmaz (teklif eki, sözleşme, belge yok) | – | Yok |
| Geçmiş / hareket kaydı | İnsan diliyle talep izi, yalnız ekleme | `satin_alma_hareket.zaman/.kisi_id/.metin` | Yabancı anahtar (`kisi`); `denetim_kaydi` ile örtüşür |

## Başka modüle bağlar

- `kisi` (kisiler): `kisiAdlari`, `kisiVarMi` ithali (`sunucu/moduller/satin-alma/servis.ts`); sekiz sütunda `kisi` yabancı anahtarı.
- `ayarlar`: `sistemAyariOku(db, 'satin-alma.dort-goz')`.
- `finans` (`finans_firma.id`): ithal YOK, finans depoda değil. Geçici karşılık `firma-gecici.ts` finansın dört adını taşır (`firmaAdlari`, `firmaVarMi`, `firmaAra`, `firmaOzetleri`; imza VARSAYIM, BASKA-MODUL-ISTEKLERI.md); bağlanınca ithal `../finans/disari.ts` olur (UYUM-BORCU 1-2).
- `malzemeler`: bağ yok; `satin_alma_katalog.malzeme_no` boş düz tamsayı, hedef `malzeme_katalog_karti.no`, anahtar Aşama 2'de (UYUM-BORCU 5).
- `stok`: mal kabul stokta; stok sipariş satırlarını `disari.ts` `siparisSatirlari` ile fiyatsız okur, satın alma kabulü `teslimAlinanlar` ile okur (henüz yok).
- rota/kalite: GKK sonucu `gkkSonuclari` ile okunur (henüz yok).
- Başka modül `satin-alma` ithal etmez (`disari.ts` yok).
- `uretim-emirleri` (`uretim_emirleri_is_emri.id`, kart #542): hizmet siparişi satırı `satin_alma_siparis_satiri.is_emri_id` ile iş emrine bağlanır (yabancı anahtar). Fason tarihleri ve firma iş emrindedir (sahibi üretim emirleri); satın alma okur.
- `finans` belge (D6 b): siparişe bağlı alış faturası finansın `finans_belge.satin_alma_talep_id`, `satin_alma_teklif_id` sütunlarındadır (sahibi finans); satın alma bağı `belgeSiparisBagla`, listeyi `alisBelgeleri` ile alır, tutar almaz.

## Doğal sahibi başka modül olabilecekler

- Firma / tedarikçi kaydı ve alanları (ad, vergi no, yetkili, telefon, e-posta, şehir, aktiflik): finans modülü (kart #246). Tedarikçinin puanı, durumu, kategorisi, değerlendirmesi satın almada kalır.
- Malzeme kataloğu (kod, ad, kategori, birim, özellik, takma ad) ve `malzeme_no`: malzemeler modülü; katalog bugün örtüşüyor (kullanıcı kararı 4, senkron sonra).
- Para birimi ve kur listesi: finans ya da ayarlar; bugün modül içinde, dört sabit kod.
- Departman (birim) ve yıllık bütçe: finans ya da kişiler/organizasyon; bugün modülün kendi listesi.
- Sipariş numarası üreteci satın almada (#544, karar 2a); Logo kayıt numaraları finans ya da ERP bağlantısında (kart #205).
- Ölçü birimi listesi: malzemeler.
- Hareket (geçmiş) kaydı: denetim modülüyle örtüşür.
- Dosya/ek: ortak dosya deposu gelince (kart #82).
