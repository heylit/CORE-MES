# ORTAKLIK: istasyonlar (kart #186, #105)

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Kaynak: `sunucu/gocler/20261006104042_istasyonlar_tesis.sql`,
`20261008050000_istasyonlar_surum.sql`, `20261008050100_istasyonlar_operasyon_tipi.sql`, `20261008050200_istasyonlar_operasyon_tipi_tohum.sql`,
`20261008120000`-`20261008120300` (#105) (DOĞRULANDI).
Sabit kimlik (proje talimatı): istasyon ve makine bu modülündür.

## Tablolar

- `is_merkezi`: `id`, `kod`, `ad`, `aciklama`, `aktif`, `surum`
- `istasyon`: `id`, `kod`, `ad`, `is_merkezi_id`, `tip` (talasli, kalite, depo, markalama, boya, montaj), `sorumlu_kisi_id` (kisiler, boş olabilir), `kapasite_kaynagi` (makine, insan; boş olabilir), `aktif`, `surum`
- `makine`: `id`, `kod`, `ad`, `tur`, `marka_model`, `seri_no`, `istasyon_id`, `baglanti_turu`, `baglanti_adresi`, `aktif`, `surum`
- `kisi_is_merkezi`: `kisi_id` (kisiler), `is_merkezi_id`
- `istasyon_kisi`, `makine_kisi`, `ekip_uye`: `id`, hedef (`istasyon_id` / `makine_id` / `ekip_id`), `kisi_id` (kisiler), `baslangic` (date), `yuzde` (numeric(5,2), boşsa çıkarıldı), `iptal_zamani` (timestamptz, boşsa geçerli)
- `ekip`: `id`, `kod`, `ad`, `istasyon_id` (boş olabilir), `aktif`, `surum`
- `istasyonlar_operasyon_tipi`: `id`, `kod`, `ad`, `grup` (13 kod; adları sözleşmede `OPERASYON_GRUP_ADLARI`), `aktif`, `surum`, `kisaltma`, `varsayilan_ayar_dk`, `varsayilan_birim_dk`, `varsayilan_istasyon_id` (#324, boş olabilir) (`20261008111500_istasyonlar_operasyon_tipi_surum.sql`); 96 tiple tohumlu

## Kavramlar

| Kavram | Burada | Başka modülde | Durum |
|---|---|---|---|
| İş merkezi, istasyon, makine | üç tablo | Arkon `kv/plant`, `arkon_kayit.makine`, `.is_merkezi` (kod metni, yabancı anahtarsız); malzemeler `kayit.ops[].merkez` (metin); üretim emirleri `istasyon_id` | sahibi bu modül; ötekiler bağlamada kimliğe bağlanır |
| Operasyon tipi (rotanın kataloğu, RT2 a) | `istasyonlar_operasyon_tipi` | malzemeler ekran sabiti `OPS` ve ayar `operasyonlar` (jsonb); Arkon paketinde `operasyon` | kullanıcı kararı: katalog burada, kodlar malzemelerle aynı |
| İstasyon tipi | `istasyon.tip` (6 değer) | yok | yalnız burada |
| Kişinin iş merkezi kısıtı | `kisi_is_merkezi` | çekirdek `kapsam.ts` bunu `disari.ts` ile okur | sahibi bu modül |
| Kişi (sorumlu, atanan, üye) | `sorumlu_kisi_id`, atama tablolarında `kisi_id` | kisiler (sahibi) | kimlikle bağlı; ad `kisiler/disari` ile okunur |
| Ekip | `ekip`, `ekip_uye` | vardiya (vardiya ekibi olabilir), plan | sahibi bu modül (kart #105); vardiyanın ekibi varsa bağlamada sorulur |
| Kişi kapasite yüzdesi ve geçerlilik tarihi | üç atama tablosu | vardiya (kişi saati), plan (kapasite) | yüzde burada, saat vardiyada |
| Kapasite kaynağı | `istasyon.kapasite_kaynagi` | plan | sahibi bu modül |
| Üretim alanı konumu (SH5 b) | `istasyon.uretim_alani` (işaret) | stok (`stok_konum`, bağlamada `istasyon_id`) | işaret burada, konum stokta |
| Makine bağlantısı (SMARTES) | `baglanti_turu`, `baglanti_adresi` | Arkon UYUM-BORCU madde 3 | SMARTES alanı yok; bağlamada |
| İstasyon plan ayarı (verim, operatör ihtiyacı) | `istasyonlar_plan_ayari` | plan (kapasite) | sahibi bu modül (#409) |
| Makine durumu (çalışır, arıza, bakım) | `istasyonlar_makine_durumu` | plan, Arkon (arıza bildirimi bağlamada) | sahibi bu modül (#409) |
| Kişi yetkinliği (çalışabildiği istasyonlar) | `istasyonlar_yetkinlik` | plan (personel kapasitesi), uretim-emirleri (S3 uyarısı) | sahibi bu modül (#409) |
| Makine yetkinliği (kişinin baktığı makineler) | `istasyonlar_makine_yetkinlik`, defteri `istasyonlar_makine_yetkinlik_gecmisi` | plan (motorda kişi ataması, 569b) | sahibi bu modül (563 c) |
| Kişinin aynı anda en çok tezgâhı | `istasyonlar_kisi_tezgah_siniri.en_cok` | plan (motor, 569b); kisiler kişi kartı | sahibi bu modül (563 2 a) |
| Tesis kodunun geçmişi (iş merkezi, istasyon, makine) | `istasyonlar_kod_gecmisi` (`kod`, `birakildi`) | Arkon eski kayıttaki kodu `eskiKoddanKimlikCoz` ile çözer | sahibi bu modül (AG2-2) |

## Dışa açtıkları (`disari.ts`)

`istasyonGetir`, `aktifIstasyonlar`, `istasyonlar`, `isMerkezleri`, `makineGetir`, `istasyondakiMakineler`, `aktifMakineler`,
`kisininIzinliIsMerkezleri`, `isMerkeziIzinliMi`, `istasyonAdlari`, `operasyonTipleri`, `istasyondakiKisiler`, `makineKisiAtamalari`, `ekipler`, `ekipUyeleri` (#105), `istasyonKisiAtamalari` (#324), `uretimAlanlari`, `aktifUretimAlaniMi` (#368), `eskiKoddanKimlikCoz` ve `TesisDuzeyi` (#385), `planAyarlari`, `makineDurumlari`, `calisirMakineler`, `isMerkeziPersonelSayilari`, `istasyonKisileri`, `istasyonYetkinlikleri`, `yetkinMi`, `kisilerinIzinliIsMerkezleri` (#409), `makineYetkinlikleri`, `kisiTezgahSinirlari` (563). Tipler sürüm taşımaz.
