# Başka modül istekleri: idari-isler

- kisiler: yok (`kisiAdlari`, `kisiSecenekleri` disari'den kullanılıyor).
- Fabrika haritası (sahibi atanınca): yer seçimi için alan listesi ve QR etiket çözümü (2. aşama).
- musteri-tedarikci: yok (`firmaAra`, `firmaAdlari`, `firmaVarMi` disari'den kullanılıyor).
- vardiya: yok (`vardiyaKadrosu`, `basladigiGunTakvimleri` disari'den kullanılıyor).
- ik: `izinliKisiler` ve `gununFazlaMesaisi` disari'den kullanılıyor (istek #1884 ile karşılandı).
- ik (244 a, zimmet İdari İşler'e geçti): zimmet alanını (`zimmetler`, `ik_zimmet`, `ik.zimmet-yaz`) kaldırma; IK-74 çıkış uyarısını
  `idari-isler/disari` `kisilerinAcikZimmetleri(db, kisiIdleri)` ile okuma (döngü: çözücü kaydı); `ik_zimmet`'i kaldıran göçte önce
  `SELECT idari_isler_zimmet_ik_kopyala();`.
- nizamiye: İstek: günün yemeğe kalacak ziyaretçi sayısı, `yemegeKalanZiyaretci(db, tarih): Promise<number>` (o gün beklenen ya da
  içerideki ziyaretlerden yemeğe kalacak işaretli olanlar). Gelince yemek hesabında elle girilen ziyaretçi sistemden dolar.

