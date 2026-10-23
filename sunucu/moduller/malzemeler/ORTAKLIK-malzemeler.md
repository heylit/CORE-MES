# Ortaklık: malzemeler

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; bağlama aşamasında (kart #158) "kavram başına hangi modül ne tutuyor" tablosuna girer.
Kaynak: göçler `sunucu/gocler/*malzeme*`, `paylasilan/sozlesme/malzemeler.ts`, ekran `istemci/src/moduller/malzemeler/katalog/katalog.html` (ekran sabitleri arama ile çıkarıldı; liste eksik olabilir).

## Tablolar
- `malzeme_katalog_karti`: `kimlik` (metin, birincil), `no` (sayı kimlik, tekil, değişmez), `tur`, `onek`, `sira_no`, `stok_kodu` (üretilmiş), `benzersiz_anahtar`, `mukerrer_gerekcesi`, `onay_durumu`, `kayit` (jsonb: kartın bütünü), `surum`, kişi ve zaman sütunları, `aktif_oldu`.
- `malzeme_katalog_kod_sirasi` (`onek`, `son_sira`), `malzeme_katalog_sablonu` (`kimlik`, `sablon` jsonb), `malzeme_katalog_ayari` (`anahtar`: malzeme, operasyonlar, genel; `deger` jsonb).

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Malzeme ve hizmet | kimlik, sayı kimlik, stok kodu, ad, tür (hizmet ve ticari mal dahil), hizmet yönü | `malzeme_katalog_karti.kimlik`, `.no`, `.stok_kodu`, `.tur`, `.hizmet_yonu`; ad `kayit.com.ad` | sahibi bu modül; satın alma kataloğu `no`'ya bağlı |
| Firma: tedarikçi | Müşteriler ve Tedarikçiler firması (kart #466, #1164); eski kartta serbest metin | `kayit.com.tedId` (musteri_tedarikci_firma.id), `kayit.com.ted` (ad); sarfta `kayit.g.marka`, `kayit.g.urunKodu` | sayı kimliği + metin |
| Firma: müşteri | yarı mamulde müşteri parça no | `kayit.g.musteri` | metin |
| Kişi | açan, gönderen, onaylayan, güncelleyen, şablonu kaydeden | `*_kisi_id` sütunları | yabancı anahtar `kisi` |
| Kişi (kopya) | onay, talep, ret, revizyon damgalarında ad | `kayit.onay.*.by/byAd`, `kayit.talep.by/byAd`, `kayit.rev[].by/byAd`; demirbaş zimmetlisi `kayit.g.sorumlu` | metin |
| İstasyon, iş merkezi | rota satırında merkez; varsayılan istasyon | `kayit.ops[].merkez`; ayar `operasyonlar` | metin |
| Operasyon listesi | operasyon adları ve kodları; A7 (#515) sonrası `istasyonlar_operasyon_tipi`'nden okunur (`istasyonlar/disari.ts`) | ekran sabitleri `OPS`, `OP_VARSAYILAN`; ayar `operasyonlar` (yedek) | istasyonlar |
| Rota ve reçete | operasyon sırası, süre; reçete kalemleri. Kullanıcı kararı (#688, 12.10.2026): kart onaylanınca `ops[]` rotaya taslak olarak aktarılır, kopya kartta kalır (RT1 a değişti) | `kayit.ops[]`, `kayit.bom[]` (`ref` başka kartın metin kimliği); dışa `malzemeOperasyonlari` | metin |
| Depo, raf, konum | depo yeri; demirbaş konumu | `kayit.g.depoYeri`, `kayit.g.konum` | metin |
| Birim | stok birimi; birim listesi (sahibi, SH4 a) | `kayit.com.birim`; `malzeme_birimi` (prototipin `BIRIMLER`, `BIRIM_T` listeleri ve Ayarlar farkından) | metin; liste tabloda |
| CNC takım kütüphanesi kimliği | CNC kurulum prototipinin takım, tutucu ve bağlama kimliği (`inv` anahtarı); kart başına bir, kimlik başına bir kart; yalnız sarf ve demirbaş (163 b) | `malzeme_katalog_karti.cnc_kutuphane_kimligi`; dışa `cncKimlikliMalzemeler`, `cncKimligiBagla` | cnc-kurulum stoğu bu bağla stok modülünden okur (153 a) |
| Kategori | sarf ve demirbaş kategorisi; hizmet grubu | `kayit.g.kat`; `malzeme_kategorisi` (tür `sarf`, `demirbas`, `hizmet`) | anahtar; liste tabloda |
| Hizmet çeşidi ve standardı | hizmetin çeşidi (alodin, boya, hidrojen gevrekliği giderme...), standart / şartname, isterler (tip, sınıf, kalınlık, sıcaklık...) | `kayit.g.cesit`, `kayit.g.std`, `kayit.g.<ister>`; liste ekranda (`HZ_KAT`) | seçim metni; rota fason adımı ve kalite (şartname) de tutabilir |
| Para birimi, fiyat | fiyat, para birimi, en az sipariş | `kayit.com.fiyat`, `kayit.com.pb`, `kayit.com.moq`; para birimi listesi yok | metin |
| Belge no | stok kodu üreteci; teknik resim no ve revizyon | `malzeme_katalog_kod_sirasi`; `kayit.g.resim`, `kayit.g.rev` | modül içi; resim metin |
| Sertifika | sertifika seçimleri | `kayit.com.sertifika`; liste ekran sabiti `SERTIFIKA` | ekran sabiti |
| Durum listeleri | onay durumu; tür; demirbaş durumu | `.onay_durumu`, `.tur` (kısıtlı); `kayit.g.durum` | modül içi |
| Sınıflama | aile, sınıf, kalite, form, tolerans, kategori | ekran sabitleri `FAMS`, `FORMS`, `STDS`, `CLS_STDS`, `TOLP`, `SARF_KAT`, `DB_KAT`, `YM_TIP` | ekran sabiti |
| Kalite ve bakım alanları | kontrol, muayene; demirbaş bakım ve kalibrasyon tarihleri | `kayit.g.kontrol`; `kayit.g.bakimAy`, `kayit.g.kalAy`, `kayit.g.sonKal` | metin |
| Onay ve dört göz | onay akışı ayarı; dört göz | ayar `genel.onayAkisi`; Sistem Ayarları `malzemeler.dort-goz` | `ayarlar` modülü |
| Dosya, ek | yok (belge yükleme kapalı) | | yok |
| ERP (Logo) | gönderim durumu, kayıt no, ad güncelleme durumu, gönderilen tür ve birim karşılığı; TMI türü ve birimi karşılığında Logo değeri; barkod alanları | `malzeme_katalog_karti.logo_*`; `malzeme_logo_karsiligi`; `kayit.g.gtin`, `kayit.g.gtip` | bağlantı modülü (`disari.ts` ile) |

## Başka modüle bağlar
- Yabancı anahtar: yalnız `kisi`. İthal: `kisiler/disari.ts` (`kisiAdlari`, `kisiBayrakliMi`), `ayarlar/disari.ts` (`sistemAyariOku`).
- Dışa verilen (`disari.ts`): `malzemeOzeti(db, no)`, `malzemeKullanilabilirMi(db, no)`, `malzemeAdlari(db, nolar)`; Logo bağlantısı için `logoyaGidecekMalzemeler(db, sinir)`, `malzemeLogoSonucu(db, no, sonuc)`, `logoBirimSetiKullaniliyorMu(db, kod)` (kart #232), ad güncellemesi `logoyaGuncellemeGidecekMalzemeler(db, sinir)`, `malzemeLogoGuncellemeSonucu(db, no, sonuc)` (kart #783); bağlama tur 1: `malzemeOzetleri(db, idler)`, `malzemeAra(db, g)`, `olcuBirimleri(db)` (kart #163). Firma kodu `firmaKodu(db)` (kart #802, üretim emri numarası). Örnek veri: `malzemeNoKoddan(db, stokKodu)`, `ornekMalzemeNo(db, anahtar)` (kart #906). Bugün başka modül çağırmıyor.

## Doğal sahibi başka modül olabilecekler
Tedarikçi ve müşteri (musteri-tedarikci: firma); depo yeri ve konum (stok, istasyonlar); istasyon, operasyon, rota ve reçete (istasyonlar, rota); birim ve para birimi listeleri (ortak tanım); fiyat ve en az sipariş (satın alma); zimmetli kişi (personel); kalite, bakım ve kalibrasyon alanları (kalite, bakım, kalibrasyon).
