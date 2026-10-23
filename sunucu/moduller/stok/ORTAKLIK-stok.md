# ORTAKLIK: stok (kart #206)

Oturtmada yazıldı (teslimde yoktu). Kaynak: göçler `20261008142031`..`20261008142035`, `servis.ts`, `disari.ts`.

## Tablolar (sahibi stok, OS7)

- `stok_depo`: `id`, `kod`, `ad`, `logo_ambar_no`, `aktif`, `surum`
- `stok_raf`: `id`, `depo_id`, `kod`, `tur`, `numaralama`, `ilk_bolme`, `bolme_sayisi`, `kat_sayisi`, ölçüler, `x_m`, `z_m`, `aci`, `on_yuz_ters`, `aktif`, `surum`
- `stok_konum`: `id`, `depo_id`, `kod`, `tur`, `raf_id`, `bolme_no`, `kat_no`, `ad`, `istasyon_id`, `son_sayim`, `aktif`, `surum`, `firma_id` (fason ve yolda konumunun firması, kart #1310) (raf gözü, kabul alanı, üretim çıkışı, depo zemini, istasyon)
- `stok_teslim`: `id`, `no` (`TS-`), `kaynak_kimligi`, `malzeme_id`, `miktar`, `parti_id`, `statu_id`, `kaynak_konum_id`, `hedef_konum_id`, `uretim_emri_id` (düz sayı), `istek_id`, `aciklama`, `durum`, `alinan`, `red_nedeni`, `hareket_id`, `gonderen_kisi_id`, `kapatan_kisi_id`, `gonderim`, `kapanis`, `surum`
- `stok_refakat_partisi` (kart #123): `id`, `uretim_emri_id` (düz sayı), `sira` (emir başına; kart etiketi `<emir no>-P<sira>`), `malzeme_id`, `parti_id` (depodan verilen lot), `durum` (`acik`/`iptal`), `acan_kisi_id`, `kayit_zamani`, `iptal_eden_kisi_id`, `iptal_zamani`, `surum`. Kavram: üretim partisi (emir + gelen lot); Üretim Emirleri sayımda partinin kimliğini opak sayı olarak tutar (Dal 3, kart #125).
- `stok_parti.refakat_partisi_id` (kart #126): kartla sayılan parçanın üretim partisi (malzeme, kart başına bir); boşsa kartsız emir partisi ya da mal kabul lotu.
- `stok_refakat_partisi.ust_refakat_partisi_id`, `birlestigi_refakat_partisi_id`, `birlesme_zamani` (kart #126 devamı): kolun kartı üst emrin kartına bağlı; birleşen kolun kartı birleştiği karta yönlenir. Kavram üretim emrinin parti bölme ve birleşmesiyle (Üretim Emirleri `ust_emir_id`, `birlestigi_emir_id`) eşleşir.
- `stok_refakat_partisi.lota_baglayan_kisi_id`, `lota_baglanma_zamani`; `stok_refakat_istisna_dusumu` (kart #154): lotsuz (istisna) kart ve lotsuz düşümlerinin bağı. Kişi kavramı `kisiler`'in (`kisi` yabancı anahtarı); belge ve parti kavramı stokun.
- `stok_parti`: `id`, `malzeme_id`, `tedarikci_parti_no`, `dokum_no`, `sertifika_no`, `uretim_emri_id` (düz sayı), `kayit_zamani`, `acan_kisi_id`
- `stok_bakiye`: `id`, (`malzeme_id`, `konum_id`, `parti_id`) tekil, `konum_aktif`, `miktar`, `ilk_giris`, ambalaj sütunları (`ambalaj_tur`, `ambalaj_olcu`, ölçüler, `ambalaj_adet`)
- `stok_hareketi` (yalnız ekleme): `id`, `zaman`, `tur`, `malzeme_id`, `parti_id`, `parti_secimi`, `kaynak_konum_id`, `hedef_konum_id`, `miktar`, `onayli_eksi`, `eksi_onay_kaynagi`, `giris_kaynagi`, `cikis_nedeni`, `uretim_emri_id` (düz sayı), `geri_alinan_id`, `kisi_id`, `aciklama`
- `stok_hareketi_logo`: `hareket_id`, `logo_kayit_no`, `logo_gonderim_durumu`, `logo_iletisi`, `guncelleme`
- `stok_mal_kabul`: `id`, `no` (`MK-`), `tur`, `irsaliye_no`, `duzeltilen_id`, `zaman`, `kisi_id`; `stok_mal_kabul_satiri`: `id`, `mal_kabul_id`, `sira`, `malzeme_id`, `sayilan_miktar`, `parti_id`, `konum_id`, `hareket_id`, `logo_irsaliye_satir_no`, `logo_irsaliye_miktari`, `logo_durumu`
- `stok_malzeme_ayari`: `malzeme_id`, `kritik_seviye` (malzeme kartının sipariş noktası, A7 #516), `varsayilan_ambalaj_tur`, `varsayilan_ambalaj_olcu`, `varsayilan_konum_id` (kartın depo yeri, A7 #516), `surum`; `stok_malzeme_ambalaji`: `malzeme_id`, `ambalaj_tur`, `ambalaj_olcu`, `ici_miktar`
- `stok_sepet_satiri`, `stok_fis`, `stok_fis_satiri`: kişinin sepeti, teslim fişi (`teslim_alan_kisi_id`, `uretim_emri_id` düz sayı)
- `stok_toplama`, `stok_toplama_kalemi`, `stok_toplama_adimi`: toplama listesi ve rotası
- `stok_depo_yerlesimi`: bina, kabul alanı, fason dolabı, kare boyu, `sayim_suresi_gun` (kare adları borç #441 ile kaldırıldı)

## Başka modülde de olabilecek kavramlar

| Kavram | Stokta ne | Tablo ve sütun | Bağ |
|---|---|---|---|
| Malzeme | kart sayı kimliği | `*.malzeme_id` (8 tablo) | yabancı anahtar `malzeme_katalog_karti (no)`; ad ve tür `malzemeler/disari.ts` |
| Ölçü birimi | tutulmaz | — | malzemelerden okunacak (OS4; borç 4, 21) |
| Kişi | yapan, açan, teslim alan | `*.kisi_id`, `acan_kisi_id`, `teslim_alan_kisi_id` | yabancı anahtar `kisi`; ad `kisiAdlari` |
| Üretim emri | sarf ve üretim girişinin emri, parti | `stok_parti.uretim_emri_id`, `stok_hareketi.uretim_emri_id`, `stok_fis.uretim_emri_id` | düz sayı (STK6 b); varlık `emirOzeti`; Aşama 2'de yabancı anahtar (hedef soruda) |
| İstasyon, üretim alanı | üretim alanı konumu (kapalı) | `stok_konum.tur` | istasyonlara bağlanacak (STK4 a) |
| Firma | tedarikçi, fason (kapalı) | yok | finans `finans_firma.id` |
| Sipariş satırı | mal kabul satırının siparişi | yok | satın alma; Aşama 2'de yeni göç (STK2 a) |
| Depo, raf, konum | sahibi stok | `stok_depo`, `stok_raf`, `stok_konum` | malzeme kartı metni `kayit.g.depoYeri`, `kayit.g.konum` (STK3 a); kalibrasyon `olcu_aleti.yer`; Arkon `logi` |
| Belge no | mal kabul, fiş, toplama, malzeme isteği no (kalıp `ayarlar` Numara kuralları) | `stok_mal_kabul`, `stok_fis` | modül içi |
| Logo | irsaliye satırı, ambar, fiş gönderimi | `stok_hareketi_logo`, `stok_mal_kabul_satiri.logo_*`, `stok_depo.logo_ambar_no` | yalnız alan; bağlantı kodu yok |
| Para birimi, maliyet | tutulmaz | — | finans (OS5); stok değeri "—" |
| Durum listeleri | hareket türü, çıkış nedeni, konum türü, raf türü, eşleşme ve gönderim durumu, toplama durumu | kısıt listeleri | modül içi |
| Malzeme lojistiği | sepet, fiş, toplama | yukarıdaki tablolar | Arkon `arkon_belge` depo `logi` aynı işi metinle tutar (OS7: sahibi stok) |
| Malzeme teslimi | iki kişi arası teslim (gönderen, alan), yol, red nedeni | `stok_teslim` (`malzeme_id`, `parti_id`, `statu_id`, `kaynak_konum_id`, `hedef_konum_id`, `istek_id`, `uretim_emri_id`, `gonderen_kisi_id`, `kapatan_kisi_id`) | Arkon kutusu bağlamada bu uçlara bağlanır (kart #1208); statü Reçete ve Rota'nın (`recete_rota_statu`) |
| İstasyon konumu | istasyonun stok konumu | `stok_konum` (`tur = 'istasyon'`, `istasyon_id`) | istasyon kaydı `istasyonlar` modülünün; konum kendiliğinden açılır |
| Malzeme isteği | bütün sayfalardan gelen istek, durum ve karşılanan | `stok_malzeme_istegi` (`malzeme_id`, `istasyon_id`, `uretim_emri_id`, `kaynak_kimligi`, `durum`) | Arkon `logi` `req` belgesi `kaynak_kimligi` ile bağlanır (`arkon:logi:<id>`); istasyon yabancı anahtar, emir düz sayı (STK6 b) |

## Başkasına verilen (`disari.ts`)

`stokMiktarlari(db, malzemeIdler)`, `emrinPartileri(db, uretimEmriId)`, `konumAdlari(db, idler)`, `malzemeIstegiAc(db, kullanici, girdi)`, `malzemeIstekleri(db, kaynakKimlikleri)`.
