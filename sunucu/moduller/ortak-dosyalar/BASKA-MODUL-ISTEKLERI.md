# Başka modül istekleri: ortak-dosyalar (kart 2067)

1. denetim: `denetim/disari.ts`'e yol kalıbı ve parametreyle süzülen okuma, örn.
   `modulKayitlari(db, { modul: 'ortak-dosyalar', parametre: { klasorId: number }, sinir: number }): Promise<{ zaman; kisiId; yontem; yol; govde }[]>`.
   Geçmiş sekmesi indirme ve önceki olayları bundan okur (UYUM-BORCU 3). Yetki denetlemez: çağıran uç denetler.
2. kisiler: `kisininRolleri` ve `rollerVeBayraklari` bu kartın ayrı yamasıyla girer (dal 2067-kisiler-rolleri, koordinatör kilidi 05.11).
3. Kart 3288 dilim 2: musteri-tedarikci "firma açıldı / türü müşteri oldu" olayı, siparisler "sipariş oluştu" olayı (bugün yalnız onay
   olayı var), projeler `projeAcildiBildir` (3272 ile ortak; önce 2067 yazar, imza yalnız eklenerek değişir); her biri kayıtla aynı
   transaction'da, `kullanici` taşır. Mevcut kayıt kaynağı için her modülden kimlik, kod/no ve ad listesi (`disari.ts`). Bağ `sunucu/kablolama.ts`.
