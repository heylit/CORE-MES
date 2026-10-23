# ORTAKLIK: vardiya

| Kavram | Burada | Sahibi | Not |
|---|---|---|---|
| Vardiya (saat, mola, aktif) | `vardiya`, `vardiya_molasi` | vardiya | Arkon `kv/shifts` buradan okur (`disari.vardiyaTanimlari`, A7 #517); Arkon'da girilmiş vardiyalar bir kez kopyalandı (göç `vardiya_arkon_kopyasi`, aynı ad varsa buradaki kalır) |
| Haftalık vardiya düzeni (iş merkezi x gün) | `vardiya_matrisi.is_merkezi_id, gun, vardiya_id` | vardiya | iş merkezi istasyonlar'dan, yabancı anahtar `is_merkezi` |
| Kapalı gün (tesis geneli) | `vardiya_takvim_gunu.tarih, tur, ad` | vardiya | plan stüdyosu "kapalı gün" `disari.gunYaz` ile yazar; planlı duruş ayrı kavram (aşağıda); 142'den önce yazılmış `tur = 'tatil'` satırı tatil kalır (kullanıcı kararı 23.10.2026), yenisi yazılmaz |
| Resmî tatil | yok (okunur: `ik/disari.ts resmiTatilGunleri`) | ik (soru 142 b) | takvim günleri İK tatilleriyle birleşir (VR-28); Vardiya kopya tutmaz |
| İşten çıkış tarihi, kişinin aktifliği | yok (okunur: `ik/disari.ts kisilerinCikisTarihleri`, `kisiler/disari.ts kisileriListele`) | ik, kisiler | kişi takvimi çıkıştan sonra (pasifte bugünden itibaren) 0 ve `ayrildi` (VR-29); Vardiya kopya tutmaz |
| Planlı duruş (başlık, neden, kapsam ve hedef, zaman, tekrar) | `vardiya_planli_durus.baslik, durus_nedeni_id, kapsam, is_merkezi_id, istasyon_id, baslangic, bitis, tekrar, gunler, tekrar_bitis, kaynak_kimligi` | vardiya (A6, kart #519) | Arkon `downs` deposu bu tablodan türer ve `disari.ts` ile yazar; neden durus-nedenleri'nden |
| Kişinin vardiyası | `vardiya_kisi.kisi_id, vardiya_id` | vardiya (karar 2-a) | kişi kisiler'den, yabancı anahtar `kisi` |
| İş merkezi, istasyon, makine | okunur (`istasyonlar/disari.ts`) | istasyonlar | - |
| İstasyon ve makine seçim listesi (çalışma takvimi ekranı) | okunur, istemci: `GET /istasyonlar/secim` (`istasyonlar.istasyon`), `GET /makineler` (`istasyonlar.makine`) | istasyonlar | yalnız ekranda kaynak seçimi için; vardiya tablosuna yazılmaz |
| Kişi ve adı | okunur (`kisiler/disari.ts` `kisiAdlari`) | kisiler | - |
| Kişinin istasyon ataması (yüzde) | okunur (`istasyonKisiAtamalari`) | istasyonlar | kişinin iş merkezi buradan türer (VR-08) |
| Vardiya devri | yok | personel-vardiya (sabit kimlik) | bugün Arkon'da; bu turda yazılmadı |
| Mesai | yok | - | Günlük Mesai sayfa tanımı duruyor; karar 1-a: sonra |
