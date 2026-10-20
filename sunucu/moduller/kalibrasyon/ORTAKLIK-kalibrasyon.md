# Ortaklık: kalibrasyon

Modülün tuttuğu ve başka modülde de olabilecek kavramlar; Aşama 2 tablosuna girer. Kaynak: `sunucu/gocler/20261006104020_kalibrasyon_tablolar.sql`, `paylasilan/sozlesme/kalibrasyon.ts`.

## Tablolar
- `olcu_aleti_turu`: `id`, `ad` (tekil, büyük küçük harf ayrımsız), `aktif`.
- `olcu_aleti`: `id`, `no` (tekil, büyük harf), `tur_id` -> `olcu_aleti_turu`, `ad`, `olcme_araligi`, `yer`, `periyot_gun`, `kullanim_disi`, `kullanim_disi_nedeni`, `olusturuldu`.
- `kalibrasyon_kaydi`: `id`, `alet_id` -> `olcu_aleti`, `tarih` (date), `kisi_id` -> `kisi`, `sonuc` (uygun, uygunsuz), `sertifika_no`, `aciklama`, `olusturuldu`.

## Kavramlar
| Kavram | Modül ne tutuyor | Yer | Bağ |
|---|---|---|---|
| Ölçü aleti | no, tür, ad, aralık, periyot, kullanım durumu | `olcu_aleti` | sahibi bu modül (A7 kullanıcı kararı: tek kaynak). Arkon `gauges` buradan okur (`disari.aletlerVeKayitlari`, #518; Arkon kayıtları bir kez kopyalandı); malzemeler demirbaşı `kayit.g.kalAy/.sonKal` henüz bağlı değil |
| Alet türü | ad | `olcu_aleti_turu` | modül içi |
| Kalibrasyon kaydı | tarih, sonuç, sertifika no | `kalibrasyon_kaydi` | modül içi; yalnız ekleme |
| Kişi | kaydı giren | `kalibrasyon_kaydi.kisi_id` | yabancı anahtar `kisi`; ad kisiler `disari.ts` ile |
| Yer | aletin durduğu yer | `olcu_aleti.yer` | serbest metin; depo ya da istasyon kavramıyla Aşama 2'de sorulur |
| Belge no | sertifika numarası | `kalibrasyon_kaydi.sertifika_no` | metin |
| Durum listeleri | sonuç; türetilen durum (kullanım dışı, kayıt yok, geçmiş, yaklaşan, geçerli) | sözleşme `SONUCLAR`, `DURUMLAR` | modül içi |
