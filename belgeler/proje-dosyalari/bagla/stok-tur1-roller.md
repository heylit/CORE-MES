# Stok rol satirlari (akis C, tur 1): RC1 tablosuna tasindi

Bu oneri cekirdekteki tek tabloya (`bagla/rol-C.md`, RC1) islenmek uzere cekirdek konusuna gonderildi; kullanici RC1 uzerinden cevaplar. Asagisi yalniz stok tarafinin gerekcesidir.
Kart #206. Onaydan önce göç yazılmaz. Okuma (`sayfa.stok`) bugün ana dalda zaten şu rollerde: Depo, Kalite, Muhasebe ve Finans, Müdür, Planlama ve Proje, Satın Alma (DOĞRULANDI: yerel veritabanında `rol_islemi`, ana dal göçleriyle). Yönetici her işlemi taşır.

Öneri (X = verilir):

| Rol | giris (mal kabul, üretimden giriş) | cikis (çıkış, sarf) | transfer (taşıma, sepet) | sayim | toplama | geri-al (hareketi geri al) | tanim (raf, konum, ayar) |
|---|---|---|---|---|---|---|---|
| Depo | X | X | X | X | X | | |
| Müdür | X | X | X | X | X | X | X |
| Planlama ve Proje | | | | | X | | |
| Kalite, Satın Alma, Muhasebe ve Finans | yalnız okuma | | | | | | |
| Operatör, CAM, Bakım, İdari İşler, İnsan Kaynakları | yok (stok ekranını görmez) | | | | | | |

Gerekçe:
- Geri alma ve tanım düzeltme yetkisidir. Yanlış geri alma bakiyeyi bozar, bu yüzden yalnız Müdür'e önerildi.
- Planlama'ya toplama, üretime malzeme hazırlatmak için önerildi.
- Bakım'ın yedek parça ya da sarf çekmesi gerekiyorsa `cikis` eklenir.

Cevap biçimi: "tamam" ya da değişecek hücreler (ör. "Depo tanim X", "Bakim cikis X").
