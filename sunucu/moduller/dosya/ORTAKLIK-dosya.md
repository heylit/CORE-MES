# Ortaklık: dosya

Modülün tuttuğu ve başka modülde de olabilecek kavramlar.

| Kavram | Tablo ve sütun | Not |
|---|---|---|
| Kişi | `dosya.ilk_yukleyen_id`, `dosya_yukleyeni.kisi_id`, `dosya_bagi.ekleyen_id`, `dosya_yuklemesi.yukleyen_id` | `kisi` yabancı anahtarı |
| Dosya, ek | `dosya`, `dosya_icerigi`, `dosya_bagi` | tek depo; Arkon'un `arkon_dosya`sı #302 ile buraya taşınır |
| Belge türü | `dosya_bagi.belge_turu` | serbest metin; listesi bağlayan modülün |
| Kayıt anahtarı | `dosya_bagi.modul`, `dosya_bagi.kayit` | metin; Aşama 2'de sayı kimliğine geçiş gerekebilir |
