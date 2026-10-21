# Ortaklık (plan)

| Kavram | Planda | Sahibi / öteki yer |
|---|---|---|
| İş emri | `plan_yerlesimi.is_emri_id`, `plan_senaryo_yerlesimi.is_emri_id` (FK yok, P-B2) | uretim-emirleri (iş emri; üretim emri üst kaydı) |
| Emir durumu | okunur: planli, basladi, bitti, iptal | uretim-emirleri `EMIR_DURUMLARI` |
| Kaynak (makine) | `plan_yerlesimi.makine_id` -> `makine` | istasyonlar; rota `rota_adimi.makine_id` |
| Kaynak (kişi) | `plan_yerlesimi.kisi_id` -> `kisi` | kisiler; istasyon bağı istasyonlar (istendi) |
| İstasyon, iş merkezi | tutulmaz; kaynaktan okunur (kapsam) | istasyonlar |
| Süre | tutulmaz; iş emrinin ayar + adet x birim (dakika); elle yerleştirmede `sureDk` | rota (kaynak), iş emri (kopya) |
| Bağımlılık | okunur (bekleyen, akisli, bagimsiz; devir adedi) | rota -> iş emri |
| Teslim | okunur (üretim emri teslimi) | uretim-emirleri |
| Öncelik | yok (sıralama teslim, emir, sıra); öncelik alanı gelirse motora girer | uretim-emirleri (yok) |
| Takvim, vardiya | yok (sürekli çalışma, P-B3) | vardiya, mesai |
| Senaryo durumu | `plan_senaryosu.durum` (acik, canliya_alindi, vazgecildi) | - |
| Plan sürümü | `plan_durumu.surum` | - |

## Taban plan (33 a)
| Kavram | Planda | Sahibi / öteki yer |
|---|---|---|
| Taban plan (adımın ilk canlı yeri) | `plan_taban` (is_emri_id, uretim_emri_id, makine_id, kisi_id, baslangic, bitis, plan_surumu, senaryo_id, yazan_kisi_id, zaman) | plan (sahibi, 33 a); Reçete ve Rota `tabanPlani` ile okur |
| İş emri, üretim emri | `plan_taban.is_emri_id`, `plan_taban.uretim_emri_id` (FK yok: taban emirden sonra da kalır) | uretim-emirleri |
