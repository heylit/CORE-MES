import type { AcikSiparisSatiri } from '#paylasilan/sozlesme/stok.ts';

// Mal kabulde tek kutu: depocu gelen malı malzeme, tedarikçi, emir ya da projeyle bulur. Her sözcük dört alandan birinde
// geçmelidir (sıra ve büyük-küçük harf önemsiz, Türkçe harfler doğru küçülür). Boş arama bütün satırları bırakır.
const kucuk = (x: string): string => x.toLocaleLowerCase('tr-TR');

export function aramaAlanlari(x: AcikSiparisSatiri): string[] {
  return [x.kalemAdi, x.tedarikciAdi, x.emirNo ?? '', x.projeAdi ?? '', x.siparisNo, x.talepNo].filter((a) => a !== '');
}

export function acikSiparisAra(satirlar: readonly AcikSiparisSatiri[], metin: string): AcikSiparisSatiri[] {
  const sozcukler = kucuk(metin).split(/\s+/).filter(Boolean);
  if (sozcukler.length === 0) return [...satirlar];
  return satirlar.filter((x) => {
    const alanlar = aramaAlanlari(x).map(kucuk);
    return sozcukler.every((s) => alanlar.some((a) => a.includes(s)));
  });
}
