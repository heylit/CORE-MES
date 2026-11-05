# Başka modül istekleri: ortak-dosyalar (kart 2067)

1. denetim: `denetim/disari.ts`'e yol kalıbı ve parametreyle süzülen okuma, örn.
   `modulKayitlari(db, { modul: 'ortak-dosyalar', parametre: { klasorId: number }, sinir: number }): Promise<{ zaman; kisiId; yontem; yol; govde }[]>`.
   Geçmiş sekmesi indirme ve önceki olayları bundan okur (UYUM-BORCU 3). Yetki denetlemez: çağıran uç denetler.
2. kisiler: `kisininRolleri` ve `rollerVeBayraklari` bu kartın ayrı yamasıyla girer (dal 2067-kisiler-rolleri, koordinatör kilidi 05.11).
