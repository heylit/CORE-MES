# denetim-hazirlik: ortaklık

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Hepsi `denetim_hazirlik_belge.veri` (jsonb) içinde, belge yoluyla:

| Kavram | Nerede (koleksiyon / alan) | Olası sahibi |
|---|---|---|
| firma (kendi kuruluşu) | `profile.firma`, `profile.kurulus` | finans firma / ayarlar |
| kişi (denetçi, sorumlu) | serbest metin ad alanları | kisiler |
| denetim kaydı, bulgu, DÖF | `audits`, `kys`, `pw` (ISO programı başına çalışma alanı) | kalite (gelecek modül) |
| belge no / doküman listesi | `kys` altında | dosyalar |
| tarih | ISO metin | - |

Kişi sütunları: `denetim_hazirlik_belge.olusturan_kisi_id`, `guncelleyen_kisi_id`, `denetim_hazirlik_ek.yukleyen_kisi_id` (kisi tablosuna Aşama 2'de bağlanır).
