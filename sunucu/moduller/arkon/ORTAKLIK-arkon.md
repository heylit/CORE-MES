# Ortaklık: arkon

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; bağlama aşamasında (kart #158) "kavram başına hangi modül ne tutuyor" tablosuna girer.
Kaynak: göçler `sunucu/gocler/*arkon*`, `arkon/shared/model.ts`, `sunucu/moduller/arkon/{servis,kurallar}.ts`, `paylasilan/sozlesme/arkon.ts`.

## Tablolar
- `arkon_belge`: `depo` (pkgs, results, requests, draws, downs, maint, gauges, logi, kv), `kimlik`, `govde` (jsonb), `surum`, `degistiren_id`, `degisti`.
- `arkon_kayit` (yalnız eklenir): `tur` (events, counts, meas, calls, audit), `cid`, `zaman`, `makine`, `is_merkezi`, `emir_no`, `paket_id`, `madde_id`, `govde`, `kisi_id`.
- `arkon_dosya` (`ozet`, `icerik`, `boyut`, `yukleyen_id`), `arkon_dosya_parcasi` (geçici), `arkon_ileti` (geçici).
- `arkon_tmi_yansima`: `kayit_id`, `emir_id` (yabancı anahtarsız), `kisi_id`, `sonuc` (bekliyor, yazildi, reddedildi, eslenemedi, hatali), `neden`, `deneme`, `son_hata`, `son_deneme`, `zaman`.
- `arkon_kuyruk_sirasi` (kart 527): `is_emri_id` (yabancı anahtarsız), `parca_no`, `istasyon_id`, `sira`, `surum`, `kisi_id`, `zaman`. İş sırası kavramı: canlı plan sırası plan modülünün, istasyon kuyruğu sırası Arkon'un.

## Kavramlar
| Kavram | Arkon ne tutuyor | Yer | Bağ |
|---|---|---|---|
| İş paketi (üretim emri) | no, parça no ve adı, revizyon, operasyon, istasyon, makine, hedef, çevrim, termin, öncelik, durum, sürüm, sıra, onay | `arkon_belge` depo `pkgs` | kendi belgesi; açık TMI emri `tmi-ue-<emir id>` kimlikli taslak paket olarak görünür |
| Parça, malzeme | parça no, parça adı, malzeme | `pkgs.govde.partNo`, `.part`, `.material` | metin; malzemeler ile bağ yok |
| Kişi | yapan, karar veren, kapatan vb. ad alanları | belge gövdelerinde `by`, `decidedBy`, `closedBy`, `openedBy`, `ackBy`, `handledBy`, `doneBy`; kayıtta `kisi_id` | gövdede metin (TMI kişi adının kopyası); sütunda yabancı anahtar `kisi` |
| Kullanıcı, rol | kimlik, ad, rol, iş merkezleri | tabloda yok | TMI'den okunur (`kisiler`; rol TMI işleminden çözülür) |
| Yetki matrisi | rol x izin | `kv/perms` | TMI'den türetilir; yazımı reddedilir |
| İstasyon, makine, iş merkezi | tesis ağacı; belge ve kayıtlarda kod | `kv/plant`; `machine`, `mc`, `wc` alanları; `arkon_kayit.makine`, `.is_merkezi` | tesis TMI'den okunur (`istasyonlar`); kodlar metin |
| Vardiya | ad, başlangıç, bitiş, molalar | `kv/shifts` | vardiya modülünden okunur (`vardiya/disari.ts` `vardiyaTanimlari`, A7 #517); Arkon'dan yazılmaz |
| Vardiya devri | not, kişi, zaman | `kv/handover` | kendi belgesi; TMI'de karşılığı yok |
| Planlı duruş | başlık, neden, kapsam, hedef, zaman aralığı, yineleme | yok: `downs` deposu Vardiya'dan türer (`vardiya_planli_durus`, kart #519) | sahibi vardiya; Arkon formu `vardiya/disari.ts` ile yazar; `arkon_belge` içindeki eski `downs` okunmaz |
| Duruş nedeni, hurda nedeni | kod, ad | `kv/reasons`, `kv/scraps` | TMI'den okunur (`durus-nedenleri`); yazımı reddedilir |
| Üretim olayı ve sayım | durum (çalışıyor, durdu, bitti...), sağlam ve hurda adedi, neden | `arkon_kayit` tur `events`, `counts`; ayrıca `results.govde.good`, `.scrap` | kendi kaydı; TMI üretim emrine `arkon_tmi_yansima` ile yansır |
| Operatör sonucu | durum, sayım, ölçümler, iğneler, okundu kayıtları, seri sayacı | `arkon_belge` depo `results` | kendi belgesi |
| Kontrol planı | karakteristik, nominal, tolerans, alet, sıklık | `pkgs.govde.plan[]` | kendi belgesi |
| Ölçüm | değer, sınırlar, uygunluk, kaynak | `arkon_kayit` tur `meas`; `results.govde.meas` | kendi kaydı |
| Numune isteği | paket, neden, maddeler, durum, karar | `arkon_belge` depo `requests` | kendi belgesi |
| Ölçü aleti, kalibrasyon | no, tür, ad, aralık, yer, periyot, son tarih, durum, kalibrasyon kayıtları | `gauges` (okuma) | kalibrasyon modülünden okunur (`kalibrasyon/disari.ts` `aletlerVeKayitlari`, A7 #518); Arkon'dan yazılmaz, kayıtlı `gauges` satırları okunmaz |
| Bakım | arıza (durum, neden, yapılan iş), periyodik plan, yapılan bakım | `arkon_belge` depo `maint` | kendi belgesi; TMI'de karşılığı yok |
| Malzeme lojistiği | istek ve çıkış: kalem, miktar, durum | `arkon_belge` depo `logi` | kendi belgesi; kalem ve miktar metin |
| Çizim, dosya | çizim belgesi; dosya içeriği | `arkon_belge` depo `draws`; `arkon_dosya` | kendi belgesi ve kendi dosya deposu |
| Çağrı | ekip, aşama, not | `arkon_kayit` tur `calls` | kendi kaydı |
| Denetim günlüğü | alan, eylem, hedef, ayrıntı | `arkon_kayit` tur `audit` (sunucu üretir) | kendi kaydı; çekirdek `denetim_kaydi` ayrı |
| Belge no | paket no ve sıra; markalama seri sayacı | `pkgs.govde.no`, `.seq`; `results.govde.sr` | belge alanı; sunucuda sayaç yok |
| Durum listeleri | paket, emir, istek, arıza, lojistik durumları | belge gövdesinde sabit metin | kısıtsız |
| Ayarlar | çalışma kuralları, kip, kural şablonları | `kv/policy`, `kv/mode`, `kv/ruleTpls` | kendi belgesi |
| Birim | yok | | yok |

## TMI ile bağlar
- İthal: `kisiler/disari.ts`, `istasyonlar/disari.ts`, `durus-nedenleri/disari.ts`, `uretim-emirleri/disari.ts` (açık emirler; emir komutları ve `emirOzeti`). `kalibrasyon/disari.ts` (ölçü aletleri, A7 #518). `malzemeler` (arama dışında) ve `ayarlar` ithal edilmiyor. Arkon'un `disari.ts` dosyası yok.
- Yabancı anahtar: yalnız `kisi` ve kendi `arkon_kayit`. `uretim_emri`, `istasyon`, `is_merkezi`, `makine` için yabancı anahtar yok (kod metni ya da anahtarsız `emir_id`).

## Doğal sahibi başka modül olabilecekler
Ölçü aleti ve kalibrasyon (kalibrasyon); bakım; kalite, kontrol planı, ölçüm ve numune; vardiya; planlı duruş; üretim sayımı ve emir durumu (uretim-emirleri); malzeme lojistiği (stok); çizim ve dosya (ortak dosya deposu); parça ve malzeme (malzemeler).
