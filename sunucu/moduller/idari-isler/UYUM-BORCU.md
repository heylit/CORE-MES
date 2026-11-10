# Uyum borcu: idari-isler

## Bağlamada kapanacak
- Yer, Fabrika haritası alanına bağlanacak (boş olabilen alan kimliği, ayrı göç); bugün serbest metin ve QR etiket metni.
- Talep sahibine bildirim (durum değişince) ortak bildirimle; bugün yalnız Taleplerim sayacı.
- Fotoğraf ekleme (ortak dosya modülü üzerinden).
- Eksik simgeler (damla, termometre, kamera): Çekirdek §13 isteği gelince `gorunum.ts` güncellenir.
- Atık birimi sabit liste; bağlamada Malzemeler'in birim tanımına bağlanır.
- Kontrol raporu ve atık formu dosyası (ortak dosya modülü); bugün yalnız belge no.
- Sözleşme tutarı ve ödemesi Finans'ta; bağlamada sözleşme kalemi Finans kaydına bağlanabilir.
- Yemek: yemeğe kalan ziyaretçi Nizamiye'den gelecek (istek yazıldı); bugün elle. Fazla mesai İK'dan geliyor.
- Yemek: PDKS bağlanınca kadro yerine günün gerçek giriş sayısı (ayrı ADR).
- Yemek simgesi ortak sette yok; `coffee` kullanıldı (Çekirdek §13 isteği).
- Araç görevi: bildirim merkezi bağlanınca onay ve red talep edene bildirim olarak gider; bugün durum Araç talebim'de görülür.
- Filo: Sevkiyat'ın `sevkiyat_araci` kaydı plaka ile araç kartına bağlanacak (172 a); bugün iki liste.
- Filo: araç simgesi ortak sette yok; `truck` kullanıldı (Çekirdek §13 isteği, araba).

- Araç masrafı: proje bağı (masrafın projeye yazılması) bağlamada. Finans bağı yok: araç gideri genel gidere yalnız Finans belgesinden girer (2711 b).
- Zimmet: İK zimmet alanını kaldırır, IK-74 çıkış uyarısını `kisilerinAcikZimmetleri` ile okur, `ik_zimmet`'i kaldıran göçünde önce
  `idari_isler_zimmet_ik_kopyala()` çağırır (İK şeridi). İdari İşler `ik/disari`'yi okuduğu için İK'dan bu okuma döngü yapar; çözücü kaydı gerekir.
- Zimmet: kişi sayfasında "üzerindeki zimmetler", zimmet formu yazdırma ve demirbaş etiketi (Etiket Merkezi) bağlamada.

## Bilgi (borç değil)

Kurgu, karar ve sınır kayıtları; kapanacak iş değildir (borç denetimi, kart 2049).

### Bağlamada kapanacak

- Rol x işlem satırları (216 a): Çekirdek 101700 göçü. Herkes `talep-ac`; idari_isler `oku`, `talep-yonet`, `kontrol-yaz`; müdür yalnız `oku`.
- Talep numarası Sistem Ayarları'ndaki ortak sayaçtan (143 a); `idari_isler_numara_sayaci` artık okunmaz ve yazılmaz. Kaldıran göç dolu tabloyu sildiği için onayla, ayrı göçle.
