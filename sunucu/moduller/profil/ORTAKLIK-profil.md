# ORTAKLIK: profil

| Kavram | Tablo ve sütun | Sahibi | Not |
|---|---|---|---|
| Kişi | `profil_geri_bildirim.kisi_id` -> `kisi.id` | kisiler | yabancı anahtar; ad `kisiler/disari.ts` `kisiAdlari` |
| Görev | (tablo yok) | kisiler | `kisiGorevi` ile okunur |
| Personel kartı, izin, fazla mesai | (tablo yok) | ik | `kisininPersonelKarti`, `kisininKalanIzni`, `kisininIzinleri`, `kisininFazlaMesaisi` |
| Şikayet, istek, öneri | `profil_geri_bildirim` (konu, tur, metin, gonderildi) | profil | yalnız bu modülde |
| Durum listeleri | `konu` (sirket, uygulama), `tur` (sikayet, istek, oneri) | profil | `paylasilan/sozlesme/profil.ts` |
